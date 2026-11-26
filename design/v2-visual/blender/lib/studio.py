"""TITAN V2 — reusable Blender studio (Blender 5.0, bpy).

One scene grammar for every TITAN object: same scale (object fits a 2 m cube, centred on the origin, resting on z=0),
same camera (85 mm, 3/4 view from the front-left, slightly above), same three lights (warm-neutral key from the upper
left, cool rim from behind right, soft fill), a shadow catcher on the ground, transparent film, AgX colour management.
Materials are named `titan.<family>.<variant>` so a master can be re-skinned without hunting nodes.
"""
import bpy, math, os, time
from mathutils import Vector

# ---------------------------------------------------------------- palette (derived from DESIGN.md tokens, never new hues)
HEX = {
    'bg': '#090C10', 'bg2': '#131920', 'bg3': '#1A222C', 'bg4': '#232D39',
    'cyan': '#3DD9E8', 'amber': '#F4BB54', 'chalk': '#E9EDE8', 'moss': '#7FE0B0',
    'coral': '#FF9B7A', 'azure': '#9CC3FF', 'lime': '#D7F25A',
}

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def rgb(hexstr, a=1.0):
    h = hexstr.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (a,)

# ---------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc

def set_color_management(sc, look='AgX - Medium High Contrast'):
    vs = sc.view_settings
    try:
        vs.view_transform = 'AgX'
    except TypeError:
        vs.view_transform = 'Filmic'
    try:
        vs.look = look
    except TypeError:
        pass
    vs.exposure = -0.6
    sc.display_settings.display_device = 'sRGB'

def setup_render(sc, engine='CYCLES', res=512, samples=64, threads=3, denoise=True, transparent=True):
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = threads
    if engine == 'CYCLES':
        sc.render.engine = 'CYCLES'
        cy = sc.cycles
        cy.device = 'CPU'
        cy.samples = samples
        cy.use_adaptive_sampling = True
        cy.adaptive_threshold = 0.02
        cy.max_bounces = 8
        cy.glossy_bounces = 4
        cy.transmission_bounces = 4
        cy.transparent_max_bounces = 8
        cy.caustics_reflective = False
        cy.caustics_refractive = False
        cy.use_denoising = denoise
        try:
            cy.denoiser = 'OPENIMAGEDENOISE'
        except TypeError:
            pass
        sc.render.use_persistent_data = False
    else:
        sc.render.engine = engine
        try:
            sc.eevee.taa_render_samples = samples
        except AttributeError:
            pass
    set_color_management(sc)

