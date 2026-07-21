export class BattleComparisonManager {
  static STORAGE_KEY = "octopath-cotc-battle-comparisons-v28";

  constructor(battleResultManager, strategyAdvisor, battlePlanManager, storage = globalThis.localStorage) {
    this.battleResultManager = battleResultManager;
    this.strategyAdvisor = strategyAdvisor;
    this.battlePlanManager = battlePlanManager;
    this.storage = storage;
    this.snapshots = [];
    this.selectedIds = [];
    this.load();
  }

  normalize(snapshot = {}, index = 0) {
    const report = snapshot.report ?? {};
    const advice = snapshot.advice ?? {};
    return {
      id: String(snapshot.id ?? `comparison_${Date.now()}_${index}`),
      name: String(snapshot.name ?? `比較結果 ${index + 1}`),
      planId: String(snapshot.planId ?? ""),
      planName: String(snapshot.planName ?? "未保存プラン"),
      enemyId: String(report.enemy?.id ?? snapshot.enemyId ?? ""),
      enemyName: String(report.enemy?.name ?? snapshot.enemyName ?? "敵"),
      createdAt: String(snapshot.createdAt ?? new Date().toISOString()),
      report: structuredClone(report),
      advice: structuredClone(advice)
    };
  }

  capture(name = "") {
    const report = this.battleResultManager.analyze();
    if (!report || !report.turns) throw new Error("保存できる戦闘結果がありません。");
    const advice = this.strategyAdvisor.analyze(report) ?? { score: 0, grade: "-", recommendations: [] };
    const plan = this.battlePlanManager.activePlan;
    const snapshot = this.normalize({
      id: `comparison_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || `${plan?.name ?? report.enemy.name}｜${report.turns}T`,
      planId: plan?.id ?? "",
      planName: plan?.name ?? "手動戦闘",
      createdAt: new Date().toISOString(),
      report,
      advice
    });
    this.snapshots.unshift(snapshot);
    this.selectedIds = [snapshot.id, ...this.selectedIds].filter((id, i, all) => all.indexOf(id) === i).slice(0, 4);
    this.save();
    return snapshot;
  }

  remove(id) {
    this.snapshots = this.snapshots.filter(item => item.id !== id);
    this.selectedIds = this.selectedIds.filter(item => item !== id);
    this.save();
  }

  clear() { this.snapshots = []; this.selectedIds = []; this.save(); }

  toggle(id) {
    if (!this.snapshots.some(item => item.id === id)) return;
    if (this.selectedIds.includes(id)) this.selectedIds = this.selectedIds.filter(item => item !== id);
    else {
      if (this.selectedIds.length >= 4) throw new Error("比較できる結果は最大4件です。");
      this.selectedIds.push(id);
    }
    this.save();
  }

  get selected() { return this.selectedIds.map(id => this.snapshots.find(item => item.id === id)).filter(Boolean); }

  compare(items = this.selected) {
    if (!items.length) return null;
    const metrics = [
      { key:"turns", label:"ターン", unit:"T", direction:"min", value:s=>Number(s.report.turns||0) },
      { key:"totalDamage", label:"総ダメージ", unit:"", direction:"max", value:s=>Number(s.report.totalDamage||0) },
      { key:"averageDamage", label:"平均ダメージ", unit:"", direction:"max", value:s=>Number(s.report.averageDamage||0) },
      { key:"peakDamage", label:"最大ダメージ", unit:"", direction:"max", value:s=>Number(s.report.peakDamage||0) },
      { key:"breakCount", label:"ブレイク", unit:"回", direction:"max", value:s=>Number(s.report.breakCount||0) },
      { key:"spEfficiency", label:"SP効率", unit:" dmg/SP", direction:"max", value:s=>Number(s.report.totalDamage||0)/Math.max(1,Number(s.report.totalSpSpent||0)) },
      { key:"spRemaining", label:"SP残量", unit:"%", direction:"max", value:s=>Number(s.report.spRemainingPercent||0) },
      { key:"score", label:"改善スコア", unit:"点", direction:"max", value:s=>Number(s.advice.score||0) }
    ];
    const rows = metrics.map(metric => {
      const values = items.map(item => ({ id:item.id, value:metric.value(item) }));
      const target = metric.direction === "min" ? Math.min(...values.map(x=>x.value)) : Math.max(...values.map(x=>x.value));
      return { ...metric, values, winnerIds:values.filter(x=>x.value===target).map(x=>x.id) };
    });
    const base = items[0];
    return {
      generatedAt:new Date().toISOString(),
      baseId:base.id,
      items,
      rows,
      sameEnemy:items.every(item=>item.enemyId===base.enemyId),
      fastest:rows.find(row=>row.key==="turns")?.winnerIds ?? [],
      highestScore:rows.find(row=>row.key==="score")?.winnerIds ?? []
    };
  }

  exportData() { return { format:"octopath-cotc-battle-comparisons", version:1, exportedAt:new Date().toISOString(), selectedIds:this.selectedIds, snapshots:this.snapshots }; }
  importData(payload={}) {
    if (!Array.isArray(payload.snapshots)) throw new Error("比較結果JSONの形式が正しくありません。");
    this.snapshots = payload.snapshots.map((item,index)=>this.normalize(item,index));
    this.selectedIds = (payload.selectedIds ?? []).filter(id=>this.snapshots.some(item=>item.id===id)).slice(0,4);
    this.save();
  }

  toCsv(comparison=this.compare()) {
    if (!comparison) throw new Error("比較する結果を選択してください。");
    const esc=value=>`"${String(value??"").replaceAll('"','""')}"`;
    const rows=[["metric",...comparison.items.map(item=>item.name)]];
    for (const row of comparison.rows) rows.push([row.label,...row.values.map(item=>item.value.toFixed(row.key==="spEfficiency"?1:row.key==="spRemaining"?1:0))]);
    return "\uFEFF"+rows.map(row=>row.map(esc).join(",")).join("\r\n");
  }

  save() { try { this.storage?.setItem(BattleComparisonManager.STORAGE_KEY, JSON.stringify(this.exportData())); } catch {} }
  load() { try { const raw=this.storage?.getItem(BattleComparisonManager.STORAGE_KEY); if(raw)this.importData(JSON.parse(raw)); } catch(error) { console.warn("比較結果を復元できませんでした。", error); } }
}
