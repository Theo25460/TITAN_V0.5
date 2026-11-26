"""TITAN crest: a cut-corner shield (la coupe) in brushed steel, carbon field, raised double chevron (the mark)."""
import bpy, math
import studio as S

def shield_pts(w=1.0, h=1.25, cut=0.22):
    # flat top with one corner cut at 45° (la coupe, upper right), straight flanks, pointed base
    pts = [(-w/2, h/2), (w/2 - cut, h/2), (w/2, h/2 - cut), (w/2, -h*0.05), (w*0.18, -h/2 + 0.06), (0, -h/2), (-w*0.18, -h/2 + 0.06), (-w/2, -h*0.05)]
    return [(x, y, 0) for x, y in pts]

def chevron_pts(w=0.46, t=0.11, h=0.2, y0=0.0):
    return [(-w/2, y0), (0, y0 + h), (w/2, y0), (w/2, y0 - t), (0, y0 + h - t*1.35), (-w/2, y0 - t)]

def build(variant='steel'):
    steel = S.mat_metal('titan.metal.brushed-steel', '#C9D1D8', rough=0.24)
    dark = S.mat_metal('titan.metal.gunmetal', '#4A5560', rough=0.32, aniso=0.4)
    field = S.mat_carbon('titan.carbon.twill', scale=150)
    chev = S.mat_metal('titan.metal.satin-steel', '#E4E9EC', rough=0.2, aniso=0.3)
    if variant == 'amber':
        chev = S.mat_enamel('titan.enamel.amber', '#F4BB54', rough=0.2)
    objs = []
    rim = S.curve_from_points('titan.crest.rim', shield_pts(), extrude=0.07)
    rim.data.bevel_depth = 0.025
    rim.data.bevel_resolution = 3
    rim = S.to_mesh(rim); S.name_obj(rim, 'titan.crest.rim'); S.assign(rim, steel); objs.append(rim)
    inner = S.curve_from_points('titan.crest.field', [(x*0.84, y*0.86 - 0.005, 0) for x, y, _ in shield_pts()], extrude=0.04)
    inner = S.to_mesh(inner); inner.location.z = 0.06; S.name_obj(inner, 'titan.crest.field'); S.assign(inner, field); objs.append(inner)
    for i, y0 in enumerate((0.04, -0.2)):
        c = S.curve_from_points(f'titan.crest.chevron.{i}', chevron_pts(y0=y0), extrude=0.035)
        c.data.bevel_depth = 0.012
        c.data.bevel_resolution = 2
        c = S.to_mesh(c); c.location.z = 0.12; S.name_obj(c, f'titan.crest.chevron.{i}'); S.assign(c, chev); objs.append(c)
    # small gunmetal bolts at the flanks
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.03, depth=0.03, location=(sx*0.42, 0.48, 0.09))
        b = S.name_obj(bpy.context.active_object, f'titan.crest.bolt.{sx}'); S.assign(b, dark); S.bevel(b, 0.008, 2); S.smooth(b); objs.append(b)
    for o in objs:
        S.smooth(o, 30)
    root = S.parent_all('titan.crest', objs)
    # stand the crest up, tilted slightly back
    root.rotation_euler = (math.radians(78), 0, math.radians(-8))
    root.location = (0, 0, 0.64)
    return objs
