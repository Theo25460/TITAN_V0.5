"""TITAN V2 vector family generator. One grammar for every empty / system state:
- 160×120 canvas, a horizon at y=92, two faint contour lines of the summit (le relief) behind;
- one object drawn in a 2 px line (currentColor = the text colour of the surface, --tx-2 by default);
- ONE accent detail in the colour that carries the meaning (cyan progression, amber record, coral shared,
  lime record-action, azure data, moss adventure, err/warn for faults) through `--titan-accent`;
- dashed = what is missing, solid = what exists. No text inside an image: every message stays native and translatable.
Small icons (24 grid, 1.65 stroke, round caps) follow the existing interface icons (js/app/sport-icons.js grammar).
"""
import os, sys, json
OUT = sys.argv[1]

ACC = {'cyan': '#3DD9E8', 'amber': '#F4BB54', 'coral': '#FF9B7A', 'lime': '#D7F25A', 'azure': '#9CC3FF',
       'moss': '#7FE0B0', 'err': '#F2665F', 'warn': '#F0A24A', 'ok': '#57D39B', 'faint': '#838E97'}

def es(name, accent, body, title):
    a = ACC[accent]
    return name, f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="titan-es titan-es--{name}" data-accent="{accent}" aria-hidden="true" focusable="false" style="color:#AEB7BD">
<g class="titan-es__relief" opacity=".16" stroke-width="1.2"><path d="M6 92c18-10 30-26 46-26s22 12 34 12 24-20 40-20 22 18 28 24"/><path d="M22 92c12-6 22-16 32-16s16 8 28 8 20-12 30-12 16 12 22 16"/></g>
<path class="titan-es__ground" d="M10 92h140" opacity=".5"/>
<g class="titan-es__subject">{body.replace('ACCENT', 'var(--titan-accent,' + a + ')')}</g>
</svg>'''

def icon(name, body, cls='titan-ic'):
    return name, f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" class="{cls} {cls}--{name}" aria-hidden="true" focusable="false">{body}</svg>'''

