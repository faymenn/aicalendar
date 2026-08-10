#!/bin/bash
set -euo pipefail
docker compose -f ~/aicalendar/docker-compose.yml exec -T frontend sh <<'EOF'
grep -Rho 'tasks/?limit=[^"]*' /app/.next/static/chunks 2>/dev/null | sort | uniq -c
echo '---'
# Show surrounding JS for fetchTasks-like strings
grep -Rn 'tasks/?limit=' /app/.next/static/chunks 2>/dev/null | head -5
EOF
