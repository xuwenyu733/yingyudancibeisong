#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="backups/pet-room-$stamp.sql"
if [ -e "$target" ] || [ -e "$target.partial" ]; then
  echo '该时刻备份已存在，请稍后重试。' >&2
  exit 1
fi
trap 'rm -f -- "$target.partial"' EXIT HUP INT TERM
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces --hex-blob --default-character-set=utf8mb4 --databases pet_room' > "$target.partial"
test -s "$target.partial"
mv -- "$target.partial" "$target"
echo "备份完成：$target"
