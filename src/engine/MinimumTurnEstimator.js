export class MinimumTurnEstimator {
  constructor(repo, damageEngine, formationManager, rosterManager, equipmentManager) {
    this.repo=repo; this.damageEngine=damageEngine; this.formationManager=formationManager;
    this.rosterManager=rosterManager; this.equipmentManager=equipmentManager;
  }
  abilities(id){
    const all=this.repo.getAbilities(id).filter(a=>a.category!=="support");
    const ids=this.rosterManager.get(id)?.abilityIds??[];
    const selected=ids.length?all.filter(a=>ids.includes(a.id)):all;
    return selected.filter(a=>!a.isPlaceholder && (Number(a.power||0)>0 || Number(a.shield||a.hits||0)>0));
  }
  estimate(enemyId,{maxTurns=30}={}){
    const enemy=structuredClone(this.repo.getEnemy(enemyId));
    if(!enemy) throw new Error("敵を選択してください。");
    const ids=this.formationManager.getFrontIds();
    if(!ids.length) throw new Error("前衛を編成してください。");
    const chars=ids.map(id=>this.equipmentManager.applyToCharacter(this.repo.getCharacter(id)));
    let hp=Number(enemy.maxHp||1), shield=Number(enemy.shield||0), broken=0, total=0;
    const bp=Object.fromEntries(ids.map(id=>[id,0]));
    const sp=Object.fromEntries(chars.map(c=>[c.id,Number(c.maxSp||c.sp||0)]));
    const timeline=[]; let missing=0;
    for(let turn=1;turn<=maxTurns;turn++){
      let turnDamage=0, shieldDamage=0; const actions=[];
      for(const c of chars){
        const abilities=this.abilities(c.id); if(!abilities.length){missing++;actions.push(`${c.name}:有効技なし`);continue;}
        const candidates=[];
        for(const a of abilities){
          if(sp[c.id]<Number(a.sp||0)) continue;
          for(let boost=0;boost<=Math.min(3,bp[c.id]);boost++){
            const r=this.damageEngine.calculate({attacker:c,ability:a,enemy, effects:[],boost,broken:broken>0});
            candidates.push({a,boost,damage:Number(r.totalDamage||0),shield:Number(a.shield??a.hits??0)});
          }
        }
        if(!candidates.length){actions.push(`${c.name}:SP不足`);continue;}
        candidates.sort((x,y)=> broken>0 ? y.damage-x.damage : (shield>0 ? (y.shield-x.shield || y.damage-x.damage) : y.damage-x.damage));
        const pick=candidates[0]; sp[c.id]-=Number(pick.a.sp||0); bp[c.id]-=pick.boost;
        const sd=broken>0?0:Math.min(shield,pick.shield); shield-=sd; shieldDamage+=sd;
        const dmg=Math.min(hp,pick.damage); hp-=dmg; turnDamage+=dmg; total+=dmg;
        actions.push(`${c.name}:${pick.a.name}${pick.boost?` B${pick.boost}`:""}`);
        if(shield<=0 && broken<=0 && hp>0) broken=1;
      }
      timeline.push({turn,damage:turnDamage,shieldDamage,hp,shield,actions});
      if(hp<=0) return {turns:turn,totalDamage:total,timeline,confidence:this.confidence(ids),missing};
      for(const id of ids) bp[id]=Math.min(5,bp[id]+1);
      if(broken>0){broken--;if(broken===0)shield=Number(enemy.shieldRecovery??enemy.shield??0);}
    }
    return {turns:null,totalDamage:total,timeline,confidence:this.confidence(ids),missing,remainingHp:hp};
  }
  confidence(ids){
    const all=ids.flatMap(id=>this.rosterManager.get(id)?.abilityIds??[]).map(id=>this.repo.getAbility(id)).filter(Boolean);
    if(!all.length)return 25;
    return Math.round(100*all.filter(a=>!a.isPlaceholder && a.dataStatus!=="incomplete").length/all.length);
  }
}
