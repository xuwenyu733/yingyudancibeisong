USE pet_room;
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS room_life_accounts (
 account_key VARCHAR(160) NOT NULL PRIMARY KEY COMMENT '账号内部编号，与小屋账号对应',revision BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '生活存档版本，防止重复覆盖',state JSON NOT NULL COMMENT '材料、种植、故事和职业等生活进度JSON',
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '最后更新时间UTC',
 FOREIGN KEY(account_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='小屋生活：共享材料、委托、制作、种植、厨房、故事、职业';
CREATE TABLE IF NOT EXISTS room_life_requests (
 account_key VARCHAR(160) NOT NULL COMMENT '账号内部编号，与小屋账号对应',request_id VARCHAR(80) CHARACTER SET ascii NOT NULL COMMENT '操作唯一编号，重试时复用',body_hash CHAR(64) CHARACTER SET ascii NOT NULL COMMENT '操作内容校验值',response JSON NOT NULL COMMENT '已提交结果，用于防止重复扣费领奖',created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间UTC',
 PRIMARY KEY(account_key,request_id),FOREIGN KEY(account_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='生活操作幂等回执；重试不会重复扣材料或发奖';
CREATE TABLE IF NOT EXISTS room_life_photos (
 photo_id CHAR(32) CHARACTER SET ascii NOT NULL PRIMARY KEY COMMENT '摄影作品唯一编号',owner_key VARCHAR(160) NOT NULL COMMENT '作品所属账号内部编号',room_id VARCHAR(64) NOT NULL COMMENT '拍摄时所在楼层编号',title VARCHAR(40) NOT NULL COMMENT '作品标题',image MEDIUMTEXT NOT NULL COMMENT '大小受限的JPEG图片数据',created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间UTC',
 KEY photo_owner(owner_key),FOREIGN KEY(owner_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='摄影室作品；只保存受限大小JPEG，不接受外链或SVG';
CREATE TABLE IF NOT EXISTS room_life_posts (
 post_id CHAR(32) CHARACTER SET ascii NOT NULL PRIMARY KEY COMMENT '展厅作品唯一编号',owner_key VARCHAR(160) NOT NULL COMMENT '作品所属账号内部编号',photo_id CHAR(32) CHARACTER SET ascii NOT NULL COMMENT '摄影作品唯一编号',room_id VARCHAR(64) NOT NULL COMMENT '拍摄时所在楼层编号',title VARCHAR(40) NOT NULL COMMENT '作品标题',theme VARCHAR(32) NOT NULL COMMENT '作品主题编号',image MEDIUMTEXT NOT NULL COMMENT '大小受限的JPEG图片数据',design_code CHAR(4) CHARACTER SET ascii NULL COMMENT '四位装修码，保留开头的零',created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间UTC',
 UNIQUE KEY post_photo(owner_key,photo_id),KEY post_owner(owner_key),FOREIGN KEY(owner_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='好友作品展厅；照片和装修码快照，非公共小镇';
CREATE TABLE IF NOT EXISTS room_life_reactions (
 post_id CHAR(32) CHARACTER SET ascii NOT NULL COMMENT '展厅作品唯一编号',account_key VARCHAR(160) NOT NULL COMMENT '账号内部编号，与小屋账号对应',reaction VARCHAR(16) CHARACTER SET ascii NOT NULL COMMENT '好友选择的表情编号',PRIMARY KEY(post_id,account_key),
 FOREIGN KEY(post_id) REFERENCES room_life_posts(post_id) ON DELETE CASCADE,FOREIGN KEY(account_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='每位好友对一件作品只保留一个表情，支持取消';
CREATE TABLE IF NOT EXISTS room_life_favorites (
 post_id CHAR(32) CHARACTER SET ascii NOT NULL COMMENT '展厅作品唯一编号',account_key VARCHAR(160) NOT NULL COMMENT '账号内部编号，与小屋账号对应',PRIMARY KEY(post_id,account_key),
 FOREIGN KEY(post_id) REFERENCES room_life_posts(post_id) ON DELETE CASCADE,FOREIGN KEY(account_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='作品收藏；账号隔离，支持取消';
-- Metadata upgrades also apply when these tables already exist.
ALTER TABLE room_life_accounts MODIFY COLUMN account_key VARCHAR(160) NOT NULL COMMENT '账号内部编号，与小屋账号对应';
ALTER TABLE room_life_accounts MODIFY COLUMN revision BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '生活存档版本，防止重复覆盖';
ALTER TABLE room_life_accounts MODIFY COLUMN state JSON NOT NULL COMMENT '材料、种植、故事和职业等生活进度JSON';
ALTER TABLE room_life_accounts MODIFY COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '最后更新时间UTC';
ALTER TABLE room_life_requests MODIFY COLUMN account_key VARCHAR(160) NOT NULL COMMENT '账号内部编号，与小屋账号对应';
ALTER TABLE room_life_requests MODIFY COLUMN request_id VARCHAR(80) CHARACTER SET ascii NOT NULL COMMENT '操作唯一编号，重试时复用';
ALTER TABLE room_life_requests MODIFY COLUMN body_hash CHAR(64) CHARACTER SET ascii NOT NULL COMMENT '操作内容校验值';
ALTER TABLE room_life_requests MODIFY COLUMN response JSON NOT NULL COMMENT '已提交结果，用于防止重复扣费领奖';
ALTER TABLE room_life_requests MODIFY COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间UTC';
ALTER TABLE room_life_photos MODIFY COLUMN photo_id CHAR(32) CHARACTER SET ascii NOT NULL COMMENT '摄影作品唯一编号';
ALTER TABLE room_life_photos MODIFY COLUMN owner_key VARCHAR(160) NOT NULL COMMENT '作品所属账号内部编号';
ALTER TABLE room_life_photos MODIFY COLUMN room_id VARCHAR(64) NOT NULL COMMENT '拍摄时所在楼层编号';
ALTER TABLE room_life_photos MODIFY COLUMN title VARCHAR(40) NOT NULL COMMENT '作品标题';
ALTER TABLE room_life_photos MODIFY COLUMN image MEDIUMTEXT NOT NULL COMMENT '大小受限的JPEG图片数据';
ALTER TABLE room_life_photos MODIFY COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间UTC';
ALTER TABLE room_life_posts MODIFY COLUMN post_id CHAR(32) CHARACTER SET ascii NOT NULL COMMENT '展厅作品唯一编号';
ALTER TABLE room_life_posts MODIFY COLUMN owner_key VARCHAR(160) NOT NULL COMMENT '作品所属账号内部编号';
ALTER TABLE room_life_posts MODIFY COLUMN photo_id CHAR(32) CHARACTER SET ascii NOT NULL COMMENT '摄影作品唯一编号';
ALTER TABLE room_life_posts MODIFY COLUMN room_id VARCHAR(64) NOT NULL COMMENT '拍摄时所在楼层编号';
ALTER TABLE room_life_posts MODIFY COLUMN title VARCHAR(40) NOT NULL COMMENT '作品标题';
ALTER TABLE room_life_posts MODIFY COLUMN theme VARCHAR(32) NOT NULL COMMENT '作品主题编号';
ALTER TABLE room_life_posts MODIFY COLUMN image MEDIUMTEXT NOT NULL COMMENT '大小受限的JPEG图片数据';
ALTER TABLE room_life_posts MODIFY COLUMN design_code CHAR(4) CHARACTER SET ascii NULL COMMENT '四位装修码，保留开头的零';
ALTER TABLE room_life_posts MODIFY COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间UTC';
ALTER TABLE room_life_reactions MODIFY COLUMN post_id CHAR(32) CHARACTER SET ascii NOT NULL COMMENT '展厅作品唯一编号';
ALTER TABLE room_life_reactions MODIFY COLUMN account_key VARCHAR(160) NOT NULL COMMENT '账号内部编号，与小屋账号对应';
ALTER TABLE room_life_reactions MODIFY COLUMN reaction VARCHAR(16) CHARACTER SET ascii NOT NULL COMMENT '好友选择的表情编号';
ALTER TABLE room_life_favorites MODIFY COLUMN post_id CHAR(32) CHARACTER SET ascii NOT NULL COMMENT '展厅作品唯一编号';
ALTER TABLE room_life_favorites MODIFY COLUMN account_key VARCHAR(160) NOT NULL COMMENT '账号内部编号，与小屋账号对应';
CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_14_小屋生活进度` AS
 SELECT a.public_id AS `用户ID`,a.display_name AS `孩子昵称`,l.revision AS `生活存档版本`,JSON_UNQUOTE(JSON_EXTRACT(l.state,'$.stars')) AS `小屋星星`,CASE JSON_UNQUOTE(JSON_EXTRACT(l.state,'$.job')) WHEN 'designer' THEN '小小设计师' WHEN 'gardener' THEN '花园园艺师' WHEN 'chef' THEN '邻里小厨师' ELSE '尚未选择' END AS `当前职业`,JSON_EXTRACT(l.state,'$.inventory') AS `材料包JSON`,JSON_EXTRACT(l.state,'$.plots') AS `种植格JSON`,JSON_UNQUOTE(JSON_EXTRACT(l.state,'$.stats.quests')) AS `完成装修委托`,JSON_UNQUOTE(JSON_EXTRACT(l.state,'$.stats.crafted')) AS `制作家具数`,JSON_UNQUOTE(JSON_EXTRACT(l.state,'$.stats.harvested')) AS `收获作物数`,JSON_UNQUOTE(JSON_EXTRACT(l.state,'$.stats.cooked')) AS `制作料理数`,JSON_UNQUOTE(JSON_EXTRACT(l.state,'$.stats.delivered')) AS `完成订单数`,JSON_LENGTH(JSON_EXTRACT(l.state,'$.story.completed')) AS `完成故事章节`,l.account_key AS `账号编号`
 FROM room_life_accounts l JOIN social_accounts a USING(account_key);
CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_15_好友作品展厅` AS
 SELECT p.post_id AS `作品编号`,a.public_id AS `作者ID`,a.display_name AS `作者昵称`,p.title AS `作品标题`,p.theme AS `主题`,p.room_id AS `楼层编号`,p.design_code AS `装修码`,(SELECT COUNT(*) FROM room_life_reactions r WHERE r.post_id=p.post_id) AS `表情数`,(SELECT COUNT(*) FROM room_life_favorites f WHERE f.post_id=p.post_id) AS `收藏数`,p.owner_key AS `账号编号`,p.created_at AS `发布于UTC`
 FROM room_life_posts p JOIN social_accounts a ON a.account_key=p.owner_key;
INSERT INTO sys_schema_migrations(version,description) VALUES('1.6.0','小屋生活九项玩法：委托、套装、蓝图、摄影、种植、好友展厅、厨房、故事、职业；无公共小镇和使用时长限制') ON DUPLICATE KEY UPDATE description=VALUES(description);
