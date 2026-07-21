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
import { AppUI } from "./ui/AppUI.js";

async function main() {
  document.documentElement.dataset.appVersion = "2.4.0";
  const db = await loadDatabase();
  const dataManager = new DataManager(db);
  const stateManager = new StateManager();
  const repo = new Repository(dataManager.getDatabase());
  const rosterManager = new RosterManager(repo);
  const effectManager = new EffectManager();
  const formationManager = new FormationManager(repo, rosterManager);
  const partyOptimizer = new PartyOptimizer(repo, rosterManager);
  const damageEngine = new DamageEngine(repo);
  const turnBattleManager = new TurnBattleManager(repo, damageEngine, formationManager, effectManager);
  const turnOptimizer = new TurnOptimizer(repo, damageEngine);
  const equipmentManager = new EquipmentManager(repo);
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
    turnBattleManager
  ).init();
}

main().catch(error => {
  console.error("アプリの初期化に失敗しました。", error);

  const message = location.protocol === "file:"
    ? "ローカルファイルからはデータを読み込めません。Live ServerまたはGitHub Pagesで開いてください。"
    : `アプリの初期化に失敗しました。ページを再読み込みしてください。\n\n詳細: ${error.message}`;

  alert(message);
});