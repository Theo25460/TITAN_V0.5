"""Benchmark one object: build, render at RES with SAMPLES, report time and peak memory. Usage:
python bench.py <object> <res> <samples> <outdir>"""
import sys, os, time, resource, json
sys.path[:0] = [os.path.join(os.path.dirname(__file__), 'lib'), os.path.join(os.path.dirname(__file__), 'objects')]
import importlib
import studio as S
name, res, samples, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
t0 = time.time()
sc, cam = S.studio(res=res, samples=samples)
mod = importlib.import_module(name)
objs = mod.build()
import bpy
bpy.context.view_layer.update()
S.frame_object(objs, cam)
tb = time.time() - t0
tr = S.render(os.path.join(out, f'{name}-{res}-s{samples}.png'))
rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
print('BENCH', json.dumps({'object': name, 'res': res, 'samples': samples, 'build_s': round(tb, 2), 'render_s': round(tr, 2), 'peak_rss_mb': round(rss), 'tris': sum(len(o.data.polygons) for o in objs if o.type == 'MESH')}))
