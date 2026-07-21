export class BattleResultManager {
  constructor(turnBattleManager, formationManager, repo) {
    this.turnBattleManager = turnBattleManager;
    this.formationManager = formationManager;
    this.repo = repo;
  }

  analyze(state = this.turnBattleManager.state) {
    if (!state) return null;
    const logs = state.log ?? [];
    const totalDamage = logs.reduce((sum, turn) => sum + Number(turn.turnDamage || 0), 0);
    const activeTurns = logs.filter(turn => Number(turn.turnDamage || 0) > 0);
    const peak = logs.reduce((best, turn) => Number(turn.turnDamage || 0) > Number(best?.turnDamage || 0) ? turn : best, null);
    const actorDamage = {};
    const actorActions = {};
    let totalShieldDamage = 0;
    let totalSpSpent = 0;
    let boostedActions = 0;
    let phaseChanges = 0;
    for (const turn of logs) {
      phaseChanges += (turn.phaseEvents ?? []).length;
      for (const entry of turn.entries ?? []) {
        if (entry.actor === "SYSTEM") continue;
        actorDamage[entry.actor] = (actorDamage[entry.actor] ?? 0) + Number(entry.damage || 0);
        actorActions[entry.actor] = (actorActions[entry.actor] ?? 0) + 1;
        totalShieldDamage += Number(entry.shieldDamage || 0);
        totalSpSpent += Number(entry.spCost || 0);
        if (Number(entry.boost || 0) > 0) boostedActions++;
      }
    }
    const ranking = Object.entries(actorDamage).map(([name, damage]) => ({
      name, damage, actions: actorActions[name] ?? 0,
      share: totalDamage ? damage / totalDamage : 0
    })).sort((a,b)=>b.damage-a.damage);
    const maxHp = Number(state.enemy.maxHp || 1);
    const initialShield = Number(state.enemy.shield || state.enemy.phases?.[0]?.shield || 0);
    const timeline = logs.map(turn => ({
      turn: turn.turn,
      damage: Number(turn.turnDamage || 0),
      hp: Number(turn.enemyHp || 0),
      hpPercent: Math.max(0, 100 * Number(turn.enemyHp || 0) / maxHp),
      shield: Number(turn.enemyShield || 0),
      broken: (turn.entries ?? []).some(e => e.actor === "SYSTEM" && e.action === "BREAK") || Boolean(turn.broken),
      phase: turn.phase,
      bp: turn.bpSnapshot ?? {},
      sp: turn.spSnapshot ?? {}
    }));
    const finalBp = logs.at(-1)?.bpSnapshot ?? state.bp ?? {};
    const finalSp = logs.at(-1)?.spSnapshot ?? this.formationManager.sp ?? {};
    const bpTotal = Object.values(finalBp).reduce((s,v)=>s+Number(v||0),0);
    const spValues = Object.entries(finalSp).map(([id,value])=>({id,value:Number(value||0),max:Number(this.repo.getCharacter(id)?.maxSp || this.repo.getCharacter(id)?.sp || 0)}));
    const spRemainingPercent = spValues.reduce((s,x)=>s+x.max,0) ? 100*spValues.reduce((s,x)=>s+x.value,0)/spValues.reduce((s,x)=>s+x.max,0) : 0;
    return {
      generatedAt: new Date().toISOString(),
      enemy: { id: state.enemy.id, name: state.enemy.name, maxHp, remainingHp:Number(state.enemy.hp||0) },
      victory: Boolean(state.victory),
      turns: logs.length,
      totalDamage,
      averageDamage: logs.length ? Math.round(totalDamage/logs.length) : 0,
      averageActiveDamage: activeTurns.length ? Math.round(totalDamage/activeTurns.length) : 0,
      peakDamage: Number(peak?.turnDamage || 0),
      peakTurn: peak?.turn ?? null,
      breakCount: Number(state.breakCount || 0),
      totalShieldDamage,
      totalSpSpent,
      boostedActions,
      phaseChanges,
      initialShield,
      finalBpTotal: bpTotal,
      spRemainingPercent,
      ranking,
      timeline
    };
  }

  exportData() {
    const report=this.analyze();
    if(!report) throw new Error("戦闘結果がありません。");
    return { format:"octopath-cotc-battle-result", version:1, report, battleState:this.turnBattleManager.state };
  }

  toCsv(report=this.analyze()) {
    if(!report) throw new Error("戦闘結果がありません。");
    const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
    const rows=[["turn","damage","enemyHp","enemyHpPercent","shield","break","phase"]];
    for(const t of report.timeline) rows.push([t.turn,t.damage,t.hp,t.hpPercent.toFixed(2),t.shield,t.broken?1:0,t.phase]);
    rows.push([],["character","damage","actions","sharePercent"]);
    for(const r of report.ranking) rows.push([r.name,r.damage,r.actions,(100*r.share).toFixed(2)]);
    return "\uFEFF"+rows.map(row=>row.map(esc).join(",")).join("\r\n");
  }
}
