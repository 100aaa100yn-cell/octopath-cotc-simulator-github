export class StrategyAdvisor {
  constructor(battleResultManager, turnBattleManager) {
    this.battleResultManager = battleResultManager;
    this.turnBattleManager = turnBattleManager;
  }

  analyze(report = this.battleResultManager.analyze(), state = this.turnBattleManager.state) {
    if (!report || !report.turns) return null;
    const timeline = report.timeline ?? [];
    const logs = state?.log ?? [];
    const recommendations = [];
    const add = (priority, category, title, detail, turn = null, impact = "medium") =>
      recommendations.push({ priority, category, title, detail, turn, impact });

    const noDamageTurns = timeline.filter(t => t.damage <= 0).map(t => t.turn);
    const lowDamageThreshold = report.averageDamage * 0.45;
    const lowDamageTurns = timeline.filter(t => t.damage > 0 && t.damage < lowDamageThreshold).map(t => t.turn);
    const spFailures = [];
    const waits = [];
    for (const turn of logs) {
      for (const entry of turn.entries ?? []) {
        if (String(entry.action ?? "").includes("SP不足")) spFailures.push(turn.turn);
        if (entry.actor !== "SYSTEM" && entry.action === "待機") waits.push(turn.turn);
      }
    }

    const breakTurns = timeline.filter(t => t.broken).map(t => t.turn);
    const peakNearBreak = report.peakTurn != null && breakTurns.some(t => Math.abs(t - report.peakTurn) <= 1);
    const last = timeline.at(-1);
    const avgFinalBp = report.ranking.length ? report.finalBpTotal / report.ranking.length : 0;
    const topShare = report.ranking[0]?.share ?? 0;
    const shieldPerTurn = report.turns ? report.totalShieldDamage / report.turns : 0;

    if (!report.victory) {
      const remaining = report.enemy?.remainingHp ?? 0;
      add(1, "撃破", "火力不足を最優先で改善", `敵HPが${remaining.toLocaleString()}残っています。低火力ターンを削り、ブレイク中へ最大Boost技を集中してください。`, lowDamageTurns[0] ?? noDamageTurns[0] ?? null, "high");
    }
    if (spFailures.length) {
      add(1, "SP", "SP不足の行動を解消", `T${[...new Set(spFailures)].join("・T")}で技が不発です。後衛回復、低消費技、装備または交代タイミングを見直してください。`, spFailures[0], "high");
    }
    if (noDamageTurns.length) {
      add(2, "行動", "無ダメージターンを圧縮", `T${noDamageTurns.join("・T")}はダメージがありません。支援を同時に整えるか、攻撃役を前衛へ交代すると撃破ターンを短縮できます。`, noDamageTurns[0], "medium");
    } else if (lowDamageTurns.length) {
      add(3, "火力", "低火力ターンを改善", `T${lowDamageTurns.join("・T")}は平均の45%未満です。Boost配分や弱点攻撃を見直してください。`, lowDamageTurns[0], "medium");
    }
    if (breakTurns.length === 0 && report.initialShield > 0) {
      add(1, "ブレイク", "ブレイクを成立させる", `シールドを${report.totalShieldDamage}削りましたがブレイクできていません。多段技と弱点攻撃を前半へ寄せてください。`, 1, "high");
    } else if (!peakNearBreak && breakTurns.length) {
      add(2, "ブレイク", "最大火力をブレイクへ重ねる", `最大ダメージはT${report.peakTurn}、ブレイクはT${breakTurns.join("・T")}です。最大Boost・必殺技・耐性低下をブレイク前後へ移してください。`, breakTurns[0], "high");
    }
    if (shieldPerTurn < 1 && report.initialShield > 0 && !report.victory) {
      add(2, "盾削り", "シールド削り速度を上げる", `平均盾削りは1ターンあたり${shieldPerTurn.toFixed(1)}です。多段弱点技を持つ前衛を増やしてください。`, 1, "medium");
    }
    if (avgFinalBp >= 2) {
      add(3, "BP", "余ったBPを火力へ変換", `終了時に合計${report.finalBpTotal}BP残っています。特にブレイクターンのBoostを1段階ずつ増やせる余地があります。`, breakTurns[0] ?? report.peakTurn, "medium");
    }
    if (report.spRemainingPercent < 20) {
      add(3, "SP", "終盤のSP枯渇を予防", `SP残量率は${report.spRemainingPercent.toFixed(1)}%です。長期戦では後衛滞在を増やすか、低消費技を混ぜてください。`, last?.turn ?? null, "medium");
    }
    if (topShare > 0.65 && report.ranking.length > 1) {
      add(4, "編成", "ダメージ役の偏りを緩和", `${report.ranking[0].name}が総ダメージの${(topShare*100).toFixed(1)}%を担当しています。別の弱点アタッカーを加えると不発時の落ち込みを抑えられます。`, null, "low");
    }
    if (waits.length) {
      add(4, "行動", "待機を有効行動へ置換", `T${[...new Set(waits)].join("・T")}に待機があります。支援技、盾削り、交代のいずれかへ置き換えてください。`, waits[0], "low");
    }
    if (report.phaseChanges > 0) {
      add(5, "フェーズ", "フェーズ移行後の弱点を確認", `${report.phaseChanges}回フェーズが変化しています。移行直後の技が新しい弱点に合っているか確認してください。`, null, "low");
    }
    if (!recommendations.length) {
      add(5, "評価", "安定した戦闘プランです", "大きな損失は見つかりませんでした。装備や乱数条件を変えて結果を比較すると、さらに詰められます。", null, "low");
    }

    recommendations.sort((a,b) => a.priority - b.priority);
    let score = 45;
    score += report.victory ? 25 : 0;
    score += breakTurns.length ? 8 : 0;
    score += peakNearBreak ? 8 : 0;
    score += Math.min(8, Math.round(report.spRemainingPercent / 12.5));
    score -= Math.min(12, noDamageTurns.length * 4);
    score -= Math.min(12, spFailures.length * 6);
    score -= avgFinalBp >= 3 ? 4 : 0;
    score = Math.max(0, Math.min(100, score));

    return {
      generatedAt: new Date().toISOString(),
      score,
      grade: score >= 90 ? "S" : score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D",
      headline: recommendations[0].title,
      recommendationCount: recommendations.length,
      recommendations,
      diagnostics: { noDamageTurns, lowDamageTurns, spFailures, waits, breakTurns, peakNearBreak, avgFinalBp, topShare, shieldPerTurn }
    };
  }

  exportData() {
    const advice = this.analyze();
    if (!advice) throw new Error("分析できる戦闘結果がありません。");
    return { format: "octopath-cotc-strategy-advice", version: 1, advice };
  }
}
