#!/usr/bin/env python3
"""Build the Colombo runner map (GLB) from a Mapbox Streets v8 tile bundle.

Input : colombo_mapbox_bundle.json  {route:[[lon,lat],...], tiles:{"z/x/y": base64 mvt}}
Output: colombo_route.glb  (+ colombo_route.json with metadata)

The real route (Galle Face roundabout -> Galle Road -> Morven Hotel) is
"straightened": every vertex is re-expressed as (s = distance along the route,
d = signed offset to the right of travel).  In the game the runner moves along
-Z, so a vertex ends up at x = d, z = -s.  Buildings keep their real order,
footprint and height on both sides of the road.

usage: python3 build_colombo_map.py bundle.json out_dir
pip: mapbox-vector-tile shapely trimesh mapbox-earcut numpy pillow
"""
import base64, json, math, sys, os
import numpy as np
import mapbox_vector_tile
from shapely.geometry import shape, box, LineString, Polygon, MultiPolygon, Point
import warnings; warnings.filterwarnings('ignore')
from shapely.ops import unary_union, transform as shp_transform
from shapely.validation import make_valid
from shapely.geometry.polygon import orient
import trimesh
from PIL import Image, ImageDraw
import mapbox_earcut as earcut

bundle_path, out_dir = sys.argv[1], sys.argv[2]
B = json.load(open(bundle_path))

# ---------------------------------------------------------------- projection
R = 6378137.0
LON0, LAT0 = 79.8465, 6.921
KX = math.pi / 180 * R * math.cos(math.radians(LAT0))
KY = math.pi / 180 * R
def ll2m(lon, lat):  # local metres, x east, y north
    return (lon - LON0) * KX, (lat - LAT0) * KY

def tile_to_ll(z, tx, ty, px, py, extent):
    n = 2 ** z
    lon = (tx + px / extent) / n * 360 - 180
    yy = math.pi * (1 - 2 * (ty + py / extent) / n)
    lat = math.degrees(math.atan(math.sinh(yy)))
    return lon, lat

# ---------------------------------------------------------------- route
route = np.array([ll2m(*c) for c in B['route']])
# Drop the short westward Lotus Road leg: start where the route turns south.
start = 0
for i in range(1, len(route)):
    if route[i][1] < route[0][1] - 20:
        start = max(0, i - 3); break
route = route[start:]

def resample(pts, step):
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.arange(0, s[-1], step)
    return np.stack([np.interp(t, s, pts[:, 0]), np.interp(t, s, pts[:, 1])], 1)

raw = resample(route, 2.0)
# Heavy smoothing so the straightening keeps building shapes (bends become gentle).
def smooth(p, win):
    k = np.ones(win) / win
    pad = np.pad(p, ((win, win), (0, 0)), mode='edge')
    out = np.stack([np.convolve(pad[:, 0], k, 'same'), np.convolve(pad[:, 1], k, 'same')], 1)
    return out[win:-win]
center = smooth(smooth(raw, 45), 45)  # ~90 m windows
center = resample(center, 2.0)
seg = np.linalg.norm(np.diff(center, axis=0), axis=1)
S = np.concatenate([[0], np.cumsum(seg)])
L = float(S[-1])
T = np.diff(center, axis=0); T = np.vstack([T, T[-1]]); T /= np.linalg.norm(T, axis=1)[:, None]
Nr = np.stack([T[:, 1], -T[:, 0]], 1)  # right-hand normal
print(f'route length {L:.0f} m, {len(center)} samples')

from scipy.spatial import cKDTree
tree = cKDTree(center)
def to_sd(xy):
    xy = np.asarray(xy, float)
    _, idx = tree.query(xy)
    idx = np.clip(idx, 0, len(center) - 2)
    a, b = center[idx], center[idx + 1]
    ab = b - a; t = np.einsum('ij,ij->i', xy - a, ab) / np.einsum('ij,ij->i', ab, ab)
    t = np.clip(t, -1.5, 2.5)
    p = a + ab * t[:, None]
    s = S[idx] + t * np.linalg.norm(ab, axis=1)
    d = np.einsum('ij,ij->i', xy - p, Nr[idx])
    return s, d

HALF = 175.0   # corridor half-width kept (m)
corridor = LineString(center).buffer(HALF, cap_style=2)
WIDE = 420.0  # ground / sea / parks reach further so the horizon is not empty
corridor_wide = LineString(center).buffer(WIDE, cap_style=2)
ROAD_HALF = 9.0  # straight running road half-width in game

