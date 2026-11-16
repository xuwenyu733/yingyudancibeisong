-- MySQL 8.0，只读查询，不需要管理员、不建表、不修改任何存档。
-- 第一张结果：每件兑换家具的独立编号和所在楼层；同款编号不同就是不同的一件。
-- 自带家具原本属于各层独立初始布置，继续在“新手_04_房间家具”中查看。
SELECT a.display_name AS `孩子昵称`, s.namespace AS `账号编号`,
       c.item_name AS `家具名称`, i.instance_id AS `这一件的编号`,
       CASE WHEN COUNT(f.furniture_id)=0 THEN '可从仓库取出'
            WHEN COUNT(f.furniture_id)>1 THEN '旧存档在多个楼层摆放'
            ELSE MAX(CASE WHEN f.furniture_id IS NOT NULL THEN r.room_name END) END AS `当前位置`,
       GROUP_CONCAT(DISTINCT CASE WHEN f.furniture_id IS NOT NULL THEN r.floor_no END ORDER BY r.floor_no) AS `所在楼层`
FROM sys_save_slots s
JOIN usr_accounts a ON a.account_key=s.namespace
JOIN JSON_TABLE(s.archive,'$.estate.bank.owned[*]'
     COLUMNS(instance_id VARCHAR(192) PATH '$')) i
JOIN cfg_items c ON c.item_sku=REGEXP_REPLACE(i.instance_id,'--copy-([2-9]|1[0-9]|20)$','')
LEFT JOIN room_floors r ON r.account_key=s.namespace
LEFT JOIN room_furniture f ON f.account_key=r.account_key AND f.room_id=r.room_id
     AND f.tier_level=r.current_tier AND f.furniture_id=CONCAT('shop-',i.instance_id)
WHERE c.item_kind IN ('furniture','wall')
GROUP BY s.namespace,a.display_name,c.item_name,i.instance_id
ORDER BY a.display_name,c.item_name,i.instance_id;

-- 第二张结果：同款家具一共拥有几件。产权表记录种类，这里从权威存档统计实际件数。
SELECT a.display_name AS `孩子昵称`,s.namespace AS `账号编号`,c.item_name AS `家具名称`,
       COUNT(*) AS `拥有件数`
FROM sys_save_slots s
JOIN usr_accounts a ON a.account_key=s.namespace
JOIN JSON_TABLE(s.archive,'$.estate.bank.owned[*]'
     COLUMNS(instance_id VARCHAR(192) PATH '$')) i
JOIN cfg_items c ON c.item_sku=REGEXP_REPLACE(i.instance_id,'--copy-([2-9]|1[0-9]|20)$','')
WHERE c.item_kind IN ('furniture','wall')
GROUP BY s.namespace,a.display_name,c.item_name
ORDER BY a.display_name,c.item_name;

-- 第三张结果：孩子收藏的家具组合。组合存于一楼附加记录，由两层共享。
SELECT a.display_name AS `孩子昵称`,r.account_key AS `账号编号`,g.group_name AS `组合名字`,
       JSON_LENGTH(g.items) AS `家具件数`,g.group_id AS `组合编号`
FROM room_extras r
JOIN usr_accounts a ON a.account_key=r.account_key
JOIN JSON_TABLE(IF(JSON_VALID(r.value_text),r.value_text,'{}'),'$.groups[*]'
     COLUMNS(group_id VARCHAR(64) PATH '$.id',group_name VARCHAR(100) PATH '$.name',items JSON PATH '$.items')) g
WHERE r.storage_key LIKE '%-furniture-groups-v1'
ORDER BY a.display_name,g.group_name;
