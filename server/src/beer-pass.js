// Builds the free-beer pass image (server/assets/beer-pass.jpg) with the winner's name and email written
// into the two boxes - same layout as the in-game download. Pure JavaScript (no native modules).
import fs from 'node:fs';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import * as PImage from 'pureimage';
const BOX={x:100,w:741,name:770,email:994}; // on the 941x1672 card
let ready=null;
function load(root){
 return ready||=(async()=>{
  const font=PImage.registerFont(path.join(root,'client/assets/font/Supercell-Magic Regular.ttf'),'Supercell');
  font.loadSync();
  return {card:path.join(root,'server/assets/beer-pass.jpg')};
 })();
}
function fit(ctx,text,size,max){let s=size;do{ctx.font=`${s}px Supercell`;s-=2;}while(ctx.measureText(text).width>max&&s>14);}
export async function makeBeerPass(root,{name,email}){
 const {card}=await load(root);
 const img=await PImage.decodeJPEGFromStream(fs.createReadStream(card));
 const ctx=img.getContext('2d');ctx.fillStyle='#0b2a7a';ctx.textAlign='center';ctx.textBaseline='middle';
 const cx=img.width/2;
 fit(ctx,name,58,BOX.w);ctx.fillText(name,cx,BOX.name+4);
 fit(ctx,email,34,BOX.w);ctx.fillText(email,cx,BOX.email+2);
 const out=new PassThrough(),chunks=[];out.on('data',c=>chunks.push(c));
 await PImage.encodeJPEGToStream(img,out,90);
 return Buffer.concat(chunks);
}
