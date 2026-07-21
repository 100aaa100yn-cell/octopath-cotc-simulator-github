export class DamageEngine {
  constructor(repository) {
    this.repo = repository;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  getAbilityStatType(ability) {
    if (ability.damageType === "elemental") return "elemental";
    return "physical";
  }

  normalizeEffects(effects = []) {
    const totals = {};

    for (const effect of effects) {
      totals[effect.type] ??= 0;
      totals[effect.type] += effect.value / 100;
    }

    return totals;
  }

  cappedEffect(type, value) {
    const rules = this.repo.getDamageRules();
    const cap = rules.stacking?.[type]?.cap;
    return cap === undefined ? value : Math.min(value, cap);
  }

  isWeakness(attacker, ability, enemy) {
    const weaponWeak = enemy.weakWeapons?.includes(attacker.weapon);
    const element = ability.element ?? attacker.element;
    const elementWeak = enemy.weakElements?.includes(element);
    return Boolean(weaponWeak || elementWeak);
  }

  getDamageCap(ability, effects) {
    const rules = this.repo.getDamageRules();
    let base = rules.damageCap.base;

    if (ability.category === "ultimate") base = rules.damageCap.ultimate;
    if (ability.category === "ex") base = rules.damageCap.ex;

    const capUp = this.cappedEffect("damage_cap_up", effects.damage_cap_up ?? 0);
    return Math.round(base * (1 + capUp));
  }

  calculate({
    attacker,
    ability,
    enemy,
    effects = [],
    boost = 0,
    critical = false,
    broken = false,
    weakness = null,
    randomFactor = 1
  }) {
    const rules = this.repo.getDamageRules();
    const constants = rules.constants;
    const effectTotals = this.normalizeEffects(effects);

    const statType = this.getAbilityStatType(ability);
    const baseAttack = statType === "elemental" ? attacker.eatk : attacker.patk;
    const defense = statType === "elemental" ? enemy.edef : enemy.pdef;

    const statBuffType = statType === "elemental"
      ? "element_attack_up"
      : "physical_attack_up";

    const statBuff = this.cappedEffect(statBuffType, effectTotals[statBuffType] ?? 0);
    const effectiveAttack = baseAttack * (1 + statBuff);

    const defenseRatio = this.clamp(
      effectiveAttack / Math.max(1, defense),
      constants.minimumDefenseRatio,
      constants.maximumDefenseRatio
    );

    const boostMultiplier = 1 + boost * (ability.bpPowerStep ?? 0.25);
    const skillPower = ability.power ?? 0;
    const hits = Math.max(1, ability.hits ?? 1);

    const weaponDamage = this.cappedEffect(
      "weapon_damage_up",
      effectTotals.weapon_damage_up ?? 0
    );
    const generalDamage = this.cappedEffect(
      "damage_up",
      effectTotals.damage_up ?? 0
    );
    const resistanceDown = this.cappedEffect(
      statType === "elemental"
        ? "element_resistance_down"
        : "weapon_resistance_down",
      effectTotals[
        statType === "elemental"
          ? "element_resistance_down"
          : "weapon_resistance_down"
      ] ?? 0
    );

    const isWeak = weakness ?? this.isWeakness(attacker, ability, enemy);
    const weaknessMultiplier = isWeak
      ? enemy.weaknessMultiplier ?? constants.defaultWeaknessMultiplier
      : 1;

    const breakMultiplier = broken
      ? enemy.breakMultiplier ?? constants.defaultBreakMultiplier
      : 1;

    const criticalMultiplier =
      critical && enemy.criticalAllowed !== false
        ? constants.criticalMultiplier
        : 1;

    const categoryMultiplier =
      ability.category === "ultimate"
        ? 1 + this.cappedEffect("ultimate_power", effectTotals.ultimate_power ?? 0)
        : 1;

    const rawPerHit =
      skillPower *
      defenseRatio *
      boostMultiplier *
      (1 + weaponDamage) *
      (1 + generalDamage) *
      (1 + resistanceDown) *
      weaknessMultiplier *
      breakMultiplier *
      criticalMultiplier *
      categoryMultiplier *
      randomFactor;

    const damageCap = this.getDamageCap(ability, effectTotals);
    const cappedPerHit = Math.min(Math.round(rawPerHit), damageCap);
    const totalDamage = cappedPerHit * hits;

    return {
      totalDamage,
      perHit: cappedPerHit,
      hits,
      rawPerHit,
      damageCap,
      effectiveAttack: Math.round(effectiveAttack),
      defense,
      defenseRatio,
      boostMultiplier,
      weaknessMultiplier,
      breakMultiplier,
      criticalMultiplier,
      categoryMultiplier,
      effectTotals: {
        statBuff,
        weaponDamage,
        generalDamage,
        resistanceDown,
        damageCapUp: effectTotals.damage_cap_up ?? 0,
        ultimatePower: effectTotals.ultimate_power ?? 0
      }
    };
  }

  calculateRange(input) {
    const constants = this.repo.getDamageRules().constants;
    const min = this.calculate({ ...input, randomFactor: constants.randomMin });
    const average = this.calculate({ ...input, randomFactor: 1 });
    const max = this.calculate({ ...input, randomFactor: constants.randomMax });

    return {
      min,
      average,
      max
    };
  }
}