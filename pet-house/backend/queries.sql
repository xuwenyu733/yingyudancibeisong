-- 宠物小屋：常用查找。先改下面的账户键，再按需要选中一段运行。
USE pet_room;
SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET @account = 'hamster-room-layout-v3';

-- 1. 总览：有哪些账户，积分、楼层、等级与最近保存时间分别是什么？
SELECT * FROM v_account_overview ORDER BY `最近保存UTC` DESC;

-- 2. 表格导航：每张表干什么？每个字段是什么意思？
SELECT TABLE_NAME AS `表名`,TABLE_COMMENT AS `用途`,TABLE_ROWS AS `估算行数`
FROM information_schema.TABLES WHERE TABLE_SCHEMA='pet_room' AND TABLE_TYPE='BASE TABLE'
ORDER BY TABLE_NAME;
SELECT TABLE_NAME AS `表名`,ORDINAL_POSITION AS `字段顺序`,COLUMN_NAME AS `字段名`,
  COLUMN_TYPE AS `类型`,IS_NULLABLE AS `允许空值`,COLUMN_COMMENT AS `中文含义`
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='pet_room'
ORDER BY TABLE_NAME,ORDINAL_POSITION;

-- 3. 看某个账户全部楼层（floor_no从1开始，current_tier是面积档位从0开始）。
SELECT r.floor_no AS `楼层`,r.room_id AS `楼层ID`,r.room_name AS `楼层名`,
  t.tier_name AS `当前面积`,r.max_unlocked_tier AS `已解锁最大面积档`,
  r.wall_color AS `墙色`,r.flooring_sku AS `地板SKU`,r.theme AS `界面主题`,
  r.room_created_at AS `创建UTC`,r.room_id=u.active_room_id AS `当前所在`
FROM room_floors r JOIN usr_accounts u USING(account_key)
LEFT JOIN cfg_room_tiers t ON t.tier_level=r.current_tier
WHERE r.account_key=@account ORDER BY r.floor_no;

-- 4. 查某层当前摆放家具及坐标（换层时只改楼层数字）。
SELECT * FROM v_room_furniture_search
WHERE `账户键`=@account AND `当前布局`=1 AND `楼层`=1 ORDER BY `家具名称`;

-- 5. 按名称找家具，跨楼层搜索（布局中未摆过的默认坐标不会伪造成已保存坐标）。
SELECT * FROM v_room_furniture_search
WHERE `账户键`=@account AND `家具名称` LIKE '%书%' ORDER BY `楼层`,`面积档位`;
SELECT item_sku AS `物品SKU`,item_name AS `物品名`,item_kind AS `分类`,price_points AS `现目录价`
FROM cfg_items WHERE item_name LIKE '%书%' ORDER BY item_kind,item_sku;

-- 6. 每层仓库里收着什么？
SELECT * FROM v_room_storage_search WHERE `账户键`=@account ORDER BY `楼层`,`物品名称`;

-- 7. 已经拥有的家具和实际获得时间（NULL表示原档没有记时间）。
SELECT i.item_name AS `物品名`,o.item_sku AS `物品SKU`,o.ownership_kind AS `获得方式`,o.acquired_at AS `实际获得UTC`
FROM inv_ownership o JOIN cfg_items i USING(item_sku)
WHERE o.account_key=@account ORDER BY o.acquired_at IS NULL,o.acquired_at DESC,i.item_name;

-- 8. 共享积分和幂等回执。注意NULL金额表示源存档未记录，不表示0积分。
SELECT * FROM wallet_accounts WHERE account_key=@account;
SELECT * FROM v_wallet_receipt_search WHERE `账户键`=@account ORDER BY `范围`,`回执类型`,`来源顺序`;
SELECT * FROM usr_pending_rewards WHERE account_key=@account ORDER BY event_key;

-- 9. 主宠、已解锁伙伴和昵称设置。
SELECT p.pet_name AS `宠物品种`,o.pet_sku AS `品种SKU`,o.is_active AS `当前主宠`,o.acquired_at AS `实际获得UTC`
FROM pet_ownership o JOIN cfg_pets p USING(pet_sku) WHERE o.account_key=@account
ORDER BY o.is_active DESC,p.pet_name;
SELECT account_key AS `账户键`,pet_nickname AS `宠物昵称`,age_mode AS `适龄模式`,
  voice_language AS `语音语言`,voice_style AS `声线`,voice_enabled AS `语音开启`,
  sound_muted AS `静音`,sound_volume AS `音量档`,outfit_hat AS `帽子`,outfit_scarf AS `围巾`,outfit_backpack AS `背包`
FROM usr_settings WHERE account_key=@account;

-- 10. 书架的新书来自哪些原有学习事件？累计时长在汇总设置中，不能按事件倒推。
SELECT event_id AS `学习事件ID`,has_wallet_claim AS `已入钱包去重`,
  has_companion_record AS `已记入书架`,book_order AS `书架事件序号`
