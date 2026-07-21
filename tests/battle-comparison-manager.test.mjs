import assert from "node:assert/strict";
import { BattleComparisonManager } from "../src/engine/BattleComparisonManager.js";
const storage={data:new Map(),setItem(k,v){this.data.set(k,v)},getItem(k){return this.data.get(k)??null}};
let index=0;
const reports=[
 {enemy:{id:"e1",name:"Enemy"},turns:5,totalDamage:1000,averageDamage:200,peakDamage:400,breakCount:1,totalSpSpent:100,spRemainingPercent:40},
 {enemy:{id:"e1",name:"Enemy"},turns:4,totalDamage:1200,averageDamage:300,peakDamage:500,breakCount:2,totalSpSpent:80,spRemainingPercent:55}
];
const result={analyze(){return structuredClone(reports[index])}};
const advisor={analyze(){return {score:index?88:70,grade:index?"A":"B",recommendations:[]}}};
const plans={activePlan:{id:"p1",name:"Plan"}};
const manager=new BattleComparisonManager(result,advisor,plans,storage);
manager.capture("A"); index=1; manager.capture("B");
assert.equal(manager.snapshots.length,2);
const comparison=manager.compare();
assert.equal(comparison.items.length,2);
assert.deepEqual(comparison.fastest,[manager.snapshots[0].id]);
assert.deepEqual(comparison.highestScore,[manager.snapshots[0].id]);
assert.match(manager.toCsv(comparison),/SP効率/);
manager.toggle(manager.snapshots[0].id);
assert.equal(manager.selectedIds.length,1);
console.log("BattleComparisonManager tests passed.");
