export class RosterManager {
  constructor(repo, storageKey = "octopath-cotc-my-roster-v2") {
    this.repo = repo;
    this.storageKey = storageKey;
    this.entries = {};
    this.load();
  }

  defaultEntry(character) {
    return {
      owned: true,
      enabled: true,
      level: Math.min(100, Number(character.level ?? 100)),
      awakening: 0,
      ultimateLevel: 1,
      exUnlocked: false,
      abilityIds: [],
      note: ""
    };
  }

  normalizeEntry(character, value = {}) {
    const base = this.defaultEntry(character);
    return {
      owned: value.owned === undefined ? base.owned : Boolean(value.owned),
      enabled: value.enabled === undefined ? base.enabled : Boolean(value.enabled),
      level: Math.max(1, Math.min(120, Number(value.level ?? base.level) || base.level)),
      awakening: Math.max(0, Math.min(4, Number(value.awakening ?? 0) || 0)),
      ultimateLevel: Math.max(1, Math.min(10, Number(value.ultimateLevel ?? 1) || 1)),
      exUnlocked: Boolean(value.exUnlocked),
      abilityIds: Array.isArray(value.abilityIds) ? [...new Set(value.abilityIds.map(String))].slice(0, 6) : [],
      note: String(value.note ?? "")
    };
  }

  get(characterId) {
    const character = this.repo.getCharacter(characterId);
    if (!character) return null;
    if (!this.entries[characterId]) this.entries[characterId] = this.defaultEntry(character);
    return { ...this.entries[characterId] };
  }

  set(characterId, patch) {
    const character = this.repo.getCharacter(characterId);
    if (!character) return null;
    this.entries[characterId] = this.normalizeEntry(character, { ...this.get(characterId), ...patch });
    this.save();
    return this.get(characterId);
  }

  setAll(patch) {
    for (const character of this.repo.getCharacters()) this.set(character.id, patch);
    this.save();
  }

  isAvailable(characterId) {
    const entry = this.get(characterId);
    return Boolean(entry?.owned && entry?.enabled);
  }

  getAvailableIds() {
    return this.repo.getCharacters().filter(c => this.isAvailable(c.id)).map(c => c.id);
  }

  getSummary() {
    const characters = this.repo.getCharacters();
    const entries = characters.map(c => this.get(c.id));
    return {
      total: characters.length,
      owned: entries.filter(x => x.owned).length,
      enabled: entries.filter(x => x.owned && x.enabled).length,
      awakening4: entries.filter(x => x.owned && x.awakening === 4).length,
      exUnlocked: entries.filter(x => x.owned && x.exUnlocked).length
    };
  }

  exportData() {
    return { version: 3.1, exportedAt: new Date().toISOString(), roster: this.entries };
  }

  importData(payload) {
    const source = payload?.roster ?? payload;
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("旅団データの形式が正しくありません。");
    const next = {};
    for (const character of this.repo.getCharacters()) {
      if (source[character.id]) next[character.id] = this.normalizeEntry(character, source[character.id]);
    }
    this.entries = next;
    this.save();
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.exportData()));
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      this.importData(JSON.parse(raw));
    } catch (error) {
      console.warn("マイ旅団データを復元できませんでした。", error);
      this.entries = {};
    }
  }
}
