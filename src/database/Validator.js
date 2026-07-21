export class DatabaseValidator {
  constructor(db) {
    this.db = db;
    this.errors = [];
    this.warnings = [];
  }

  add(level, code, message, path = "") {
    const item = { level, code, message, path };
    if (level === "error") this.errors.push(item);
    else this.warnings.push(item);
  }

  validateRequired(object, fields, path) {
    for (const field of fields) {
      if (object[field] === undefined || object[field] === null || object[field] === "") {
        this.add("error", "REQUIRED", `必須項目「${field}」がありません。`, `${path}.${field}`);
      }
    }
  }

  validateUniqueIds(list, path) {
    const seen = new Set();
    for (const item of list) {
      if (!item.id) continue;
      if (seen.has(item.id)) {
        this.add("error", "DUPLICATE_ID", `ID「${item.id}」が重複しています。`, path);
      }
      seen.add(item.id);
    }
  }

  validateNumber(value, path, { min = -Infinity, max = Infinity } = {}) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      this.add("error", "INVALID_NUMBER", "数値ではありません。", path);
      return;
    }
    if (value < min || value > max) {
      this.add("warning", "OUT_OF_RANGE", `${min}〜${max}の範囲外です。`, path);
    }
  }

  validateCharacters() {
    const allowedRoles = new Set(["attacker", "support", "debuffer", "breaker", "healer", "tank"]);
    const allowedWeapons = new Set(["sword", "spear", "dagger", "axe", "bow", "staff", "tome", "fan"]);
    const allowedElements = new Set(["fire", "ice", "lightning", "wind", "light", "dark", "none"]);
    const allowedStatuses = new Set(["verified", "provisional", "simulator", "incomplete"]);

    this.validateUniqueIds(this.db.characters, "characters");

    this.db.characters.forEach((character, index) => {
      const path = `characters[${index}]`;
      this.validateRequired(character, ["id", "name", "weapon", "element", "role"], path);

      if (!allowedRoles.has(character.role)) {
        this.add("warning", "UNKNOWN_ROLE", `未登録の役割「${character.role}」です。`, `${path}.role`);
      }
      if (!allowedWeapons.has(character.weapon)) {
        this.add("error", "UNKNOWN_WEAPON", `未登録の武器「${character.weapon}」です。`, `${path}.weapon`);
      }
      if (!allowedElements.has(character.element)) {
        this.add("error", "UNKNOWN_ELEMENT", `未登録の属性「${character.element}」です。`, `${path}.element`);
      }
      const baseRank = Number(character.baseRank ?? character.rarity);
      if (![3, 4, 5].includes(baseRank)) {
        this.add("warning", "INVALID_BASE_RANK", "baseRankは3・4・5のいずれかです。", `${path}.baseRank`);
      }
      const status = character.dataStatus ?? "incomplete";
      if (!allowedStatuses.has(status)) {
        this.add("warning", "UNKNOWN_DATA_STATUS", `未登録のデータ品質「${status}」です。`, `${path}.dataStatus`);
      }
      if (!character.series) {
        this.add("warning", "MISSING_SERIES", "シリーズが未設定です。", `${path}.series`);
      }
      if (!Array.isArray(character.tags ?? [])) {
        this.add("error", "INVALID_TAGS", "tagsは配列である必要があります。", `${path}.tags`);
      }

      if (character.maxSp !== undefined) {
        this.validateNumber(character.maxSp, `${path}.maxSp`, { min: 0, max: 9999 });
      }
      if (character.speed !== undefined) {
        this.validateNumber(character.speed, `${path}.speed`, { min: 0, max: 9999 });
      }
      for (const field of ["hp", "patk", "eatk", "pdef", "edef", "crit"]) {
        if (character[field] !== undefined) this.validateNumber(character[field], `${path}.${field}`, { min: 0, max: 99999 });
      }
      if ((character.dataStatus === "verified" || character.dataStatus === "provisional") && !character.sourceUrl) {
        this.add("warning", "MISSING_SOURCE", "検証済み・暫定データにはsourceUrlの記録を推奨します。", `${path}.sourceUrl`);
      }

      const references = [
        ...(character.supportIds ?? []),
        ...(character.battleIds ?? []),
        character.ultimateId,
        character.exId
      ].filter(Boolean);

      for (const abilityId of references) {
        if (!this.abilityIds.has(abilityId)) {
          this.add(
            "error",
            "BROKEN_REFERENCE",
            `アビリティ「${abilityId}」が見つかりません。`,
            path
          );
        }
      }
    });
  }

  validateAbilities() {
    const categories = new Set(["support", "battle", "ultimate", "ex"]);
    const timings = new Set(["passive", "setup", "debuff", "break", "attack", "finisher"]);
    const allowedStatuses = new Set(["verified", "provisional", "simulator", "incomplete"]);

    this.validateUniqueIds(this.db.abilities, "abilities");

    this.db.abilities.forEach((ability, index) => {
      const path = `abilities[${index}]`;
      this.validateRequired(ability, ["id", "ownerId", "category", "name", "effects"], path);

      if (!this.characterIds.has(ability.ownerId)) {
        this.add(
          "error",
          "UNKNOWN_OWNER",
          `所有者「${ability.ownerId}」が見つかりません。`,
          `${path}.ownerId`
        );
      }
      if (!categories.has(ability.category)) {
        this.add("error", "UNKNOWN_CATEGORY", `未登録の分類「${ability.category}」です。`, `${path}.category`);
      }
      if (ability.timing && !timings.has(ability.timing)) {
        this.add("warning", "UNKNOWN_TIMING", `未登録のタイミング「${ability.timing}」です。`, `${path}.timing`);
      }
      const status = ability.dataStatus ?? "incomplete";
      if (!allowedStatuses.has(status)) {
        this.add("warning", "UNKNOWN_DATA_STATUS", `未登録のデータ品質「${status}」です。`, `${path}.dataStatus`);
      }

      if (!Array.isArray(ability.effects)) {
        this.add("error", "INVALID_EFFECTS", "effectsは配列である必要があります。", `${path}.effects`);
        return;
      }

      ability.effects.forEach((effect, effectIndex) => {
        const effectPath = `${path}.effects[${effectIndex}]`;
        this.validateRequired(effect, ["type", "value"], effectPath);

        if (!this.db.effectRules[effect.type]) {
          this.add(
            "error",
            "UNKNOWN_EFFECT",
            `効果タイプ「${effect.type}」がeffect-rules.jsonにありません。`,
            `${effectPath}.type`
          );
        }
        this.validateNumber(effect.value, `${effectPath}.value`, { min: -1000, max: 1000 });
      });

      for (const field of ["sp", "shield", "duration", "power", "hits", "maxBoost"]) {
        if (ability[field] !== undefined) {
          this.validateNumber(ability[field], `${path}.${field}`, { min: 0, max: 99999 });
        }
      }
    });
  }

  validateEnemies() {
    this.validateUniqueIds(this.db.enemies, "enemies");

    this.db.enemies.forEach((enemy, index) => {
      const path = `enemies[${index}]`;
      this.validateRequired(enemy, ["id", "name", "shield", "weakWeapons", "weakElements"], path);
      this.validateNumber(enemy.shield, `${path}.shield`, { min: 0, max: 999 });
      for (const field of ["level", "maxHp", "shieldRecovery", "pdef", "edef", "breakDuration", "weaknessMultiplier"]) {
        if (enemy[field] !== undefined) this.validateNumber(enemy[field], `${path}.${field}`, { min: 0, max: 999999999 });
      }
      this.validateNumber(enemy.breakMultiplier ?? 2, `${path}.breakMultiplier`, { min: 1, max: 10 });
      if (!Array.isArray(enemy.weakWeapons)) this.add("error", "INVALID_WEAKNESSES", "weakWeaponsは配列である必要があります。", `${path}.weakWeapons`);
      if (!Array.isArray(enemy.weakElements)) this.add("error", "INVALID_WEAKNESSES", "weakElementsは配列である必要があります。", `${path}.weakElements`);
      if (enemy.actions !== undefined && !Array.isArray(enemy.actions)) this.add("error", "INVALID_ACTIONS", "actionsは配列である必要があります。", `${path}.actions`);
      if (enemy.phases !== undefined && !Array.isArray(enemy.phases)) this.add("error", "INVALID_PHASES", "phasesは配列である必要があります。", `${path}.phases`);
      (enemy.phases ?? []).forEach((phase, phaseIndex) => {
        const phasePath = `${path}.phases[${phaseIndex}]`;
        this.validateRequired(phase, ["id", "hpThreshold"], phasePath);
        this.validateNumber(phase.hpThreshold, `${phasePath}.hpThreshold`, { min: 0, max: 100 });
      });
    });
  }


  validateEquipment() {
    const equipment = this.db.equipment ?? [];
    const allowedSlots = new Set(["weapon", "armor", "accessory"]);
    const allowedWeapons = new Set(["sword", "spear", "dagger", "axe", "bow", "staff", "tome", "fan"]);
    this.validateUniqueIds(equipment, "equipment");

    equipment.forEach((item, index) => {
      const path = `equipment[${index}]`;
      this.validateRequired(item, ["id", "name", "slot", "stats"], path);
      if (!allowedSlots.has(item.slot)) this.add("error", "UNKNOWN_SLOT", `未登録の装備枠「${item.slot}」です。`, `${path}.slot`);
      if (item.weapon && !allowedWeapons.has(item.weapon)) this.add("error", "UNKNOWN_WEAPON", `未登録の武器「${item.weapon}」です。`, `${path}.weapon`);
      if (!item.stats || Array.isArray(item.stats) || typeof item.stats !== "object") {
        this.add("error", "INVALID_STATS", "statsはオブジェクトである必要があります。", `${path}.stats`);
        return;
      }
      for (const [stat, value] of Object.entries(item.stats)) {
        this.validateNumber(value, `${path}.stats.${stat}`, { min: -9999, max: 99999 });
      }
    });
  }

  run() {
    this.errors = [];
    this.warnings = [];
    this.characterIds = new Set(this.db.characters.map(x => x.id));
    this.abilityIds = new Set(this.db.abilities.map(x => x.id));

    this.validateCharacters();
    this.validateAbilities();
    this.validateEnemies();
    this.validateEquipment();

    if (!this.db.damageRules || typeof this.db.damageRules !== "object") {
      this.add("error", "MISSING_DAMAGE_RULES", "damage-rules.jsonがありません。", "damageRules");
    } else {
      const constants = this.db.damageRules.constants ?? {};
      for (const field of ["criticalMultiplier", "randomMin", "randomMax"]) {
        if (constants[field] === undefined) {
          this.add("error", "MISSING_DAMAGE_CONSTANT", `damageRules.constants.${field}がありません。`, `damageRules.constants.${field}`);
        }
      }
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        characters: this.db.characters.length,
        abilities: this.db.abilities.length,
        enemies: this.db.enemies.length,
        errors: this.errors.length,
        warnings: this.warnings.length
      }
    };
  }
}