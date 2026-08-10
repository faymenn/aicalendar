#!/bin/bash
set -euo pipefail

echo "=== PROD BACKEND GET TASKS ==="
docker compose -f ~/aicalendar/docker-compose.yml exec -T app \
  sed -n '17,20p' /app/app/routers/task.py

echo "=== PROD FRONTEND API SNIPPETS ==="
docker compose -f ~/aicalendar/docker-compose.yml exec -T frontend sh -c '
  grep -Rao "tasks/?limit=[0-9]*" /app/.next 2>/dev/null | sort | uniq -c | head
  grep -Rao "/tasks/" /app/.next/static/chunks 2>/dev/null | wc -l
  grep -Rao "limit=300" /app/.next 2>/dev/null | wc -l
  grep -Rao "limit=10" /app/.next 2>/dev/null | wc -l
'

echo "=== ROUNDTRIP TEST ==="
# Create disposable user, create many tasks, list with default and with limit=300
EMAIL="probe$(date +%s)@example.com"
PASS="testpass123"
curl -s -m 20 -X POST "http://127.0.0.1:8000/users/" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}" >/tmp/user.json
echo "user=$(cat /tmp/user.json)"

TOKEN=$(curl -s -m 20 -X POST "http://127.0.0.1:8000/login/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${EMAIL}&password=${PASS}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
echo "token_ok=${#TOKEN}"

for i in $(seq 1 12); do
  curl -s -m 20 -X POST "http://127.0.0.1:8000/tasks/" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"Probe task ${i}\"}" >/tmp/task.json
done
echo "last_create=$(cat /tmp/task.json)"

echo "=== LIST DEFAULT (no query) ==="
curl -s -m 20 "http://127.0.0.1:8000/tasks/" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("count", len(d), "ids", [t["id"] for t in d], "titles", [t["title"] for t in d])'

echo "=== LIST limit=300 ==="
curl -s -m 20 "http://127.0.0.1:8000/tasks/?limit=300" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("count", len(d), "ids", [t["id"] for t in d], "titles", [t["title"] for t in d])'
