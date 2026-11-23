// Downloads the Mapbox data used to build client/assets/colombo_route.glb.
// Route: Galle Face roundabout -> Galle Face Centre Rd -> Galle Road -> Morven Hotel (213 Galle Rd, Colombo 03).
// usage: MAPBOX_TOKEN=pk.xxx node scripts/fetch-colombo-mapbox.mjs [out.json]
// then:  python3 scripts/build_colombo_map.py colombo_mapbox_bundle.json client/assets
import {writeFileSync} from 'node:fs';
const TK = process.env.MAPBOX_TOKEN;
if (!TK) { console.error('Set MAPBOX_TOKEN first.'); process.exit(1); }
const out = process.argv[2] || 'colombo_mapbox_bundle.json';
const START = [79.8437, 6.9316], END = [79.8497, 6.9107];
const dir = await fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${START};${END}?geometries=geojson&overview=full&access_token=${TK}`).then(r => r.json());
if (!dir.routes?.length) throw new Error('Directions failed: ' + JSON.stringify(dir));
const route = dir.routes[0].geometry.coordinates;
const z = 16, tx = l => Math.floor((l + 180) / 360 * 2 ** z);
const ty = a => { const r = a * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
const tiles = {};
const jobs = [];
for (let x = tx(79.8375); x <= tx(79.8565); x++) for (let y = ty(6.9355); y <= ty(6.9065); y++)
  jobs.push(fetch(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${z}/${x}/${y}.mvt?access_token=${TK}`)
    .then(r => { if (!r.ok) throw new Error(`tile ${x}/${y}: ${r.status}`); return r.arrayBuffer(); })
    .then(b => { tiles[`${z}/${x}/${y}`] = Buffer.from(b).toString('base64'); }));
await Promise.all(jobs);
writeFileSync(out, JSON.stringify({route, tiles, source: 'mapbox.mapbox-streets-v8', fetched: new Date().toISOString()}));
console.log(`Saved ${Object.keys(tiles).length} tiles + route (${Math.round(dir.routes[0].distance)} m) to ${out}`);
