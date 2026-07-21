export class BattleAnalytics {
  static analyze(result) {
    const turns = result.log ?? [];
    const damages = turns.map(turn => turn.turnDamage ?? 0);
    const cumulative = [];
    let running = 0;

    for (const damage of damages) {
      running += damage;
      cumulative.push(running);
    }

    const activeTurns = damages.filter(value => value > 0);
    const peakDamage = Math.max(0, ...damages);
    const averageActiveDamage = activeTurns.length
      ? Math.round(activeTurns.reduce((sum, value) => sum + value, 0) / activeTurns.length)
      : 0;

    return {
      labels: turns.map(turn => `T${turn.turn}`),
      damageByTurn: damages,
      cumulativeDamage: cumulative,
      peakDamage,
      peakTurn: damages.indexOf(peakDamage) + 1,
      averageActiveDamage,
      breakTurns: turns.filter(turn => turn.broken).map(turn => turn.turn),
      actionCount: turns.reduce(
        (sum, turn) => sum + (turn.partyActions?.length ?? 0),
        0
      )
    };
  }
}