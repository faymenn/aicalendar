#!/bin/bash
set -euo pipefail

TOKEN=$(curl -s --max-time 3 -X PUT http://169.254.169.254/latest/api/token \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
H="X-aws-ec2-metadata-token: ${TOKEN}"

echo "INSTANCE=$(curl -s --max-time 3 -H "$H" http://169.254.169.254/latest/meta-data/instance-id)"
echo "AZ=$(curl -s --max-time 3 -H "$H" http://169.254.169.254/latest/meta-data/placement/availability-zone)"
echo "PRIVIP=$(curl -s --max-time 3 -H "$H" http://169.254.169.254/latest/meta-data/local-ipv4)"
echo "SGS=$(curl -s --max-time 3 -H "$H" http://169.254.169.254/latest/meta-data/security-groups)"
echo "IAM=$(curl -s --max-time 3 -H "$H" http://169.254.169.254/latest/meta-data/iam/info || true)"

HOST=aitodolist-database.cnm8wm42sfuj.us-east-2.rds.amazonaws.com
echo "DNS=$(getent hosts "$HOST" || true)"
if timeout 5 bash -c "echo >/dev/tcp/${HOST}/5432"; then
  echo "PORT=OPEN"
else
  echo "PORT=FAIL"
fi

# Prefer instance role if present
aws sts get-caller-identity 2>&1 || true
aws rds describe-db-instances --db-instance-identifier aitodolist-database --output json 2>&1 | head -c 8000 || true
