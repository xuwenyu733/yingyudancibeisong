USE pet_room;
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS social_accounts (
  account_key VARCHAR(160) NOT NULL COMMENT '联网账号对应的独立游戏存档键，不随房间投影删除',
  public_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '可分享的唯一好友ID，不是登录凭据',
  display_name VARCHAR(40) NOT NULL COMMENT '公开昵称',
  password_salt VARCHAR(64) CHARACTER SET ascii NOT NULL COMMENT '随机密码盐，不存明文密码',
  password_hash VARCHAR(128) CHARACTER SET ascii NOT NULL COMMENT 'scrypt密码摘要',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '注册UTC时间',
  PRIMARY KEY(account_key),UNIQUE KEY uq_social_public_id(public_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='好友账号：唯一公开ID和登录校验';
CREATE TABLE IF NOT EXISTS social_sessions (
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL COMMENT '会话令牌SHA256；原令牌只在HttpOnly Cookie',
  account_key VARCHAR(160) NOT NULL COMMENT '会话所属账号',
  expires_at DATETIME(3) NOT NULL COMMENT '过期UTC时间',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '登录UTC时间',
  PRIMARY KEY(token_hash),KEY idx_social_session_owner(account_key,expires_at),
  FOREIGN KEY(account_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='联网登录会话：过期和退出后失效';
CREATE TABLE IF NOT EXISTS social_friendships (
  user_a VARCHAR(160) NOT NULL COMMENT '双方账号键，按字符顺序排列',
  user_b VARCHAR(160) NOT NULL COMMENT '另一方账号键',
  requester VARCHAR(160) NOT NULL COMMENT '发出本次申请的账号',
  state VARCHAR(16) NOT NULL COMMENT 'pending待确认/accepted好友/declined拒绝/removed移除',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '最近状态变化UTC时间',
  PRIMARY KEY(user_a,user_b),KEY idx_social_friend_b(user_b,state),
  FOREIGN KEY(user_a) REFERENCES social_accounts(account_key) ON DELETE CASCADE,
  FOREIGN KEY(user_b) REFERENCES social_accounts(account_key) ON DELETE CASCADE,
  CHECK(state IN ('pending','accepted','declined','removed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='好友关系：必须对方同意才成为好友';
CREATE TABLE IF NOT EXISTS social_messages (
  message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '服务端消息顺序号',
  sender_key VARCHAR(160) NOT NULL COMMENT '发送人账号',
  recipient_key VARCHAR(160) NOT NULL COMMENT '接收人账号',
  client_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '客户端幂等发送编号',
  body VARCHAR(4000) NOT NULL COMMENT '纯文本聊天内容，最多1000个字符',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '发送UTC时间',
  read_at DATETIME(3) NULL COMMENT '对方已读取UTC时间',
  PRIMARY KEY(message_id),UNIQUE KEY uq_social_message_retry(sender_key,client_id),
  KEY idx_social_conversation(sender_key,recipient_key,message_id),KEY idx_social_inbox(recipient_key,read_at,message_id),
  FOREIGN KEY(sender_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE,
  FOREIGN KEY(recipient_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='好友私聊：只允许双方读取，不包含公共聊天室';
CREATE TABLE IF NOT EXISTS social_invitations (
  invitation_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '不可预测的邀请编号',
  host_key VARCHAR(160) NOT NULL COMMENT '主人账号',
  guest_key VARCHAR(160) NOT NULL COMMENT '受邀好友账号',
  state VARCHAR(16) NOT NULL COMMENT 'pending待同意/accepted参观中/declined拒绝/revoked主人结束/left访客离开',
  expires_at DATETIME(3) NOT NULL COMMENT '30分钟后过期的UTC时间',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '邀请UTC时间',
  PRIMARY KEY(invitation_id),KEY idx_social_guest(guest_key,state,expires_at),KEY idx_social_host(host_key,state,expires_at),
  FOREIGN KEY(host_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE,
  FOREIGN KEY(guest_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE,
  CHECK(state IN ('pending','accepted','declined','revoked','left'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='好友参观邀请：指定好友、限时、只读、主人可结束';
CREATE TABLE IF NOT EXISTS social_blocks (
  owner_key VARCHAR(160) NOT NULL COMMENT '发起屏蔽的账号',
  peer_key VARCHAR(160) NOT NULL COMMENT '被屏蔽的账号',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '屏蔽UTC时间',
  PRIMARY KEY(owner_key,peer_key),
  FOREIGN KEY(owner_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE,
  FOREIGN KEY(peer_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='屏蔽列表：阻止好友申请、聊天和继续参观';

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_09_好友关系` AS
SELECT a.display_name AS `一方昵称`,a.public_id AS `一方好友ID`,b.display_name AS `另一方昵称`,b.public_id AS `另一方好友ID`,
 CASE f.state WHEN 'pending' THEN '等待同意' WHEN 'accepted' THEN '已经是好友' WHEN 'declined' THEN '已拒绝' ELSE '已移除' END AS `关系状态`,
 DATE_FORMAT(TIMESTAMPADD(HOUR,8,f.updated_at),'%Y-%m-%d %H:%i:%s') AS `更新时间_北京时间`
FROM social_friendships f JOIN social_accounts a ON a.account_key=f.user_a JOIN social_accounts b ON b.account_key=f.user_b;
CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_10_参观邀请` AS
SELECT h.display_name AS `主人昵称`,h.public_id AS `主人好友ID`,g.display_name AS `受邀好友`,g.public_id AS `好友ID`,
 CASE WHEN i.expires_at<UTC_TIMESTAMP(3) THEN '已过期' WHEN i.state='pending' THEN '等待同意' WHEN i.state='accepted' THEN '可以参观' WHEN i.state='revoked' THEN '主人已结束' WHEN i.state='left' THEN '访客已离开' ELSE '已拒绝' END AS `邀请状态`,
 DATE_FORMAT(TIMESTAMPADD(HOUR,8,i.expires_at),'%Y-%m-%d %H:%i:%s') AS `到期时间_北京时间`
FROM social_invitations i JOIN social_accounts h ON h.account_key=i.host_key JOIN social_accounts g ON g.account_key=i.guest_key;
CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_11_联网账号` AS
SELECT a.display_name AS `昵称`,a.public_id AS `可分享的账号ID`,
 (SELECT COUNT(*) FROM social_friendships f WHERE (f.user_a=a.account_key OR f.user_b=a.account_key) AND f.state='accepted') AS `好友数量`,
 CASE WHEN s.namespace IS NULL THEN '还没有保存小屋' ELSE '已经保存小屋' END AS `小屋状态`,
 DATE_FORMAT(TIMESTAMPADD(HOUR,8,a.created_at),'%Y-%m-%d %H:%i:%s') AS `注册时间_北京时间`,
 a.account_key AS `账号编号`
FROM social_accounts a LEFT JOIN sys_save_slots s ON s.namespace=a.account_key;
CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_00_使用指南` AS
SELECT 1 AS `顺序`,'新手_01_账号总览' AS `看哪个入口`,'账号、积分和当前房间' AS `能看到什么`,'在小屋里修改和读档' AS `小提示`
UNION ALL SELECT 2,'新手_02_每层房间','楼层名字和保存时间','先找账号，再看楼层'
UNION ALL SELECT 3,'新手_03_房间存档','自动保存和手动存档','自动是现状，手动是旧档'
UNION ALL SELECT 4,'新手_04_房间家具','各层摆出的家具','只看当前摆放'
UNION ALL SELECT 5,'新手_05_家具仓库','已经拥有但还没摆出的家具','同一收藏可用于不同楼层'
UNION ALL SELECT 6,'新手_06_积分记录','购买、扩建和积分收支','未记录金额不等于免费'
UNION ALL SELECT 7,'新手_07_宠物伙伴','宠物种类和昵称','各层共用同一只伙伴'
UNION ALL SELECT 8,'新手_08_商品价格','中文商品和积分价格','价格是积分，不是人民币'
UNION ALL SELECT 9,'新手_09_好友关系','好友ID、双方昵称和申请状态','需要对方同意才成为好友'
UNION ALL SELECT 10,'新手_10_参观邀请','主人、受邀好友和到期时间','参观只读，不改变主人装修'
UNION ALL SELECT 11,'新手_11_联网账号','每个人的专属账号ID','分享ID，不分享密码';
INSERT INTO sys_schema_migrations(version,description) VALUES('1.3.0','联网账号、好友申请、私聊、限时只读参观与屏蔽；社交账号不随房间投影级联删除')
ON DUPLICATE KEY UPDATE description=VALUES(description);
