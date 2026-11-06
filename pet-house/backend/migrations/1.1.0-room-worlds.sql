-- 增量迁移 1.1.0：先备份，再显式执行；可重复运行，不修改或删除现有表/存档。
-- 适用已经安装 1.0.x 的 pet_room。新安装也会从 schema.sql 创建同一张表。
USE pet_room;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS room_world_saves (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键，与完整权威存档 namespace 一致',
  room_id VARCHAR(16) NOT NULL COMMENT '所属楼层id；各层独立查询和恢复',
  save_key VARCHAR(80) NOT NULL COMMENT 'current为当前世界；checkpoint:加原始存档点id为命名快照',
  save_kind VARCHAR(16) NOT NULL COMMENT 'current当前世界或checkpoint命名存档点',
  checkpoint_id VARCHAR(64) NULL COMMENT '原始存档点id；当前世界为NULL',
  save_name VARCHAR(40) NOT NULL COMMENT '当前楼层名称或玩家命名的存档点名称',
  world_revision BIGINT UNSIGNED NOT NULL COMMENT '所属单层世界的当前修订号，不是共享账户revision',
  saved_at DATETIME(3) NOT NULL COMMENT '当前世界更新时间或存档点创建时刻，UTC',
  snapshot_json JSON NOT NULL COMMENT '本层名称、模板、装修scene、伙伴局部设置及extras；不包含共享钱包或其他楼层',
  PRIMARY KEY (account_key,room_id,save_key),
  KEY idx_world_kind_time (account_key,room_id,save_kind,saved_at),
  CONSTRAINT fk_world_room FOREIGN KEY (account_key,room_id) REFERENCES room_floors(account_key,room_id) ON DELETE CASCADE,
  CONSTRAINT ck_world_save_kind CHECK (save_kind IN ('current','checkpoint'))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin COMMENT='世界存档：每层一份当前世界及最多五个命名装修快照，与完整存档同事务同步';

INSERT INTO sys_schema_migrations(version,description) VALUES('1.1.0','每层独立世界及最多五个命名存档点：当前装修和本层快照的可检索投影')
ON DUPLICATE KEY UPDATE description=VALUES(description);
