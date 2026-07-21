export class TurnBattleManager {
  constructor(repo, damageEngine, formationManager, effectManager, equipmentManager = null, rosterManager = null) {
    this.repo = repo;
    this.damageEngine = damageEngine;
    this.formationManager = formationManager;
    this.effectManager = effectManager;
    this.equipmentManager = equipmentManager;
    this.rosterManager = rosterManager;
    this.state = null;
  }

  normalizedPhases(enemy) {
    const base = { id:"base", name:"第1フェーズ", hpThreshold:100, shield:enemy.shield, shieldRecovery:enemy.shieldRecovery ?? enemy.shield, weakWeapons:enemy.weakWeapons ?? [], weakElements:enemy.weakElements ?? [], pdef:enemy.pdef, edef:enemy.edef };
    const phases = Array.isArray(enemy.phases) && enemy.phases.length ? enemy.phases.map((p,i)=>({...base,...p,id:p.id??`phase_${i+1}`,name:p.name??`第${i+1}フェーズ`,hpThreshold:Number(p.hpThreshold??(i?0:100))})) : [base];
    return phases.sort((a,b)=>b.hpThreshold-a.hpThreshold);
  }

  create(enemyId) {
    const enemy = structuredClone(this.repo.getEnemy(enemyId));
    if (!enemy) throw new Error("敵を選択してください。");
    const members = this.formationManager.getMemberIds();
    if (!members.length) throw new Error("先に8人隊列を編成してください。");
    this.formationManager.resetBattle();
    for (const id of members) {
      const equipped = this.equipmentManager?.applyToCharacter(this.repo.getCharacter(id)) ?? this.repo.getCharacter(id);
      this.formationManager.sp[id] = Number(equipped?.maxSp ?? equipped?.sp ?? this.formationManager.sp[id] ?? 0);
    }
    const phases=this.normalizedPhases(enemy);
    this.state={turn:1, enemy:{...enemy,hp:Number(enemy.maxHp||1),shieldCurrent:Number(enemy.shield||0),brokenTurns:0,phaseIndex:0,currentPhase:phases[0],phases}, bp:Object.fromEntries(members.map(id=>[id,0])), log:[], finished:false,victory:false,totalDamage:0,breakCount:0};
    return this.state;
  }

  ability(characterId, abilityId) { return this.repo.getAbilities(characterId).find(a=>a.id===abilityId); }
  availableAbilities(characterId) {
    const all = this.repo.getAbilities(characterId).filter(a=>a.category!=="support");
    const selected = this.rosterManager?.get(characterId)?.abilityIds ?? [];
    if (!selected.length) return all;
    const filtered = all.filter(a => selected.includes(a.id));
    return filtered.length ? filtered : all;
  }
  effectsFor(characterId) {
    const managed=(this.effectManager?.getActiveEffects?.() ?? this.effectManager?.effects ?? []).map(e=>({type:e.type,value:Number(e.value||0)}));
    const supports=this.repo.getAbilities(characterId).filter(a=>a.category==="support").flatMap(a=>a.effects??[]).map(e=>({type:e.type,value:Number(e.value||0)}));
    return [...managed,...supports];
  }
  phaseForHp() {
    const s=this.state, pct=s.enemy.maxHp?100*s.enemy.hp/s.enemy.maxHp:0;
    let index=0; s.enemy.phases.forEach((p,i)=>{if(pct<=p.hpThreshold) index=i;});
    if(index===s.enemy.phaseIndex)return null;
    const previous=s.enemy.currentPhase; const p=s.enemy.phases[index];
    s.enemy.phaseIndex=index;s.enemy.currentPhase=p;s.enemy.weakWeapons=[...(p.weakWeapons??[])];s.enemy.weakElements=[...(p.weakElements??[])];s.enemy.pdef=p.pdef??s.enemy.pdef;s.enemy.edef=p.edef??s.enemy.edef;
    if(s.enemy.brokenTurns<=0)s.enemy.shieldCurrent=Number(p.shield??s.enemy.shield);
    return {from:previous?.name,to:p.name};
  }

  execute(actions={}) {
    const s=this.state;
    if(!s || s.finished) throw new Error("戦闘を開始してください。");
    const frontIds=this.formationManager.getFrontIds();
    const ordered=frontIds.map(id=>({id,character:this.equipmentManager?.applyToCharacter(this.repo.getCharacter(id)) ?? this.repo.getCharacter(id),choice:actions[id]??{}})).filter(x=>x.character).sort((a,b)=>Number(b.character.speed||0)-Number(a.character.speed||0));
    const entries=[]; let turnDamage=0; const phaseEvents=[];
    for(const item of ordered){
      if(s.enemy.hp<=0)break;
      const ability=this.ability(item.id,item.choice.abilityId);
      if(!ability){entries.push({actor:item.character.name,action:"待機",damage:0,shieldDamage:0});continue;}
      const boost=Math.max(0,Math.min(Number(ability.maxBoost??3),Number(item.choice.boost||0),Number(s.bp[item.id]||0)));
      const spCost=Math.max(0,Number(ability.sp||0));
      const currentSp=Number(this.formationManager.sp[item.id]??item.character.maxSp??0);
      if(currentSp<spCost){entries.push({actor:item.character.name,action:`${ability.name}（SP不足）`,damage:0,shieldDamage:0});continue;}
      this.formationManager.spendSp(item.id,spCost); s.bp[item.id]=Math.max(0,Number(s.bp[item.id]||0)-boost);
      let damage=0;
      if(Number(ability.power||0)>0){
        const result=this.damageEngine.calculate({attacker:item.character,ability,enemy:{...s.enemy,weakWeapons:s.enemy.currentPhase?.weakWeapons??s.enemy.weakWeapons,weakElements:s.enemy.currentPhase?.weakElements??s.enemy.weakElements,weaknessMultiplier:s.enemy.currentPhase?.weaknessMultiplier??s.enemy.weaknessMultiplier,breakMultiplier:s.enemy.currentPhase?.breakMultiplier??s.enemy.breakMultiplier},effects:this.effectsFor(item.id),boost,broken:s.enemy.brokenTurns>0});
        damage=Math.min(s.enemy.hp,result.totalDamage);s.enemy.hp-=damage;s.totalDamage+=damage;turnDamage+=damage;
      }
      const shieldDamage=s.enemy.brokenTurns>0?0:Math.min(s.enemy.shieldCurrent,Math.max(0,Number(ability.shield??ability.hits??0)));
      s.enemy.shieldCurrent-=shieldDamage;
      entries.push({actor:item.character.name,action:ability.name,boost,spCost,damage,shieldDamage});
      const pe=this.phaseForHp();if(pe)phaseEvents.push(pe);
      if(s.enemy.shieldCurrent<=0 && s.enemy.brokenTurns<=0 && s.enemy.hp>0){s.enemy.brokenTurns=Number(s.enemy.breakDuration??1);s.breakCount++;entries.push({actor:"SYSTEM",action:"BREAK",damage:0,shieldDamage:0});}
    }
    let enemyAction={action:"撃破",skipped:true};
    if(s.enemy.hp>0){
      if(s.enemy.brokenTurns>0)enemyAction={action:"ブレイク中",skipped:true};
      else enemyAction={action:(s.enemy.currentPhase?.actions??s.enemy.actions??[])[0]?.name??"通常攻撃",skipped:false};
    }
    const completedTurn=s.turn;
    for(const id of this.formationManager.getMemberIds())s.bp[id]=Math.min(5,Number(s.bp[id]||0)+1);
    if(s.enemy.brokenTurns>0){s.enemy.brokenTurns--;if(s.enemy.brokenTurns===0&&s.enemy.hp>0)s.enemy.shieldCurrent=Number(s.enemy.currentPhase?.shieldRecovery??s.enemy.shieldRecovery??s.enemy.currentPhase?.shield??s.enemy.shield);}
    const formationResult=this.formationManager.advanceTurn();
    this.effectManager?.tick?.();
    s.turn++;
    s.finished=s.enemy.hp<=0;s.victory=s.finished;
    const log={turn:completedTurn,entries,enemyAction,turnDamage,enemyHp:s.enemy.hp,enemyShield:s.enemy.shieldCurrent,broken:s.enemy.brokenTurns>0,phase:s.enemy.currentPhase?.name??"第1フェーズ",phaseEvents,swaps:formationResult.swaps,bpSnapshot:structuredClone(s.bp),spSnapshot:structuredClone(this.formationManager.sp)};
    s.log.push(log); return log;
  }

  summary(){const s=this.state;return !s?null:{turn:s.turn,enemyHp:s.enemy.hp,maxHp:s.enemy.maxHp,shield:s.enemy.shieldCurrent,phase:s.enemy.currentPhase?.name,totalDamage:s.totalDamage,breakCount:s.breakCount,victory:s.victory};}
}
