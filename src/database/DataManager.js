import { DatabaseValidator } from "./Validator.js";

export class DataManager {
  constructor(db) {
    this.original = structuredClone(db);
    this.db = structuredClone(db);
  }

  getDatabase() {
    return this.db;
  }

  replaceDatabase(nextDb) {
    this.db = structuredClone(nextDb);
    return this.validate();
  }

  replace(nextDb) {
    return this.replaceDatabase(nextDb);
  }

  reset() {
    this.db = structuredClone(this.original);
    return this.validate();
  }

  validate() {
    return new DatabaseValidator(this.db).run();
  }

  exportJson() {
    return JSON.stringify(this.db, null, 2);
  }

  getCollection(name) {
    if (name === "effectRules") return this.db.effectRules;
    if (name === "damageRules") return this.db.damageRules;
    return this.db[name];
  }

  saveCollection(name, value) {
    if (name === "effectRules" || name === "damageRules") {
      if (!value || Array.isArray(value) || typeof value !== "object") {
        throw new Error("effectRulesはオブジェクトである必要があります。");
      }
    } else if (!Array.isArray(value)) {
      throw new Error(`${name}は配列である必要があります。`);
    }

    this.db[name] = value;
    return this.validate();
  }

  addCharacter(character) {
    this.db.characters.push(character);
    return this.validate();
  }

  addAbility(ability) {
    this.db.abilities.push(ability);

    const owner = this.db.characters.find(x => x.id === ability.ownerId);
    if (owner) {
      if (ability.category === "support") {
        owner.supportIds ??= [];
        if (!owner.supportIds.includes(ability.id)) owner.supportIds.push(ability.id);
      } else if (ability.category === "battle") {
        owner.battleIds ??= [];
        if (!owner.battleIds.includes(ability.id)) owner.battleIds.push(ability.id);
      } else if (ability.category === "ultimate") {
        owner.ultimateId = ability.id;
      } else if (ability.category === "ex") {
        owner.exId = ability.id;
      }
    }

    return this.validate();
  }

  addEquipment(equipment) {
    this.db.equipment ??= [];
    this.db.equipment.push(equipment);
    return this.validate();
  }

  addEnemy(enemy) {
    this.db.enemies.push(enemy);
    return this.validate();
  }
}