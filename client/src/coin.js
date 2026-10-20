import * as T from 'three';

// coin.blend mesh with embedded logo UVs corrected to read upright on both faces.
export async function loadCoinTemplate(loader,url) {
  const {scene}=await loader.loadAsync(url);
  const meshes=[];
  scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  if(!meshes.length)throw new Error('Coin asset has no mesh');
  const model=new T.Group();
  // Exported vertex positions already form an upright XY disc. Remove the
  // Blender display rotation so both logo faces turn around the game's Y axis.
  for(const source of meshes){
    const coin=source.clone();coin.position.set(0,0,0);coin.rotation.set(0,0,0);coin.scale.set(1,1,1);
    coin.castShadow=false;coin.receiveShadow=false;
    const tune=original=>{
      const mat=original.clone();
      // A little diffuse light keeps metallic blue readable without an HDR map.
      mat.metalness=Math.min(mat.metalness,.45);mat.roughness=Math.max(mat.roughness,.3);
      mat.emissive.copy(mat.map?new T.Color(0xffffff):mat.color);
      mat.emissiveMap=mat.map;mat.emissiveIntensity=.12;
      return mat;
    };
    coin.material=Array.isArray(source.material)?source.material.map(tune):tune(source.material);
    model.add(coin);
  }
  const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());
  const diameter=Math.max(size.x,size.y);
  if(!Number.isFinite(diameter)||diameter<=0)throw new Error('Invalid coin dimensions');
  const scale=.64/diameter,center=bounds.getCenter(new T.Vector3());
  model.position.copy(center).multiplyScalar(-scale);model.scale.setScalar(scale);
  const template=new T.Group();template.name='GameOnCoin';template.add(model);
  return template;
}
