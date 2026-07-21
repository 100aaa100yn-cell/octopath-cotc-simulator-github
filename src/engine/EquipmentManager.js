export class EquipmentManager {
  constructor(repository, storageKey = "octopath-cotc-equipment-v21") {
    this.repo = repository;
    this.storageKey = storageKey;
    this.loadouts = {};
    this.templates = {};
    this.load();
  }

  defaultLoadout() {
    return {
      weapon: "", head: "", body: "", arm: "",
      accessory1: "", accessory2: "",
      souls: Array.from({ length: 5 }, () => ({ stat: "", value: 0 })),
      customEffects: { damageCap: 0, physicalDamage: 0, elementalDamage: 0, critical: 0 }
    };
  }

  normalizeLoadout(value = {}) {
    const base = this.defaultLoadout();
    const legacyArmor = value.armor ?? "";
    const souls = Array.from({ length: 5 }, (_, index) => {
      const soul = value.souls?.[index] ?? {};
      return { stat: String(soul.stat ?? ""), value: Number(soul.value ?? 0) || 0 };
    });
    return {
      ...base,
      ...value,
      head: value.head ?? "",
      body: value.body ?? legacyArmor,
      arm: value.arm ?? "",
      souls,
      customEffects: { ...base.customEffects, ...(value.customEffects ?? {}) }
    };
  }

  setLoadouts(loadouts = {}) {
    this.loadouts = Object.fromEntries(Object.entries(loadouts ?? {}).map(([id, value]) => [id, this.normalizeLoadout(value)]));
    this.save();
  }
  getLoadouts() { return structuredClone(this.loadouts); }
  getLoadout(characterId) { return this.normalizeLoadout(this.loadouts[characterId]); }

  equip(characterId, slot, equipmentId) {
    const character = this.repo.getCharacter(characterId);
    if (!character) throw new Error("キャラクターが見つかりません。");
    const item = equipmentId ? this.repo.getEquipment(equipmentId) : null;
    const expectedSlot = slot.startsWith("accessory") ? "accessory" : slot;
    if (item && item.slot !== expectedSlot) throw new Error("装備スロットが一致しません。");
    if (item?.slot === "weapon" && item.weapon && item.weapon !== character.weapon) throw new Error(`${character.name}は${item.weapon}武器を装備できません。`);
    this.loadouts[characterId] = { ...this.getLoadout(characterId), [slot]: equipmentId ?? "" };
    this.save();
  }

  setSoul(characterId, index, soul) {
    const loadout = this.getLoadout(characterId);
    loadout.souls[index] = { stat: String(soul.stat ?? ""), value: Number(soul.value ?? 0) || 0 };
    this.loadouts[characterId] = loadout;
    this.save();
  }

  setCustomEffects(characterId, effects = {}) {
    const loadout = this.getLoadout(characterId);
    loadout.customEffects = { ...loadout.customEffects, ...effects };
    this.loadouts[characterId] = loadout;
    this.save();
  }

  getItems(characterId) {
    const loadout = this.getLoadout(characterId);
    return [loadout.weapon, loadout.head, loadout.body, loadout.arm, loadout.accessory1, loadout.accessory2]
      .map(id => this.repo.getEquipment(id)).filter(Boolean);
  }

  getStatBonuses(characterId) {
    const totals = {};
    for (const item of this.getItems(characterId)) for (const [stat, value] of Object.entries(item.stats ?? {})) totals[stat] = (totals[stat] ?? 0) + Number(value || 0);
    for (const soul of this.getLoadout(characterId).souls) if (soul.stat) totals[soul.stat] = (totals[soul.stat] ?? 0) + Number(soul.value || 0);
    return totals;
  }

  getEffects(characterId) {
    const effects = { damageCap: 0, physicalDamage: 0, elementalDamage: 0, critical: 0 };
    for (const item of this.getItems(characterId)) for (const [key, value] of Object.entries(item.effects ?? {})) effects[key] = (effects[key] ?? 0) + Number(value || 0);
    for (const [key, value] of Object.entries(this.getLoadout(characterId).customEffects ?? {})) effects[key] = (effects[key] ?? 0) + Number(value || 0);
    return effects;
  }

  applyToCharacter(character) {
    if (!character) return character;
    const bonuses = this.getStatBonuses(character.id);
    const effects = this.getEffects(character.id);
    const result = { ...character, equipmentBonuses: bonuses, equipmentEffects: effects };
    for (const stat of ["hp", "patk", "eatk", "pdef", "edef", "speed", "critical", "maxSp"]) result[stat] = Number(character[stat] ?? 0) + Number(bonuses[stat] ?? 0);
    return result;
  }

  saveTemplate(name, characterId) {
    const clean = String(name ?? "").trim();
    if (!clean) throw new Error("テンプレート名を入力してください。");
    this.templates[clean] = this.getLoadout(characterId);
    this.save();
  }
  applyTemplate(name, characterId) {
    if (!this.templates[name]) throw new Error("テンプレートが見つかりません。");
    const template = this.normalizeLoadout(this.templates[name]);
    const character = this.repo.getCharacter(characterId);
    const weapon = template.weapon ? this.repo.getEquipment(template.weapon) : null;
    if (weapon?.weapon && weapon.weapon !== character.weapon) template.weapon = "";
    this.loadouts[characterId] = template;
    this.save();
  }
  deleteTemplate(name) { delete this.templates[name]; this.save(); }
  getTemplates() { return structuredClone(this.templates); }

  exportData() { return { version: 2.1, exportedAt: new Date().toISOString(), loadouts: this.loadouts, templates: this.templates }; }
  importData(payload) {
    const loadouts = payload?.loadouts ?? payload;
    if (!loadouts || typeof loadouts !== "object" || Array.isArray(loadouts)) throw new Error("装備データの形式が正しくありません。");
    this.loadouts = Object.fromEntries(Object.entries(loadouts).map(([id, value]) => [id, this.normalizeLoadout(value)]));
    this.templates = payload?.templates && typeof payload.templates === "object" ? structuredClone(payload.templates) : {};
    this.save();
  }
  save() { try { localStorage.setItem(this.storageKey, JSON.stringify(this.exportData())); } catch (error) { console.warn("装備データを保存できませんでした。", error); } }
  load() { try { const raw=localStorage.getItem(this.storageKey); if(raw) this.importData(JSON.parse(raw)); } catch(error) { console.warn("装備データを復元できませんでした。", error); this.loadouts={}; this.templates={}; } }
}