# ---------------------------------------------------------------- tiles
layers = {}
for key, data in B['tiles'].items():
    z, tx, ty = map(int, key.split('/'))
    dec = mapbox_vector_tile.decode(base64.b64decode(data), default_options={'y_coord_down': True})
    for lname, layer in dec.items():
        ext = layer.get('extent', 4096)
        def conv(x, y, z_=None, tx=tx, ty=ty, z=z, ext=ext):
            return ll2m(*tile_to_ll(z, tx, ty, x, y, ext))
        clip = shp_transform(conv, box(0, 0, ext, ext))
        for f in layer['features']:
            try:
                g = shp_transform(conv, shape(f['geometry']))
                if not g.is_valid: g = make_valid(g)
                g = g.intersection(clip).intersection(corridor if lname == 'building' else corridor_wide)
            except Exception:
                continue
            if g.is_empty: continue
            layers.setdefault(lname, []).append((g, f['properties']))
print({k: len(v) for k, v in layers.items()})

def polys(g):
    if isinstance(g, Polygon): return [g]
    if isinstance(g, MultiPolygon): return list(g.geoms)
    if hasattr(g, 'geoms'): return [p for x in g.geoms for p in polys(x)]
    return []

def densify(ring, step=6.0):
    pts = np.asarray(ring.coords)
    out = []
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(np.linalg.norm(b - a) / step))
        for k in range(n): out.append(a + (b - a) * k / n)
    return np.array(out)

def straighten_poly(p, step=6.0):
    """Polygon in metres -> polygon in (x=d, y=s) straightened space."""
    def ring(r):
        pts = densify(r, step)
        if len(pts) < 3: return None
        s, d = to_sd(pts)
        return np.stack([d, s], 1)
    ext = ring(p.exterior)
    if ext is None: return None
    holes = [h for h in (ring(i) for i in p.interiors) if h is not None]
    q = Polygon(ext, holes)
    if not q.is_valid: q = make_valid(q)
    return q

# ---------------------------------------------------------------- geometry builders
buckets = {}  # (chunk, material) -> list of (verts, faces, uvs)
CHUNK = 120.0
def add(mat, chunk, v, f, uv):
    buckets.setdefault((chunk, mat), []).append((np.asarray(v, np.float32), np.asarray(f, np.int64), np.asarray(uv, np.float32)))

def chunk_of(s): return int(max(0, min(L - 1, s)) // CHUNK)

def tri_poly(poly):
    rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]
    verts = np.vstack(rings)
    ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    idx = earcut.triangulate_float64(verts, ends).reshape(-1, 3)
    return verts, idx

def face_up(v, idx):
    idx = np.asarray(idx, np.int64).copy()
    a, b, c = v[idx[:, 0]], v[idx[:, 1]], v[idx[:, 2]]
    ny = np.cross(b - a, c - a)[:, 1]
    idx[ny < 0] = idx[ny < 0][:, ::-1]
    return idx

def flat(poly, y, mat, uvscale=0.1):
    """Horizontal polygon given in (d, s) space -> game (x=d, y, z=-s)."""
    for p in polys(poly):
        if p.area < 1: continue
        try: v2, idx = tri_poly(p)
        except Exception: continue
        if len(idx) == 0: continue
        cs = chunk_of(float(np.mean(v2[:, 1])))
        v = np.stack([v2[:, 0], np.full(len(v2), y), -v2[:, 1]], 1)
        add(mat, cs, v, face_up(v, idx), v2 * uvscale)

def extrude(poly, h0, h1, wall_mat, roof_mat):
    for p in polys(poly):
        if p.area < 4: continue
        p = p.simplify(0.3)
        if p.is_empty or not isinstance(p, Polygon): continue
        try: v2, idx = tri_poly(p)
        except Exception: continue
        cs = chunk_of(p.centroid.y)
        # roof
        v = np.stack([v2[:, 0], np.full(len(v2), h1), -v2[:, 1]], 1)
        add(roof_mat, cs, v, face_up(v, idx), v2 * 0.08)
        # walls (outer + holes), one quad per edge, UV in metres for window texture
        p = orient(p, 1.0)  # exterior CCW, holes CW in (d, s): interior is on the left of every edge
        for r in [p.exterior] + list(p.interiors):
            c = np.asarray(r.coords)
            V, F, U = [], [], []
            for a, b in zip(c[:-1], c[1:]):
                ln = float(np.linalg.norm(b - a))
                if ln < 0.05: continue
                k = len(V)
                V += [[a[0], h0, -a[1]], [b[0], h0, -b[1]], [b[0], h1, -b[1]], [a[0], h1, -a[1]]]
                U += [[0, h0 / 3.4], [ln / 4.0, h0 / 3.4], [ln / 4.0, h1 / 3.4], [0, h1 / 3.4]]
                F += [[k, k + 1, k + 2], [k, k + 2, k + 3]]
            if F:
                V = np.array(V, float); F = np.array(F)
                # outward direction of each quad in game space = right-hand normal of edge in (d,s) -> (x, z=-s)
                e = V[F[:, 1]] - V[F[:, 0]]                       # edge vector in game (dx, 0, dz)
                out = np.stack([-e[:, 2], np.zeros(len(e)), e[:, 0]], 1)  # right normal (ds,-dd) in (d,s) -> game (x=ds, z=dd)
                n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
                flip = np.einsum('ij,ij->i', n, out) < 0
                F[flip] = F[flip][:, ::-1]
                add(wall_mat, cs, V, F, U)

