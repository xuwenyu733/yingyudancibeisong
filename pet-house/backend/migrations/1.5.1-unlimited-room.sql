USE pet_room;
SET NAMES utf8mb4;
ALTER TABLE room_usage_days COMMENT='仓鼠屋在线时长统计；不限时，保留历史记录';
CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_13_仓鼠屋在线时长` AS
 SELECT a.public_id AS `用户ID`,a.display_name AS `孩子昵称`,u.usage_day AS `统计日期_早8点起`,
 ROUND(u.used_ms/60000,2) AS `累计在线分钟`,'可进入（不限时）' AS `进入状态`,u.account_key AS `账号编号`
 FROM room_usage_days u JOIN social_accounts a USING(account_key);
INSERT INTO sys_schema_migrations(version,description) VALUES('1.5.1','取消仓鼠屋时长限制、强制休息和定时解封；保留在线记录和原有存档') ON DUPLICATE KEY UPDATE description=VALUES(description);
