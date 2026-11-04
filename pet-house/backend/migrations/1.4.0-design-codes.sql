USE pet_room;
CREATE TABLE IF NOT EXISTS social_room_designs (
 design_code CHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '四位装修码，保留开头的0',
 owner_key VARCHAR(160) NOT NULL COMMENT '发布者的小屋身份键',
 room_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '所属楼层',
 snapshot_json JSON NOT NULL COMMENT '仅公开装修，不包含积分、身份、照片和备份',
 revision INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '发布版本，每次更新递增',
 created_at DATETIME(3) NOT NULL COMMENT '首次发布UTC时间',
 updated_at DATETIME(3) NOT NULL COMMENT '最近更新UTC时间',
 PRIMARY KEY(design_code), UNIQUE KEY owner_room(owner_key,room_id),
 CONSTRAINT fk_design_owner FOREIGN KEY(owner_key) REFERENCES social_accounts(account_key) ON DELETE CASCADE,
 CONSTRAINT ck_design_code CHECK (design_code REGEXP '^[0-9]{4}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin COMMENT='每位玩家每层楼独立发布的装修方案';
CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_12_装修分享` AS
 SELECT d.design_code AS `装修码`,a.public_id AS `主人ID`,a.display_name AS `主人昵称`,d.room_id AS `楼层编号`,d.revision AS `发布版本`,DATE_FORMAT(TIMESTAMPADD(HOUR,8,d.updated_at),'%Y-%m-%d %H:%i:%s') AS `更新时间_北京时间`,d.owner_key AS `账号编号`
 FROM social_room_designs d JOIN social_accounts a ON a.account_key=d.owner_key;
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
UNION ALL SELECT 11,'新手_11_联网账号','每个人的专属账号ID','分享ID，不分享密码'
UNION ALL SELECT 12,'新手_12_装修分享','四位装修码、主人和楼层','在装修界面输入号码复制摆设';
INSERT INTO sys_schema_migrations(version,description) VALUES('1.4.0','四位装修码：按楼层发布公开装修，复制前确认缺失物品及积分并自动备份') ON DUPLICATE KEY UPDATE description=VALUES(description);
