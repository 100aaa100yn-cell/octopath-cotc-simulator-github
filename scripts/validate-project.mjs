import fs from "node:fs";
import path from "node:path";

const requiredFiles = [
  "index.html",
  "style.css",
  "src/ui/AppUI.js",
  "src/engine/DamageEngine.js",
  "src/engine/BattleEngine.js",
  "src/database/Repository.js",
  "data/characters/characters.json",
  "data/abilities/abilities.json",
  "data/system/enemies.json",
  "data/equipment/equipment.json",
  "src/engine/EquipmentManager.js",
  "src/engine/StrategyAdvisor.js",
  "src/engine/BattleComparisonManager.js"
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Missing required file: ${file}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk("data").filter(file => file.endsWith(".json"))) {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Project validation passed.");
