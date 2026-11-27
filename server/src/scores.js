export const BIOMES=new Set(['forest','coast','canyon','cave','ruins','colombo']);
export function validateScore(body) {
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Please enter your name and email.');
 const allowed=new Set(['name','email','distance','coins','biome']);
 if(Object.keys(body).some(k=>!allowed.has(k)))throw new Error('Unexpected score fields.');
 if(typeof body.name!=='string'||typeof body.email!=='string')throw new Error('Name and email are required.');
 const name=body.name.trim().replace(/\s+/g,' '),email=body.email.trim().toLowerCase();
 if(name.length<2||name.length>60||/[\u0000-\u001f<>]/u.test(name))throw new Error('Use a name between 2 and 60 characters.');
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/u.test(email))throw new Error('Enter a valid email address.');
 if(!Number.isSafeInteger(body.distance)||body.distance<0||body.distance>1000000)throw new Error('Invalid run distance.');
 if(!Number.isSafeInteger(body.coins)||body.coins<0||body.coins>Math.ceil((body.distance+2)*1.5))throw new Error('Invalid coin count.');
 if(!BIOMES.has(body.biome))throw new Error('Invalid trail.');
 return {name,email,distance:body.distance,coins:body.coins,biome:body.biome,score:body.distance+body.coins*25};
}
export class MongoScoreStore {
 constructor(collection){this.collection=collection;}
 async initialize(){await this.collection.createIndex({bestScore:-1,bestAt:1,_id:1});}
 async save(run){
  const now=new Date();
  const improved={$or:[{$eq:[{$type:'$bestScore'},'missing']},{$gt:[run.score,'$bestScore']}]};
  const pipeline=[{$set:{
   name:{$literal:run.name},
   bestScore:{$max:[{$ifNull:['$bestScore',0]},run.score]},
   distance:{$cond:[improved,run.distance,'$distance']},coins:{$cond:[improved,run.coins,'$coins']},
   biome:{$cond:[improved,{$literal:run.biome},'$biome']},
   bestAt:{$cond:[improved,now,'$bestAt']},createdAt:{$ifNull:['$createdAt',now]},updatedAt:now
  }}];
  let doc;
  try{doc=await this.collection.findOneAndUpdate({_id:run.email},pipeline,{upsert:true,returnDocument:'after'});}
  catch(e){if(e.code!==11000)throw e;doc=await this.collection.findOneAndUpdate({_id:run.email},pipeline,{returnDocument:'after'});}
  return {bestScore:doc.bestScore,submittedScore:run.score};
 }
 async leaderboard(limit=10){
  const docs=await this.collection.find({},{projection:{_id:0,name:1,bestScore:1,distance:1,coins:1,biome:1,bestAt:1}}).sort({bestScore:-1,bestAt:1,_id:1}).limit(limit).toArray();
  return docs.map((doc,i)=>({rank:i+1,name:doc.name,score:doc.bestScore,distance:doc.distance,coins:doc.coins,biome:doc.biome}));
 }
}
// Explicit test mode only. Production never silently falls back to memory.
export class MemoryScoreStore {
 constructor(){this.players=new Map();}
 async save(run){const old=this.players.get(run.email);const doc=!old||run.score>old.score?{...run,at:Date.now()}:{...old,name:run.name};this.players.set(run.email,doc);return {bestScore:doc.score,submittedScore:run.score};}
 async leaderboard(limit=10){return [...this.players.values()].sort((a,b)=>b.score-a.score||a.at-b.at||a.email.localeCompare(b.email)).slice(0,limit).map((r,i)=>({rank:i+1,name:r.name,score:r.score,distance:r.distance,coins:r.coins,biome:r.biome}));}
}
