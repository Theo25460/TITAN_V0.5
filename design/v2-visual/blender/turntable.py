"""Short turntable of one object (proof that Blender animation is feasible here): N frames, one render at a time.
python turntable.py <out_dir> <id> <frames> <res> <samples>"""
import sys, os, math, time, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, 'lib'), os.path.join(HERE, 'objects')]
import bpy
import studio as S
import library as LIB
out, oid, n, res, samples = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
sc, cam = S.studio(res=res, samples=samples)
objs = LIB.REGISTRY[oid][0]()
bpy.context.view_layer.update()
S.frame_object(objs, cam, margin=1.08)
root = objs[0].parent
base = root.rotation_euler.copy()
t0 = time.time()
times = []
for f in range(n):
    # ease in-out over a half turn and back: a settle, not a spin loop
    k = f / (n - 1)
    a = math.sin(k * math.pi * 2) * math.radians(28)
    root.rotation_euler = (base[0], base[1], base[2] + a)
    bpy.context.view_layer.update()
    times.append(S.render(os.path.join(out, f'{oid}-turn-{f:03d}.png')))
print('TURNTABLE', json.dumps({'id': oid, 'frames': n, 'res': res, 'samples': samples, 'total_s': round(time.time() - t0, 1), 'mean_frame_s': round(sum(times) / n, 2)}))
