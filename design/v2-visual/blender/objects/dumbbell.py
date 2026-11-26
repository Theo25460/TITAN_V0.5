"""Hex dumbbell: knurled steel handle, rubber hex heads, steel collars."""
import bpy, math
import studio as S

def build():
    steel = S.mat_metal('titan.metal.brushed-steel', '#C9D1D8', rough=0.26)
    knurl = S.mat_dielectric('titan.metal.knurl', '#9AA4AD', rough=0.45, bump=0.9, bump_scale=420)
    knurl.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 1.0
    rubber = S.mat_dielectric('titan.rubber.matte-black', '#0E1114', rough=0.55, spec=0.35, bump=0.08, bump_scale=90)
    objs = []
    # handle along X
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.085, depth=0.95, rotation=(0, math.radians(90), 0), location=(0, 0, 0))
    h = S.name_obj(bpy.context.active_object, 'titan.dumbbell.handle'); S.assign(h, knurl); S.smooth(h); objs.append(h)
    for sx in (-1, 1):
        # collar
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.13, depth=0.07, rotation=(0, math.radians(90), 0), location=(sx * 0.51, 0, 0))
        c = S.name_obj(bpy.context.active_object, f'titan.dumbbell.collar.{"l" if sx < 0 else "r"}'); S.assign(c, steel); S.bevel(c, 0.012, 3); S.smooth(c); objs.append(c)
        # hex head
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.36, depth=0.36, rotation=(0, math.radians(90), 0), location=(sx * 0.73, 0, 0))
        hd = S.name_obj(bpy.context.active_object, f'titan.dumbbell.head.{"l" if sx < 0 else "r"}'); S.assign(hd, rubber); S.bevel(hd, 0.035, 4); S.smooth(hd, 40); objs.append(hd)
        # steel end cap with the chevron recess hint
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.13, depth=0.03, rotation=(0, math.radians(90), 0), location=(sx * 0.915, 0, 0))
        cap = S.name_obj(bpy.context.active_object, f'titan.dumbbell.cap.{"l" if sx < 0 else "r"}'); S.assign(cap, steel); S.bevel(cap, 0.01, 2); S.smooth(cap); objs.append(cap)
    root = S.parent_all('titan.dumbbell', objs)
    # rest one hex flat on the ground
    root.rotation_euler = (math.radians(30), 0, 0)
    root.location = (0, 0, 0.36 * math.cos(math.radians(30)))
    root.rotation_euler[2] = math.radians(8)
    return objs
