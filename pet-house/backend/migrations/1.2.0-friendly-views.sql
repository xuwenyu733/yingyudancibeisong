-- 中文入门入口；只新增查询视图，不改原表名、字段或游戏存档。
USE pet_room;
SET NAMES utf8mb4;

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_01_账号总览` AS
SELECT COALESCE(NULLIF(u.display_name,''),CASE u.account_key WHEN 'hamster-room-layout-v3' THEN '默认小屋账号' WHEN 'original-pet-room-qa-v3' THEN '体验小屋账号' WHEN 'original-pet-room-estate-qa-v1' THEN '多房间体验账号' ELSE CONCAT('未命名账号（',RIGHT(u.account_key,6),'）') END) AS `账号名称`,
  u.level AS `等级`,COALESCE(w.balance_points,0) AS `可用积分`,COALESCE(w.total_spent_points,0) AS `累计购买和扩建消费`,
  (SELECT COUNT(*) FROM room_floors f WHERE f.account_key=u.account_key) AS `共有几层`,
  COALESCE(CONCAT(r.floor_no,' 楼 · ',r.room_name),'还没有进入房间') AS `现在在哪层`,
  COALESCE(NULLIF(s.pet_nickname,''),'还没起昵称') AS `宠物昵称`,
  ROUND(u.study_seconds/60,1) AS `累计学习分钟`,
  COALESCE(DATE_FORMAT(TIMESTAMPADD(HOUR,8,ss.updated_at),'%Y-%m-%d %H:%i:%s'),'未记录') AS `最近保存时间_北京时间`,
  u.account_key AS `账号编号`
FROM usr_accounts u LEFT JOIN wallet_accounts w USING(account_key)
LEFT JOIN usr_settings s USING(account_key) LEFT JOIN room_floors r ON r.account_key=u.account_key AND r.room_id=u.active_room_id
LEFT JOIN sys_save_slots ss ON ss.namespace=u.account_key;

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_02_每层房间` AS
SELECT a.`账号名称`,r.floor_no AS `楼层`,r.room_name AS `房间名字`,
  CASE r.template_key WHEN 'cream' THEN '奶油小屋' WHEN 'mint' THEN '薄荷花房' WHEN 'candy' THEN '糖果城堡' ELSE '自定义房间' END AS `房间风格`,
  COALESCE(t.tier_name,'初始房型') AS `房间大小`,
  CASE WHEN r.room_id=u.active_room_id THEN '正在这一层' ELSE '其他楼层' END AS `当前状态`,
  (SELECT COUNT(*) FROM room_world_saves ws WHERE ws.account_key=r.account_key AND ws.room_id=r.room_id AND ws.save_kind='checkpoint') AS `手动存档点数量`,
  COALESCE(DATE_FORMAT(TIMESTAMPADD(HOUR,8,current_save.saved_at),'%Y-%m-%d %H:%i:%s'),'尚未同步新存档') AS `最近保存时间_北京时间`,
  r.account_key AS `账号编号`,r.room_id AS `楼层编号`
FROM room_floors r JOIN `新手_01_账号总览` a ON a.`账号编号`=r.account_key JOIN usr_accounts u USING(account_key)
LEFT JOIN cfg_room_tiers t ON t.tier_level=r.current_tier
LEFT JOIN room_world_saves current_save ON current_save.account_key=r.account_key AND current_save.room_id=r.room_id AND current_save.save_key='current';

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_03_房间存档` AS
SELECT a.`账号名称`,r.floor_no AS `楼层`,r.room_name AS `房间名字`,
  CASE w.save_kind WHEN 'current' THEN '自动保存 · 当前布置' ELSE '手动保存 · 命名存档点' END AS `存档类型`,
  w.save_name AS `存档名字`,
  COALESCE(DATE_FORMAT(TIMESTAMPADD(HOUR,8,w.saved_at),'%Y-%m-%d %H:%i:%s'),'未记录') AS `保存时间_北京时间`,
  w.world_revision AS `本层保存版本`,
  COALESCE(JSON_LENGTH(JSON_EXTRACT(w.snapshot_json,'$.scene.layout.furniture')),0) AS `记录的家具数量`,
  CASE w.save_kind WHEN 'current' THEN '进入这一层时继续使用的布置' ELSE '在小屋中点击读取，可只恢复这一层' END AS `这份存档有什么用`,
  w.account_key AS `账号编号`,w.room_id AS `楼层编号`,w.save_key AS `存档编号`
FROM room_world_saves w JOIN room_floors r USING(account_key,room_id)
JOIN `新手_01_账号总览` a ON a.`账号编号`=w.account_key;

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_04_房间家具` AS
SELECT a.`账号名称`,r.floor_no AS `楼层`,r.room_name AS `房间名字`,
  COALESCE(i.item_name,NULLIF(f.instance_label,''),f.furniture_id) AS `家具名字`,
  '正在这个房间摆放' AS `状态`,ROUND(f.pos_x,2) AS `左右位置_米`,ROUND(f.pos_z,2) AS `前后位置_米`,
  ROUND(f.rot_y*180/PI(),1) AS `朝向_度`,f.account_key AS `账号编号`,f.room_id AS `楼层编号`,f.furniture_id AS `家具编号`
