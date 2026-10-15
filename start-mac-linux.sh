#!/usr/bin/env bash
# تشغيل محلي سريع للتجربة على Mac أو Linux:  bash start-mac-linux.sh
cd "$(dirname "$0")/server"
command -v node >/dev/null || { echo "Node.js غير مثبت. حمّله من https://nodejs.org"; exit 1; }
[ -f .env ] || cp .env.example .env
[ -d node_modules ] || npm install --omit=dev --no-audit --no-fund
echo "لوحة التحكم: http://localhost:3000/admin/"
(sleep 2; (open http://localhost:3000/admin/ || xdg-open http://localhost:3000/admin/) >/dev/null 2>&1) &
node src/start.js
