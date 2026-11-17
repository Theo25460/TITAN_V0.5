#!/usr/bin/env python3
"""Inventory of every remote branch against the checked-out reference (HEAD), by content rather than by commit:
squash merges and integration checkpoints make commit ancestry useless on this repository.

    git fetch --unshallow origin '+refs/heads/*:refs/remotes/origin/*'   # a shallow clone hides the common history
    python3 tools/github/branch-inventory.py out.json

For each branch, every file it changed since its merge-base with HEAD is put in one of three sets:
  same  the branch's version is exactly the one in HEAD                      -> integrated
  old   the branch's version is an earlier version of that file in HEAD's history -> superseded
  UNIQ  the branch's version never existed on HEAD's line                    -> a contribution to examine
A branch with UNIQ = 0 has nothing left to recover. Decisions are recorded in docs/CONSOLIDATION_GITHUB.md.
Read-only: it never changes a branch."""
import subprocess, json, collections, sys
def git(*a):
    return subprocess.run(["git",*a],capture_output=True,text=True,errors="replace").stdout
HEAD="HEAD"
# every blob each path ever had in HEAD's history
hist=collections.defaultdict(set)
for line in git("log",HEAD,"--raw","--no-abbrev","--format=","-m","--no-renames").splitlines():
    if line.startswith(":"):
        meta,path=line.split("\t",1); hist[path].add(meta.split()[3])
head_tree={}
for line in git("ls-tree","-r",HEAD).splitlines():
    meta,path=line.split("\t",1); head_tree[path]=meta.split()[2]
out=[]
for b in git("for-each-ref","--format=%(refname:short)","refs/remotes/origin").split():
    if b in("origin/HEAD","origin"): continue
    name=b[len("origin/"):]
    mb=git("merge-base",HEAD,b).strip()
    if not mb: out.append(dict(branch=name,note="no common history")); continue
    ahead=int(git("rev-list","--count",f"{HEAD}..{b}").strip() or 0)
    date=git("log","-1","--format=%cs",b).strip()
    subj=git("log","-1","--format=%s",b).strip()[:90]
    same=old=uniq=dele=0; uniq_paths=[]
    for line in git("diff","--raw","--no-abbrev","--no-renames",mb,b).splitlines():
        meta,path=line.split("\t",1); new=meta.split()[3]; st=meta.split()[4]
        if st=="D": dele+=1; continue
        if head_tree.get(path)==new: same+=1
        elif new in hist.get(path,()): old+=1
        else: uniq+=1; uniq_paths.append(path)
    areas=collections.Counter(p.split("/")[0] if "/" in p else "(root)" for p in uniq_paths)
    out.append(dict(branch=name,date=date,ahead=ahead,same=same,old=old,uniq=uniq,deleted=dele,areas=dict(areas.most_common(6)),uniq_paths=uniq_paths,subject=subj,mb=mb[:7]))
json.dump(out,open(sys.argv[1],"w"),ensure_ascii=False)
out.sort(key=lambda r:(r.get("date",""),),reverse=True)
for r in out:
    if "note" in r: print(r); continue
    print(f'{r["date"]} {r["branch"][:52]:52} ahead={r["ahead"]:4} same={r["same"]:4} old={r["old"]:4} UNIQ={r["uniq"]:4} {r["areas"]}')
