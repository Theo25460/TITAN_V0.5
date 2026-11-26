"""Running shoe: lofted knit upper, stacked midsole with heel drop, rubber outsole, toe bumper, eyelet panels,
tongue, laces and heel tab. Built from cross-sections along the length so the silhouette (toe spring, heel stack,
collar, lacing) reads at 32 px."""
import bpy, bmesh, math
import studio as S

L = 1.9

def width(t):
    base = 0.27 + 0.05 * math.sin(math.pi * min(1.0, t * 1.1))
    if t > 0.8:
        base *= 1 - 0.6 * ((t - 0.8) / 0.2) ** 1.5
    if t < 0.08:
        base *= 0.85 + 0.15 * (t / 0.08)
    return base

def sole_z(t):
    return 0.13 * max(0.0, (t - 0.74) / 0.26) ** 2 + 0.04 * max(0.0, (0.07 - t) / 0.07)

def stack(t):
    return 0.30 - 0.12 * t

def upper_h(t):
    # heel counter 0.46, dips at the collar, peaks at the instep, slopes to a low toe box
    if t < 0.12:
        return 0.44
    if t < 0.30:
        return 0.44 - 0.10 * (t - 0.12) / 0.18
    if t < 0.50:
        return 0.34 + 0.04 * math.sin(math.pi * (t - 0.30) / 0.20)
    return 0.34 * (1 - ((t - 0.50) / 0.50) ** 1.3) + 0.10 * ((t - 0.50) / 0.50)

def ring(t, z0, hz, n=28, inset=1.0, dome=True):
    x = (t - 0.5) * L
    w = width(t) * inset
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        y = w * math.cos(a)
        s = math.sin(a)
        if dome:
            z = z0 + hz * (max(0.0, s) ** 0.75) + (0.015 * s if s < 0 else 0)
        else:
            z = z0 + hz * (0.5 + 0.5 * s)
        pts.append((x, y, z))
    return pts

def loft(name, rings):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(verts[:-1], verts[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(list(reversed(verts[0])))
    bm.faces.new(verts[-1])
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o

def build(colorway='graphite'):
    knit = S.mat_fabric('titan.fabric.knit-graphite', '#141A21', weave=300, strength=0.5, rough=0.8)
    overlay = S.mat_dielectric('titan.synthetic.overlay-gunmetal', '#3A4550', rough=0.4, coat=0.3)
    foam = S.mat_dielectric('titan.foam.midsole-chalk', '#DDE2DC', rough=0.68, spec=0.3, bump=0.04, bump_scale=160)
    rubber = S.mat_dielectric('titan.rubber.outsole', '#121519', rough=0.72, bump=0.25, bump_scale=70)
    accent = S.mat_dielectric('titan.foam.accent-cyan', '#3DD9E8', rough=0.45)
    lace = S.mat_fabric('titan.fabric.lace-chalk', '#D5DAD5', weave=600, strength=0.2)
    T = [0.004 + i * 0.992 / 48 for i in range(49)]
    objs = []
    out = loft('titan.shoe.outsole', [ring(t, sole_z(t), 0.045, inset=1.0, dome=False) for t in T])
    S.assign(out, rubber); S.subsurf(out, 2); objs.append(out)
    mid = loft('titan.shoe.midsole', [ring(t, sole_z(t) + 0.035, stack(t) - 0.035, inset=0.995, dome=False) for t in T])
    S.assign(mid, foam); S.subsurf(mid, 2); objs.append(mid)
    up = loft('titan.shoe.upper', [ring(t, sole_z(t) + stack(t) - 0.04, upper_h(t), inset=0.93) for t in T])
    S.assign(up, knit); S.subsurf(up, 2); S.apply_modifiers(up)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=48, ring_count=24, location=((0.20 - 0.5) * L, 0, 0.80))
    cut = bpy.context.active_object
    cut.scale = (0.30, 0.18, 0.16)
    cut.rotation_euler = (0, math.radians(-10), 0)
    S.boolean(up, cut)
    objs.append(up)
    # toe bumper and heel counter in the overlay material (a slightly inflated shell over a band of stations)
    toe = loft('titan.shoe.toe-cap', [ring(t, sole_z(t) + stack(t) - 0.05, upper_h(t) * 0.55, inset=0.96) for t in T[40:]])
    S.assign(toe, overlay); S.subsurf(toe, 2); objs.append(toe)
    heel = loft('titan.shoe.heel-counter', [ring(t, sole_z(t) + stack(t) - 0.05, upper_h(t) * 0.62, inset=0.955) for t in T[:9]])
    S.assign(heel, overlay); S.subsurf(heel, 2); objs.append(heel)
    # tongue
    bpy.ops.mesh.primitive_cube_add(size=1, location=((0.27 - 0.5) * L, 0, 0.60))
    tg = S.name_obj(bpy.context.active_object, 'titan.shoe.tongue')
    tg.scale = (0.15, 0.13, 0.03); tg.rotation_euler = (0, math.radians(38), 0)
    S.assign(tg, knit); S.bevel(tg, 0.025, 4); objs.append(tg)
    # eyelet panels + laces
    for k in range(5):
        t = 0.33 + k * 0.07
        x = (t - 0.5) * L
        z = sole_z(t) + stack(t) - 0.04 + upper_h(t) * 0.985
        w = width(t) * 0.42
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.017, depth=2 * w, rotation=(math.radians(90), 0, 0), location=(x, 0, z + 0.012))
        l = S.name_obj(bpy.context.active_object, f'titan.shoe.lace.{k}')
        S.assign(l, lace); S.smooth(l); objs.append(l)
        for sy in (-1, 1):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.008, location=(x, sy * w, z - 0.004))
            e = S.name_obj(bpy.context.active_object, f'titan.shoe.eyelet.{k}.{sy}')
            S.assign(e, overlay); objs.append(e)
    # heel tab and the discreet cyan midsole line
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.5 * L + 0.035, 0, 0.70))
    tab = S.name_obj(bpy.context.active_object, 'titan.shoe.heel-tab')
    tab.scale = (0.045, 0.09, 0.16); tab.rotation_euler = (0, math.radians(-14), 0)
    S.assign(tab, accent); S.bevel(tab, 0.018, 3); objs.append(tab)
    stripe = loft('titan.shoe.stripe', [ring(t, sole_z(t) + 0.155 - 0.07 * t, 0.016, inset=1.004, dome=False) for t in T[2:42]])
    S.assign(stripe, accent); objs.append(stripe)
    for o in objs:
        S.smooth(o, 40)
    root = S.parent_all('titan.shoe', objs)
    root.rotation_euler = (0, 0, math.radians(-70))
    return objs
