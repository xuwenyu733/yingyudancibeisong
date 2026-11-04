#!/bin/sh
# Read-only Chinese views over the private Docker database connection.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
case "${1:-guide}" in
  guide) table='新手_00_使用指南' ;;
  accounts) table='新手_11_联网账号' ;;
  floors) table='新手_02_每层房间' ;;
  saves) table='新手_03_房间存档' ;;
  points) table='新手_06_积分记录' ;;
  friends) table='新手_09_好友关系' ;;
  designs) table='新手_12_装修分享' ;;
  invites) table='新手_10_参观邀请' ;;
  *) echo '用法：sh view-database.sh [guide|accounts|floors|saves|points|friends|invites|designs]' >&2; exit 2 ;;
esac
# This fixed allowlist never accepts user SQL or arbitrary table names.
query="SELECT * FROM \`$table\` LIMIT 100"
docker compose exec -T -e "PET_ROOM_VIEW_QUERY=$query" db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -upet_room_app --database=pet_room --default-character-set=utf8mb4 --table -e "$PET_ROOM_VIEW_QUERY"'
