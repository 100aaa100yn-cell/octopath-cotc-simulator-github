export class TurnOptimizer{
  constructor(repository, damageEngine=null){this.repo=repository;this.damageEngine=damageEngine}

  applies(effect,attacker){
    if(effect.weapon&&effect.weapon!==attacker.weapon)return false;
    if(effect.element&&effect.element!==attacker.element)return false;
    return true;
  }

  abilityValue(ability,attacker,enemy,turn,attackTurn,priority){
    let score=0;
    const remaining=attackTurn-turn+1;
    for(const effect of ability.effects??[]){
      if(!this.applies(effect,attacker))continue;
      const rule=this.repo.getEffectRule(effect.type);
      if(!rule)continue;
      const activeAtAttack=(ability.duration??1)>=remaining;
      if(activeAtAttack)score+=Math.min(effect.value,rule.cap)*rule.weight;
      if(effect.type.includes("resistance_down"))score+=8;
      if(effect.type==="damage_cap_up")score+=6;
      if(effect.type==="break_support")score+=priority==="break"?20:8;
    }
    const weakWeapon=enemy.weakWeapons.includes(attacker.weapon);
    const weakElement=enemy.weakElements.includes(attacker.element);
    score+=(ability.shield??0)*(priority==="break"?7:3);
    if(ability.ownerId===attacker.id&&ability.power){
      score+=ability.power/18;
      if(weakWeapon||weakElement)score+=14;
      if(ability.timing==="finisher"&&turn===attackTurn)score+=35;
      if(turn!==attackTurn)score-=25;
    }
    if(ability.timing==="setup"&&turn<attackTurn)score+=10;
    if(ability.timing==="debuff"&&turn<attackTurn)score+=12;
    return score;
  }

  createPlan(partyResult,{enemyId,maxTurns=5,priority="balanced",enemyOverride=null}={}){
    const enemy=enemyOverride??this.repo.getEnemy(enemyId);
    const attacker=partyResult.attacker;
    const members=[attacker,...partyResult.selected.map(x=>x.candidate)];
    const states=Object.fromEntries(members.map(c=>[c.id,{sp:c.maxSp,bp:0,gauge:0,exUses:1}]));
    const attackTurn=Math.max(2,Math.min(maxTurns,enemy.shield>22?5:enemy.shield>12?4:3));
    let shield=enemy.shield;
    const activeEffects=[];
    const turns=[];

    for(let turn=1;turn<=maxTurns;turn++){
      for(const state of Object.values(states)){
        state.bp=Math.min(5,state.bp+1);
        state.gauge=Math.min(100,state.gauge+25);
      }

      const actions=[];
      const usedTypes=new Set();

      for(const member of members){
        const state=states[member.id];
        const abilities=this.repo.getAbilities(member.id).filter(a=>a.timing!=="passive");
        let candidates=abilities.filter(a=>{
          if((a.sp??0)>state.sp)return false;
          if((a.gaugeCost??0)>state.gauge)return false;
          if((a.exUses??0)>state.exUses)return false;
          if(member.id===attacker.id&&turn===attackTurn)return a.power>0;
          if(member.id===attacker.id&&turn!==attackTurn&&a.timing==="finisher")return false;
          return true;
        });

        if(turn<attackTurn){
          candidates=candidates.filter(a=>{
            if(a.timing==="attack"&&a.ownerId===attacker.id)return false;
            return true;
          });
        }

        candidates.sort((a,b)=>this.abilityValue(b,attacker,enemy,turn,attackTurn,priority)-this.abilityValue(a,attacker,enemy,turn,attackTurn,priority));
        let ability=candidates[0];

        if(!ability){
          actions.push({character:member,kind:"wait",name:"通常待機",sp:state.sp,bp:state.bp,shield:0});
          continue;
        }

        const duplicate=ability.effects?.every(e=>usedTypes.has(e.type));
        if(duplicate&&turn<attackTurn){
          const alternative=candidates.find(a=>!a.effects?.every(e=>usedTypes.has(e.type)));
          if(alternative)ability=alternative;
        }

        let boost=0;
        if(member.id===attacker.id&&turn===attackTurn){
          boost=Math.min(3,state.bp);
        }else if(priority==="break"&&turn===attackTurn-1&&(ability.shield??0)>0){
          boost=Math.min(2,state.bp);
        }

        state.bp-=boost;
        state.sp-=ability.sp??0;
        if(ability.gaugeCost)state.gauge-=ability.gaugeCost;
        if(ability.exUses)state.exUses-=ability.exUses;

        const shieldDamage=Math.min(shield,(ability.shield??0)+boost);
        shield-=shieldDamage;

        for(const effect of ability.effects??[]){
          if(!this.applies(effect,attacker))continue;
          usedTypes.add(effect.type);
          activeEffects.push({
            type:effect.type,
            value:effect.value,
            owner:member.name,
            ability:ability.name,
            expires:turn+(ability.duration??1)-1
          });
        }

        actions.push({
          character:member,kind:"ability",name:ability.name,
          category:ability.category,spCost:ability.sp??0,sp:state.sp,
          bp:state.bp,boost,shield:shieldDamage,power:ability.power??0
        });
      }

      const broken=shield<=0;
      const activeAtTurn=activeEffects.filter(e=>e.expires>=turn);
      turns.push({
        turn,actions,shield:Math.max(0,shield),broken,
        phase:turn===attackTurn?"攻撃ターン":broken?"ブレイク中":"準備ターン",
        activeEffects:activeAtTurn
      });
      if(broken&&turn<attackTurn)shield=0;
    }

    const attackActions=turns.find(t=>t.turn===attackTurn)?.actions??[];
    const attackerAction=attackActions.find(a=>a.character.id===attacker.id);
    let estimatedDamage=0;
    let damageResult=null;

    if(this.damageEngine&&attackerAction){
      const ability=this.repo.getAbilities(attacker.id).find(a=>a.name===attackerAction.name);
      const effects=turns.find(t=>t.turn===attackTurn)?.activeEffects??[];
      damageResult=this.damageEngine.calculateRange({
        attacker,
        ability,
        enemy,
        effects,
        boost:attackerAction.boost??0,
        broken:turns.find(t=>t.turn===attackTurn)?.broken??false,
        critical:false
      });
      estimatedDamage=damageResult.average.totalDamage;
    }else{
      const multiplier=Object.values(partyResult.totals).reduce((m,x)=>m*(1+x.effective/100),1);
      estimatedDamage=Math.round(
        ((attackerAction?.power||180)*(1+(attackerAction?.boost||0)*0.25))*multiplier*(shield<=0?enemy.breakMultiplier:1)*100
      );
    }

    return{enemy,members,turns,attackTurn,estimatedDamage,damageResult};
  }
}