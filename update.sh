#!/usr/bin/env bash
# تحديث Smart Chat Agent إلى نسخة جديدة مع الحفاظ على البيانات والإعدادات
# الاستخدام: فك ضغط النسخة الجديدة ثم من داخل مجلدها:  sudo bash update.sh
set -euo pipefail
APP_DIR=/opt/smart-chat
SRC="$(cd "$(dirname "$0")" && pwd)/server"
[ "$EUID" -ne 0 ] && { echo "شغّل بصلاحية root: sudo bash update.sh"; exit 1; }
[ -d "$APP_DIR" ] || { echo "لم يتم العثور على تثبيت سابق في $APP_DIR — استخدم install.sh"; exit 1; }

BACKUP="/root/smart-chat-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
echo "نسخة احتياطية من البيانات: $BACKUP"
tar -czf "$BACKUP" -C "$APP_DIR" data .env

systemctl stop smart-chat
rsync -a --delete --exclude node_modules --exclude data --exclude .env "$SRC"/ "$APP_DIR"/
cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund
chown -R smartchat:smartchat "$APP_DIR"
systemctl start smart-chat
sleep 2 && systemctl is-active --quiet smart-chat && echo "✅ تم التحديث" || echo "❌ راجع: journalctl -u smart-chat -n 50"
