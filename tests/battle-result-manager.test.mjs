import assert from "node:assert/strict";
import { BattleResultManager } from "../src/engine/BattleResultManager.js";
const state={enemy:{id:"e",name:"Enemy",maxHp:1000,hp:200,shield:10},victory:false,breakCount:1,bp:{a:2},log:[
 {turn:1,turnDamage:300,enemyHp:700,enemyShield:5,broken:false,phase:"P1",phaseEvents:[],entries:[{actor:"A",damage:300,shieldDamage:5,spCost:10,boost:1}],bpSnapshot:{a:1},spSnapshot:{a:90}},
 {turn:2,turnDamage:500,enemyHp:200,enemyShield:0,broken:true,phase:"P1",phaseEvents:[],entries:[{actor:"A",damage:200,shieldDamage:5,spCost:10,boost:0},{actor:"B",damage:300,shieldDamage:0,spCost:20,boost:2},{actor:"SYSTEM",action:"BREAK"}],bpSnapshot:{a:2},spSnapshot:{a:80}}
]};
const tb={state}; const formation={sp:{a:80}}; const repo={getCharacter:id=>({id,maxSp:100})};
const report=new BattleResultManager(tb,formation,repo).analyze();
assert.equal(report.totalDamage,800); assert.equal(report.peakTurn,2); assert.equal(report.breakCount,1); assert.equal(report.totalShieldDamage,10); assert.equal(report.totalSpSpent,40); assert.equal(report.ranking[0].name,"A"); assert.equal(report.timeline.length,2);
console.log("BattleResultManager tests passed");
