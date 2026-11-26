"""TITAN V2 object library. Each builder returns the list of mesh objects it created, resting on z=0 and roughly
centred on the origin. Materials come from studio.py and are named titan.<family>.<variant>.
Meaning of matter: steel = the neutral base; amber gold = records and rare moments; cyan enamel = progression (discreet);
coral = what is shared with others (rope, community bands); lime = the act of recording (start buttons only)."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
import studio as S

def M():
    return {
        'steel': S.mat_metal('titan.metal.brushed-steel', '#C9D1D8', rough=0.24),
        'satin': S.mat_metal('titan.metal.satin-steel', '#E4E9EC', rough=0.2, aniso=0.3),
        'gun': S.mat_metal('titan.metal.gunmetal', '#4A5560', rough=0.32, aniso=0.4),
        'iron': S.mat_dielectric('titan.metal.cast-iron', '#1A1E22', rough=0.55, bump=0.25, bump_scale=200),
        'gold': S.mat_metal('titan.metal.amber-gold', '#E8B04E', rough=0.22, aniso=0.35),
        'bronze': S.mat_metal('titan.metal.bronze', '#A8754A', rough=0.3, aniso=0.3),
        'amber': S.mat_enamel('titan.enamel.amber', '#F4BB54', rough=0.2),
        'cyan': S.mat_enamel('titan.enamel.cyan', '#3DD9E8', rough=0.25),
        'coral': S.mat_enamel('titan.enamel.coral', '#FF9B7A', rough=0.3),
        'lime': S.mat_enamel('titan.enamel.lime', '#D7F25A', rough=0.3),
        'carbon': S.mat_carbon('titan.carbon.twill', scale=150),
        'rubber': S.mat_dielectric('titan.rubber.matte-black', '#0E1114', rough=0.55, spec=0.35, bump=0.08, bump_scale=90),
        'glass': S.mat_glass('titan.glass.clear'),
        'dial': S.mat_dielectric('titan.dial.ink', '#0B0F13', rough=0.35, coat=0.6),
        'chalk': S.mat_dielectric('titan.paint.chalk', '#E3E7E2', rough=0.45, coat=0.4),
        'rock': S.mat_rock('titan.rock.granite', '#1E2228'),
        'leather': S.mat_dielectric('titan.leather.graphite', '#22262B', rough=0.6, bump=0.3, bump_scale=120),
        'paper': S.mat_dielectric('titan.paper.chalk', '#D8D9CF', rough=0.9, spec=0.2),
        'graphite': S.mat_fabric('titan.fabric.graphite', '#1A2129', weave=260),
        'rope': S.mat_fabric('titan.fabric.rope-coral', '#D9775B', weave=120, strength=0.6),
        'flag-cyan': S.mat_fabric('titan.fabric.flag-cyan', '#2FB9C7', weave=200, strength=0.3),
        'foam': S.mat_dielectric('titan.foam.mat-slate', '#4C6070', rough=0.75, bump=0.1, bump_scale=60),
        'resin': S.mat_dielectric('titan.resin.hold-slate', '#7A6FA8', rough=0.6, bump=0.6, bump_scale=300),
        'wood': S.mat_dielectric('titan.wood.ash', '#5A4A3B', rough=0.6, bump=0.15, bump_scale=30),
        'teal': S.mat_enamel('titan.enamel.sea-teal', '#2A8F99', rough=0.3),
    }

def cyl(name, r, d, loc=(0, 0, 0), rot=(0, 0, 0), v=48, mat=None, bev=0.0, seg=3):
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d, location=loc, rotation=rot)
    o = S.name_obj(bpy.context.active_object, name)
    if mat: S.assign(o, mat)
    if bev: S.bevel(o, bev, seg)
    S.smooth(o)
    return o

def cone(name, r1, r2, d, loc=(0, 0, 0), rot=(0, 0, 0), v=48, mat=None, bev=0.0):
    bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r1, radius2=r2, depth=d, location=loc, rotation=rot)
    o = S.name_obj(bpy.context.active_object, name)
    if mat: S.assign(o, mat)
    if bev: S.bevel(o, bev, 3)
    S.smooth(o)
    return o

def box(name, sx, sy, sz, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, bev=0.0, seg=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = S.name_obj(bpy.context.active_object, name)
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if mat: S.assign(o, mat)
    if bev: S.bevel(o, bev, seg)
    S.smooth(o)
    return o

def torus(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, maj=64, mino=16):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=maj, minor_segments=mino, location=loc, rotation=rot)
    o = S.name_obj(bpy.context.active_object, name)
    if mat: S.assign(o, mat)
    S.smooth(o)
    return o

def sphere(name, r, loc=(0, 0, 0), mat=None, seg=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=rings, location=loc)
    o = S.name_obj(bpy.context.active_object, name)
    if mat: S.assign(o, mat)
    S.smooth(o)
    return o

def chevron_obj(name, w=0.46, t=0.11, h=0.2, y0=0.0, ext=0.03, mat=None, z=0.0):
    pts = [(-w/2, y0, 0), (0, y0 + h, 0), (w/2, y0, 0), (w/2, y0 - t, 0), (0, y0 + h - t*1.35, 0), (-w/2, y0 - t, 0)]
    c = S.curve_from_points(name, pts, extrude=ext)
    c.data.bevel_depth = 0.008
    c.data.bevel_resolution = 2
    o = S.to_mesh(c)
    S.name_obj(o, name)
    o.location.z = z
    if mat: S.assign(o, mat)
    return o

def prism_profile(name, pts, ext, mat=None, bevel_depth=0.0):
    c = S.curve_from_points(name, [(x, y, 0) for x, y in pts], extrude=ext)
    c.data.bevel_depth = bevel_depth
    c.data.bevel_resolution = 3
    o = S.to_mesh(c)
    S.name_obj(o, name)
    if mat: S.assign(o, mat)
    S.smooth(o, 30)
    return o

def group(name, objs, rot=(0, 0, 0), loc=(0, 0, 0)):
    r = S.parent_all(name, objs)
    r.rotation_euler = rot
    r.location = loc
    return objs

# ------------------------------------------------------------------ rewards
def record_medal():
    m = M()
    objs = []
    objs.append(cyl('titan.medal.rim', 0.62, 0.11, mat=m['steel'], bev=0.03, v=96))
    objs.append(cyl('titan.medal.face', 0.52, 0.12, mat=m['gold'], bev=0.015, v=96))
    for i, y0 in enumerate((0.06, -0.17)):
        objs.append(chevron_obj(f'titan.medal.chevron.{i}', w=0.5, t=0.12, h=0.22, y0=y0, ext=0.03, mat=m['satin'], z=0.075))
    # ribbon: two strips leaning back from the top, graphite with an amber centre line
    for sx in (-1, 1):
        r = box(f'titan.medal.ribbon.{sx}', 0.17, 0.62, 0.012, loc=(sx * 0.12, 0.88, -0.02), rot=(0, 0, math.radians(sx * 12)), mat=m['graphite'], bev=0.004)
        objs.append(r)
        objs.append(box(f'titan.medal.ribbon-line.{sx}', 0.035, 0.62, 0.014, loc=(sx * 0.12, 0.88, -0.015), rot=(0, 0, math.radians(sx * 12)), mat=m['amber']))
    objs.append(torus('titan.medal.ring', 0.08, 0.022, loc=(0, 0.64, 0), rot=(math.radians(90), 0, 0), mat=m['steel']))
    group('titan.record-medal', objs, rot=(math.radians(72), 0, math.radians(-10)), loc=(0, 0, 0.66))
    return objs

def trophy():
    m = M()
    objs = []
    # base with la coupe (one corner cut), stem, faceted cup
    base = prism_profile('titan.trophy.base', [(-0.42, -0.32), (0.30, -0.32), (0.42, -0.20), (0.42, 0.32), (-0.42, 0.32)], 0.09, m['carbon'], 0.01)
    base.location.z = 0.09
    objs.append(base)
    band = prism_profile('titan.trophy.band', [(-0.43, -0.33), (0.30, -0.33), (0.43, -0.20), (0.43, 0.33), (-0.43, 0.33)], 0.018, m['coral'])
    band.location.z = 0.19
    objs.append(band)
    objs.append(cone('titan.trophy.foot', 0.2, 0.07, 0.16, loc=(0, 0, 0.29), v=8, mat=m['steel'], bev=0.01))
    objs.append(cyl('titan.trophy.stem', 0.05, 0.28, loc=(0, 0, 0.5), v=8, mat=m['steel']))
    objs.append(cyl('titan.trophy.knot', 0.09, 0.06, loc=(0, 0, 0.52), v=8, mat=m['satin'], bev=0.01))
    cup = cone('titan.trophy.cup', 0.16, 0.42, 0.62, loc=(0, 0, 0.95), v=8, mat=m['steel'], bev=0.012)
    objs.append(cup)
    objs.append(cyl('titan.trophy.lip', 0.43, 0.035, loc=(0, 0, 1.27), v=8, mat=m['satin'], bev=0.008))
    for sx in (-1, 1):
        h = torus(f'titan.trophy.handle.{sx}', 0.17, 0.028, loc=(sx * 0.42, 0, 1.0), rot=(math.radians(90), 0, 0), mat=m['steel'])
        h.scale = (0.75, 1.0, 1.0)
        objs.append(h)
    objs.append(chevron_obj('titan.trophy.mark', w=0.26, t=0.06, h=0.12, y0=0.0, ext=0.02, mat=m['coral']))
    objs[-1].rotation_euler = (math.radians(90), 0, math.radians(0))
    objs[-1].location = (0, -0.33, 0.9)
    group('titan.trophy', objs, rot=(0, 0, math.radians(-22)))
    return objs

def week_pennant():
    m = M()
    objs = []
    rock = sphere('titan.pennant.rock', 0.36, loc=(0, 0, 0.12), mat=m['rock'], seg=24, rings=12)
    rock.scale = (1.2, 1.0, 0.5)
    d = rock.modifiers.new('titan.displace', 'DISPLACE')
    tex = bpy.data.textures.new('titan.tex.rock', 'CLOUDS'); tex.noise_scale = 0.4
    d.texture = tex; d.strength = 0.12
    objs.append(rock)
    objs.append(cyl('titan.pennant.pole', 0.03, 1.5, loc=(0, 0, 0.9), mat=m['steel'], v=24))
    objs.append(sphere('titan.pennant.finial', 0.05, loc=(0, 0, 1.66), mat=m['satin']))
    # pennant: a triangle subdivided and waved
    me = bpy.data.meshes.new('titan.pennant.cloth')
    bm = bmesh.new()
    N, K = 24, 8
    verts = {}
    for i in range(N + 1):
        u = i / N
        for j in range(K + 1):
            v = j / K
            half = 0.24 * (1 - u)
            y = 0.0
            x = 0.03 + u * 0.78
            z = 1.38 + (v - 0.5) * 2 * half
            y = 0.06 * math.sin(u * math.pi * 2.2) * u
            verts[(i, j)] = bm.verts.new((x, y, z))
    for i in range(N):
        for j in range(K):
            bm.faces.new((verts[(i, j)], verts[(i + 1, j)], verts[(i + 1, j + 1)], verts[(i, j + 1)]))
    bm.to_mesh(me); bm.free()
    cl = bpy.data.objects.new('titan.pennant.cloth', me)
    bpy.context.scene.collection.objects.link(cl)
    sol = cl.modifiers.new('titan.solidify', 'SOLIDIFY'); sol.thickness = 0.012
    S.assign(cl, m['flag-cyan']); S.smooth(cl)
    objs.append(cl)
    objs.append(chevron_obj('titan.pennant.mark', w=0.16, t=0.04, h=0.08, y0=0.0, ext=0.006, mat=m['chalk']))
    objs[-1].rotation_euler = (math.radians(90), 0, math.radians(-90))
    objs[-1].rotation_euler = (math.radians(90), 0, 0)
    objs[-1].location = (0.26, -0.035, 1.38)
    group('titan.week-pennant', objs, rot=(0, 0, math.radians(-28)))
    return objs

def beacon(lit=True, crystal=False):
    m = M()
    objs = []
    # cairn: stacked flattened stones
    random.seed(7)
    z = 0.0
    for i, (r, h) in enumerate([(0.42, 0.18), (0.34, 0.16), (0.27, 0.14)]):
        st = sphere(f'titan.beacon.stone.{i}', 1, loc=(random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), z + h / 2), mat=m['rock'], seg=20, rings=10)
        st.scale = (r * 1.1, r, h / 2 * 1.15)
        st.rotation_euler[2] = random.uniform(0, 3)
        objs.append(st)
        z += h * 0.85
    objs.append(cyl('titan.beacon.pole', 0.05, 0.45, loc=(0, 0, z + 0.22), mat=m['gun'], v=16))
    top = z + 0.45
    objs.append(cyl('titan.beacon.cage-base', 0.26, 0.06, loc=(0, 0, top), mat=m['gun'], v=6, bev=0.01))
    objs.append(cyl('titan.beacon.cage-top', 0.22, 0.05, loc=(0, 0, top + 0.5), mat=m['gun'], v=6, bev=0.01))
    objs.append(cone('titan.beacon.roof', 0.27, 0.03, 0.2, loc=(0, 0, top + 0.62), mat=m['gun'], v=6))
    objs.append(torus('titan.beacon.handle', 0.08, 0.014, loc=(0, 0, top + 0.76), rot=(math.radians(90), 0, 0), mat=m['gun']))
    for k in range(6):
        a = k * math.pi / 3
        objs.append(cyl(f'titan.beacon.bar.{k}', 0.018, 0.5, loc=(0.235 * math.cos(a), 0.235 * math.sin(a), top + 0.25), mat=m['gun'], v=8))
    if crystal:
        core = cone('titan.beacon.crystal', 0.13, 0.0, 0.42, loc=(0, 0, top + 0.25), v=6)
    else:
        core = cyl('titan.beacon.flame-glass', 0.15, 0.4, loc=(0, 0, top + 0.25), v=24)
    if lit:
        S.assign(core, S.mat_emission('titan.light.beacon-amber', '#F4BB54', strength=9.0) if not crystal else S.mat_emission('titan.light.beacon-ice', '#9CE8EF', strength=6.0))
        L = bpy.data.lights.new('titan.beacon.light', 'POINT'); L.energy = 70; L.color = (1.0, 0.75, 0.38) if not crystal else (0.6, 0.92, 0.95); L.shadow_soft_size = 0.05
        lo = bpy.data.objects.new('titan.beacon.light', L); bpy.context.scene.collection.objects.link(lo); lo.location = (0, 0, top + 0.25)
    else:
        S.assign(core, m['glass'] if not crystal else S.mat_dielectric('titan.crystal.dormant', '#4D6470', rough=0.2, coat=0.6))
    objs.append(core)
    group('titan.beacon', objs, rot=(0, 0, math.radians(15)))
    return objs

# ------------------------------------------------------------------ worlds
def buoy():
    m = M()
    objs = []
    objs.append(cone('titan.buoy.hull-low', 0.42, 0.46, 0.22, loc=(0, 0, 0.11), mat=m['teal'], bev=0.02))
    objs.append(cone('titan.buoy.hull', 0.46, 0.2, 0.6, loc=(0, 0, 0.52), mat=m['chalk'], bev=0.02))
    objs.append(cone('titan.buoy.band', 0.335, 0.26, 0.16, loc=(0, 0, 0.6), mat=m['teal']))
    objs[-1].scale = (1.02, 1.02, 1)
    objs.append(cyl('titan.buoy.mast', 0.03, 0.5, loc=(0, 0, 1.05), mat=m['gun'], v=16))
    objs.append(cone('titan.buoy.topmark', 0.12, 0.0, 0.2, loc=(0, 0, 1.36), mat=m['gun'], v=4))
    objs.append(torus('titan.buoy.fender', 0.45, 0.04, loc=(0, 0, 0.22), mat=m['rubber']))
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        objs.append(cyl(f'titan.buoy.rail.{k}', 0.014, 0.34, loc=(0.16 * math.cos(a), 0.16 * math.sin(a), 0.95), rot=(0, 0, 0), mat=m['steel'], v=8))
    objs.append(torus('titan.buoy.rail-ring', 0.16, 0.014, loc=(0, 0, 1.12), mat=m['steel']))
    group('titan.buoy', objs)
    return objs

def gear(name, r=0.4, teeth=16, depth=0.12, mat=None, hole=0.12):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    N = teeth * 4
    ring = []
    for i in range(N):
        a = 2 * math.pi * i / N
        k = i % 4
        rr = r if k in (1, 2) else r * 0.86
        ring.append((rr * math.cos(a), rr * math.sin(a)))
    bot = [bm.verts.new((x, y, 0)) for x, y in ring]
    top = [bm.verts.new((x, y, depth)) for x, y in ring]
    for i in range(N):
        bm.faces.new((bot[i], bot[(i + 1) % N], top[(i + 1) % N], top[i]))
    bm.faces.new(list(reversed(bot))); bm.faces.new(top)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if mat: S.assign(o, mat)
    S.bevel(o, 0.008, 2)
    S.apply_modifiers(o)
    c = cyl(name + '.hole', hole, depth * 3, loc=(0, 0, depth / 2), v=6)
    S.boolean(o, c)
    S.smooth(o, 30)
    return o

def forge_gears():
    m = M()
    objs = []
    g1 = gear('titan.forge.gear-large', 0.5, 18, 0.14, m['bronze'], 0.12); g1.location = (-0.2, 0.0, 0.0); objs.append(g1)
    g2 = gear('titan.forge.gear-small', 0.3, 12, 0.14, m['iron'], 0.08); g2.location = (0.52, -0.08, 0.0); g2.rotation_euler[2] = 0.13; objs.append(g2)
    g3 = gear('titan.forge.gear-standing', 0.34, 14, 0.12, m['steel'], 0.09); g3.location = (0.1, 0.35, 0.34); g3.rotation_euler = (math.radians(80), 0, math.radians(-10)); objs.append(g3)
    objs.append(cyl('titan.forge.axle', 0.06, 0.3, loc=(-0.2, 0, 0.15), v=6, mat=m['gun']))
    group('titan.forge-gears', objs, rot=(0, 0, math.radians(10)))
    return objs

def anvil():
    m = M()
    objs = []
    objs.append(box('titan.anvil.foot', 0.7, 0.5, 0.12, loc=(0, 0, 0.06), mat=m['iron'], bev=0.03))
    objs.append(box('titan.anvil.waist', 0.38, 0.28, 0.38, loc=(0, 0, 0.31), mat=m['iron'], bev=0.04))
    objs.append(box('titan.anvil.face', 1.0, 0.36, 0.2, loc=(0.05, 0, 0.6), mat=m['iron'], bev=0.03))
    objs.append(box('titan.anvil.face-steel', 0.98, 0.34, 0.02, loc=(0.05, 0, 0.705), mat=m['steel'], bev=0.006))
    horn = cone('titan.anvil.horn', 0.13, 0.015, 0.55, loc=(0.82, 0, 0.62), rot=(0, math.radians(90), 0), mat=m['iron'])
    horn.scale = (1.0, 1.0, 1.0); objs.append(horn)
    # ember: a glowing ingot on the face
    objs.append(box('titan.anvil.ingot', 0.3, 0.1, 0.06, loc=(-0.1, 0.02, 0.745), mat=S.mat_emission('titan.light.ember', '#F08A3A', 3.0), bev=0.01))
    objs.append(box('titan.anvil.hammer-head', 0.12, 0.12, 0.26, loc=(0.25, -0.02, 0.78), rot=(math.radians(90), 0, math.radians(30)), mat=m['steel'], bev=0.012))
    objs.append(cyl('titan.anvil.hammer-handle', 0.022, 0.7, loc=(0.5, -0.17, 0.78), rot=(math.radians(90), 0, math.radians(-60)), mat=m['wood'], v=12))
    group('titan.anvil', objs, rot=(0, 0, math.radians(-20)))
    return objs

def veilleur_stone():
    m = M()
    objs = []
    st = box('titan.veilleur.stone', 0.5, 0.2, 1.3, loc=(0, 0, 0.65), mat=m['rock'], bev=0.06, seg=2)
    S.apply_modifiers(st)
    sub = st.modifiers.new('titan.subsurf', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    d = st.modifiers.new('titan.displace', 'DISPLACE')
    tex = bpy.data.textures.new('titan.tex.stone', 'CLOUDS'); tex.noise_scale = 0.35
    d.texture = tex; d.strength = 0.1
    objs.append(st)
    # the Veilleur's sign: an eye-like chevron inlaid in bronze on the face
    for i, y0 in enumerate((0.08, -0.12)):
        c = chevron_obj(f'titan.veilleur.sign.{i}', w=0.28, t=0.06, h=0.13, y0=y0, ext=0.012, mat=m['bronze'])
        c.rotation_euler = (math.radians(90), 0, 0)
        c.location = (0, -0.115, 0.85)
        objs.append(c)
    moss = S.mat_dielectric('titan.moss.dawn', '#4F7A5A', rough=0.9, bump=0.5, bump_scale=200)
    for k, (x, y, r) in enumerate([(-0.18, -0.1, 0.16), (0.2, 0.05, 0.12), (0.05, 0.16, 0.1)]):
        b = sphere(f'titan.veilleur.moss.{k}', r, loc=(x, y, 0.0), mat=moss, seg=16, rings=8)
        b.scale = (1.3, 1.0, 0.5); objs.append(b)
    group('titan.veilleur-stone', objs, rot=(0, 0, math.radians(-25)))
    return objs

def sea_chart():
    """Marées: rolled chart of currents tied with cord, plus a brass dividers."""
    m = M()
    objs = []
    objs.append(cyl('titan.chart.roll', 0.17, 1.3, loc=(0, 0, 0.17), rot=(0, math.radians(90), 0), mat=m['paper'], v=48))
    for sx in (-0.25, 0.25):
        objs.append(torus(f'titan.chart.cord.{sx}', 0.175, 0.012, loc=(sx, 0, 0.17), rot=(0, math.radians(90), 0), mat=m['rope']))
    # dividers
    for sy in (-1, 1):
        a = cyl(f'titan.chart.divider.{sy}', 0.012, 0.75, loc=(0.1 + sy * 0.09, -0.33, 0.04), rot=(math.radians(90), 0, math.radians(sy * 8)), mat=m['bronze'], v=8)
        a.rotation_euler = (math.radians(88), 0, math.radians(sy * 10))
        objs.append(a)
    objs.append(cyl('titan.chart.divider-hinge', 0.035, 0.03, loc=(0.1, -0.7, 0.04), mat=m['bronze'], v=24))
    group('titan.sea-chart', objs, rot=(0, 0, math.radians(-15)))
    return objs

# ------------------------------------------------------------------ cooperation, coaching, data
def rope_carabiner():
    m = M()
    objs = []
    for i in range(5):
        t = torus(f'titan.rope.coil.{i}', 0.46 - i * 0.012, 0.045, loc=(0.01 * i, 0.012 * i, 0.05 + i * 0.075), mat=m['rope'], mino=12)
        t.rotation_euler = (math.radians(4 * (i % 2) - 2), math.radians(3), 0)
        objs.append(t)
    # carabiner: an asymmetric D drawn as a bevelled curve
    pts = []
    for k in range(40):
        a = 2 * math.pi * k / 40
        x = 0.2 * math.cos(a) * (1.0 if math.cos(a) > 0 else 0.8)
        y = 0.32 * math.sin(a)
        pts.append((x, y, 0))
    c = S.curve_from_points('titan.carabiner.body', pts, closed=True)
    c.data.dimensions = '3D'
    c.data.bevel_depth = 0.028
    c.data.bevel_resolution = 6
    c.data.fill_mode = 'FULL'
    cb = S.to_mesh(c); S.name_obj(cb, 'titan.carabiner.body'); S.assign(cb, m['satin']); S.smooth(cb)
    cb.location = (0.42, -0.3, 0.42); cb.rotation_euler = (math.radians(75), math.radians(10), math.radians(30))
    objs.append(cb)
    gate = cyl('titan.carabiner.gate', 0.022, 0.24, loc=(0.0, 0, 0), mat=m['gun'], v=12)
    gate.parent = cb; gate.location = (0.205, 0.02, 0); gate.rotation_euler = (math.radians(90), 0, 0)
    objs.append(gate)
    group('titan.rope-carabiner', objs, rot=(0, 0, math.radians(-10)))
    return objs

def relay_baton():
    m = M()
    objs = []
    b = cyl('titan.baton.body', 0.09, 1.3, loc=(0, 0, 0.09), rot=(0, math.radians(90), 0), mat=m['satin'], v=48, bev=0.02)
    objs.append(b)
    for sx in (-0.35, 0.35):
        objs.append(cyl(f'titan.baton.grip.{sx}', 0.093, 0.22, loc=(sx, 0, 0.09), rot=(0, math.radians(90), 0), mat=m['rope'], v=48))
    objs.append(cyl('titan.baton.band', 0.094, 0.05, loc=(0, 0, 0.09), rot=(0, math.radians(90), 0), mat=m['cyan'], v=48))
    group('titan.relay-baton', objs, rot=(0, 0, math.radians(-30)))
    return objs

def stopwatch():
    m = M()
    objs = []
    rot = (math.radians(90), 0, 0)
    objs.append(cyl('titan.stopwatch.case', 0.55, 0.2, loc=(0, 0, 0), rot=rot, mat=m['steel'], v=96, bev=0.05))
    objs.append(cyl('titan.stopwatch.dial', 0.47, 0.21, loc=(0, -0.002, 0), rot=rot, mat=m['dial'], v=96))
    for k in range(60):
        a = 2 * math.pi * k / 60
        L = 0.07 if k % 5 == 0 else 0.03
        r0 = 0.42 - L / 2
        t = box(f'titan.stopwatch.tick.{k}', 0.012 if k % 5 == 0 else 0.006, 0.004, L, loc=(r0 * math.sin(a), -0.107, r0 * math.cos(a)), rot=(0, a, 0), mat=m['chalk'])
        objs.append(t)
    objs.append(box('titan.stopwatch.hand', 0.016, 0.006, 0.38, loc=(0.11, -0.115, 0.14), rot=(0, math.radians(38), 0), mat=m['lime']))
    objs.append(cyl('titan.stopwatch.pin', 0.03, 0.02, loc=(0, -0.118, 0), rot=rot, mat=m['steel'], v=24))
    objs.append(cyl('titan.stopwatch.glass', 0.48, 0.03, loc=(0, -0.12, 0), rot=rot, mat=m['glass'], v=96))
    objs.append(cyl('titan.stopwatch.stem', 0.06, 0.16, loc=(0, 0, 0.62), mat=m['steel'], v=24))
    objs.append(cyl('titan.stopwatch.crown', 0.1, 0.09, loc=(0, 0, 0.74), mat=m['lime'], v=24, bev=0.015))
    objs.append(torus('titan.stopwatch.ring', 0.12, 0.022, loc=(0, 0, 0.86), rot=rot, mat=m['steel']))
    b = cyl('titan.stopwatch.button', 0.05, 0.12, loc=(0.42, 0, 0.42), rot=(0, math.radians(45), 0), mat=m['gun'], v=24, bev=0.01)
    objs.append(b)
    group('titan.stopwatch', objs, rot=(math.radians(-8), 0, math.radians(-18)), loc=(0, 0, 0.58))
    return objs

def gps_watch():
    m = M()
    objs = []
    case = box('titan.watch.case', 0.62, 0.62, 0.16, loc=(0, 0, 0.0), mat=m['gun'], bev=0.12, seg=6)
    objs.append(case)
    objs.append(box('titan.watch.screen', 0.5, 0.5, 0.02, loc=(0, 0, 0.082), mat=m['dial'], bev=0.09, seg=6))
    # a GPS trace drawn on the screen (a dim cyan polyline, no glow)
    pts = [(-0.17, -0.12, 0.095), (-0.08, -0.02, 0.095), (-0.1, 0.09, 0.095), (0.02, 0.14, 0.095), (0.09, 0.04, 0.095), (0.17, 0.1, 0.095)]
    c = S.curve_from_points('titan.watch.trace', pts, closed=False)
    c.data.bevel_depth = 0.009
    tr = S.to_mesh(c); S.name_obj(tr, 'titan.watch.trace'); S.assign(tr, S.mat_emission('titan.light.trace-cyan', '#3DD9E8', 1.6)); objs.append(tr)
    for sy in (-1, 1):
        s = box(f'titan.watch.strap.{sy}', 0.4, 0.55, 0.06, loc=(0, sy * 0.52, -0.06), rot=(math.radians(sy * -14), 0, 0), mat=m['rubber'], bev=0.025)
        objs.append(s)
    objs.append(cyl('titan.watch.button', 0.035, 0.07, loc=(0.33, -0.12, 0), rot=(0, math.radians(90), 0), mat=m['steel'], v=16))
    objs.append(cyl('titan.watch.button-lime', 0.035, 0.07, loc=(0.33, 0.12, 0), rot=(0, math.radians(90), 0), mat=m['lime'], v=16))
    group('titan.gps-watch', objs, rot=(math.radians(52), 0, math.radians(-20)), loc=(0, 0, 0.42))
    return objs

def logbook():
    m = M()
    objs = []
    objs.append(box('titan.logbook.pages', 0.86, 1.16, 0.12, loc=(0.01, 0, 0.09), mat=m['paper'], bev=0.01))
    objs.append(box('titan.logbook.cover-bottom', 0.92, 1.22, 0.025, loc=(0, 0, 0.02), mat=m['leather'], bev=0.012))
    objs.append(box('titan.logbook.cover-top', 0.92, 1.22, 0.025, loc=(0, 0, 0.16), mat=m['leather'], bev=0.012))
    objs.append(box('titan.logbook.spine', 0.05, 1.22, 0.17, loc=(-0.45, 0, 0.09), mat=m['leather'], bev=0.02))
    objs.append(box('titan.logbook.band', 0.03, 1.24, 0.18, loc=(0.32, 0, 0.09), mat=m['rope'], bev=0.005))
    objs.append(box('titan.logbook.ribbon', 0.04, 0.3, 0.004, loc=(-0.1, -0.72, 0.004), mat=m['amber']))
    c = chevron_obj('titan.logbook.mark', w=0.3, t=0.07, h=0.14, y0=0.0, ext=0.006, mat=m['satin'], z=0.173)
    objs.append(c)
    group('titan.logbook', objs, rot=(0, 0, math.radians(-25)))
    return objs

def camp_tent():
    m = M()
    objs = []
    # A-frame tent: a triangular prism with a coral fly, graphite door
    prof = [(-0.6, 0), (0.6, 0), (0, 0.78)]
    t = prism_profile('titan.tent.body', prof, 0.55, m['graphite'], 0.01)
    t.rotation_euler = (math.radians(90), 0, 0); t.location = (0, 0, 0)
    objs.append(t)
    fly = prism_profile('titan.tent.fly', [(-0.64, 0.02), (-0.58, 0.02), (0, 0.79), (0.58, 0.02), (0.64, 0.02), (0, 0.84)], 0.6, m['coral'], 0.004)
    fly.rotation_euler = (math.radians(90), 0, 0)
    objs.append(fly)
    door = prism_profile('titan.tent.door', [(-0.22, 0), (0.22, 0), (0, 0.52)], 0.01, m['carbon'])
    door.rotation_euler = (math.radians(90), 0, 0); door.location = (0, -0.555, 0.0)
    objs.append(door)
    # lantern beside it, lit amber
    objs.append(cyl('titan.tent.lantern-base', 0.06, 0.03, loc=(0.82, -0.3, 0.015), mat=m['gun'], v=16))
    objs.append(cyl('titan.tent.lantern-glass', 0.05, 0.12, loc=(0.82, -0.3, 0.09), mat=S.mat_emission('titan.light.beacon-amber', '#F4BB54', 6.0), v=16))
    objs.append(cyl('titan.tent.lantern-top', 0.065, 0.03, loc=(0.82, -0.3, 0.165), mat=m['gun'], v=16))
    L = bpy.data.lights.new('titan.tent.light', 'POINT'); L.energy = 12; L.color = (1.0, 0.75, 0.4)
    lo = bpy.data.objects.new('titan.tent.light', L); bpy.context.scene.collection.objects.link(lo); lo.location = (0.82, -0.3, 0.1)
    group('titan.camp-tent', objs, rot=(0, 0, math.radians(-30)))
    return objs

# ------------------------------------------------------------------ sport families
def kettlebell():
    m = M()
    objs = []
    b = sphere('titan.kettlebell.bell', 0.42, loc=(0, 0, 0.4), mat=m['iron'])
    b.scale = (1, 1, 0.95)
    objs.append(b)
    objs.append(cyl('titan.kettlebell.base', 0.25, 0.04, loc=(0, 0, 0.02), mat=m['iron'], v=48))
    h = torus('titan.kettlebell.handle', 0.27, 0.05, loc=(0, 0, 0.88), rot=(math.radians(90), 0, 0), mat=m['iron'])
    h.scale = (1, 0.85, 1); objs.append(h)
    for sx in (-1, 1):
        objs.append(cyl(f'titan.kettlebell.horn.{sx}', 0.055, 0.22, loc=(sx * 0.27, 0, 0.74), mat=m['iron'], v=24))
    band = cyl('titan.kettlebell.band', 0.43, 0.06, loc=(0, 0, 0.4), mat=m['cyan'], v=64)
    band.scale = (1, 1, 1); objs.append(band)
    group('titan.kettlebell', objs, rot=(0, 0, math.radians(20)))
    return objs

def ball():
    m = M()
    objs = []
    b = sphere('titan.ball.leather', 0.5, loc=(0, 0, 0.5), mat=m['chalk'], seg=64, rings=32)
    objs.append(b)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.5, location=(0, 0, 0))
    seams = S.name_obj(bpy.context.active_object, 'titan.ball.seams')
    me = seams.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    for v in bm.verts:
        v.co = v.co.normalized() * 0.503
    # keep only the original ico edges' great-circle paths: dissolve the inner grid by keeping every edge (panels read as a net)
    bm.to_mesh(me); bm.free()
    seams.location = (0, 0, 0.5)
    wf = seams.modifiers.new('titan.wire', 'WIREFRAME'); wf.thickness = 0.022; wf.use_even_offset = True
    S.assign(seams, m['gun'])
    bpy.data.objects.remove(seams, do_unlink=True)
    # panels: a few dark pentagon-like caps at the ico vertices
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.5)
    ico = bpy.context.active_object
    pts = [v.co.copy() for v in ico.data.vertices]
    bpy.data.objects.remove(ico, do_unlink=True)
    for k, pnt in enumerate(pts):
        d = pnt.normalized()
        c = cyl(f'titan.ball.panel.{k}', 0.11, 0.02, loc=tuple(d * 0.497 + Vector((0, 0, 0.5))), v=5, mat=m['gun'])
        c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        objs.append(c)
    group('titan.ball', objs, rot=(0.3, 0.2, 0.4))
    return objs

def yoga_mat():
    m = M()
    objs = []
    # a spiral profile extruded across the width = a rolled mat, with a short unrolled tongue
    pts = []
    turns = 3.2
    for k in range(200):
        a = 2 * math.pi * turns * k / 199
        r = 0.08 + 0.022 * a / (2 * math.pi) * 2.2
        pts.append((r * math.cos(a), r * math.sin(a), 0))
    pts.append((pts[-1][0] + 0.0, pts[-1][1], 0))
    c = S.curve_from_points('titan.mat.roll', pts, closed=False)
    c.data.dimensions = '2D'
    c.data.extrude = 0.55
    c.data.offset = 0.0
    c.data.bevel_depth = 0.0
    sol = S.to_mesh(c)
    S.name_obj(sol, 'titan.mat.roll')
    so = sol.modifiers.new('titan.solidify', 'SOLIDIFY'); so.thickness = 0.016
    S.assign(sol, m['foam']); S.smooth(sol)
    sol.rotation_euler = (0, math.radians(90), 0)
    sol.location = (-0.27, 0, 0.3)
    objs.append(sol)
    objs.append(box('titan.mat.tongue', 0.55, 0.9, 0.016, loc=(0.0, -0.75, 0.008), mat=m['foam'], bev=0.004))
    st = torus('titan.mat.strap-loop', 0.31, 0.014, loc=(0.0, 0, 0.3), rot=(0, math.radians(90), 0), mat=m['graphite'])
    objs.append(st)
    group('titan.yoga-mat', objs, rot=(0, 0, math.radians(-55)))
    return objs

def climbing_hold():
    m = M()
    objs = []
    panel = box('titan.hold.wall', 1.3, 0.08, 1.3, loc=(0, 0.1, 0.65), mat=m['wood'], bev=0.01)
    objs.append(panel)
    for ix in range(4):
        for iz in range(4):
            objs.append(cyl(f'titan.hold.insert.{ix}.{iz}', 0.022, 0.01, loc=(-0.48 + ix * 0.32, 0.055, 0.17 + iz * 0.32), rot=(math.radians(90), 0, 0), mat=m['gun'], v=12))
    for k, (x, z, sc, rot) in enumerate([(-0.05, 0.62, 1.0, 0.3), (0.38, 1.02, 0.55, 1.2), (-0.38, 0.28, 0.6, 2.1)]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.26 * sc, location=(x, -0.02, z))
        h = S.name_obj(bpy.context.active_object, f'titan.hold.resin.{k}')
        h.scale = (1.3, 0.55, 0.85); h.rotation_euler = (0, rot, 0)
        d = h.modifiers.new('titan.displace', 'DISPLACE')
        tex = bpy.data.textures.new(f'titan.tex.hold.{k}', 'VORONOI'); tex.noise_scale = 0.3
        d.texture = tex; d.strength = 0.07 * sc
        S.assign(h, m['resin'] if k == 0 else (m['amber'] if k == 1 else m['teal'])); S.smooth(h, 60)
        objs.append(h)
        objs.append(cyl(f'titan.hold.bolt.{k}', 0.03 * sc, 0.03, loc=(x, -0.16 * sc - 0.02, z), rot=(math.radians(90), 0, 0), mat=m['steel'], v=6))
    group('titan.climbing-hold', objs, rot=(0, 0, math.radians(-25)))
    return objs

# ------------------------------------------------------------------ text-free reward objects (proposals)
def supply_chest():
    m = M()
    objs = []
    objs.append(box('titan.chest.body', 1.2, 0.72, 0.5, loc=(0, 0, 0.25), mat=m['gun'], bev=0.04))
    objs.append(box('titan.chest.lid', 1.22, 0.74, 0.18, loc=(0, 0, 0.6), mat=m['gun'], bev=0.05))
    objs.append(box('titan.chest.panel-front', 0.8, 0.02, 0.3, loc=(0, -0.365, 0.24), mat=m['carbon'], bev=0.01))
    objs.append(box('titan.chest.panel-lid', 0.9, 0.5, 0.02, loc=(0, 0, 0.695), mat=m['carbon'], bev=0.01))
    for sx in (-0.48, 0.48):
        objs.append(box(f'titan.chest.strap.{sx}', 0.1, 0.78, 0.74, loc=(sx, 0, 0.36), mat=m['steel'], bev=0.02))
    for sx in (-0.25, 0.25):
        objs.append(box(f'titan.chest.latch.{sx}', 0.12, 0.05, 0.12, loc=(sx, -0.385, 0.5), mat=m['satin'], bev=0.015))
    objs.append(chevron_obj('titan.chest.mark', w=0.2, t=0.05, h=0.1, y0=0.0, ext=0.008, mat=m['cyan']))
    objs[-1].rotation_euler = (math.radians(90), 0, 0); objs[-1].location = (0, -0.378, 0.24)
    group('titan.supply-chest', objs, rot=(0, 0, math.radians(-24)))
    return objs

def mastery_relic():
    m = M()
    objs = []
    objs.append(cyl('titan.relic.base', 0.42, 0.1, loc=(0, 0, 0.05), v=8, mat=m['gun'], bev=0.02))
    objs.append(cyl('titan.relic.base-top', 0.34, 0.05, loc=(0, 0, 0.125), v=8, mat=m['steel'], bev=0.01))
    for i, (R, rx, ry) in enumerate([(0.42, 90, 0), (0.36, 90, 60), (0.3, 30, 0)]):
        objs.append(torus(f'titan.relic.ring.{i}', R, 0.022, loc=(0, 0, 0.62), rot=(math.radians(rx), math.radians(ry), 0), mat=m['satin'] if i else m['gold']))
    objs.append(cyl('titan.relic.post', 0.025, 0.2, loc=(0, 0, 0.22), mat=m['steel'], v=12))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.17, location=(0, 0, 0.62))
    cr = S.name_obj(bpy.context.active_object, 'titan.relic.crystal')
    cr.scale = (0.8, 0.8, 1.25)
    S.assign(cr, S.mat_glass('titan.glass.amber-crystal', '#F7D49A', rough=0.04))
    objs.append(cr)
    L = bpy.data.lights.new('titan.relic.light', 'POINT'); L.energy = 8; L.color = (1.0, 0.82, 0.5)
    lo = bpy.data.objects.new('titan.relic.light', L); bpy.context.scene.collection.objects.link(lo); lo.location = (0, 0, 0.62)
    group('titan.mastery-relic', objs)
    return objs

def exploration_seal():
    m = M()
    objs = []
    rot = (math.radians(90), 0, 0)
    objs.append(cyl('titan.seal.disc', 0.6, 0.12, rot=rot, mat=m['bronze'], v=96, bev=0.03))
    objs.append(torus('titan.seal.rim', 0.55, 0.02, loc=(0, -0.065, 0), rot=rot, mat=m['steel']))
    # compass rose: 4 long and 4 short diamond points
    for k in range(8):
        a = k * math.pi / 4
        L = 0.42 if k % 2 == 0 else 0.24
        w = 0.07 if k % 2 == 0 else 0.05
        pts = [(0, 0), (w, w), (0, L), (-w, w)]
        p = prism_profile(f'titan.seal.point.{k}', pts, 0.015, m['satin'] if k % 2 == 0 else m['gun'])
        p.rotation_euler = (math.radians(90), a, 0)
        p.location = (0, -0.075, 0)
        objs.append(p)
    objs.append(cyl('titan.seal.centre', 0.05, 0.05, loc=(0, -0.08, 0), rot=rot, mat=m['cyan'], v=24))
    group('titan.exploration-seal', objs, rot=(math.radians(-10), 0, math.radians(-20)), loc=(0, 0, 0.62))
    return objs

def titan_crest(variant='steel'):
    import crest
    return crest.build(variant)

def dumbbell():
    import dumbbell as d
    return d.build()

def shoe():
    import shoe as s
    return s.build()

REGISTRY = {
    'dumbbell': (dumbbell, 'sport-family', 'force'),
    'running-shoe': (shoe, 'sport-family', 'endurance'),
    'titan-crest': (titan_crest, 'identity', 'mark'),
    'titan-crest-amber': (lambda: titan_crest('amber'), 'reward', 'record'),
    'record-medal': (record_medal, 'reward', 'record'),
    'trophy': (trophy, 'reward', 'challenge'),
    'week-pennant': (week_pennant, 'reward', 'week-held'),
    'beacon-lit': (lambda: beacon(True), 'adventure', 'beacon'),
    'beacon-dormant': (lambda: beacon(False), 'adventure', 'beacon'),
    'aurora-beacon-lit': (lambda: beacon(True, True), 'adventure', 'aurores'),
    'aurora-beacon-dormant': (lambda: beacon(False, True), 'adventure', 'aurores'),
    'buoy': (buoy, 'adventure', 'marees'),
    'sea-chart': (sea_chart, 'adventure', 'marees'),
    'forge-gears': (forge_gears, 'adventure', 'forges'),
    'anvil': (anvil, 'adventure', 'forges'),
    'veilleur-stone': (veilleur_stone, 'adventure', 'aube'),
    'camp-tent': (camp_tent, 'adventure', 'camp'),
    'logbook': (logbook, 'journal', 'chroniques'),
    'rope-carabiner': (rope_carabiner, 'community', 'cordee'),
    'relay-baton': (relay_baton, 'community', 'relais'),
    'stopwatch': (stopwatch, 'coaching', 'live'),
    'gps-watch': (gps_watch, 'data', 'sources'),
    'kettlebell': (kettlebell, 'sport-family', 'force'),
    'ball': (ball, 'sport-family', 'jeu'),
    'yoga-mat': (yoga_mat, 'sport-family', 'mobilite'),
    'climbing-hold': (climbing_hold, 'sport-family', 'technique'),
    'supply-chest': (supply_chest, 'reward', 'atelier'),
    'mastery-relic': (mastery_relic, 'reward', 'records'),
    'exploration-seal': (exploration_seal, 'reward', 'exploration'),
}
