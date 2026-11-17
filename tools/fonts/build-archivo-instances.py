#!/usr/bin/env python3
"""Static instances of the Archivo variable font (OFL) for the Android app, which cannot use variable axes reliably.
One family, three widths: text (width 100), display (width 75, already shipped as TitanDisplay) and figures (width 62).
Usage: python3 tools/fonts/build-archivo-instances.py   (needs fonttools and brotli)"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "css/fonts/archivo-latin-variable.woff2"
OUT = ROOT / "mobile/assets/fonts"
INSTANCES = [
    ("TitanText", "Regular", 400, 100), ("TitanText", "SemiBold", 600, 100), ("TitanText", "Bold", 700, 100), ("TitanText", "ExtraBold", 800, 100),
    ("TitanFigure", "Light", 300, 62), ("TitanFigure", "Bold", 700, 62),
]
for family, style, weight, width in INSTANCES:
    font = instantiateVariableFont(TTFont(SOURCE), {"wght": weight, "wdth": width})
    font.flavor = None
    full = f"{family} {style}"
    for record in font["name"].names:
        if record.nameID in (1, 16): record.string = family
        elif record.nameID in (2, 17): record.string = style
        elif record.nameID in (3, 4): record.string = full
        elif record.nameID == 6: record.string = f"{family}-{style}"
    font["OS/2"].usWeightClass = weight
    target = OUT / f"{family}-{style}.ttf"
    font.save(target)
    print(target.relative_to(ROOT), target.stat().st_size)
