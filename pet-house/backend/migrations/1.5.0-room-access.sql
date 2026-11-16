USE pet_room;
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS room_usage_days (
 account_key VARCHAR(160) NOT NULL COMMENT '小屋用户键；登录孩子使用稳定的独立键',
 usage_day DATE NOT NULL COMMENT '北京时间当天08点开始的额度日期',
 used_ms BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当天已使用毫秒，多窗口合并计时',
 continuous_ms BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '连续使用毫秒，休息满5分钟后重置',
 settled_ms BIGINT UNSIGNED NOT NULL COMMENT '服务器上次结算UTC毫秒',
 last_active_ms BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '服务器最近有效在线UTC毫秒',
 rest_until_ms BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '强制休息结束UTC毫秒',
 PRIMARY KEY(account_key,usage_day),
 FOREIGN KEY(account_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='仓鼠屋每日在线时长；30分钟上限，15分钟休息5分钟';
CREATE TABLE IF NOT EXISTS room_usage_sessions (
 account_key VARCHAR(160) NOT NULL COMMENT '只属于当前孩子的小屋身份',
 session_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '每个窗口独立的随机会话号',
 starts_ms BIGINT UNSIGNED NOT NULL COMMENT '本次有效在线租约开始UTC毫秒',
 until_ms BIGINT UNSIGNED NOT NULL COMMENT '心跳失联时最多计到这里',
 sequence_no BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '忽略乱序及重放心跳',
 PRIMARY KEY(account_key,session_id),
 FOREIGN KEY(account_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='仓鼠屋前台在线心跳租约；同用户多窗口不叠加';
CREATE TABLE IF NOT EXISTS room_entry_tickets (
 ticket_hash CHAR(64) CHARACTER SET ascii NOT NULL COMMENT '一次性入屋凭据SHA256，不存学习系统登录凭据',
 account_key VARCHAR(160) NOT NULL COMMENT '经学习接口验证后的孩子身份',
 expires_at DATETIME(3) NOT NULL COMMENT '凭据两分钟到期，兑换后立即删除',
 PRIMARY KEY(ticket_hash),KEY ticket_expiry(expires_at),
 FOREIGN KEY(account_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='手机仓鼠屋与学习账号的短期一次性桥接';
CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_13_仓鼠屋在线时长` AS
 SELECT a.public_id AS `用户ID`,a.display_name AS `孩子昵称`,u.usage_day AS `额度日期_早8点起`,
 ROUND(u.used_ms/60000,2) AS `已用分钟`,GREATEST(0,ROUND((1800000-u.used_ms)/60000,2)) AS `剩余分钟`,
 CASE WHEN u.usage_day<DATE(UTC_TIMESTAMP()) THEN '历史记录' WHEN u.used_ms>=1800000 THEN '当天额度已用完' WHEN u.rest_until_ms>UNIX_TIMESTAMP(UTC_TIMESTAMP(3))*1000 THEN '休息5分钟' ELSE '可以进入' END AS `进入状态`,
 DATE_FORMAT(TIMESTAMPADD(HOUR,32,CAST(u.usage_day AS DATETIME)),'%Y-%m-%d %H:%i') AS `额度恢复_北京时间`,
 u.account_key AS `账号编号`
 FROM room_usage_days u JOIN social_accounts a USING(account_key);
INSERT INTO sys_schema_migrations(version,description) VALUES('1.5.0','仅仓鼠屋：按孩子每日30分钟，连续15分钟休息5分钟，北京时间早8点重置，多设备合并计时') ON DUPLICATE KEY UPDATE description=VALUES(description);
