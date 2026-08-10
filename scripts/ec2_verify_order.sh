#!/bin/bash
set -euo pipefail

# Use probe user from earlier if we can recreate login - create fresh and many tasks isn't needed.
# Instead verify ordering: list for owner 4 by logging... we don't have password.
# Verify with new user: create 5 tasks, list limit=3, expect newest 3 ids.

EMAIL="orderprobe$(date +%s)@example.com"
PASS="testpass123"
curl -s -m 20 -X POST "http://127.0.0.1:8000/users/" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}" >/dev/null

TOKEN=$(curl -s -m 20 -X POST "http://127.0.0.1:8000/login/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${EMAIL}&password=${PASS}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

IDS=()
for i in 1 2 3 4 5; do
  ID=$(curl -s -m 20 -X POST "http://127.0.0.1:8000/tasks/" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"Order ${i}\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
  IDS+=("$ID")
done
echo "created_ids=${IDS[*]}"

echo "=== limit=3 should be newest 3 ==="
curl -s -m 20 "http://127.0.0.1:8000/tasks/?limit=3" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print([(t["id"], t["title"]) for t in d])'

echo "=== limit=300 headers ==="
curl -s -m 20 -D - "http://127.0.0.1:8000/tasks/?limit=300" \
  -H "Authorization: Bearer ${TOKEN}" -o /tmp/tasks.json | grep -i cache
python3 -c 'import json; d=json.load(open("/tmp/tasks.json")); print("count", len(d), "first", d[0]["title"], "last", d[-1]["title"])'