D = 'stroke-dasharray="3 4"'
EMPTY = [
  # séance : the trail is there, the first beacon is not lit yet
  es('no-session', 'lime', f'''<path d="M30 92c14-4 22-12 34-14s20 4 30-2 16-16 26-22" {D}/>
<path d="M40 92l4-8h12l4 8"/><path d="M45 84l3-6h6l3 6"/><path d="M51 78v-16"/><path d="M45 52h12v10H45z"/><path d="M47 52l4-5 4 5"/>
<circle cx="51" cy="57" r="2" style="stroke:ACCENT"/>''', 'Aucune séance'),
  # records : an empty plinth, the medal it will hold drawn dashed
  es('no-record', 'amber', f'''<path d="M56 92V74h48v18"/><path d="M52 74h56"/><path d="M62 82h36" opacity=".5"/>
<circle cx="80" cy="50" r="14" {D} style="stroke:ACCENT"/><path d="M73 52l7-6 7 6M73 58l7-6 7 6" {D} style="stroke:ACCENT"/>
<path d="M74 36l-5-12M86 36l5-12" {D}/>''', 'Aucun record'),
  # quêtes : a folded map, the route stops at the fold
  es('no-quest', 'moss', f'''<path d="M44 40l24-8 24 8 24-8v48l-24 8-24-8-24 8z"/><path d="M68 32v48M92 40v48"/>
<path d="M50 70c8-2 10-12 18-14" style="stroke:ACCENT"/><path d="M68 56c8-2 14 4 22-2" {D}/><path d="M104 54l4 4m0-4l-4 4" opacity=".6"/>''', 'Aucune quête'),
  # amis : one carabiner clipped, the rope's other end free
  es('no-friend', 'coral', f'''<path d="M20 70c20 0 30 6 46 6s22-4 30-4" style="stroke:ACCENT"/><path d="M96 72c10 0 14 6 12 12" style="stroke:ACCENT" {D}/>
<path d="M60 56c-6 0-10 5-10 12s4 14 10 14 10-6 10-14-4-12-10-12z"/><path d="M66 60l-2 10"/>
<path d="M118 58c-5 0-8 4-8 10s3 12 8 12 8-5 8-12-3-10-8-10z" {D}/>''', 'Aucun ami'),
  # défis : the summit is there, the flag is not planted
  es('no-challenge', 'coral', f'''<path d="M40 92l40-50 40 50"/><path d="M68 58l12 6 12-6" opacity=".5"/>
<path d="M80 42V18"/><path d="M80 18l20 6-20 6" {D} style="stroke:ACCENT"/>''', 'Aucun défi'),
  # cordée / club : three anchors on the wall, rope through only one
  es('no-group', 'coral', f'''<path d="M30 92V30h100v62" opacity=".5"/>
<circle cx="56" cy="50" r="5"/><circle cx="80" cy="62" r="5" {D}/><circle cx="104" cy="46" r="5" {D}/>
<path d="M56 55c0 14-8 24-20 37" style="stroke:ACCENT"/><path d="M56 55c6 6 14 6 19 7M85 61c6-4 12-10 14-13" {D}/>''', 'Aucun groupe'),
  # coaching : a clipboard, the programme grid empty
  es('no-coach', 'coral', f'''<path d="M52 26h56v66H52z"/><path d="M68 22h24v10H68z"/>
<path d="M60 44h40M60 56h40M60 68h40M60 80h40" opacity=".35"/><path d="M74 40v44M88 40v44" opacity=".35"/>
<rect x="62" y="47" width="9" height="6" rx="1" {D} style="stroke:ACCENT"/><rect x="77" y="59" width="9" height="6" rx="1" {D}/>''', 'Aucun coach'),
  # GPS : a pin over a grid, the track only dashed
  es('no-gps', 'cyan', f'''<path d="M24 80l30-10 30 10 30-10 22 6" opacity=".45"/><path d="M38 86c16-14 30-4 44-14s28-18 46-8" {D}/>
<path d="M80 22c-9 0-15 6-15 14 0 10 15 26 15 26s15-16 15-26c0-8-6-14-15-14z" style="stroke:ACCENT"/><circle cx="80" cy="36" r="4" style="stroke:ACCENT"/>''', 'Aucune trace GPS'),
  # sources : a watch and the journal, the link open
  es('no-source', 'azure', f'''<rect x="34" y="40" width="26" height="30" rx="6"/><path d="M40 40l2-10h10l2 10M40 70l2 10h10l2-10"/><path d="M41 56l5-5 4 6 4-4"/>
<path d="M102 32h24v46h-24z"/><path d="M108 42h12M108 50h12M108 58h8"/>
<path d="M64 56h8" style="stroke:ACCENT"/><path d="M90 56h8" style="stroke:ACCENT"/><path d="M76 52l4 8M82 52l4 8" {D}/>''', 'Aucune source connectée'),
  # file locale : sessions waiting on the phone, nothing lost
  es('sync-queue', 'azure', f'''<rect x="56" y="20" width="48" height="72" rx="8"/><path d="M74 26h12"/>
<path d="M64 42h32M64 54h32M64 66h32" style="stroke:ACCENT"/><circle cx="66" cy="42" r="1.5"/><circle cx="66" cy="54" r="1.5"/><circle cx="66" cy="66" r="1.5"/>
<path d="M112 46c8 0 14-6 14-14" {D}/><path d="M122 30l4 2 2-4" {D}/>''', 'Séances en attente d’envoi'),
  # récompenses : the steel plate is there, the object not yet
  es('no-reward', 'amber', f'''<path d="M36 92l8-14h72l8 14"/><path d="M44 78h72" opacity=".5"/>
<path d="M58 44h44v26H58z" {D} style="stroke:ACCENT"/><path d="M58 54h44" {D} style="stroke:ACCENT"/><path d="M76 56v6h8v-6" {D}/>''', 'Aucune récompense'),
  # journal search : the lens over the relief finds nothing
  es('no-result', 'faint', f'''<circle cx="74" cy="50" r="20"/><path d="M89 65l18 18"/><path d="M64 50h20" {D}/>''', 'Aucun résultat'),
]
STATES = [
  es('error', 'err', f'''<path d="M20 92c12-6 24-10 38-12"/><path d="M102 80c14 2 26 6 38 12"/><path d="M66 78l6 4m16-4l-6 4" style="stroke:ACCENT"/>
<path d="M80 34l14 24H66z" style="stroke:ACCENT"/><path d="M80 43v7M80 54v.5" style="stroke:ACCENT"/>''', 'Erreur'),
  es('refused', 'warn', f'''<path d="M24 92c20-8 40-12 56-12s36 4 56 12" {D}/><path d="M48 58v34M112 58v34"/><path d="M44 58h72v10H44z"/>
<path d="M56 58l10 10M76 58l10 10M96 58l10 10" style="stroke:ACCENT"/>''', 'Autorisation refusée'),
  es('offline', 'faint', f'''<path d="M30 92c18-8 32-12 50-12s32 4 50 12"/><rect x="66" y="32" width="28" height="44" rx="6"/><path d="M76 38h8"/>
<path d="M54 28c4-4 8-6 12-7M106 28c-4-4-8-6-12-7" {D}/><path d="M48 20l64 64" style="stroke:ACCENT"/>''', 'Hors ligne'),
  es('success', 'ok', f'''<path d="M34 92l46-58 46 58"/><path d="M80 34V16l16 5-16 5" style="stroke:ACCENT"/>
<path d="M66 76l14-10 14 10M66 86l14-10 14 10" style="stroke:ACCENT"/>''', 'Réussite'),
  es('locked', 'faint', f'''<rect x="60" y="48" width="40" height="34" rx="5"/><path d="M68 48v-8c0-7 5-12 12-12s12 5 12 12v8"/><path d="M80 60v8" style="stroke:ACCENT"/>''', 'Verrouillé'),
  es('onboarding', 'cyan', f'''<path d="M58 92a22 22 0 0144 0" style="stroke:ACCENT"/><path d="M80 60v-8M58 68l-6-5M102 68l6-5" style="stroke:ACCENT" opacity=".7"/>
<path d="M70 92c4-10 8-18 18-26s18-10 30-12" {D}/>''', 'Bienvenue'),
  es('not-found', 'faint', f'''<path d="M80 92V30"/><path d="M80 34h30l6 6-6 6H80z"/><path d="M80 52H54l-6 6 6 6h26"/>
<path d="M40 92c10-4 20-6 28-6" {D}/><path d="M92 86c8 0 18 2 28 6" {D}/>''', 'Page introuvable'),
]
ICONS = [
  # synchronisation states (V1.6.1): the same words on Web and Android, never colour alone
  icon('sync-local', '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 6h4"/><circle cx="12" cy="14" r="2.2"/>'),
  icon('sync-sending', '<path d="M12 20V8"/><path d="M7 12l5-5 5 5"/><path d="M5 4h14"/>'),
  icon('sync-received', '<path d="M5 4h14"/><path d="M7 13l3.5 3.5L17 10"/><path d="M5 20h14" opacity=".55"/>'),
  icon('sync-refused', '<path d="M5 4h14"/><path d="M8.5 10.5l7 7m0-7l-7 7"/>'),
  icon('sync-offline', '<path d="M4 9a12 12 0 0116 0M7 12.5a7.5 7.5 0 0110 0M10 16a3 3 0 014 0"/><path d="M4 4l16 16"/>'),
  icon('sync-conflict', '<path d="M6 4v6a4 4 0 004 4h4a4 4 0 014 4v2"/><path d="M18 4v6"/><circle cx="18" cy="4" r="1.2"/><circle cx="6" cy="20" r="1.2"/><path d="M6 14v4"/>'),
  icon('sync-retry', '<path d="M19 12a7 7 0 11-2.05-4.95"/><path d="M19 4v4h-4"/>'),
  # where a session comes from (V1.6.2 / V1.6.5): generic, no third-party marks
  icon('source-manual', '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 7l3 3"/>'),
  icon('source-gpx', '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 17c2-1 2-4 4-4s2 2 3 1"/>'),
  icon('source-watch', '<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/><path d="M9 12.5l2-2 2 3 2-2"/>'),
  icon('source-health', '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M9 12h1.6l1-2.2 1.8 4.4 1-2.2H15"/>'),
  icon('source-import', '<path d="M12 3v11"/><path d="M8 10l4 4 4-4"/><path d="M4 15v4h16v-4"/>'),
  icon('source-merged', '<path d="M6 4v5a5 5 0 005 5h1"/><path d="M18 4v5a5 5 0 01-5 5h-1v6"/><circle cx="6" cy="4" r="1.2"/><circle cx="18" cy="4" r="1.2"/>'),
  icon('source-uncertain', '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.5 2.5"/><path d="M10 9.5a2.2 2.2 0 114 1c-.8.6-2 1-2 2.3M12 16v.3"/>'),
  # GPS markers (V1.7.7): distinct shapes before colour
  icon('gps-start', '<circle cx="12" cy="12" r="7"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>'),
  icon('gps-finish', '<path d="M6 21V4"/><path d="M6 4h12v9H6"/><path d="M6 8.5h12M10 4v9M14 4v9" opacity=".6"/>'),
  icon('gps-waypoint', '<path d="M12 3l7 9-7 9-7-9z"/><circle cx="12" cy="12" r="1.6"/>'),
  icon('gps-poi', '<path d="M12 21s6.5-6.6 6.5-11a6.5 6.5 0 10-13 0C5.5 14.4 12 21 12 21z"/><path d="M9.5 10h5M12 7.5v5"/>'),
  icon('gps-pause', '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M10 9v6M14 9v6"/>'),
  icon('gps-position', '<circle cx="12" cy="12" r="3.2" fill="currentColor"/><circle cx="12" cy="12" r="7.5" opacity=".45"/>'),
  icon('gps-lap', '<path d="M5 18a8 8 0 1114 0"/><path d="M12 12l4-3"/><path d="M12 4v2"/>'),
  icon('gps-no-signal', '<path d="M12 21s6.5-6.6 6.5-11a6.5 6.5 0 10-13 0C5.5 14.4 12 21 12 21z" stroke-dasharray="2.5 2.5"/><path d="M4 4l16 16"/>'),
  # programme states (V1.7.2 / V1.9.1): planned, moved, done, skipped, proposed by a coach
  icon('plan-planned', '<rect x="4" y="5" width="16" height="15" rx="2" stroke-dasharray="3 2.5"/><path d="M8 3v4M16 3v4"/>'),
  icon('plan-done', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4"/><path d="M8.5 13l2.5 2.5 4.5-5"/>'),
  icon('plan-moved', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4"/><path d="M8 13.5h7"/><path d="M13 11l2.5 2.5L13 16"/>'),
  icon('plan-skipped', '<rect x="4" y="5" width="16" height="15" rx="2" opacity=".55"/><path d="M8 3v4M16 3v4" opacity=".55"/><path d="M8 16l8-6"/>'),
  icon('plan-proposed', '<rect x="4" y="5" width="16" height="15" rx="2" stroke-dasharray="3 2.5"/><path d="M8 3v4M16 3v4"/><path d="M12 10v6M9 13h6"/>'),
  # cooperation (V1.8): relay, cordée, club, meeting
  icon('coop-relay', '<path d="M4 15l6-6"/><rect x="9" y="5.5" width="10" height="4" rx="2" transform="rotate(-45 14 7.5)"/><path d="M14 20l6-6"/>'),
  icon('coop-cordee', '<circle cx="6" cy="18" r="2"/><circle cx="12" cy="11" r="2"/><circle cx="18" cy="4.5" r="2"/><path d="M7.4 16.6l3.2-4.2M13.4 9.6l3.2-3.6"/>'),
  icon('coop-club', '<path d="M5 4h14v8c0 4.5-3.5 7.5-7 8.5-3.5-1-7-4-7-8.5z"/><path d="M9 12l3-3 3 3"/>'),
  icon('coop-meetup', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4"/><circle cx="10" cy="14" r="1.8"/><circle cx="15" cy="14" r="1.8"/>'),
  icon('privacy-private', '<path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10.5 11V9.5a1.5 1.5 0 013 0V11"/>'),
  icon('privacy-shared', '<circle cx="8" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M14 20c0-2.5 1.5-4 3-4s3 1.5 3 4"/>'),
  # steps (QG): the footprint cadence, never a ring around a number
  icon('steps', '<path d="M8 13c-1.6 0-2.5-1.8-2.5-4S6.4 4 8 4s2.5 2.2 2.5 5-1 4-2.5 4z"/><path d="M6.4 16.2c0 1.3.7 2.3 1.6 2.3s1.6-1 1.6-2.3"/><path d="M16 17c-1.6 0-2.5-1.8-2.5-4s.9-5 2.5-5 2.5 2.2 2.5 5-1 4-2.5 4z"/><path d="M14.4 20.2"/>'),
]
os.makedirs(os.path.join(OUT, 'empty-states'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'states'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
idx = []
for name, svg in EMPTY:
    open(os.path.join(OUT, 'empty-states', f'empty-{name}.svg'), 'w').write(svg + '\n'); idx.append(('empty-states', f'empty-{name}.svg'))
for name, svg in STATES:
    open(os.path.join(OUT, 'states', f'state-{name}.svg'), 'w').write(svg + '\n'); idx.append(('states', f'state-{name}.svg'))
for name, svg in ICONS:
    open(os.path.join(OUT, 'icons', f'ic-{name}.svg'), 'w').write(svg + '\n'); idx.append(('icons', f'ic-{name}.svg'))
print(json.dumps({'count': len(idx)}))

# ------------------------------------------------------------------ world motifs (320 tiles, 1 px lines, used as masks)
import math as _m
def tile(name, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round">{body}</svg>\n'
def wave(y, amp, per, phase=0, x0=0, x1=320):
    pts = [f'{x:.1f} {y + amp * _m.sin(2 * _m.pi * (x / per) + phase):.1f}' for x in range(x0, x1 + 1, 8)]
    return 'M' + ' L'.join(pts)
aube = ''.join(f'<path d="{wave(20 + i * 40, 6 + (i % 3) * 3, 160, i * .9)}"/>' for i in range(8))
marees = ''.join(f'<path d="{wave(14 + i * 26, 4, 64, i * 1.3)}"/>' for i in range(12)) + ''.join(f'<path d="M{x} {y}l8 0m-3-3l3 3-3 3" stroke-width="1"/>' for x, y in [(40, 60), (200, 140), (120, 250), (270, 30)])
hexes = []
for r in range(6):
    for c in range(6):
        cx, cy = c * 64 + (32 if r % 2 else 0), r * 55.4
        if (r * 7 + c * 3) % 4 == 0:
            continue
        pts = ' '.join(f'{cx + 26 * _m.cos(_m.pi / 3 * k + _m.pi / 6):.1f},{cy + 26 * _m.sin(_m.pi / 3 * k + _m.pi / 6):.1f}' for k in range(6))
        hexes.append(f'<polygon points="{pts}"/>')
forges = ''.join(hexes)
aurores = ''.join(f'<path d="M{-40 + i * 60} 320 C {i * 60} 200, {20 + i * 60} 120, {60 + i * 60} 0"/>' for i in range(8)) + ''.join(f'<path d="M{x - 4} {y}h8M{x} {y - 4}v8" stroke-width="1"/>' for x, y in [(30, 40), (150, 90), (260, 60), (90, 220), (230, 260), (300, 180)])
os.makedirs(os.path.join(OUT, 'motifs'), exist_ok=True)
for n, b in [('aube', aube), ('marees', marees), ('forges', forges), ('aurores', aurores)]:
    open(os.path.join(OUT, 'motifs', f'motif-{n}.svg'), 'w').write(tile(n, b))
print('motifs ok')
