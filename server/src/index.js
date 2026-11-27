import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import {MongoClient} from 'mongodb';
import {createApp} from './app.js';
import {MongoScoreStore,MemoryScoreStore} from './scores.js';
import {createMailer} from './mailer.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
dotenv.config({path:path.join(root,'server/.env'),quiet:true});
let store=null,client=null,connecting=false,stopping=false;
const testMemory=process.env.NODE_ENV==='test'&&process.env.STORAGE_DRIVER==='memory';
if(testMemory)store=new MemoryScoreStore();
async function connect(){
 if(connecting||store||testMemory||stopping)return;connecting=true;
 try{
  if(!process.env.MONGODB_URI)throw new Error('missing-uri');
  client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000,connectTimeoutMS:8000,maxPoolSize:10});
  await client.connect();const next=new MongoScoreStore(client.db(process.env.MONGODB_DB||'gameon_runner').collection('players'));await next.initialize();store=next;console.log('MongoDB connected. Leaderboard ready.');
 }catch{console.error('MongoDB unavailable. Check server/.env and Atlas network access. Game remains playable; score saves report an error.');await client?.close().catch(()=>{});client=null;}finally{connecting=false;}
}
const mailer=createMailer(process.env,root);
const app=createApp({getStore:()=>store,clientDir:path.join(root,'client'),mailer});
const port=Number(process.env.PORT)||3000,host=process.env.HOST||'127.0.0.1';
const server=app.listen(port,host,error=>{if(error){console.error(`Cannot start on port ${port}: ${error.code}. Stop the existing server or choose another PORT in server/.env.`);process.exit(1);}console.log(`GameOn Runner: http://localhost:${port}`);});
connect();const retry=setInterval(connect,30000);retry.unref();
async function stop(){stopping=true;clearInterval(retry);server.close();await client?.close();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
