import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateScore} from './scores.js';
export function createApp({getStore,clientDir,rateLimits=true,mailer=null}) {
 const app=express();app.disable('x-powered-by');
 const importMap=readFileSync(clientDir+'/index.html','utf8').match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1]||'';
 const importMapHash="'sha256-"+createHash('sha256').update(importMap).digest('base64')+"'";
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","'wasm-unsafe-eval'",importMapHash],scriptSrcAttr:["'none'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],connectSrc:["'self'",'blob:'],workerSrc:["'self'",'blob:'],mediaSrc:["'self'",'blob:'],objectSrc:["'none'"],upgradeInsecureRequests:null}},crossOriginEmbedderPolicy:false}));
 app.use((req,res,next)=>{res.setHeader('Permissions-Policy','camera=(self), microphone=()');next();});
 app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 app.use(express.json({limit:'4kb',strict:true}));
 const saveLimit=rateLimits?rateLimit({windowMs:60000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many save attempts. Please wait a minute.'}}):(req,res,next)=>next();
 app.get('/api/health',(req,res)=>res.json({ok:true,database:getStore()?'connected':'unavailable'}));
 app.get('/api/leaderboard',async(req,res)=>{
  if(!getStore())return res.status(503).json({error:'Leaderboard is temporarily unavailable. You can still play.'});
  try{res.json({scores:await getStore().leaderboard(10)});}catch{res.status(503).json({error:'Leaderboard is temporarily unavailable. Please try again later.'});}
 });
 app.post('/api/scores',saveLimit,async(req,res)=>{
  // Same-origin saves only; no cookies, login or session creation are required.
  const origin=req.get('origin');
  if(origin){try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Save scores from the game page.'});}catch{return res.status(403).json({error:'Invalid origin.'});}}
  let run;try{run=validateScore(req.body);}catch(e){return res.status(400).json({error:e.message});}
  const store=getStore();if(!store)return res.status(503).json({error:'Scores cannot be saved right now. Retry or skip.'});
  let result;try{result=await store.save(run);}catch{return res.status(503).json({error:'Could not save the score. Please retry or skip.'});}
  res.json({saved:true,...result,emailed:!!mailer});
  // Email runs after the response so a slow mail server never delays the game.
  if(mailer)mailer.sendRun(run,result.bestScore).catch(e=>console.error('Email to player failed:',e.message));
 });
 app.use('/api',(req,res)=>res.status(404).json({error:'Endpoint not found.'}));
 // Only client/ is public. server/.env and database credentials cannot be served.
 app.use(express.static(clientDir,{dotfiles:'deny',setHeaders(res,file){if(/\.(html|js|mjs)$/i.test(file))res.setHeader('Cache-Control','no-cache');}}));
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);res.status(err.type==='entity.too.large'?413:400).json({error:err.type==='entity.too.large'?'Request is too large.':'Invalid request.'});});
 return app;
}
