export class EffectManager {
  static STORAGE_KEY = "octopath-cotc-effects-v2";
  static DEFINITIONS = {
    physical_attack_up: { label: "物攻UP", cap: 50, side: "ally" },
    element_attack_up: { label: "属攻UP", cap: 50, side: "ally" },
    weapon_damage_up: { label: "武器ダメージUP", cap: 30, side: "ally" },
    damage_up: { label: "ダメージUP", cap: 30, side: "ally" },
    weapon_resistance_down: { label: "武器耐性DOWN", cap: 30, side: "enemy" },
    element_resistance_down: { label: "属性耐性DOWN", cap: 30, side: "enemy" },
    physical_defense_down: { label: "物防DOWN", cap: 30, side: "enemy" },
    element_defense_down: { label: "属防DOWN", cap: 30, side: "enemy" },
    critical_rate_up: { label: "会心率UP", cap: 100, side: "ally" },
    guaranteed_critical: { label: "必ず会心", cap: 1, side: "ally", boolean: true },
    damage_cap_up: { label: "ダメージ上限UP", cap: 999, side: "ally" },
    ultimate_power: { label: "必殺威力UP", cap: 100, side: "ally" }
  };

  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.effects = [];
    this.load();
  }
  normalize(effect = {}) {
    const definition = EffectManager.DEFINITIONS[effect.type] ?? {};
    return {
      id: effect.id ?? `effect_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      type: effect.type ?? "physical_attack_up",
      value: definition.boolean ? 1 : Math.max(0, Number(effect.value ?? 0)),
      remainingTurns: Math.max(1, Number(effect.remainingTurns ?? effect.duration ?? 1)),
      source: String(effect.source ?? "手動"),
      side: effect.side ?? definition.side ?? "ally",
      enabled: effect.enabled !== false
    };
  }
  add(effect) { const next=this.normalize(effect); this.effects.push(next); this.save(); return next; }
  update(id, patch) { const i=this.effects.findIndex(x=>x.id===id); if(i<0)return null; this.effects[i]=this.normalize({...this.effects[i],...patch,id}); this.save(); return this.effects[i]; }
  remove(id) { this.effects=this.effects.filter(x=>x.id!==id); this.save(); }
  clear() { this.effects=[]; this.save(); }
  tick(turns=1) { this.effects=this.effects.map(x=>({...x,remainingTurns:x.remainingTurns-turns})).filter(x=>x.remainingTurns>0); this.save(); return this.list(); }
  list(side=null) { return this.effects.filter(x=>x.enabled && (!side || x.side===side)).map(x=>({...x})); }
  totals() {
    const totals={};
    for(const effect of this.list()) totals[effect.type]=(totals[effect.type]??0)+effect.value;
    for(const [type,value] of Object.entries(totals)) {
      const def=EffectManager.DEFINITIONS[type];
      if(def?.cap!==undefined) totals[type]=Math.min(value,def.cap);
    }
    return totals;
  }
  toDamageEffects() {
    const allowed=new Set(["physical_attack_up","element_attack_up","weapon_damage_up","damage_up","weapon_resistance_down","element_resistance_down","damage_cap_up","ultimate_power"]);
    return Object.entries(this.totals()).filter(([type])=>allowed.has(type)).map(([type,value])=>({type,value}));
  }
  applyEnemy(enemy) {
    const totals=this.totals();
    return {...enemy,
      pdef: Math.max(1, Math.round((enemy.pdef??1)*(1-(totals.physical_defense_down??0)/100))),
      edef: Math.max(1, Math.round((enemy.edef??1)*(1-(totals.element_defense_down??0)/100)))
    };
  }
  shouldForceCritical() { return (this.totals().guaranteed_critical??0)>0; }
  exportJson() { return JSON.stringify({version:1,effects:this.effects},null,2); }
  importJson(text) { const data=typeof text==='string'?JSON.parse(text):text; this.effects=(data.effects??[]).map(x=>this.normalize(x)); this.save(); return this.list(); }
  save() { try { this.storage?.setItem(EffectManager.STORAGE_KEY,JSON.stringify(this.effects)); } catch {} }
  load() { try { const raw=this.storage?.getItem(EffectManager.STORAGE_KEY); this.effects=raw?JSON.parse(raw).map(x=>this.normalize(x)):[]; } catch { this.effects=[]; } }
}