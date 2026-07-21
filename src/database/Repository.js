export class Repository {
  constructor(db) {
    this.replaceDatabase(db);
  }

  replaceDatabase(db) {
    this.db = db;
    this.characterById = Object.fromEntries(db.characters.map(x => [x.id, x]));
    this.abilityById = Object.fromEntries(db.abilities.map(x => [x.id, x]));
    this.enemyById = Object.fromEntries(db.enemies.map(x => [x.id, x]));
    this.equipmentById = Object.fromEntries((db.equipment ?? []).map(x => [x.id, x]));
    this.abilitiesByOwner = {};

    for (const ability of db.abilities) {
      (this.abilitiesByOwner[ability.ownerId] ??= []).push(ability);
    }
  }

  getCharacters() { return this.db.characters; }
  getCharacter(id) { return this.characterById[id]; }
  getAbilities(ownerId) { return this.abilitiesByOwner[ownerId] ?? []; }
  getAllAbilities() { return this.db.abilities; }
  getAbility(id) { return this.abilityById[id]; }
  getEffectRule(type) { return this.db.effectRules[type]; }
  getEnemies() { return this.db.enemies; }
  getEnemy(id) { return this.enemyById[id]; }
  getDamageRules() { return this.db.damageRules; }
  getEquipmentList() { return this.db.equipment ?? []; }
  getEquipment(id) { return this.equipmentById[id]; }
}