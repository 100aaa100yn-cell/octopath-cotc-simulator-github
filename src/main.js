import { loadDatabase } from "./database/Loader.js";
import { Repository } from "./database/Repository.js";
import { DataManager } from "./database/DataManager.js";
import { StateManager } from "./database/StateManager.js";
import { PartyOptimizer } from "./engine/PartyOptimizer.js";
import { TurnOptimizer } from "./engine/TurnOptimizer.js";
import { DamageEngine } from "./engine/DamageEngine.js";
import { BattleEngine } from "./engine/BattleEngine.js";
import { BattleAnalytics } from "./engine/BattleAnalytics.js";
import { EquipmentManager } from "./engine/EquipmentManager.js";
import { RosterManager } from "./engine/RosterManager.js";
import { EffectManager } from "./engine/EffectManager.js";
import { FormationManager } from "./engine/FormationManager.js";
import { TurnBattleManager } from "./engine/TurnBattleManager.js";
import { BattlePlanManager } from "./engine/BattlePlanManager.js";
import { BattleResultManager } from "./engine/BattleResultManager.js";
import { StrategyAdvisor } from "./engine/StrategyAdvisor.js";
import { BattleComparisonManager } from "./engine/BattleComparisonManager.js";
import { StrategyOptimizer } from "./engine/StrategyOptimizer.js";
import { DataQualityManager } from "./engine/DataQualityManager.js";
import { MinimumTurnEstimator } from "./engine/MinimumTurnEstimator.js";
import { AppUI } from "./ui/AppUI.js";

async function main() {
  document.documentElement.dataset.appVersion = "3.1.0";
  const db = await loadDatabase();
  const dataManager = new DataManager(db);
  const stateManager = new StateManager();
  const repo = new Repository(dataManager.getDatabase());
  const rosterManager = new RosterManager(repo);
  const effectManager = new EffectManager();
  const formationManager = new FormationManager(repo, rosterManager);
  const partyOptimizer = new PartyOptimizer(repo, rosterManager);
  const damageEngine = new DamageEngine(repo);
  const equipmentManager = new EquipmentManager(repo);
  const turnBattleManager = new TurnBattleManager(repo, damageEngine, formationManager, effectManager, equipmentManager, rosterManager);
  const battlePlanManager = new BattlePlanManager(repo, turnBattleManager, formationManager);
  const battleResultManager = new BattleResultManager(turnBattleManager, formationManager, repo);
  const strategyAdvisor = new StrategyAdvisor(battleResultManager, turnBattleManager);
  const battleComparisonManager = new BattleComparisonManager(battleResultManager, strategyAdvisor, battlePlanManager);
  const strategyOptimizer = new StrategyOptimizer(repo, battlePlanManager, battleResultManager, strategyAdvisor);
  const dataQualityManager = new DataQualityManager(repo);
  const minimumTurnEstimator = new MinimumTurnEstimator(repo, damageEngine, formationManager, rosterManager, equipmentManager);
  const turnOptimizer = new TurnOptimizer(repo, damageEngine);
  const battleEngine = new BattleEngine(
    repo,
    partyOptimizer,
    turnOptimizer,
    damageEngine
  );

  new AppUI(
    repo,
    partyOptimizer,
    turnOptimizer,
    dataManager,
    damageEngine,
    battleEngine,
    stateManager,
    BattleAnalytics,
    equipmentManager,
    rosterManager,
    effectManager,
    formationManager,
    turnBattleManager,
    battlePlanManager,
    battleResultManager,
    strategyAdvisor,
    battleComparisonManager,
    strategyOptimizer,
    dataQualityManager,
    minimumTurnEstimator
  ).init();
}

main().catch(error => {
  console.error("アプリの初期化に失敗しました。", error);

  const message = location.protocol === "file:"
    ? "ローカルファイルからはデータを読み込めません。Live ServerまたはGitHub Pagesで開いてください。"
    : `アプリの初期化に失敗しました。ページを再読み込みしてください。\n\n詳細: ${error.message}`;

  alert(message);
});