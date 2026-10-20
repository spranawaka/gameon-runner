import assert from 'node:assert/strict';
import{LANES,speedAt,hitObstacle,crossed,scoreFor,clampLane}from'./rules.js';
assert.equal(LANES.length,3);assert.equal(speedAt(0),10);assert.equal(speedAt(100000),22);
assert.equal(hitObstacle('log',0,false),true);assert.equal(hitObstacle('log',1,false),false);
assert.equal(hitObstacle('rock',1,false),true);assert.equal(hitObstacle('rock',1.6,false),false);
assert.equal(hitObstacle('barrier',0,true),false);assert.equal(hitObstacle('barrier',2,false),true);
assert.equal(crossed(-3,3),true);assert.equal(crossed(-4,-2),false);assert.equal(crossed(2,4),false);
assert.equal(scoreFor(124.8,4),224);assert.equal(clampLane(-4),0);assert.equal(clampLane(8),2);
console.log('PASS: lane bounds, speed cap, jump/slide collisions, swept collision and scoring');
