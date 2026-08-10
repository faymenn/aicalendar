#!/bin/bash
set -euo pipefail
cd ~/aicalendar
docker compose exec -T app python - <<'PY'
from sqlalchemy import text
from app.database import engine
import time
t = time.time()
with engine.connect() as c:
    print("db_ok", c.execute(text("select 1")).scalar(), "in", round(time.time() - t, 2), "s")
    print("host", engine.url.host)
PY

# Hit login locally through the app container/network
curl -s -m 20 -X POST "http://127.0.0.1:8000/login/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@example.com&password=wrong" \
  -w "\nHTTP:%{http_code} TIME:%{time_total}\n"
