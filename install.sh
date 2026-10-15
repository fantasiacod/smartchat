#!/usr/bin/env bash
# =============================================================
#  Smart Chat Agent — مثبّت تلقائي لسيرفر Ubuntu 22.04 / 24.04
#  الاستخدام:  sudo bash install.sh
# =============================================================
set -euo pipefail

APP_DIR=/opt/smart-chat
APP_USER=smartchat
PORT=3000
SRC="$(cd "$(dirname "$0")" && pwd)/server"

green(){ printf "\033[32m%s\033[0m\n" "$1"; }
red(){ printf "\033[31m%s\033[0m\n" "$1"; }

[ "$EUID" -ne 0 ] && { red "شغّل السكربت بصلاحية root:  sudo bash install.sh"; exit 1; }
[ -d "$SRC" ] || { red "لم يتم العثور على مجلد server بجانب السكربت"; exit 1; }

echo "==============================================="
echo "   تثبيت Smart Chat Agent"
echo "==============================================="
read -rp "النطاق الفرعي للمحادثة (مثال chat.example.com) — اتركه فارغاً للتشغيل بعنوان IP: " DOMAIN
read -rp "بريد حساب المدير: " ADMIN_EMAIL
while true; do
  read -rsp "كلمة مرور المدير (8 أحرف على الأقل): " ADMIN_PASS; echo
  [ ${#ADMIN_PASS} -ge 8 ] && break
  red "كلمة المرور قصيرة"
done

green "[1/6] تثبيت المتطلبات..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates build-essential python3 nginx openssl rsync

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  green "تثبيت Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node $(node -v)"

green "[2/6] نسخ الملفات إلى $APP_DIR ..."
id "$APP_USER" >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -d "$APP_DIR" "$APP_USER"
mkdir -p "$APP_DIR/data"
rsync -a --delete --exclude node_modules --exclude data --exclude .env "$SRC"/ "$APP_DIR"/

green "[3/6] تثبيت الحزم..."
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund

if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<EOF
PORT=$PORT
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASS
JWT_SECRET=$(openssl rand -hex 32)
DATA_DIR=$APP_DIR/data
EOF
fi
chmod 600 "$APP_DIR/.env"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

green "[4/6] إنشاء خدمة التشغيل التلقائي..."
cat > /etc/systemd/system/smart-chat.service <<EOF
[Unit]
Description=Smart Chat Agent
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) src/start.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now smart-chat
sleep 2
systemctl is-active --quiet smart-chat || { red "فشل التشغيل، راجع: journalctl -u smart-chat -n 50"; exit 1; }

green "[5/6] إعداد Nginx..."
SERVER_NAME=${DOMAIN:-_}
cat > /etc/nginx/sites-available/smart-chat <<EOF
server {
    listen 80;
    server_name $SERVER_NAME;
    client_max_body_size 5m;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/smart-chat /etc/nginx/sites-enabled/smart-chat
[ -z "$DOMAIN" ] && rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 'Nginx Full' || true; fi
# Oracle Cloud وبعض المزودين: صور Ubuntu فيها قواعد iptables تمنع المنفذين 80 و 443
if command -v iptables >/dev/null && iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport $p -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save || true
  else apt-get install -y iptables-persistent && netfilter-persistent save || true; fi
  echo "تم فتح المنفذين 80 و 443 في جدار الحماية"
fi

green "[6/6] شهادة SSL..."
if [ -n "$DOMAIN" ]; then
  apt-get install -y certbot python3-certbot-nginx
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect; then
    URL="https://$DOMAIN"
  else
    red "تعذر إصدار الشهادة. تأكد أن سجل DNS للنطاق يشير لهذا السيرفر ثم شغّل:  certbot --nginx -d $DOMAIN"
    URL="http://$DOMAIN"
  fi
else
  URL="http://$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')"
  echo "تنبيه: بدون نطاق وشهادة SSL لن يعمل الودجت على المواقع التي تستخدم https"
fi

echo
green "==============================================="
green " ✅ تم التثبيت بنجاح"
green "==============================================="
echo " لوحة التحكم:  $URL/admin/"
echo " البريد:       $ADMIN_EMAIL"
echo " أوامر مفيدة:"
echo "   systemctl status smart-chat      حالة الخدمة"
echo "   journalctl -u smart-chat -f      السجلات المباشرة"
echo "   systemctl restart smart-chat     إعادة التشغيل"
