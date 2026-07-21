export class BattlePlanManager {
  static STORAGE_KEY = "octopath-cotc-battle-plans-v25";

  constructor(repo, turnBattleManager, formationManager, storage = globalThis.localStorage) {
    this.repo = repo;
    this.turnBattleManager = turnBattleManager;
    this.formationManager = formationManager;
    this.storage = storage;
    this.plans = [];
    this.activePlanId = "";
    this.cursor = 0;
    this.load();
  }

  normalizeAction(action = {}) {
    return { abilityId: String(action.abilityId ?? ""), boost: Math.max(0, Math.min(3, Number(action.boost) || 0)) };
  }

  normalizeTurn(turn = {}, index = 0) {
    const actions = {};
    for (const [characterId, action] of Object.entries(turn.actions ?? {})) {
      if (this.repo.getCharacter(characterId)) actions[characterId] = this.normalizeAction(action);
    }
    return {
      id: String(turn.id ?? `plan_turn_${Date.now()}_${index}`),
      label: String(turn.label ?? `TURN ${index + 1}`),
      actions,
      swaps: [...new Set((turn.swaps ?? []).map(Number).filter(x => x >= 0 && x <= 3))]
    };
  }

  normalizePlan(plan = {}, index = 0) {
    return {
      id: String(plan.id ?? `plan_${Date.now()}_${index}`),
      name: String(plan.name ?? `攻略プラン ${index + 1}`),
      enemyId: String(plan.enemyId ?? ""),
      turns: Array.isArray(plan.turns) ? plan.turns.map((turn, i) => this.normalizeTurn(turn, i)) : [],
      updatedAt: String(plan.updatedAt ?? new Date().toISOString())
    };
  }

  get activePlan() { return this.plans.find(plan => plan.id === this.activePlanId) ?? null; }

  createPlan(name = "新しい攻略プラン", enemyId = "") {
    const plan = this.normalizePlan({ id:`plan_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, name:name.trim() || "新しい攻略プラン", enemyId, turns:[] });
    this.plans.push(plan); this.activePlanId = plan.id; this.cursor = 0; this.save(); return plan;
  }

  selectPlan(id) { if (this.plans.some(plan => plan.id === id)) { this.activePlanId=id; this.cursor=0; this.save(); } return this.activePlan; }
  renameActive(name) { const plan=this.activePlan; if(!plan)return; plan.name=name.trim()||plan.name; plan.updatedAt=new Date().toISOString(); this.save(); }
  setEnemy(enemyId) { const plan=this.activePlan; if(!plan)return; plan.enemyId=String(enemyId||""); plan.updatedAt=new Date().toISOString(); this.save(); }

  addTurn(actions = {}, swaps = [], label = "") {
    let plan=this.activePlan; if(!plan) plan=this.createPlan();
    const turn=this.normalizeTurn({ id:`plan_turn_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, label:label || `TURN ${plan.turns.length+1}`, actions, swaps }, plan.turns.length);
    plan.turns.push(turn); plan.updatedAt=new Date().toISOString(); this.save(); return turn;
  }

  duplicateTurn(index) { const plan=this.activePlan, source=plan?.turns[index]; if(!source)return; const copy=this.normalizeTurn({...structuredClone(source),id:`plan_turn_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,label:`${source.label} コピー`},index+1); plan.turns.splice(index+1,0,copy); this.relabel(plan); this.save(); }
  removeTurn(index) { const plan=this.activePlan;if(!plan)return;plan.turns.splice(index,1);this.cursor=Math.min(this.cursor,plan.turns.length);this.relabel(plan);this.save(); }
  moveTurn(index, delta) { const plan=this.activePlan,target=index+delta;if(!plan||target<0||target>=plan.turns.length)return;[plan.turns[index],plan.turns[target]]=[plan.turns[target],plan.turns[index]];this.relabel(plan);this.save(); }
  relabel(plan=this.activePlan) { if(!plan)return; plan.turns.forEach((turn,i)=>{if(/^TURN \d+$/.test(turn.label))turn.label=`TURN ${i+1}`;});plan.updatedAt=new Date().toISOString(); }
  deleteActive() { if(!this.activePlan)return;this.plans=this.plans.filter(p=>p.id!==this.activePlanId);this.activePlanId=this.plans[0]?.id??"";this.cursor=0;this.save(); }
  resetProgress() { this.cursor=0; this.save(); }

  executeNext() {
    const plan=this.activePlan;if(!plan)throw new Error("攻略プランを選択してください。");
    const turn=plan.turns[this.cursor];if(!turn)throw new Error("未実行の計画ターンがありません。");
    if(!this.turnBattleManager.state) this.turnBattleManager.create(plan.enemyId);
    for(const pairIndex of turn.swaps) this.formationManager.addSwap(this.formationManager.currentTurn,pairIndex);
    const log=this.turnBattleManager.execute(turn.actions);this.cursor++;this.save();return {turn,log,cursor:this.cursor,done:this.cursor>=plan.turns.length||this.turnBattleManager.state?.finished};
  }

  executeAll(limit=30) { const results=[]; while(results.length<limit && this.cursor<(this.activePlan?.turns.length??0) && !this.turnBattleManager.state?.finished) results.push(this.executeNext()); return results; }

  exportData() { return {version:1,exportedAt:new Date().toISOString(),activePlanId:this.activePlanId,cursor:this.cursor,plans:this.plans}; }
  importData(payload={}) { if(!Array.isArray(payload.plans))throw new Error("攻略プランJSONの形式が正しくありません。");this.plans=payload.plans.map((p,i)=>this.normalizePlan(p,i));this.activePlanId=this.plans.some(p=>p.id===payload.activePlanId)?payload.activePlanId:(this.plans[0]?.id??"");this.cursor=Math.max(0,Math.min(Number(payload.cursor)||0,this.activePlan?.turns.length??0));this.save(); }
  save() { try{this.storage?.setItem(BattlePlanManager.STORAGE_KEY,JSON.stringify(this.exportData()));}catch{} }
  load() { try{const raw=this.storage?.getItem(BattlePlanManager.STORAGE_KEY);if(raw)this.importData(JSON.parse(raw));}catch(error){console.warn("攻略プランを復元できませんでした。",error);} }
}