FROM room_furniture f JOIN room_floors r USING(account_key,room_id) JOIN room_layouts l USING(account_key,room_id,tier_level)
JOIN `新手_01_账号总览` a ON a.`账号编号`=f.account_key LEFT JOIN cfg_items i ON i.item_sku=f.item_sku
WHERE l.is_current=1;

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_05_家具仓库` AS
SELECT a.`账号名称`,r.floor_no AS `楼层`,r.room_name AS `房间名字`,i.item_name AS `家具名字`,
  '已拥有 · 本层尚未摆放' AS `状态`,
  CASE o.ownership_kind WHEN 'builtin' THEN '房间自带' WHEN 'purchased' THEN '积分兑换' WHEN 'gift' THEN '活动礼物' ELSE '其他方式' END AS `怎么获得的`,
  COALESCE(DATE_FORMAT(TIMESTAMPADD(HOUR,8,o.acquired_at),'%Y-%m-%d %H:%i:%s'),'旧记录没有保存时间') AS `获得时间_北京时间`,
  s.account_key AS `账号编号`,s.room_id AS `楼层编号`,s.item_sku AS `家具编号`
FROM inv_room_storage s JOIN room_floors r USING(account_key,room_id) JOIN cfg_items i USING(item_sku)
JOIN inv_ownership o USING(account_key,item_sku) JOIN `新手_01_账号总览` a ON a.`账号编号`=s.account_key;

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_06_积分记录` AS
SELECT a.`账号名称`,CASE WHEN w.scope_room_id='' THEN '所有楼层共用' ELSE CONCAT(r.floor_no,' 楼 · ',r.room_name) END AS `发生在哪`,
  CASE w.operation WHEN 'purchase' THEN '购买家具' WHEN 'purchase-pet' THEN '更换宠物' WHEN 'create-room' THEN '新建楼层' WHEN 'expand' THEN '扩建房间' WHEN 'set-room' THEN '切换房型' WHEN 'store' THEN '收起家具' WHEN 'unstore' THEN '摆回家具' WHEN 'store-all' THEN '全部收纳' WHEN 'grant-gift' THEN '领取礼物' WHEN 'reward' THEN '获得积分' WHEN 'spend' THEN '使用积分' ELSE '其他记录' END AS `做了什么`,
  COALESCE(i.item_name,p.pet_name,'没有关联物品') AS `相关物品`,
  CASE WHEN w.points_delta IS NULL THEN '未记录金额' WHEN w.points_delta>=0 THEN CONCAT('+',w.points_delta) ELSE CAST(w.points_delta AS CHAR) END AS `积分变化`,
  CASE WHEN w.points_delta IS NULL THEN '旧记录未记录金额，不能当成0积分' ELSE '正数是获得，负数是使用' END AS `怎么看`,
  w.account_key AS `账号编号`,NULLIF(w.scope_room_id,'') AS `楼层编号`,w.receipt_id AS `记录编号`
FROM wallet_receipts w JOIN `新手_01_账号总览` a ON a.`账号编号`=w.account_key
LEFT JOIN room_floors r ON r.account_key=w.account_key AND r.room_id=w.scope_room_id
LEFT JOIN cfg_items i ON i.item_sku=w.related_sku LEFT JOIN cfg_pets p ON p.pet_sku=w.related_sku;

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_07_宠物伙伴` AS
SELECT a.`账号名称`,COALESCE(p.pet_name,o.pet_sku) AS `宠物种类`,COALESCE(NULLIF(s.pet_nickname,''),'还没起昵称') AS `宠物昵称`,
  CASE WHEN o.is_active THEN '正在陪伴' ELSE '历史收藏' END AS `伙伴状态`,
  COALESCE(DATE_FORMAT(TIMESTAMPADD(HOUR,8,o.acquired_at),'%Y-%m-%d %H:%i:%s'),'旧记录没有保存时间') AS `获得时间_北京时间`,
  o.account_key AS `账号编号`,o.pet_sku AS `宠物编号`
FROM pet_ownership o JOIN `新手_01_账号总览` a ON a.`账号编号`=o.account_key
LEFT JOIN cfg_pets p USING(pet_sku) LEFT JOIN usr_settings s USING(account_key);

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_08_商品价格` AS
SELECT i.item_name AS `商品名字`,CASE i.item_kind WHEN 'builtin' THEN '房间自带家具' WHEN 'flooring' THEN '地板' WHEN 'wall' THEN '墙上装饰' WHEN 'gift' THEN '活动礼物' ELSE '家具和装饰' END AS `商品分类`,
  i.price_points AS `需要多少积分`,COALESCE(NULLIF(i.description,''),'详见小屋商店') AS `商品说明`,i.item_sku AS `商品编号`
FROM cfg_items i
UNION ALL SELECT p.pet_name,'宠物伙伴',p.price_points,COALESCE(NULLIF(p.description,''),'详见小屋商店'),p.pet_sku FROM cfg_pets p;

CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_00_使用指南` AS
SELECT 1 AS `顺序`,'新手_01_账号总览' AS `看哪个入口`,'账号、积分和当前房间' AS `能看到什么`,'在小屋里修改和读档' AS `小提示`
UNION ALL SELECT 2,'新手_02_每层房间','楼层名字和保存时间','先找账号，再看楼层'
UNION ALL SELECT 3,'新手_03_房间存档','自动保存和手动存档','自动是现状，手动是旧档'
UNION ALL SELECT 4,'新手_04_房间家具','各层摆出的家具','只看当前摆放'
UNION ALL SELECT 5,'新手_05_家具仓库','已经拥有但还没摆出的家具','同一收藏可用于不同楼层'
UNION ALL SELECT 6,'新手_06_积分记录','购买、扩建和积分收支','未记录金额不等于免费'
UNION ALL SELECT 7,'新手_07_宠物伙伴','宠物种类和昵称','各层共用同一只伙伴'
UNION ALL SELECT 8,'新手_08_商品价格','中文商品和积分价格','价格是积分，不是人民币';

INSERT INTO sys_schema_migrations(version,description) VALUES('1.2.0','新增九个中文只读入门入口：指南、账号、楼层、存档、家具、仓库、积分、宠物和商品')
ON DUPLICATE KEY UPDATE description=VALUES(description);