# ---------------------------------------------------------------- layers -> meshes
def straight_union(items, buffer_fn=None):
    gs = []
    for g, props in items:
        if buffer_fn: g = buffer_fn(g, props)
        if g is None or g.is_empty: continue
        for p in polys(g):
            q = straighten_poly(p)
            if q is not None and not q.is_empty: gs.append(q)
    return unary_union(gs) if gs else None

clip_game = box(-WIDE, -60, WIDE, L + 10)
run_strip = box(-ROAD_HALF, -60, ROAD_HALF, L + 60)

# Water (sea, Beira Lake) and parks / Galle Face Green.
water = straight_union(layers.get('water', []))
if water is not None: flat(water.intersection(clip_game), -0.25, 'water', 0.05)
green_classes = {'park', 'grass', 'pitch', 'scrub', 'wood', 'cemetery', 'golf_course', 'agriculture'}
greens = straight_union([(g, p) for g, p in layers.get('landuse', []) if p.get('class') in green_classes])
sand = straight_union([(g, p) for g, p in layers.get('landuse', []) if p.get('class') in {'sand', 'beach'}])
if sand is not None: flat(sand.intersection(clip_game).difference(run_strip), 0.0, 'sand', 0.1)
if greens is not None: flat(greens.intersection(clip_game).difference(run_strip), 0.01, 'grass', 0.1)

# Roads: buffer each line by a class width.
WIDTH = {'motorway': 18, 'trunk': 16, 'primary': 15, 'secondary': 12, 'tertiary': 10, 'street': 7,
         'street_limited': 6, 'service': 4.5, 'pedestrian': 4, 'path': 2.5, 'track': 3, 'major_rail': 3,
         'minor_rail': 2.5, 'primary_link': 8, 'secondary_link': 7, 'trunk_link': 8}
def road_buf(g, props):
    if props.get('structure') == 'tunnel': return None
    cls = props.get('class', 'street')
    if cls in ('major_rail', 'minor_rail', 'service_rail'): return None
    w = WIDTH.get(cls, 6)
    return g.buffer(w / 2, cap_style=2, join_style=2)
roads = straight_union(layers.get('road', []), road_buf)
rails = straight_union([(g, p) for g, p in layers.get('road', []) if p.get('class') in ('major_rail', 'minor_rail')],
                       lambda g, p: g.buffer(1.6, cap_style=2))
sidewalk = run_strip.buffer(4.0, cap_style=2, join_style=2).difference(run_strip)
if roads is not None:
    flat(roads.intersection(clip_game).difference(run_strip.buffer(3.5)), 0.03, 'asphalt', 0.1)
if rails is not None:
    flat(rails.intersection(clip_game).difference(run_strip.buffer(3.5)), 0.05, 'rail', 0.25)

# Base ground for the whole corridor (pavement colour), sea is drawn just below it.
ground = clip_game.difference(water) if water is not None else clip_game
flat(ground.difference(run_strip.buffer(4.0)), -0.02, 'ground', 0.1)
flat(sidewalk, 0.12, 'sidewalk', 0.25)
# Straight main road with lane markings for the runner.
for c0 in np.arange(-60, L, CHUNK):
    c1 = min(L, c0 + CHUNK)
    flat(box(-ROAD_HALF, c0, ROAD_HALF, c1), 0.04, 'mainroad', 0.1)
    for lx in (-1.2, 1.2, -3.6, 3.6):
        for z in np.arange(c0, c1 - 3, 9):
            flat(box(lx - 0.12, z, lx + 0.12, z + 4.5), 0.06, 'paint', 0.1)
    for lx in (-ROAD_HALF + 0.4, ROAD_HALF - 0.4):
        flat(box(lx - 0.1, c0, lx + 0.1, c1), 0.06, 'paint', 0.1)

