self.exports={};
importScripts('../vendor/mediapipe/vision_bundle.js');
const {FilesetResolver,PoseLandmarker}=self.exports;
let landmarker;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{
   const files=await FilesetResolver.forVisionTasks('../vendor/mediapipe/wasm');
   landmarker=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'../assets/pose/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55,outputSegmentationMasks:false});
   self.postMessage({type:'ready'});
  }catch(error){console.error('Pose worker initialization:',error);self.postMessage({type:'error',message:'Pose detection could not start. Reload or use keyboard controls.'});}
 }
 if(data.type==='frame'){
  try{const result=landmarker.detectForVideo(data.frame,data.time);const points=result.landmarks[0];
   self.postMessage({type:'pose',time:data.time,points:points?Object.fromEntries([11,12,23,24].map(i=>[i,{x:points[i].x,y:points[i].y,visibility:points[i].visibility}])):null});
  }catch{self.postMessage({type:'frame-error'});}finally{data.frame.close();}
 }
};
