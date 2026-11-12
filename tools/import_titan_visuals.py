#!/usr/bin/env python3
"""Import the reviewed TITAN image pack into a local checkout.

Dry-run by default. Requires only Python 3.10+ standard library.
Works on a Git checkout; writes no application source code.
"""
from __future__ import annotations
import argparse
import fnmatch
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path("design/titan-visual-library")
REGISTRY = ROOT / "registry/visual-review-2026-11-12.json"
DEST = ROOT / "sports/reviewed-2026-11-12"

def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument("pack",type=Path,help="TITAN_VISUAL_LIBRARY_REVIEW.zip")
    ap.add_argument("--repo",type=Path,default=Path("."))
    ap.add_argument("--apply",action="store_true",help="Actually write approved assets to the checkout")
    ap.add_argument("--pending",action="store_true",help="Include 20 new proposals ONLY after explicit approval")
    args=ap.parse_args()
    repo=args.repo.resolve()
    regpath=repo/REGISTRY
    if not regpath.is_file():
        raise SystemExit(f"Missing canonical review registry: {regpath}")
    review=json.loads(regpath.read_text(encoding="utf-8"))
    desired=list(review["approved_reference_sheets"])
    if args.pending:
        desired+=review["proposed_sheet"]
    results=[]
    with zipfile.ZipFile(args.pack,"r") as z:
        paths=set(z.namelist())
        for item in desired:
            pattern=item["asset_path_in_bundle"]
            matches=sorted(p for p in paths if fnmatch.fnmatch(p,pattern))
            if len(matches)!=1:
                raise SystemExit(f"Expected exactly one file for {item['sport_id']}: {pattern}, got {matches}")
            source=matches[0]
            payload=z.read(source)
            if payload[:4]!=b"RIFF" or payload[8:12]!=b"WEBP":
                raise SystemExit(f"Invalid WebP: {source}")
            outpath=DEST/"icons"/f"{item['sport_id']}.webp"
            digest=hashlib.sha256(payload).hexdigest()
            results.append((item,outpath,payload,digest))
        original_sheets=[f"source-boards/sheet-{x}.png" for x in "ABCDE"]
        for p in original_sheets:
            if p not in paths: raise SystemExit(f"Missing source board {p}")
        if args.apply:
            for item,outpath,payload,digest in results:
                target=repo/outpath
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(payload)
                item["binary_in_github"]=True
                item["actual_path"]=str(outpath.relative_to(ROOT))
                item["sha256"]=digest
            for p in original_sheets:
                target=repo/DEST/"sources"/Path(p).name
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(z.read(p))
            regpath.write_text(json.dumps(review,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    status="IMPORTED" if args.apply else "DRY RUN"
    print(f"{status}: {len(results)} icons, {len(set(item['sport_id'] for item,_,_,_ in results))} distinct sport IDs")
    if not args.apply: print("Nothing written; rerun with --apply after verification.")
    if args.pending: print("CAUTION: pending concepts were included by explicit flag.")
    print("Legacy source images are NOT deleted: retire them only after visual review of imported replacements.")
    return 0

if __name__=="__main__":
    sys.exit(main())
