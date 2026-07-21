export class FormationManager {
  static STORAGE_KEY = "octopath-cotc-formation-v23";

  constructor(repo, rosterManager, storage = globalThis.localStorage) {
    this.repo = repo;
    this.rosterManager = rosterManager;
    this.storage = storage;
    this.pairs = Array.from({ length: 4 }, () => ({ front: "", back: "" }));
    this.swapPlan = [];
    this.currentTurn = 1;
    this.sp = {};
    this.reserveSpRecoveryRate = 10;
    this.load();
  }

  normalizePairs(pairs = []) {
    const used = new Set();
    return Array.from({ length: 4 }, (_, index) => {
      const source = pairs[index] ?? {};
      const normalizeId = id => {
        const value = String(id ?? "");
        if (!value || used.has(value) || !this.repo.getCharacter(value) || !this.rosterManager.isAvailable(value)) return "";
        used.add(value);
        return value;
      };
      return { front: normalizeId(source.front), back: normalizeId(source.back) };
    });
  }

  setSlot(pairIndex, position, characterId) {
    if (!["front", "back"].includes(position) || pairIndex < 0 || pairIndex > 3) return;
    const next = this.pairs.map(pair => ({ ...pair }));
    for (const pair of next) {
      if (pair.front === characterId) pair.front = "";
      if (pair.back === characterId) pair.back = "";
    }
    next[pairIndex][position] = characterId;
    this.pairs = this.normalizePairs(next);
    this.ensureSp();
    this.save();
  }

  clear() {
    this.pairs = Array.from({ length: 4 }, () => ({ front: "", back: "" }));
    this.swapPlan = [];
    this.currentTurn = 1;
    this.sp = {};
    this.save();
  }

  autoFill(ids = []) {
    const candidates = ids.length ? ids : this.rosterManager.getAvailableIds();
    this.pairs = Array.from({ length: 4 }, (_, i) => ({ front: candidates[i] ?? "", back: candidates[i + 4] ?? "" }));
    this.pairs = this.normalizePairs(this.pairs);
    this.currentTurn = 1;
    this.ensureSp(true);
    this.save();
  }

  swap(pairIndex) {
    if (pairIndex < 0 || pairIndex > 3) return;
    const pair = this.pairs[pairIndex];
    this.pairs[pairIndex] = { front: pair.back, back: pair.front };
    this.save();
  }

  addSwap(turn, pairIndex) {
    const item = { id: `swap_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, turn: Math.max(1, Number(turn)||1), pairIndex: Math.max(0, Math.min(3, Number(pairIndex)||0)) };
    this.swapPlan.push(item);
    this.swapPlan.sort((a,b)=>a.turn-b.turn || a.pairIndex-b.pairIndex);
    this.save();
    return item;
  }

  removeSwap(id) { this.swapPlan = this.swapPlan.filter(x => x.id !== id); this.save(); }

  ensureSp(reset = false) {
    const ids = this.getMemberIds();
    for (const id of ids) {
      const max = Number(this.repo.getCharacter(id)?.maxSp ?? this.repo.getCharacter(id)?.sp ?? 0);
      if (reset || this.sp[id] === undefined) this.sp[id] = max;
      this.sp[id] = Math.max(0, Math.min(max, Number(this.sp[id]) || 0));
    }
    for (const id of Object.keys(this.sp)) if (!ids.includes(id)) delete this.sp[id];
  }

  getMemberIds() { return this.pairs.flatMap(pair => [pair.front, pair.back]).filter(Boolean); }
  getFrontIds() { return this.pairs.map(pair => pair.front).filter(Boolean); }
  getBackIds() { return this.pairs.map(pair => pair.back).filter(Boolean); }

  spendSp(characterId, amount) {
    this.ensureSp();
    this.sp[characterId] = Math.max(0, (this.sp[characterId] ?? 0) - Math.max(0, Number(amount)||0));
    this.save();
  }

  advanceTurn() {
    const turn = this.currentTurn;
    const swaps = this.swapPlan.filter(item => item.turn === turn);
    for (const item of swaps) this.swap(item.pairIndex);
    this.ensureSp();
    for (const id of this.getBackIds()) {
      const character = this.repo.getCharacter(id);
      const max = Number(character?.maxSp ?? character?.sp ?? 0);
      this.sp[id] = Math.min(max, (this.sp[id] ?? max) + Math.ceil(max * this.reserveSpRecoveryRate / 100));
    }
    this.currentTurn += 1;
    this.save();
    return { turn, swaps: swaps.map(x => ({ ...x })), front: this.getFrontIds(), back: this.getBackIds(), sp: { ...this.sp } };
  }

  resetBattle() { this.currentTurn = 1; this.ensureSp(true); this.save(); }

  summary() {
    return { members: this.getMemberIds().length, front: this.getFrontIds().length, back: this.getBackIds().length, plannedSwaps: this.swapPlan.length, currentTurn: this.currentTurn };
  }

  exportData() {
    return { version: 1, exportedAt: new Date().toISOString(), pairs: this.pairs, swapPlan: this.swapPlan, currentTurn: this.currentTurn, sp: this.sp, reserveSpRecoveryRate: this.reserveSpRecoveryRate };
  }

  importData(payload = {}) {
    this.pairs = this.normalizePairs(payload.pairs);
    this.swapPlan = Array.isArray(payload.swapPlan) ? payload.swapPlan.map(x => ({ id: String(x.id ?? `swap_${Date.now()}`), turn: Math.max(1, Number(x.turn)||1), pairIndex: Math.max(0, Math.min(3, Number(x.pairIndex)||0)) })) : [];
    this.currentTurn = Math.max(1, Number(payload.currentTurn)||1);
    this.sp = payload.sp && typeof payload.sp === "object" ? { ...payload.sp } : {};
    this.reserveSpRecoveryRate = Math.max(0, Math.min(100, Number(payload.reserveSpRecoveryRate ?? 10)||10));
    this.ensureSp(); this.save();
  }

  save() { try { this.storage?.setItem(FormationManager.STORAGE_KEY, JSON.stringify(this.exportData())); } catch {} }
  load() { try { const raw=this.storage?.getItem(FormationManager.STORAGE_KEY); if(raw) this.importData(JSON.parse(raw)); } catch(error) { console.warn("隊列データを復元できませんでした。", error); } }
}
