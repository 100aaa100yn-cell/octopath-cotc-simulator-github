export class StrategyOptimizer {
  static STORAGE_KEY = "octopath-cotc-strategy-optimizer-v29";

  constructor(repo, battlePlanManager, battleResultManager, strategyAdvisor, storage = globalThis.localStorage) {
    this.repo = repo;
    this.battlePlanManager = battlePlanManager;
    this.battleResultManager = battleResultManager;
    this.strategyAdvisor = strategyAdvisor;
    this.storage = storage;
    this.candidates = [];
    this.objective = "balanced";
    this.load();
  }

  ability(abilityId) { return this.repo.getAbility?.(abilityId) ?? null; }
  clonePlan(plan) { return structuredClone(plan); }

  actionValue(action = {}) {
    const ability = this.ability(action.abilityId) ?? {};
    const power = Number(ability.power ?? ability.potency ?? 0);
    const hits = Math.max(1, Number(ability.hits ?? ability.hitCount ?? 1));
    const cost = Math.max(0, Number(ability.spCost ?? ability.cost ?? 0));
    const boost = Math.max(0, Math.min(3, Number(action.boost) || 0));
    const category = String(ability.category ?? ability.type ?? "").toLowerCase();
    const support = /buff|debuff|support|heal/.test(category) ? 90 : 0;
    return { power, hits, cost, boost, support, score: power * hits * (1 + boost * .5) + support - cost * .35 };
  }

  estimate(plan, objective = this.objective) {
    let damage = 0, breakValue = 0, spCost = 0, boosted = 0, swaps = 0, idle = 0;
    for (const turn of plan.turns ?? []) {
      swaps += (turn.swaps ?? []).length;
      const actions = Object.values(turn.actions ?? {});
      if (!actions.length) idle += 1;
      for (const action of actions) {
        const value = this.actionValue(action);
        damage += value.power * Math.max(1, value.hits) * (1 + value.boost * .5);
        breakValue += value.hits;
        spCost += value.cost;
        boosted += value.boost;
        if (!action.abilityId) idle += 1;
      }
    }
    const turns = Math.max(1, plan.turns?.length ?? 0);
    const weights = objective === "speed"
      ? { damage:1.05, breakValue:45, spCost:-.18, swaps:18, idle:-180, turns:-65 }
      : objective === "damage"
        ? { damage:1.35, breakValue:25, spCost:-.08, swaps:5, idle:-120, turns:-20 }
        : objective === "efficiency"
          ? { damage:.8, breakValue:25, spCost:-.55, swaps:12, idle:-150, turns:-30 }
          : { damage:1, breakValue:35, spCost:-.25, swaps:10, idle:-160, turns:-40 };
    const raw = damage * weights.damage + breakValue * weights.breakValue + spCost * weights.spCost + swaps * weights.swaps + idle * weights.idle + turns * weights.turns;
    return { raw, damage, breakValue, spCost, boosted, swaps, idle, turns };
  }

  makeCandidate(base, kind, mutate, title, reason) {
    const plan = this.clonePlan(base);
    mutate(plan);
    const metrics = this.estimate(plan);
    return { id:`candidate_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, kind, title, reason, plan, metrics };
  }

  generate({ objective = "balanced", limit = 8 } = {}) {
    const base = this.battlePlanManager.activePlan;
    if (!base?.turns?.length) throw new Error("先に攻略プランへ1ターン以上登録してください。");
    this.objective = objective;
    const baseMetrics = this.estimate(base, objective);
    const candidates = [];

    candidates.push(this.makeCandidate(base, "boost-focus", plan => {
      const scored = [];
      plan.turns.forEach((turn, turnIndex) => Object.entries(turn.actions ?? {}).forEach(([characterId, action]) => scored.push({ turnIndex, characterId, value:this.actionValue(action).score })));
      scored.sort((a,b)=>b.value-a.value).slice(0, Math.max(1, Math.ceil(scored.length*.25))).forEach(item => { plan.turns[item.turnIndex].actions[item.characterId].boost = 3; });
    }, "主力技へBoost集中", "高威力・多段技へ最大Boostを寄せ、火力ターンを明確にします。"));

    candidates.push(this.makeCandidate(base, "break-first", plan => {
      plan.turns.slice(0,2).forEach(turn => Object.values(turn.actions ?? {}).forEach(action => { const v=this.actionValue(action); if(v.hits>=2) action.boost=Math.max(action.boost,1); }));
      if (plan.turns[2]) Object.values(plan.turns[2].actions ?? {}).forEach(action => { if(this.actionValue(action).power>0) action.boost=3; });
    }, "早期ブレイク型", "序盤の多段技へBPを配り、3ターン目前後のブレイク火力を狙います。"));

    candidates.push(this.makeCandidate(base, "sp-save", plan => {
      for (const turn of plan.turns ?? []) for (const action of Object.values(turn.actions ?? {})) if (this.actionValue(action).cost >= 40) action.boost = Math.min(action.boost, 1);
    }, "SP温存型", "高消費技の連打を抑え、長期戦での技不発リスクを下げます。"));

    candidates.push(this.makeCandidate(base, "swap-cycle", plan => {
      plan.turns.forEach((turn,index)=>{ if(index%2===1 && !(turn.swaps??[]).length) turn.swaps=[index%4]; });
    }, "交代循環型", "2ターンごとに交代を組み込み、後衛SP回復と前後衛の再利用を促します。"));

    if ((base.turns?.length ?? 0) >= 2) candidates.push(this.makeCandidate(base, "burst-earlier", plan => {
      const totals=plan.turns.map(turn=>Object.values(turn.actions??{}).reduce((sum,a)=>sum+this.actionValue(a).score,0));
      const best=totals.indexOf(Math.max(...totals));
      if(best>0) [plan.turns[best-1],plan.turns[best]]=[plan.turns[best],plan.turns[best-1]];
    }, "火力ターン前倒し", "最も強い行動セットを1ターン前へ移し、撃破ターン短縮を狙います。"));

    candidates.push(this.makeCandidate(base, "balanced-bp", plan => {
      plan.turns.forEach((turn,index)=>Object.values(turn.actions??{}).forEach(action=>{ const value=this.actionValue(action); action.boost=value.power>0 ? (index%3===2?3:Math.min(action.boost,1)) : 0; }));
    }, "3ターン周期型", "BPを2ターン温存して3ターン目に放出する周期へ整えます。"));

    this.candidates = candidates.map(candidate => {
      candidate.metrics = this.estimate(candidate.plan, objective);
      candidate.gain = candidate.metrics.raw - baseMetrics.raw;
      candidate.score = Math.max(0, Math.min(100, Math.round(70 + candidate.gain / Math.max(1, Math.abs(baseMetrics.raw)) * 100)));
      return candidate;
    }).sort((a,b)=>b.metrics.raw-a.metrics.raw).slice(0, Math.max(1, Math.min(12, Number(limit)||8)));
    this.save();
    return { objective, baseMetrics, candidates:this.candidates };
  }

  apply(candidateId, name = "") {
    const candidate = this.candidates.find(item => item.id === candidateId);
    if (!candidate) throw new Error("適用する候補が見つかりません。");
    const source = candidate.plan;
    const plan = this.battlePlanManager.createPlan(name.trim() || `${source.name}｜${candidate.title}`, source.enemyId);
    plan.turns = structuredClone(source.turns);
    plan.updatedAt = new Date().toISOString();
    this.battlePlanManager.save();
    return plan;
  }

  clear() { this.candidates=[]; this.save(); }
  exportData() { return { format:"octopath-cotc-strategy-optimizer", version:1, exportedAt:new Date().toISOString(), objective:this.objective, candidates:this.candidates }; }
  save() { try { this.storage?.setItem(StrategyOptimizer.STORAGE_KEY, JSON.stringify(this.exportData())); } catch {} }
  load() { try { const raw=this.storage?.getItem(StrategyOptimizer.STORAGE_KEY); if(raw){const data=JSON.parse(raw);this.objective=String(data.objective||"balanced");this.candidates=Array.isArray(data.candidates)?data.candidates:[];} } catch {} }
}
