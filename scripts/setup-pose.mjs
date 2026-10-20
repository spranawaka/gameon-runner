import {mkdir,copyFile,cp,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'node_modules/@mediapipe/tasks-vision');
const dest=path.join(root,'client/vendor/mediapipe');
await mkdir(dest,{recursive:true});
await copyFile(path.join(source,'vision_bundle.mjs'),path.join(dest,'vision_bundle.mjs'));
await copyFile(path.join(source,'vision_bundle.cjs'),path.join(dest,'vision_bundle.js'));
await cp(path.join(source,'wasm'),path.join(dest,'wasm'),{recursive:true});
await mkdir(path.join(root,'client/assets/pose'),{recursive:true});
const target=path.join(root,'client/assets/pose/pose_landmarker_lite.task');
if(!(await stat(target).catch(()=>null))?.size){
 const response=await fetch('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task');
 if(!response.ok)throw new Error('Pose model download failed: '+response.status);
 const data=Buffer.from(await response.arrayBuffer());if(data.length<1000000)throw new Error('Pose model download incomplete');
 await writeFile(target,data);
}
console.log('Local MediaPipe runtime, WASM and pose model ready.');
