"""Produce one or more TITAN objects: build, frame, render PNG (alpha), save the .blend master and a GLB.
Usage: python produce.py <out_root> <res> <samples> id [id ...]   (one render at a time, 3 threads)"""
import sys, os, time, json, resource, hashlib, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, 'lib'), os.path.join(HERE, 'objects')]
import bpy
import studio as S
import library as LIB
out, res, samples = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
ids = sys.argv[4:]
save = os.environ.get('TITAN_SAVE', '1') == '1'
for oid in ids:
    t0 = time.time()
    sc, cam = S.studio(res=res, samples=samples)
    fn, fam, sub = LIB.REGISTRY[oid]
    objs = fn()
    bpy.context.view_layer.update()
    S.frame_object(objs, cam)
    png = os.path.join(out, 'renders', f'{oid}-{res}.png')
    tr = S.render(png)
    rec = {'id': oid, 'family': fam, 'sub': sub, 'res': res, 'samples': samples, 'render_s': round(tr, 1),
           'total_s': round(time.time() - t0, 1), 'peak_rss_mb': round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)}
    if save:
        blend = os.path.join(HERE, 'masters', f'{oid}.blend')
        S.save_master(blend)
        glb = os.path.join(HERE, 'glb', f'{oid}.glb')
        S.export_glb(glb, [o for o in objs if o.type == 'MESH'])
        rec['blend_bytes'] = os.path.getsize(blend)
        rec['glb_bytes'] = os.path.getsize(glb)
    print('PRODUCED', json.dumps(rec), flush=True)
