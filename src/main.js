import { loadDatabase } from "./database/Loader.js";
import { Repository } from "./database/Repository.js";
import { DataManager } from "./database/DataManager.js";
import { StateManager } from "./database/StateManager.js";
import { PartyOptimizer } from "./engine/PartyOptimizer.js";
import { TurnOptimizer } from "./engine/TurnOptimizer.js";
import { DamageEngine } from "./engine/DamageEngine.js";
import { BattleEngine } from "./engine/BattleEngine.js";
import { BattleAnalytics } from "./engine/BattleAnalytics.js";
import { AppUI } from "./ui/AppUI.js";

async function main() {
  const db = await loadDatabase();
  const dataManager = new DataManager(db);
  const stateManager = new StateManager();
  const repo = new Repository(dataManager.getDatabase());
  const partyOptimizer = new PartyOptimizer(repo);
  const damageEngine = new DamageEngine(repo);
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
    BattleAnalytics
  ).init();
}

main().catch(error => {
  console.error(error);
  alert("データ読み込みに失敗しました。Live Serverで起動してください。");
});