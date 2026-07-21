export class BattleEngine {
  constructor(repository, partyOptimizer, turnOptimizer, damageEngine) {
    this.repo = repository;
    this.partyOptimizer = partyOptimizer;
    this.turnOptimizer = turnOptimizer;
    this.damageEngine = damageEngine;
  }

  normalizedPhases(enemy) {
    const base = {
      id: "base",
      name: "第1フェーズ",
      hpThreshold: 100,
      shield: enemy.shield,
      shieldRecovery: enemy.shieldRecovery ?? enemy.shield,
      weakWeapons: enemy.weakWeapons ?? [],
      weakElements: enemy.weakElements ?? [],
      actions: enemy.actions ?? []
    };
    const phases = Array.isArray(enemy.phases) && enemy.phases.length
      ? enemy.phases.map((phase, index) => ({
          ...base,
          ...phase,
          id: phase.id ?? `phase_${index + 1}`,
          name: phase.name ?? `第${index + 1}フェーズ`,
          hpThreshold: Number(phase.hpThreshold ?? (index === 0 ? 100 : 0))
        }))
      : [base];
    return phases.sort((a, b) => b.hpThreshold - a.hpThreshold);
  }

  phaseIndexForHp(enemyState) {
    const hpPercent = enemyState.maxHp > 0 ? enemyState.hp / enemyState.maxHp * 100 : 0;
    let index = 0;
    enemyState.phaseDefinitions.forEach((phase, phaseIndex) => {
      if (hpPercent <= phase.hpThreshold) index = phaseIndex;
    });
    return index;
  }

  applyPhase(enemyState, phaseIndex, { initial = false } = {}) {
    const phase = enemyState.phaseDefinitions[phaseIndex];
    if (!phase) return null;
    const previous = enemyState.currentPhase;
    enemyState.phaseIndex = phaseIndex;
    enemyState.currentPhase = structuredClone(phase);
    enemyState.weakWeapons = structuredClone(phase.weakWeapons ?? enemyState.baseWeakWeapons ?? []);
    enemyState.weakElements = structuredClone(phase.weakElements ?? enemyState.baseWeakElements ?? []);
    enemyState.actions = structuredClone(phase.actions ?? enemyState.baseActions ?? []);
    enemyState.shield = Number(phase.shield ?? enemyState.baseShield ?? 0);
    enemyState.shieldRecovery = Number(phase.shieldRecovery ?? phase.shield ?? enemyState.baseShieldRecovery ?? enemyState.shield);
    enemyState.breakMultiplier = Number(phase.breakMultiplier ?? enemyState.baseBreakMultiplier ?? 2);
    enemyState.weaknessMultiplier = Number(phase.weaknessMultiplier ?? enemyState.baseWeaknessMultiplier ?? 1.5);
    if (phase.pdef !== undefined) enemyState.pdef = phase.pdef;
    if (phase.edef !== undefined) enemyState.edef = phase.edef;
    if (!initial && enemyState.brokenTurns <= 0) {
      enemyState.shieldCurrent = enemyState.shield;
    } else if (initial) {
      enemyState.shieldCurrent = Math.min(enemyState.shieldCurrent ?? enemyState.shield, enemyState.shield);
    }
    return {
      from: previous?.name ?? null,
      to: phase.name,
      phaseId: phase.id,
      phaseIndex,
      hpThreshold: phase.hpThreshold,
      weakWeapons: structuredClone(enemyState.weakWeapons),
      weakElements: structuredClone(enemyState.weakElements),
      shield: enemyState.shield
    };
  }

  updateEnemyPhase(state) {
    if (!state.phaseEnabled || state.enemy.hp <= 0) return null;
    const nextIndex = this.phaseIndexForHp(state.enemy);
    if (nextIndex === state.enemy.phaseIndex) return null;
    const transition = this.applyPhase(state.enemy, nextIndex);
    state.phaseTransitions.push({ turn: state.turn, ...transition });
    return transition;
  }

  createBattleState(attackerId, enemyId, priority = "balanced", lockedIds = [], options = {}) {
    const enemy = structuredClone(this.repo.getEnemy(enemyId));
    const phases = this.normalizedPhases(enemy);
    const requestedPhase = Math.max(0, Math.min(Number(options.initialPhaseIndex ?? 0), phases.length - 1));
    const firstPhase = phases[requestedPhase];
    const party = this.partyOptimizer.optimize(attackerId, {
      weapon: firstPhase.weakWeapons?.[0] ?? enemy.weakWeapons[0] ?? "",
      element: firstPhase.weakElements?.[0] ?? enemy.weakElements[0] ?? "",
      priority,
      lockedIds
    });

    const members = [party.attacker, ...party.selected.map(x => x.candidate)];
    const memberStates = Object.fromEntries(members.map(member => [member.id, {
      id: member.id, hp: member.maxHp ?? 9999, sp: member.maxSp ?? 400,
      bp: 0, gauge: 0, exUses: 1, activeEffects: []
    }]));

    const enemyState = {
      ...enemy,
      hp: enemy.maxHp,
      shieldCurrent: enemy.shield,
      brokenTurns: 0,
      activeEffects: [],
      baseShield: enemy.shield,
      baseShieldRecovery: enemy.shieldRecovery ?? enemy.shield,
      baseWeakWeapons: structuredClone(enemy.weakWeapons ?? []),
      baseWeakElements: structuredClone(enemy.weakElements ?? []),
      baseActions: structuredClone(enemy.actions ?? []),
      baseBreakMultiplier: enemy.breakMultiplier ?? 2,
      baseWeaknessMultiplier: enemy.weaknessMultiplier ?? 1.5,
      phaseDefinitions: phases,
      phaseIndex: requestedPhase,
      currentPhase: null
    };
    this.applyPhase(enemyState, requestedPhase, { initial: true });

    return {
      turn: 0, priority, party, members,
      membersById: Object.fromEntries(members.map(x => [x.id, x])),
      memberStates, enemy: enemyState, log: [], finished: false, victory: false,
      totalDamage: 0, damageTurns: [], breakCount: 0,
      phaseEnabled: options.enablePhases !== false,
      phaseTransitions: []
    };
  }

  tickEffects(effects) {
    return effects.map(effect => ({ ...effect, remaining: effect.remaining - 1 })).filter(effect => effect.remaining > 0);
  }

  selectEnemyAction(state) {
    const actions = state.enemy.actions ?? [];
    const scheduled = actions.filter(action => !action.useEvery || state.turn % action.useEvery === 0);
    return [...scheduled].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]
      ?? actions[0] ?? { name: "様子を見る", type: "wait" };
  }

  buildPlan(state, horizon = 5) {
    return this.turnOptimizer.createPlan(state.party, {
      enemyId: state.enemy.id, maxTurns: horizon, priority: state.priority,
      enemyOverride: state.enemy
    });
  }

  abilityFromAction(characterId, actionName) {
    return this.repo.getAbilities(characterId).find(ability => ability.name === actionName);
  }

  collectEffects(state, turnPlan) {
    const effects = [];
    for (const memberState of Object.values(state.memberStates)) {
      effects.push(...memberState.activeEffects.map(effect => ({ type: effect.type, value: effect.value })));
    }
    effects.push(...state.enemy.activeEffects.map(effect => ({ type: effect.type, value: effect.value })));
    for (const effect of turnPlan.activeEffects ?? []) effects.push({ type: effect.type, value: effect.value });
    return effects;
  }

  executePartyTurn(state, turnPlan) {
    const actionLogs = [];
    let turnDamage = 0;
    const phaseEvents = [];
    const actions = [...turnPlan.actions].sort((a, b) => (b.character.speed ?? 0) - (a.character.speed ?? 0));

    for (const action of actions) {
      const memberState = state.memberStates[action.character.id];
      const ability = this.abilityFromAction(action.character.id, action.name);
      memberState.bp = action.bp ?? memberState.bp;
      memberState.sp = action.sp ?? memberState.sp;
      if (!ability) {
        actionLogs.push({ actor: action.character.name, action: action.name, damage: 0, shieldDamage: 0 });
        continue;
      }

      const effects = this.collectEffects(state, turnPlan);
      let damage = 0;
      if ((ability.power ?? 0) > 0) {
        const result = this.damageEngine.calculate({
          attacker: action.character, ability, enemy: state.enemy, effects,
          boost: action.boost ?? 0, broken: state.enemy.brokenTurns > 0,
          critical: false, weakness: null
        });
        damage = Math.min(state.enemy.hp, result.totalDamage);
        state.enemy.hp -= damage;
        state.totalDamage += damage;
        turnDamage += damage;
      }

      const shieldDamage = state.enemy.brokenTurns > 0 ? 0 : Math.min(state.enemy.shieldCurrent, action.shield ?? 0);
      state.enemy.shieldCurrent -= shieldDamage;
      for (const effect of ability.effects ?? []) {
        const targetList = effect.target === "enemy" ? state.enemy.activeEffects : memberState.activeEffects;
        targetList.push({ type: effect.type, value: effect.value, remaining: ability.duration ?? 1, source: `${action.character.name}：${ability.name}` });
      }
      actionLogs.push({ actor: action.character.name, action: ability.name, damage, shieldDamage, boost: action.boost ?? 0 });

      const phaseEvent = this.updateEnemyPhase(state);
      if (phaseEvent) phaseEvents.push(phaseEvent);
      if (state.enemy.hp <= 0) break;
    }

    if (state.enemy.shieldCurrent <= 0 && state.enemy.brokenTurns <= 0 && state.enemy.hp > 0) {
      state.enemy.brokenTurns = state.enemy.breakDuration ?? 1;
      state.breakCount += 1;
      actionLogs.push({ actor: "SYSTEM", action: "BREAK", damage: 0, shieldDamage: 0 });
    }
    if (turnDamage > 0) state.damageTurns.push(turnDamage);
    return { actionLogs, turnDamage, phaseEvents };
  }

  executeEnemyTurn(state) {
    if (state.enemy.hp <= 0) return null;
    if (state.enemy.brokenTurns > 0) return { actor: state.enemy.name, action: "ブレイク中", skipped: true };
    const action = this.selectEnemyAction(state);
    if (action.type === "debuff" && action.effect) {
      for (const memberState of Object.values(state.memberStates)) {
        memberState.activeEffects.push({ ...action.effect, remaining: action.effect.duration ?? 1, source: `${state.enemy.name}：${action.name}` });
      }
    }
    return { actor: state.enemy.name, action: action.name, type: action.type };
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
      if (state.enemy.brokenTurns <= 0 && state.enemy.hp > 0) state.enemy.shieldCurrent = state.enemy.shieldRecovery ?? state.enemy.shield;
    }
  }

  simulate({ attackerId, enemyId, priority = "balanced", maxBattleTurns = 20, planHorizon = 5, lockedIds = [], enablePhases = true, initialPhaseIndex = 0 }) {
    const state = this.createBattleState(attackerId, enemyId, priority, lockedIds, { enablePhases, initialPhaseIndex });
    while (!state.finished && state.turn < maxBattleTurns) {
      state.turn += 1;
      const phaseAtStart = structuredClone(state.enemy.currentPhase);
      const plan = this.buildPlan(state, planHorizon);
      const planTurn = plan.turns[(state.turn - 1) % plan.turns.length] ?? plan.turns[0];
      const partyResult = this.executePartyTurn(state, planTurn);
      const enemyResult = this.executeEnemyTurn(state);
      state.log.push({
        turn: state.turn, enemyHp: state.enemy.hp, enemyShield: state.enemy.shieldCurrent,
        broken: state.enemy.brokenTurns > 0, partyActions: partyResult.actionLogs,
        enemyAction: enemyResult, turnDamage: partyResult.turnDamage,
        phaseAtStart, phase: structuredClone(state.enemy.currentPhase),
        phaseEvents: partyResult.phaseEvents,
        weakWeapons: structuredClone(state.enemy.weakWeapons),
        weakElements: structuredClone(state.enemy.weakElements)
      });
      if (state.enemy.hp <= 0) { state.finished = true; state.victory = true; break; }
      this.finishTurn(state);
    }
    if (!state.finished) { state.finished = true; state.victory = false; }
    const turnsUsed = state.log.length;
    const dpt = turnsUsed > 0 ? Math.round(state.totalDamage / turnsUsed) : 0;
    return {
      ...state,
      summary: {
        victory: state.victory, turnsUsed, totalDamage: state.totalDamage, dpt,
        breakCount: state.breakCount, remainingHp: state.enemy.hp,
        phaseCount: state.enemy.phaseDefinitions.length,
        phasesReached: new Set([0, ...state.phaseTransitions.map(x => x.phaseIndex)]).size,
        phaseTransitions: state.phaseTransitions.length
      }
    };
  }
}