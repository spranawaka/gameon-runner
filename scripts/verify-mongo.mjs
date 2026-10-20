import dotenv from 'dotenv';import {MongoClient} from 'mongodb';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {MongoScoreStore,validateScore} from '../server/src/scores.js';
dotenv.config({path:new URL('../server/.env',import.meta.url),quiet:true});
const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
let collection;
try{await client.connect();collection=client.db(process.env.MONGODB_DB).collection('qa_scores_'+randomUUID().replaceAll('-',''));const store=new MongoScoreStore(collection);await store.initialize();
const run={name:'QA Runner',email:'qa-runner@example.invalid',distance:100,coins:4,biome:'forest'};
await store.save(validateScore(run));await store.save(validateScore({...run,email:'QA-RUNNER@example.invalid',distance:50,coins:0}));assert.equal((await store.leaderboard())[0].score,200);
await Promise.all([200,300,150,500].map(distance=>store.save(validateScore({...run,distance}))));const board=await store.leaderboard();assert.equal(board.length,1);assert.equal(board[0].score,600);assert.equal(board[0].distance,500);assert.equal(await collection.countDocuments({}),1);assert.ok(!JSON.stringify(board).includes('example.invalid'));console.log('PASS live MongoDB: normalized email, lower-score preservation, concurrent best-score writes and private leaderboard projection.');
}finally{if(collection)await collection.drop().catch(()=>{});await client.close();}