FROM learn_events WHERE account_key=@account ORDER BY book_order IS NULL,book_order,event_id;

-- 11. 签到日历、成就和等级徽章。
SELECT checkin_date AS `签到日期` FROM usr_checkins WHERE account_key=@account ORDER BY checkin_date DESC;
SELECT c.badge_name AS `徽章名`,c.badge_kind AS `类别`,b.unlocked_date AS `旧版解锁日期`,b.acquired_at AS `精确获得UTC`
FROM usr_badges b JOIN cfg_badges c USING(badge_id) WHERE b.account_key=@account
ORDER BY b.acquired_at IS NULL,b.acquired_at DESC,c.badge_kind,c.badge_name;

-- 12. 看各层墙画有几笔，再展开原始矢量笔画。
SELECT r.floor_no AS `楼层`,r.room_name AS `楼层名`,d.stroke_count AS `笔画数`,
  JSON_PRETTY(d.drawing_json) AS `矢量画作`
FROM room_drawings d JOIN room_floors r USING(account_key,room_id)
WHERE d.account_key=@account ORDER BY r.floor_no;

-- 13. 家具换色、贴纸、纹样、自定义手绘。
SELECT r.floor_no AS `楼层`,s.furniture_id AS `家具ID`,s.paint_color AS `HEX颜色`,
  s.sticker AS `贴纸`,s.doodle AS `预设涂鸦`,s.skin_id AS `成就纹样`,JSON_PRETTY(s.drawing_json) AS `家具手绘`
FROM room_styles s JOIN room_floors r USING(account_key,room_id)
WHERE s.account_key=@account ORDER BY r.floor_no,s.furniture_id;

-- 14. 定位某家具的每一个碰撞盒；用ID查找能避免中文重名。
SELECT c.* FROM room_colliders c JOIN room_floors r USING(account_key,room_id)
WHERE c.account_key=@account AND c.furniture_id='table' AND r.floor_no=1 ORDER BY c.tier_level,c.box_index;

-- 15. 礼物是否过期、从哪里来的？
SELECT reward_id AS `礼物ID`,reward_name AS `礼物名`,granted_at AS `实际获得UTC`,expires_at AS `到期UTC`,
  CASE WHEN expires_at IS NULL THEN '永久' WHEN expires_at>UTC_TIMESTAMP(3) THEN '有效' ELSE '已到期' END AS `有效性`
FROM pet_rewards WHERE account_key=@account ORDER BY granted_at DESC;
SELECT * FROM usr_memories WHERE account_key=@account ORDER BY acquired_at IS NULL,acquired_at DESC,memory_id;

-- 16. 精确定位备份、心愿和宿主附加设置。
SELECT r.floor_no AS `楼层`,x.storage_key AS `原始键`,x.value_text AS `原始值`
FROM room_extras x JOIN room_floors r USING(account_key,room_id)
WHERE x.account_key=@account ORDER BY r.floor_no,x.storage_key;
SELECT namespace AS `账户键`,JSON_KEYS(extras,'$.entries') AS `宿主原始键`,revision AS `修订号`
FROM sys_save_slots WHERE namespace=@account;

-- 17. 原样恢复所需的完整存档。不要直接编辑关系投影表改变游戏状态。
SELECT namespace AS `账户键`,revision AS `修订号`,archive_sha256 AS `SHA256`,
  JSON_PRETTY(archive) AS `完整权威存档`
FROM sys_save_slots WHERE namespace=@account;

-- 18. 自检：账户投影/共享钱包应齐全，且active_room_id必须可定位。
SELECT s.namespace AS `存档空间`,CASE WHEN u.account_key IS NULL THEN '缺少账户投影'
  WHEN w.account_key IS NULL THEN '缺少钱包投影' WHEN r.room_id IS NULL THEN '当前楼层失联' ELSE '正常' END AS `检查结果`
FROM sys_save_slots s LEFT JOIN usr_accounts u ON u.account_key=s.namespace
LEFT JOIN wallet_accounts w ON w.account_key=s.namespace
LEFT JOIN room_floors r ON r.account_key=u.account_key AND r.room_id=u.active_room_id;

-- 19. 每层独立世界与命名存档点：先改账户键和楼层ID；不直接改投影表恢复。
SELECT room_id AS `楼层ID`,save_kind AS `存档类型`,save_name AS `存档名称`,
  checkpoint_id AS `存档点ID`,world_revision AS `世界修订号`,saved_at AS `保存UTC`,
  JSON_PRETTY(snapshot_json) AS `本层独立装修`
FROM room_world_saves WHERE account_key=@account AND room_id='room-1'
ORDER BY save_kind,saved_at DESC;