def world(sc, strength=0.35):
    w = bpy.data.worlds.new('titan.world.studio')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    # a dark blue-black ground, a slightly lighter sky: metals reflect a horizon, not a void
    grad = nt.nodes.new('ShaderNodeTexGradient')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapn = nt.nodes.new('ShaderNodeMapping')
    mapn.inputs['Rotation'].default_value = (0, math.radians(-90), 0)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = rgb('#05070A')
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = rgb('#5A6878')
    nt.links.new(coord.outputs['Generated'], mapn.inputs['Vector'])
    nt.links.new(coord.outputs['Object'], mapn.inputs['Vector'])
    nt.links.new(mapn.outputs['Vector'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    return w

def area_light(name, loc, target, power, size, color=(1, 1, 1), size_y=None):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = power
    d.color = color
    if size_y:
        d.shape = 'RECTANGLE'
        d.size = size
        d.size_y = size_y
    else:
        d.size = size
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    look_at(o, target)
    return o

def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

def lights(key=900, rim=900, fill=120, target=(0, 0, 0.55)):
    # warm-neutral key (upper left front), cool rim (behind right), soft fill (low right front) + a strip for metal highlights
    area_light('titan.light.key', (-2.6, -2.4, 3.2), target, key, 2.2, (1.0, 0.96, 0.92))
    area_light('titan.light.rim', (2.4, 2.6, 2.4), target, rim, 0.9, (0.80, 0.92, 1.0), size_y=3.0)
    area_light('titan.light.fill', (2.8, -2.2, 0.8), target, fill, 3.0, (0.92, 0.95, 1.0))
    area_light('titan.light.top', (0.0, 0.4, 4.2), target, 220, 1.6)

def camera(focal=85, dist=6.2, elev=17, azim=-32, target=(0, 0, 0.55), ortho=False, ortho_scale=2.4):
    cd = bpy.data.cameras.new('titan.camera')
    cd.lens = focal
    cd.sensor_width = 36
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho_scale
    cam = bpy.data.objects.new('titan.camera', cd)
    bpy.context.scene.collection.objects.link(cam)
    e, a = math.radians(elev), math.radians(azim)
    cam.location = (target[0] + dist * math.cos(e) * math.sin(a),
                    target[1] - dist * math.cos(e) * math.cos(a),
                    target[2] + dist * math.sin(e))
    look_at(cam, target)
    bpy.context.scene.camera = cam
    return cam

def shadow_catcher(size=8):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    p = bpy.context.active_object
    p.name = 'titan.ground.shadow-catcher'
    p.is_shadow_catcher = True
    p.visible_glossy = False
    return p

def frame_object(objs, cam, margin=1.0):
    """Fit the camera distance so the bounding sphere of objs fills the frame with a stable margin."""
    pts = []
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    if not pts:
        return
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (mn + mx) / 2
    radius = (mx - mn).length / 2
    fov = 2 * math.atan(cam.data.sensor_width / (2 * cam.data.lens))
    dist = radius * margin / math.sin(fov / 2)
    direction = (cam.location - Vector((0, 0, 0.55))).normalized()
    cam.location = center + direction * dist
    look_at(cam, center)
    if cam.data.type == 'ORTHO':
        cam.data.ortho_scale = radius * 2 * margin

# ---------------------------------------------------------------- materials
def _principled(name):
    m = bpy.data.materials.get(name)
    if m:
        return m, None
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    return m, p

def mat_metal(name, color='#C9D1D8', rough=0.28, aniso=0.6, brushed=True):
    m, p = _principled(name)
    if p is None:
        return m
    nt = m.node_tree
    p.inputs['Base Color'].default_value = rgb(color)
    p.inputs['Metallic'].default_value = 1.0
    p.inputs['Roughness'].default_value = rough
    if brushed:
        p.inputs['Anisotropic'].default_value = aniso
        # brushed lines: stretched noise drives a tiny roughness variation
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1.0, 1.0, 180.0)
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 6.0
        nz.inputs['Detail'].default_value = 6.0
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['To Min'].default_value = rough * 0.75
        mr.inputs['To Max'].default_value = rough * 1.3
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], p.inputs['Roughness'])
    return m

def mat_dielectric(name, color, rough=0.5, coat=0.0, spec=0.5, bump=0.0, bump_scale=60.0):
    m, p = _principled(name)
    if p is None:
        return m
    nt = m.node_tree
    p.inputs['Base Color'].default_value = rgb(color)
    p.inputs['Metallic'].default_value = 0.0
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = spec
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.12
    if bump:
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = bump_scale
        nz.inputs['Detail'].default_value = 8.0
        b = nt.nodes.new('ShaderNodeBump')
        b.inputs['Strength'].default_value = bump
        b.inputs['Distance'].default_value = 0.01
        nt.links.new(nz.outputs['Fac'], b.inputs['Height'])
        nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    return m

