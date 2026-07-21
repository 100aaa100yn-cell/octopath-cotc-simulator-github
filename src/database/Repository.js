export class Repository {
  constructor(db) {
    this.replaceDatabase(db);
  }

  replaceDatabase(db) {
    this.db = db;
    this.characterById = Object.fromEntries(db.characters.map(x => [x.id, x]));
    this.sourceAbilities = db.abilities.map(x => ({ ...x }));
    this.virtualAbilities = this.buildAbilityCoverage(db.characters, this.sourceAbilities);
    this.allAbilities = [...this.sourceAbilities, ...this.virtualAbilities];
    this.abilityById = Object.fromEntries(this.allAbilities.map(x => [x.id, x]));
    this.enemyById = Object.fromEntries(db.enemies.map(x => [x.id, x]));
    this.equipmentById = Object.fromEntries((db.equipment ?? []).map(x => [x.id, x]));
    this.abilitiesByOwner = {};

    for (const ability of this.allAbilities) {
      (this.abilitiesByOwner[ability.ownerId] ??= []).push(ability);
    }
  }

  buildAbilityCoverage(characters, abilities) {
    const result = [];
    const requirements = { battle: 3, ultimate: 1, ex: 1 };
    for (const character of characters) {
      const owned = abilities.filter(a => a.ownerId === character.id);
      for (const [category, minimum] of Object.entries(requirements)) {
        const count = owned.filter(a => a.category === category).length;
        for (let index = count; index < minimum; index++) {
          const categoryName = category === "battle" ? "バトルアビリティ" : category === "ultimate" ? "必殺技" : "EXアビリティ";
          result.push({
            id: `placeholder_${character.id}_${category}_${index + 1}`,
            ownerId: character.id,
            category,
            name: `未登録${categoryName}${minimum > 1 ? ` ${index + 1}` : ""}`,
            power: 0,
            hits: 1,
            sp: 0,
            shield: 0,
            maxBoost: 3,
            effects: [],
            dataStatus: "incomplete",
            dataNote: "能力データが未登録です。CSVまたはデータ管理から実データへ置き換えてください。",
            isPlaceholder: true
          });
        }
      }
    }
    return result;
  }

  getCharacters() { return this.db.characters; }
  getCharacter(id) { return this.characterById[id]; }
  getAbilities(ownerId) { return this.abilitiesByOwner[ownerId] ?? []; }
  getAllAbilities() { return this.allAbilities; }
  getSourceAbilities() { return this.sourceAbilities; }
  getAbility(id) { return this.abilityById[id]; }
  getEffectRule(type) { return this.db.effectRules[type]; }
  getEnemies() { return this.db.enemies; }
  getEnemy(id) { return this.enemyById[id]; }
  getDamageRules() { return this.db.damageRules; }
  getEquipmentList() { return this.db.equipment ?? []; }
  getEquipment(id) { return this.equipmentById[id]; }
}