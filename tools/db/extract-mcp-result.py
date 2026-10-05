"""Extract the single text column of a saved Supabase MCP execute_sql result into a SQL file.
Usage: python3 tools/db/extract-mcp-result.py <saved-result.txt> <column> <output.sql> [header]"""
import json, re, sys

raw = open(sys.argv[1], encoding="utf8").read()
# The saved payload is a JSON object whose "result" string wraps a JSON array between untrusted-data tags.
try:
    outer = json.loads(raw)
    text = outer.get("result", raw) if isinstance(outer, dict) else raw
except json.JSONDecodeError:
    text = raw
m = re.search(r"<untrusted-data-[^>]+>\s*(\[.*\])\s*</untrusted-data", text, re.S)
rows = json.loads(m.group(1))
value = rows[0][sys.argv[2]] or ""
header = sys.argv[4] if len(sys.argv) > 4 else ""
with open(sys.argv[3], "w", encoding="utf8") as f:
    if header:
        f.write(header.rstrip() + "\n")
    f.write(value.rstrip() + "\n")
print(f"{sys.argv[3]}: {len(value)} chars")
