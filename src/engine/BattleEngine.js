export class BattleEngine {
  constructor(repository, partyOptimizer, turnOptimizer, damageEngine) {
    this.repo = repository;
    this.partyOptimizer = partyOptimizer;
    this.turnOptimizer = turnOptimizer;
    this.damageEngine = damageEngine;
  }

  createBattleState(attackerId, enemyId, priority = "balanced", lockedIds = []) {
    const enemy = structuredClone(this.repo.getEnemy(enemyId));
    const party = this.partyOptimizer.optimize(attackerId, {
      weapon: enemy.weakWeapons[0] ?? "",
      element: enemy.weakElements[0] ?? "",
      priority,
      lockedIds
    });

    const members = [party.attacker, ...party.selected.map(x => x.candidate)];
    const memberStates = Object.fromEntries(members.map(member => [
      member.id,
      {
        id: member.id,
        hp: 9999,
        sp: member.maxSp ?? 400,
        bp: 0,
        gauge: 0,
        exUses: 1,
        activeEffects: []
      }
    ]));

    return {
      turn: 0,
      priority,
      party,
      members,
      membersById: Object.fromEntries(members.map(x => [x.id, x])),
      memberStates,
      enemy: {
        ...enemy,
        hp: enemy.maxHp,
        shieldCurrent: enemy.shield,
        brokenTurns: 0,
        activeEffects: []
      },
      log: [],
      finished: false,
      victory: false,
      totalDamage: 0,
      damageTurns: [],
      breakCount: 0
    };
  }

  tickEffects(effects) {
    return effects
      .map(effect => ({ ...effect, remaining: effect.remaining - 1 }))
      .filter(effect => effect.remaining > 0);
  }

  selectEnemyAction(state) {
    const actions = state.enemy.actions ?? [];
    const scheduled = actions.filter(action =>
      !action.useEvery || state.turn % action.useEvery === 0
    );
    return [...scheduled].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]
      ?? actions[0]
      ?? { name: "様子を見る", type: "wait" };
  }

  buildPlan(state, horizon = 5) {
    return this.turnOptimizer.createPlan(state.party, {
      enemyId: state.enemy.id,
      maxTurns: horizon,
      priority: state.priority
    });
  }

  abilityFromAction(characterId, actionName) {
    return this.repo.getAbilities(characterId).find(ability => ability.name === actionName);
  }

  collectEffects(state, turnPlan) {
    const effects = [];

    for (const memberState of Object.values(state.memberStates)) {
      effects.push(...memberState.activeEffects.map(effect => ({
        type: effect.type,
        value: effect.value
      })));
    }

    effects.push(...state.enemy.activeEffects.map(effect => ({
      type: effect.type,
      value: effect.value
    })));

    for (const effect of turnPlan.activeEffects ?? []) {
      effects.push({ type: effect.type, value: effect.value });
    }

    return effects;
  }

  executePartyTurn(state, turnPlan) {
    const actionLogs = [];
    let turnDamage = 0;

    const actions = [...turnPlan.actions].sort(
      (a, b) => (b.character.speed ?? 0) - (a.character.speed ?? 0)
    );

    for (const action of actions) {
      const memberState = state.memberStates[action.character.id];
      const ability = this.abilityFromAction(action.character.id, action.name);

      memberState.bp = action.bp ?? memberState.bp;
      memberState.sp = action.sp ?? memberState.sp;

      if (!ability) {
        actionLogs.push({
          actor: action.character.name,
          action: action.name,
          damage: 0,
          shieldDamage: 0
        });
        continue;
      }

      const effects = this.collectEffects(state, turnPlan);
      let damage = 0;

      if ((ability.power ?? 0) > 0) {
        const result = this.damageEngine.calculate({
          attacker: action.character,
          ability,
          enemy: state.enemy,
          effects,
          boost: action.boost ?? 0,
          broken: state.enemy.brokenTurns > 0,
          critical: false,
          weakness: null
        });

        damage = Math.min(state.enemy.hp, result.totalDamage);
        state.enemy.hp -= damage;
        state.totalDamage += damage;
        turnDamage += damage;
      }

      const shieldDamage = state.enemy.brokenTurns > 0
        ? 0
        : Math.min(state.enemy.shieldCurrent, action.shield ?? 0);

      state.enemy.shieldCurrent -= shieldDamage;

      for (const effect of ability.effects ?? []) {
        const targetList = effect.target === "enemy"
          ? state.enemy.activeEffects
          : memberState.activeEffects;

        targetList.push({
          type: effect.type,
          value: effect.value,
          remaining: ability.duration ?? 1,
          source: `${action.character.name}：${ability.name}`
        });
      }

      actionLogs.push({
        actor: action.character.name,
        action: ability.name,
        damage,
        shieldDamage,
        boost: action.boost ?? 0
      });

      if (state.enemy.hp <= 0) break;
    }

    if (state.enemy.shieldCurrent <= 0 && state.enemy.brokenTurns <= 0 && state.enemy.hp > 0) {
      state.enemy.brokenTurns = state.enemy.breakDuration ?? 1;
      state.breakCount += 1;
      actionLogs.push({
        actor: "SYSTEM",
        action: "BREAK",
        damage: 0,
        shieldDamage: 0
      });
    }

    if (turnDamage > 0) state.damageTurns.push(turnDamage);
    return { actionLogs, turnDamage };
  }

  executeEnemyTurn(state) {
    if (state.enemy.hp <= 0) return null;
    if (state.enemy.brokenTurns > 0) {
      return { actor: state.enemy.name, action: "ブレイク中", skipped: true };
    }

    const action = this.selectEnemyAction(state);

    if (action.type === "debuff" && action.effect) {
      for (const memberState of Object.values(state.memberStates)) {
        memberState.activeEffects.push({
          ...action.effect,
          remaining: action.effect.duration ?? 1,
          source: `${state.enemy.name}：${action.name}`
        });
      }
    }

    return {
      actor: state.enemy.name,
      action: action.name,
      type: action.type
    };
  }

  finishTurn(state) {
    for (const memberState of Object.values(state.memberStates)) {
      memberState.bp = Math.min(5, memberState.bp + 1);
      memberState.gauge = Math.min(100, memberState.gauge + 25);
      memberState.activeEffects = this.tickEffects(memberState.activeEffects);
    }

    state.enemy.activeEffects = this.tickEffects(state.enemy.activeEffects);

    if (state.enemy.brokenTurns > 0) {
      state.enemy.brokenTurns -= 1;
      if (state.enemy.brokenTurns <= 0 && state.enemy.hp > 0) {
        state.enemy.shieldCurrent = state.enemy.shieldRecovery ?? state.enemy.shield;
      }
    }
  }

  simulate({
    attackerId,
    enemyId,
    priority = "balanced",
    maxBattleTurns = 20,
    planHorizon = 5,
    lockedIds = []
  }) {
    const state = this.createBattleState(attackerId, enemyId, priority, lockedIds);

    while (!state.finished && state.turn < maxBattleTurns) {
      state.turn += 1;

      const plan = this.buildPlan(state, planHorizon);
      const planTurn = plan.turns[(state.turn - 1) % plan.turns.length] ?? plan.turns[0];

      const partyResult = this.executePartyTurn(state, planTurn);
      const enemyResult = this.executeEnemyTurn(state);

      state.log.push({
        turn: state.turn,
        enemyHp: state.enemy.hp,
        enemyShield: state.enemy.shieldCurrent,
        broken: state.enemy.brokenTurns > 0,
        partyActions: partyResult.actionLogs,
        enemyAction: enemyResult,
        turnDamage: partyResult.turnDamage
      });

      if (state.enemy.hp <= 0) {
        state.finished = true;
        state.victory = true;
        break;
      }

      this.finishTurn(state);
    }

    if (!state.finished) {
      state.finished = true;
      state.victory = false;
    }

    const turnsUsed = state.log.length;
    const dpt = turnsUsed > 0 ? Math.round(state.totalDamage / turnsUsed) : 0;

    return {
      ...state,
      summary: {
        victory: state.victory,
        turnsUsed,
        totalDamage: state.totalDamage,
        dpt,
        breakCount: state.breakCount,
        remainingHp: state.enemy.hp
      }
    };
  }
}