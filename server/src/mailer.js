// Emails the free beer pass to players whose saved run collected the Somersby can. Other saves get no email.
// Configure in server/.env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM. Without them, no email is sent.
// The email is styled like the in-game pass (deep blue, neon cyan frame, gold headings). Inline styles + tables
// only, so it renders the same in Gmail, Outlook and phone mail apps.
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import {makeBeerPass} from './beer-pass.js';
const COOLDOWN_MS=10*60*1000; // at most one email per address every 10 minutes
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FONT="'Arial Black','Segoe UI',Arial,Helvetica,sans-serif",BODY="Arial,Helvetica,sans-serif";
const n=v=>Number(v).toLocaleString('en-US');
function stat(label,value){return `<td width="33%" align="center" style="padding:0 5px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a2a8f;border:2px solid #3fd8ff;border-radius:14px"><tr><td align="center" style="padding:12px 4px 10px;font-family:${BODY};font-size:11px;font-weight:700;letter-spacing:1px;color:#9fe9ff">${label}<div style="font-family:${FONT};font-size:22px;line-height:28px;color:#ffd23d;margin-top:4px">${value}</div></td></tr></table></td>`;}
export function buildEmail(run,best){
 const name=esc(run.name);
 return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>You won a free beer</title></head>
<body style="margin:0;padding:0;background:#020b2e">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Congratulations ${name}! Your PortCity Run free beer pass is inside.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#020b2e" style="background:#020b2e"><tr><td align="center" style="padding:24px 12px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0b3ad6;background-image:linear-gradient(180deg,#1a5cff 0%,#0b34c4 45%,#06208a 100%);border:3px solid #3fd8ff;border-radius:28px;box-shadow:0 0 0 3px #ffd34d,0 0 28px #2ec8ff">
  <tr><td align="center" style="padding:26px 22px 6px"><img src="cid:logo" width="220" alt="PortCity Run" style="display:block;width:220px;max-width:70%;height:auto;border:0"></td></tr>
  <tr><td align="center" style="padding:6px 22px 0;font-family:${FONT};font-size:34px;line-height:40px;color:#ffd23d;text-shadow:0 3px 0 #8a4a00,0 0 14px #ffb300;letter-spacing:.5px">CONGRATULATIONS!</td></tr>
  <tr><td align="center" style="padding:4px 22px 0"><div style="width:180px;height:3px;border-radius:3px;background:#ffd23d;background-image:linear-gradient(90deg,transparent,#ffd23d,transparent);font-size:0;line-height:0">&nbsp;</div></td></tr>
  <tr><td align="center" style="padding:14px 22px 0;font-family:${FONT};font-size:20px;line-height:26px;color:#ffffff">${name}</td></tr>
  <tr><td align="center" style="padding:6px 26px 0;font-family:${BODY};font-size:16px;line-height:24px;color:#dff3ff">You collected the <b style="color:#b8f05a">Somersby Apple</b> can and won</td></tr>
  <tr><td align="center" style="padding:2px 22px 0;font-family:${FONT};font-size:40px;line-height:48px;color:#ffe066;text-shadow:0 3px 0 #8a4a00,0 0 16px #ffb300">1 FREE BEER</td></tr>
  <tr><td style="padding:20px 17px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stat('SCORE',n(run.score))}${stat('METERS',n(run.distance))}${stat('COINS',n(run.coins))}</tr></table></td></tr>
  <tr><td align="center" style="padding:8px 22px 0;font-family:${BODY};font-size:13px;color:#9fe9ff">Your personal best: <b style="color:#ffffff">${n(best)}</b></td></tr>
  <tr><td align="center" style="padding:22px 22px 6px;font-family:${FONT};font-size:17px;letter-spacing:1px;color:#ffffff">YOUR BEER PASS</td></tr>
  <tr><td align="center" style="padding:0 22px 4px;font-family:${BODY};font-size:14px;line-height:21px;color:#dff3ff">Show this pass to claim your free beer. It is also attached to this email.</td></tr>
  <tr><td align="center" style="padding:12px 22px 0"><img src="cid:beerpass" width="300" alt="Your PortCity Run beer pass" style="display:block;width:300px;max-width:85%;height:auto;border:0;border-radius:18px;box-shadow:0 10px 26px #00103a"></td></tr>
  <tr><td align="center" style="padding:24px 22px 26px;font-family:${FONT};font-size:14px;letter-spacing:2px;color:#ffffff">GAMEON <span style="color:#ffd23d">×</span> SOMERSBY</td></tr>
 </table>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td align="center" style="padding:14px 10px 0;font-family:${BODY};font-size:11px;line-height:16px;color:#6f86b8">You received this because you saved a winning PortCity Run with this email address. Please enjoy responsibly.</td></tr></table>
</td></tr></table></body></html>`;
}
export function createMailer(env,root){
 const {SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS,EMAIL_FROM}=env;
 if(!SMTP_HOST||!SMTP_USER||!SMTP_PASS||/^<.*>$/.test(SMTP_PASS)){console.log('Email: not configured (set SMTP_* in server/.env to email players).');return null;}
 const port=Number(SMTP_PORT)||465;
 const transport=nodemailer.createTransport({host:SMTP_HOST,port,secure:port===465,auth:{user:SMTP_USER,pass:SMTP_PASS}});
 transport.verify().then(()=>console.log('Email: SMTP ready ('+SMTP_HOST+').')).catch(e=>console.error('Email: SMTP login failed -',e.message));
 const logo=fs.readFileSync(path.join(root,'server/assets/email-logo.png'));
 const lastSent=new Map();
 return {
  async sendRun(run,best){
   if(!run.lion)return 'not-winner'; // only beer-pass winners get an email
   const now=Date.now();if(now-(lastSent.get(run.email)||0)<COOLDOWN_MS)return 'skipped';
   lastSent.set(run.email,now);for(const [k,t] of lastSent)if(now-t>COOLDOWN_MS)lastSent.delete(k);
   const pass=await makeBeerPass(root,run);
   await transport.sendMail({from:EMAIL_FROM||SMTP_USER,to:run.email,subject:'🍏 You won a free beer - PortCity Run',
    text:`Congratulations ${run.name}!\nYou collected the Somersby Apple can and won 1 free beer.\nScore ${n(run.score)} - ${n(run.distance)} m - ${n(run.coins)} coins (personal best ${n(best)}).\nYour beer pass is attached - show it to claim your drink.\nGameOn x Somersby - PortCity Run`,
    html:buildEmail(run,best),
    attachments:[{filename:'logo.png',content:logo,contentType:'image/png',cid:'logo',contentDisposition:'inline'},
     {filename:'PortCityRun-Beer-Pass.jpg',content:pass,contentType:'image/jpeg',cid:'beerpass'}]});
   return 'sent';
  }
 };
}