def mat_fabric(name, color, rough=0.82, weave=220.0, strength=0.35):
    """Technical knit: a wave texture in two directions as bump, matte sheen."""
    m, p = _principled(name)
    if p is None:
        return m
    nt = m.node_tree
    p.inputs['Base Color'].default_value = rgb(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = 0.18
    try:
        p.inputs['Sheen Weight'].default_value = 0.08
    except KeyError:
        pass
    tc = nt.nodes.new('ShaderNodeTexCoord')
    w1 = nt.nodes.new('ShaderNodeTexWave')
    w1.inputs['Scale'].default_value = weave
    w2 = nt.nodes.new('ShaderNodeTexWave')
    w2.inputs['Scale'].default_value = weave
    w2.bands_direction = 'Y'
    mx = nt.nodes.new('ShaderNodeMath')
    mx.operation = 'MULTIPLY'
    b = nt.nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = strength
    b.inputs['Distance'].default_value = 0.004
    nt.links.new(tc.outputs['Object'], w1.inputs['Vector'])
    nt.links.new(tc.outputs['Object'], w2.inputs['Vector'])
    nt.links.new(w1.outputs['Fac'], mx.inputs[0])
    nt.links.new(w2.outputs['Fac'], mx.inputs[1])
    nt.links.new(mx.outputs['Value'], b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    return m

def mat_carbon(name, scale=40.0):
    """Twill carbon: checker of anisotropic-looking stripes under a clear coat."""
    m, p = _principled(name)
    if p is None:
        return m
    nt = m.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord')
    ck = nt.nodes.new('ShaderNodeTexChecker')
    ck.inputs['Scale'].default_value = scale
    ck.inputs['Color1'].default_value = rgb('#0C1014')
    ck.inputs['Color2'].default_value = rgb('#1A2129')
    nt.links.new(tc.outputs['Object'], ck.inputs['Vector'])
    nt.links.new(ck.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Metallic'].default_value = 0.25
    p.inputs['Roughness'].default_value = 0.42
    p.inputs['Coat Weight'].default_value = 1.0
    p.inputs['Coat Roughness'].default_value = 0.06
    return m

def mat_enamel(name, color, rough=0.22):
    return mat_dielectric(name, color, rough=rough, coat=0.8, spec=0.6)

def mat_rock(name, color='#1E2228', scale=7.0):
    m, p = _principled(name)
    if p is None:
        return m
    nt = m.node_tree
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = scale
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale * 3
    nz.inputs['Detail'].default_value = 10
    mix = nt.nodes.new('ShaderNodeMath')
    mix.operation = 'ADD'
    b = nt.nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = 0.6
    nt.links.new(vor.outputs['Distance'], mix.inputs[0])
    nt.links.new(nz.outputs['Fac'], mix.inputs[1])
    nt.links.new(mix.outputs['Value'], b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = rgb(color)
    ramp.color_ramp.elements[1].color = rgb('#4A515B')
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.86
    p.inputs['Specular IOR Level'].default_value = 0.15
    return m

def mat_emission(name, color, strength=4.0):
    m, p = _principled(name)
    if p is None:
        return m
    p.inputs['Base Color'].default_value = rgb(color)
    p.inputs['Emission Color'].default_value = rgb(color)
    p.inputs['Emission Strength'].default_value = strength
    return m

def mat_glass(name, color='#DDEFF2', rough=0.05):
    m, p = _principled(name)
    if p is None:
        return m
    p.inputs['Base Color'].default_value = rgb(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Transmission Weight'].default_value = 1.0
    p.inputs['IOR'].default_value = 1.45
    return m

# ---------------------------------------------------------------- mesh helpers
def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj

def smooth(obj, angle=35):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    try:
        mod = obj.modifiers.new('titan.smooth-by-angle', 'NODES')
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
        obj.modifiers.remove(mod)
    except Exception:
        pass
    return obj

def bevel(obj, width=0.02, segments=3, limit='ANGLE'):
    b = obj.modifiers.new('titan.bevel', 'BEVEL')
    b.width = width
    b.segments = segments
    b.limit_method = limit
    b.harden_normals = False
    return b

def subsurf(obj, levels=2):
    s = obj.modifiers.new('titan.subsurf', 'SUBSURF')
    s.levels = levels
    s.render_levels = levels
    return s

def name_obj(obj, name):
    obj.name = name
    if obj.data:
        obj.data.name = name
    return obj

def curve_from_points(name, pts, depth=0.0, extrude=0.0, bevel_depth=0.0, closed=True, resolution=12, fill='BOTH'):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D' if closed else '3D'
    cu.resolution_u = resolution
    sp = cu.splines.new('POLY' if not closed else 'POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        z = p[2] if len(p) > 2 else 0.0
        sp.points[i].co = (p[0], p[1], z, 1)
    sp.use_cyclic_u = closed
    cu.extrude = extrude
    cu.bevel_depth = bevel_depth
    if closed:
        cu.fill_mode = fill
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    return o

def to_mesh(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.active_object

def apply_modifiers(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception:
            pass

def boolean(obj, cutter, op='DIFFERENCE', apply=True, hide=True):
    m = obj.modifiers.new('titan.bool', 'BOOLEAN')
    m.operation = op
    m.object = cutter
    m.solver = 'EXACT'
    if apply:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=m.name)
    if hide:
        bpy.data.objects.remove(cutter, do_unlink=True)

def parent_all(name, objs):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        o.parent = root
    return root

# ---------------------------------------------------------------- output
def render(path, sc=None):
    sc = sc or bpy.context.scene
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t

def save_master(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)

def export_glb(path, objs=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    sel = objs or [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.is_shadow_catcher]
    for o in sel:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_draco_mesh_compression_enable=False)

def studio(res=512, samples=64, engine='CYCLES', threads=3, cam_kw=None):
    sc = reset()
    setup_render(sc, engine=engine, res=res, samples=samples, threads=threads)
    world(sc)
    lights()
    cam = camera(**(cam_kw or {}))
    shadow_catcher()
    return sc, cam