# Buildings.
nb = 0
rng = np.random.default_rng(7)
WALLS = ['wall_white', 'wall_cream', 'wall_grey', 'wall_glass', 'wall_peach']
for g, props in layers.get('building', []):
    if props.get('underground') == 'true': continue
    h = float(props.get('height') or 0) or 7.0 + rng.random() * 6
    h0 = float(props.get('min_height') or 0)
    if h <= h0: continue
    for p in polys(g):
        q = straighten_poly(p, step=8.0)
        if q is None: continue
        q = q.difference(run_strip.buffer(4.5))
        if q.is_empty: continue
        key = int(abs(p.centroid.x * 7 + p.centroid.y * 13)) % 997
        wall = 'wall_glass' if h > 45 else WALLS[key % 4]
        roof = 'roof_dark' if key % 3 == 0 else 'roof_light'
        extrude(q, h0, h, wall, roof)
        nb += 1
print('buildings', nb)

# ---------------------------------------------------------------- textures / materials
os.makedirs(out_dir, exist_ok=True)
def facade(base, win, frame, glass=False, size=256):
    im = Image.new('RGB', (size, size), base); d = ImageDraw.Draw(im)
    # one tile = 4 m wide x 3.4 m high: one window per floor
    if glass:
        for i in range(0, size, 64): d.rectangle([i, 0, i + 3, size], fill=frame)
        d.rectangle([0, size - 14, size, size], fill=frame)
        for i in range(0, size, 64):
            d.rectangle([i + 4, 0, i + 63, size - 15], fill=win)
    else:
        d.rectangle([48, 60, 208, 200], fill=frame)
        d.rectangle([56, 68, 200, 192], fill=win)
        d.line([128, 68, 128, 192], fill=frame, width=6)
        d.rectangle([0, size - 10, size, size], fill=tuple(int(c * .9) for c in base))
    return im
TEX = {
    'wall_white': facade((236, 234, 226), (92, 128, 150), (205, 203, 196)),
    'wall_cream': facade((236, 221, 186), (88, 118, 138), (199, 180, 145)),
    'wall_grey': facade((196, 201, 204), (70, 104, 128), (160, 166, 170)),
    'wall_peach': facade((233, 196, 170), (86, 114, 134), (196, 160, 136)),
    'wall_glass': facade((86, 140, 170), (110, 170, 198), (210, 222, 228), glass=True),
}
COL = {'roof_dark': (122, 126, 128), 'roof_light': (214, 210, 200), 'ground': (214, 206, 186),
       'sidewalk': (190, 186, 178), 'mainroad': (58, 62, 68), 'asphalt': (74, 78, 84), 'paint': (245, 245, 235),
       'grass': (136, 186, 96), 'sand': (232, 214, 164), 'water': (82, 172, 214), 'rail': (128, 104, 84)}
def srgb2lin(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

def material(name):
    if name in TEX:
        return trimesh.visual.material.PBRMaterial(name=name, baseColorTexture=TEX[name], metallicFactor=0.0,
                                                   roughnessFactor=0.85 if name != 'wall_glass' else 0.35)
    c = [srgb2lin(v) for v in COL[name]]  # glTF colour factors are linear
    return trimesh.visual.material.PBRMaterial(name=name, baseColorFactor=[c[0], c[1], c[2], 1.0], metallicFactor=0.0,
                                               roughnessFactor=0.3 if name == 'water' else 0.9)
MATS = {}
scene = trimesh.Scene()
nverts = 0
for (chunk, mat), parts in sorted(buckets.items()):
    vs, fs, us, off = [], [], [], 0
    for v, f, uv in parts:
        vs.append(v); fs.append(f + off); us.append(uv); off += len(v)
    V = np.vstack(vs); F = np.vstack(fs); U = np.vstack(us)
    MATS.setdefault(mat, material(mat))
    m = trimesh.Trimesh(vertices=V, faces=F, process=False,
                        visual=trimesh.visual.TextureVisuals(uv=U, material=MATS[mat]))
    scene.add_geometry(m, node_name=f'chunk{chunk:02d}_{mat}', geom_name=f'chunk{chunk:02d}_{mat}')
    nverts += len(V)
end = np.eye(4); end[2, 3] = -L
scene.graph.update(frame_to='route_end', frame_from=scene.graph.base_frame, matrix=end)
glb = os.path.join(out_dir, 'colombo_route.glb')
scene.export(glb)
json.dump({'length': round(L, 1), 'chunk': CHUNK, 'roadHalfWidth': ROAD_HALF, 'buildings': nb,
           'from': 'Galle Face roundabout', 'to': 'Morven Hotel, 213 Galle Rd, Colombo 03',
           'source': B.get('source'), 'fetched': B.get('fetched')},
          open(os.path.join(out_dir, 'colombo_route.json'), 'w'), indent=1)
print('verts', nverts, 'size', os.path.getsize(glb))
