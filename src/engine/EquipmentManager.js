export class EquipmentManager {
  constructor(repository) {
    this.repo = repository;
    this.loadouts = {};
  }

  setLoadouts(loadouts = {}) {
    this.loadouts = structuredClone(loadouts ?? {});
  }

  getLoadouts() {
    return structuredClone(this.loadouts);
  }

  getLoadout(characterId) {
    return this.loadouts[characterId] ?? {
      weapon: "",
      armor: "",
      accessory1: "",
      accessory2: ""
    };
  }

  equip(characterId, slot, equipmentId) {
    const character = this.repo.getCharacter(characterId);
    if (!character) throw new Error("キャラクターが見つかりません。");

    const item = equipmentId ? this.repo.getEquipment(equipmentId) : null;
    const expectedSlot = slot.startsWith("accessory") ? "accessory" : slot;

    if (item && item.slot !== expectedSlot) {
      throw new Error("装備スロットが一致しません。");
    }
    if (item?.slot === "weapon" && item.weapon && item.weapon !== character.weapon) {
      throw new Error(`${character.name}は${item.weapon}武器を装備できません。`);
    }

    this.loadouts[characterId] = {
      ...this.getLoadout(characterId),
      [slot]: equipmentId ?? ""
    };
  }

  getItems(characterId) {
    return Object.values(this.getLoadout(characterId))
      .map(id => this.repo.getEquipment(id))
      .filter(Boolean);
  }

  getStatBonuses(characterId) {
    const totals = {};
    for (const item of this.getItems(characterId)) {
      for (const [stat, value] of Object.entries(item.stats ?? {})) {
        totals[stat] = (totals[stat] ?? 0) + Number(value || 0);
      }
    }
    return totals;
  }

  applyToCharacter(character) {
    if (!character) return character;
    const bonuses = this.getStatBonuses(character.id);
    const result = { ...character, equipmentBonuses: bonuses };
    for (const stat of ["hp", "patk", "eatk", "pdef", "edef", "speed", "maxSp"]) {
      result[stat] = Number(character[stat] ?? 0) + Number(bonuses[stat] ?? 0);
    }
    return result;
  }
}
