-- Add a human-readable inspection entry. Existing life JSON is upgraded lazily by the service.
-- No table rebuild, archive rewriting, account reset or learning-module changes.
CREATE OR REPLACE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER VIEW `新手_16_创作与伙伴纪念` AS
 SELECT a.public_id AS `用户ID`,a.display_name AS `孩子昵称`,
 CASE JSON_UNQUOTE(JSON_EXTRACT(l.state,'$.adventures.focus'))
  WHEN 'forest' THEN '森林阅读角' WHEN 'space' THEN '我的星空基地'
  WHEN 'ocean' THEN '海边小画室' WHEN 'tea' THEN '从花园到餐桌' ELSE '第一间温暖小屋' END AS `正在创作`,
 COALESCE(JSON_LENGTH(JSON_EXTRACT(l.state,'$.adventures.completed')),0) AS `已完成创作数`,
 COALESCE(JSON_LENGTH(JSON_EXTRACT(l.state,'$.adventures.stamps')),0) AS `已收藏印章数`,
 COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(l.state,'$.adventures.pet.meals')) AS UNSIGNED),0) AS `分享料理次数`,
 COALESCE(JSON_LENGTH(JSON_EXTRACT(l.state,'$.adventures.pet.recipes')),0) AS `伙伴尝过几种料理`,
 COALESCE(JSON_LENGTH(JSON_EXTRACT(l.state,'$.cookedRecipes')),0) AS `做过几种料理`,
 COALESCE(JSON_EXTRACT(l.state,'$.adventures.completed'),JSON_OBJECT()) AS `创作完成楼层与时间`,
 l.updated_at AS `最后更新UTC`,l.account_key AS `账号编号`
 FROM room_life_accounts l JOIN social_accounts a USING(account_key);
INSERT INTO sys_schema_migrations(version,description) VALUES('1.6.1','创作目标、真实料理分享与成长印章的中文查询入口；不重置旧存档') ON DUPLICATE KEY UPDATE description=VALUES(description);
