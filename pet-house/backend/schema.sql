-- 宠物小屋 MySQL 8.0：原始存档 + 可检索关系投影。运行前可先备份同名数据库。
-- 不 DROP 数据库/表；首次安装可重复运行。所有 DATETIME 均按 UTC 写入，业务日历使用 DATE。
CREATE DATABASE IF NOT EXISTS pet_room CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
USE pet_room;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS sys_schema_migrations (
  version VARCHAR(32) NOT NULL COMMENT '数据库迁移版本号',
  description VARCHAR(255) NOT NULL COMMENT '本次结构变更说明',
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '结构应用时刻，UTC',
  PRIMARY KEY (version)
) ENGINE=InnoDB COMMENT='系统：数据库结构版本记录';

CREATE TABLE IF NOT EXISTS sys_save_slots (
  namespace VARCHAR(160) NOT NULL COMMENT '存档空间唯一键，对应前端 storageKey；同名账户数据共用此键',
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '乐观锁修订号；0仅用于未提交初始化占位，首份完整提交为1，其后递增',
  archive JSON NOT NULL COMMENT '经现有项目校验的 pet-estate-save 完整存档；恢复的权威来源',
  extras JSON NULL COMMENT '宿主原始存储映射，结构为entries对象；保留完整备份与附加键值',
  archive_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '规范业务存档SHA-256，忽略每次导出的时刻',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '首次入库时刻，UTC',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '最近成功保存时刻，UTC',
  PRIMARY KEY (namespace),
  KEY idx_save_updated (updated_at),
  CONSTRAINT ck_save_revision CHECK (revision >= 0)
) ENGINE=InnoDB COMMENT='系统：每个账户的完整权威存档与修订锁；业务表由它同步投影';

CREATE TABLE IF NOT EXISTS cfg_items (
  item_sku VARCHAR(192) NOT NULL COMMENT '物品稳定编号；固有家具使用原id，商店和礼物使用sku',
  item_name VARCHAR(100) NOT NULL COMMENT '物品中文名称',
  item_kind VARCHAR(20) NOT NULL COMMENT '类型：builtin/furniture/flooring/wall/gift',
  price_points BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前目录标价，单位积分；不是历史成交价格',
  description VARCHAR(500) NOT NULL DEFAULT '' COMMENT '物品说明',
  source_module VARCHAR(120) NOT NULL COMMENT '项目目录来源模块，方便追溯',
  PRIMARY KEY (item_sku),
  KEY idx_item_kind_name (item_kind,item_name)
) ENGINE=InnoDB COMMENT='目录：商店、固有家具和动态礼物的可读物品索引';

CREATE TABLE IF NOT EXISTS cfg_pets (
  pet_sku VARCHAR(64) NOT NULL COMMENT '宠物品种稳定编号',
  pet_name VARCHAR(100) NOT NULL COMMENT '品种中文名称',
  price_points BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前兑换积分标价',
  description VARCHAR(500) NOT NULL DEFAULT '' COMMENT '品种说明',
  model_module VARCHAR(120) NOT NULL COMMENT '程序模型入口模块路径',
  PRIMARY KEY (pet_sku)
) ENGINE=InnoDB COMMENT='目录：原创宠物品种及模型入口';

CREATE TABLE IF NOT EXISTS cfg_badges (
  badge_id VARCHAR(64) NOT NULL COMMENT '成就或等级徽章的稳定编号',
  badge_name VARCHAR(100) NOT NULL COMMENT '徽章中文名称',
  badge_kind VARCHAR(20) NOT NULL COMMENT 'achievement成就或level等级徽章',
  category VARCHAR(32) NOT NULL COMMENT '签到/学习/等级/成长等原始分类编码',
  description VARCHAR(500) NOT NULL DEFAULT '' COMMENT '解锁说明',
  min_level TINYINT UNSIGNED NULL COMMENT '等级徽章所需最低等级；一般成就为NULL',
  PRIMARY KEY (badge_id),
  KEY idx_badge_kind (badge_kind,category)
) ENGINE=InnoDB COMMENT='目录：成就徽章与等级徽章';

CREATE TABLE IF NOT EXISTS cfg_room_tiers (
  tier_level TINYINT UNSIGNED NOT NULL COMMENT '房间面积档位，原始编码从0开始；与楼层序号不同',
  tier_name VARCHAR(64) NOT NULL COMMENT '面积档位中文名称',
  width_m DECIMAL(8,3) NOT NULL COMMENT '房间宽度，米',
  depth_m DECIMAL(8,3) NOT NULL COMMENT '房间深度，米',
  price_points BIGINT UNSIGNED NOT NULL COMMENT '解锁此面积档位的当前目录积分',
  PRIMARY KEY (tier_level)
) ENGINE=InnoDB COMMENT='目录：房间面积扩建档位；楼层上限另由应用控制';

CREATE TABLE IF NOT EXISTS usr_accounts (
  account_key VARCHAR(160) NOT NULL COMMENT '账户可读唯一键，等于存档 namespace/storageKey',
  display_name VARCHAR(40) NOT NULL DEFAULT '' COMMENT '主人昵称，来自 profile.name',
  gender VARCHAR(8) NOT NULL DEFAULT 'none' COMMENT '头像性别选择：none/male/female',
  avatar_data_url MEDIUMTEXT NULL COMMENT '原存档头像栅格data URL；没有头像为NULL',
  level TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '个人主页等级，1至20',
  xp BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '累计经验',
  study_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '个人主页累计学习秒数',
  last_checkin DATE NULL COMMENT '最近签到业务日期；不附会具体时刻',
  streak_days INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '连续签到天数',
  total_checkins INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '累计签到次数',
  makeup_month CHAR(7) NULL COMMENT '补签计数所属月份，YYYY-MM',
  makeup_count TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '该月补签次数',
  active_room_id VARCHAR(16) NOT NULL COMMENT '当前打开的楼层id，由应用校验必须存在',
  estate_mode VARCHAR(16) NOT NULL DEFAULT 'castle' COMMENT '房屋展示模式，当前为castle',
  archive_exported_at DATETIME(3) NULL COMMENT '来源存档的导出时刻，UTC；不是账户创建时间',
  projected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '本次关系表投影时刻，UTC',
  PRIMARY KEY (account_key),
  KEY idx_user_name (display_name),
  CONSTRAINT ck_user_level CHECK (level BETWEEN 1 AND 20)
) ENGINE=InnoDB COMMENT='账户：主人资料与进度；每个存档空间一行';

CREATE TABLE IF NOT EXISTS usr_settings (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  pet_nickname VARCHAR(12) NOT NULL COMMENT '主宠昵称，不是品种名称',
  age_mode VARCHAR(20) NOT NULL COMMENT 'UI密度：kindergarten幼儿园/primary小学',
  sound_muted BOOLEAN NOT NULL COMMENT '是否全局静音',
  sound_volume VARCHAR(12) NOT NULL COMMENT '音量档位：quiet/standard/loud',
  voice_enabled BOOLEAN NOT NULL COMMENT '是否启用本地昵称TTS',
  voice_language VARCHAR(16) NOT NULL COMMENT '语音语言：zh-CN/en-US/ja-JP',
  voice_style VARCHAR(16) NOT NULL COMMENT '声线：gentle/bright',
  outfit_hat VARCHAR(20) NOT NULL COMMENT '帽子样式编号',
  outfit_scarf VARCHAR(20) NOT NULL COMMENT '围巾样式编号',
  outfit_backpack VARCHAR(20) NOT NULL COMMENT '背包样式编号',
  night_mode BOOLEAN NOT NULL COMMENT '是否启用夜间彩蛋',
  surprises_enabled BOOLEAN NOT NULL COMMENT '是否启用回访惊喜',
  tutorial_done BOOLEAN NOT NULL COMMENT '装修引导是否完成',
  companion_learning_seconds BIGINT UNSIGNED NOT NULL COMMENT '伙伴累计学习秒数，用于花园与成长',
  first_visit_at DATETIME(3) NULL COMMENT '首访时刻，UTC；未知为NULL',
  last_visit_at DATETIME(3) NULL COMMENT '最近访问时刻，UTC',
  last_interaction_at DATETIME(3) NULL COMMENT '最近交互时刻，UTC',
  last_gift_day DATE NULL COMMENT '最近回访礼物业务日期',
  PRIMARY KEY (account_key),
  CONSTRAINT fk_settings_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE,
  CONSTRAINT ck_settings_age CHECK (age_mode IN ('kindergarten','primary'))
) ENGINE=InnoDB COMMENT='账户：跨楼层共享的伙伴、适龄、语音和声音设置';

CREATE TABLE IF NOT EXISTS wallet_accounts (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键；同一账户所有楼层共用一行',
  balance_points BIGINT UNSIGNED NOT NULL COMMENT '当前可用积分余额，以完整账本为准',
  total_spent_points BIGINT UNSIGNED NOT NULL COMMENT '原账本累计购买与扩建消费，不等同全部spend回执之和',
  PRIMARY KEY (account_key),
  CONSTRAINT fk_wallet_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='积分：所有楼层共用的钱包汇总，禁止按楼层重复累计';

CREATE TABLE IF NOT EXISTS room_floors (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  room_id VARCHAR(16) NOT NULL COMMENT '原始楼层稳定id，如room-1',
  floor_no TINYINT UNSIGNED NOT NULL COMMENT '对人显示的楼层，从1开始；源floor加1',
  room_name VARCHAR(18) NOT NULL COMMENT '楼层中文名称',
  template_key VARCHAR(16) NOT NULL COMMENT '模板编码：cream/mint/candy',
  room_created_at DATETIME(3) NOT NULL COMMENT '楼层创建时刻，来自原存档，UTC',
  current_tier TINYINT UNSIGNED NOT NULL COMMENT '当前使用的面积档位，从0开始',
  max_unlocked_tier TINYINT UNSIGNED NOT NULL COMMENT '已付分解锁的最高面积档位',
  theme VARCHAR(16) NOT NULL COMMENT '本层界面主题：light/eye-care/candy',
  wall_color VARCHAR(16) NOT NULL COMMENT '本层墙色编码或六位HEX颜色',
  flooring_sku VARCHAR(192) NULL COMMENT '本层地面材料sku；NULL表示默认地板',
  PRIMARY KEY (account_key,room_id),
  UNIQUE KEY uq_floor_number (account_key,floor_no),
  KEY idx_room_name (room_name),
  CONSTRAINT fk_room_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE,
  CONSTRAINT fk_room_tier FOREIGN KEY (current_tier) REFERENCES cfg_room_tiers(tier_level),
  CONSTRAINT fk_room_max_tier FOREIGN KEY (max_unlocked_tier) REFERENCES cfg_room_tiers(tier_level),
  CONSTRAINT ck_floor_legacy CHECK (floor_no BETWEEN 1 AND 6),
  CONSTRAINT ck_room_unlocked CHECK (max_unlocked_tier >= current_tier)
) ENGINE=InnoDB COMMENT='楼层：每层的名称、面积、墙色与主题；新建最多4层，兼容旧版5/6层';

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

CREATE TABLE IF NOT EXISTS room_layouts (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  room_id VARCHAR(16) NOT NULL COMMENT '所属楼层id',
  tier_level TINYINT UNSIGNED NOT NULL COMMENT '此布局对应的面积档位',
  layout_version SMALLINT UNSIGNED NOT NULL COMMENT '原始布局版本，当前为3',
  is_current BOOLEAN NOT NULL COMMENT '是否是该层当前使用的面积档位布局',
  lamp_support_id VARCHAR(192) NULL COMMENT '台灯支撑家具id；NULL表示没有绑定',
  PRIMARY KEY (account_key,room_id,tier_level),
  CONSTRAINT fk_layout_room FOREIGN KEY (account_key,room_id) REFERENCES room_floors(account_key,room_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='装修：各楼层、各面积档位分别保存的布局槽位';

CREATE TABLE IF NOT EXISTS room_furniture (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  room_id VARCHAR(16) NOT NULL COMMENT '所属楼层id',
  tier_level TINYINT UNSIGNED NOT NULL COMMENT '所属面积档位布局',
  furniture_id VARCHAR(192) NOT NULL COMMENT '场景家具实例id，如table或shop-reading-shelf',
  item_sku VARCHAR(192) NULL COMMENT '对应物品目录sku；无法识别的历史实例保留NULL',
  instance_label VARCHAR(100) NOT NULL DEFAULT '' COMMENT '碰撞定义中的可读家具名',
  pos_x DOUBLE NOT NULL COMMENT '位置X，米',
  pos_y DOUBLE NOT NULL COMMENT '位置Y，米',
  pos_z DOUBLE NOT NULL COMMENT '位置Z，米',
  rot_x DOUBLE NOT NULL COMMENT '旋转X，弧度；正常值为0',
  rot_y DOUBLE NOT NULL COMMENT '旋转Y，弧度',
  rot_z DOUBLE NOT NULL COMMENT '旋转Z，弧度；正常值为0',
  scale_x DOUBLE NOT NULL COMMENT 'X轴缩放倍数',
  scale_y DOUBLE NOT NULL COMMENT 'Y轴缩放倍数',
  scale_z DOUBLE NOT NULL COMMENT 'Z轴缩放倍数',
  blocks_navigation BOOLEAN NOT NULL DEFAULT TRUE COMMENT '此家具是否阻挡宠物路径',
  blocks_placement BOOLEAN NOT NULL DEFAULT TRUE COMMENT '此家具是否阻挡家具摆放',
  draggable BOOLEAN NOT NULL DEFAULT TRUE COMMENT '此家具是否允许装修拖动',
  PRIMARY KEY (account_key,room_id,tier_level,furniture_id),
  KEY idx_furniture_sku (item_sku),
  CONSTRAINT fk_furniture_layout FOREIGN KEY (account_key,room_id,tier_level) REFERENCES room_layouts(account_key,room_id,tier_level) ON DELETE CASCADE,
  CONSTRAINT fk_furniture_item FOREIGN KEY (item_sku) REFERENCES cfg_items(item_sku)
) ENGINE=InnoDB COMMENT='装修：每件已保存家具的独立位置、旋转、缩放与碰撞开关';

CREATE TABLE IF NOT EXISTS room_colliders (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  room_id VARCHAR(16) NOT NULL COMMENT '所属楼层id',
  tier_level TINYINT UNSIGNED NOT NULL COMMENT '所属面积档位布局',
  furniture_id VARCHAR(192) NOT NULL COMMENT '所属场景家具id',
  box_index SMALLINT UNSIGNED NOT NULL COMMENT '家具内部碰撞盒序号，从0开始',
  center_x DOUBLE NOT NULL COMMENT '局部碰撞盒中心X，米',
  center_y DOUBLE NOT NULL COMMENT '局部碰撞盒中心Y，米',
  center_z DOUBLE NOT NULL COMMENT '局部碰撞盒中心Z，米',
  size_x DOUBLE NOT NULL COMMENT '局部碰撞盒宽X，米',
  size_y DOUBLE NOT NULL COMMENT '局部碰撞盒高Y，米',
  size_z DOUBLE NOT NULL COMMENT '局部碰撞盒深Z，米',
  PRIMARY KEY (account_key,room_id,tier_level,furniture_id,box_index),
  CONSTRAINT fk_collider_furniture FOREIGN KEY (account_key,room_id,tier_level,furniture_id) REFERENCES room_furniture(account_key,room_id,tier_level,furniture_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='装修：按家具和序号拆开的显式碰撞盒';

CREATE TABLE IF NOT EXISTS inv_ownership (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  item_sku VARCHAR(192) NOT NULL COMMENT '全局已拥有物品sku，包括免费固有家具',
  ownership_kind VARCHAR(16) NOT NULL COMMENT 'builtin固有、purchased兑换或gift礼物；不推断历史付款金额',
  acquired_at DATETIME(3) NULL COMMENT '从伙伴记忆找到的真实获得时刻；旧档未知为NULL',
  PRIMARY KEY (account_key,item_sku),
  CONSTRAINT fk_ownership_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE,
  CONSTRAINT fk_ownership_item FOREIGN KEY (item_sku) REFERENCES cfg_items(item_sku)
) ENGINE=InnoDB COMMENT='仓库：全楼层共享的物品所有权，不把每层摆放重复算作购买';

CREATE TABLE IF NOT EXISTS inv_room_storage (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  room_id VARCHAR(16) NOT NULL COMMENT '所属楼层id',
  item_sku VARCHAR(192) NOT NULL COMMENT '在本层仓库中、尚未摆放的物品sku',
  PRIMARY KEY (account_key,room_id,item_sku),
  KEY idx_storage_item (account_key,item_sku),
  CONSTRAINT fk_storage_room FOREIGN KEY (account_key,room_id) REFERENCES room_floors(account_key,room_id) ON DELETE CASCADE,
  CONSTRAINT fk_storage_ownership FOREIGN KEY (account_key,item_sku) REFERENCES inv_ownership(account_key,item_sku) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='仓库：逐层记录哪些已拥有物品处于收纳状态';

CREATE TABLE IF NOT EXISTS room_styles (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  room_id VARCHAR(16) NOT NULL COMMENT '所属楼层id',
  furniture_id VARCHAR(192) NOT NULL COMMENT '家具实例id；收仓后也可保留创作',
  paint_color CHAR(7) NULL COMMENT '家具HEX颜色；NULL表示未设置',
  sticker VARCHAR(16) NULL COMMENT '贴纸编码',
  doodle VARCHAR(16) NULL COMMENT '预设涂鸦编码',
  achievement_skin BOOLEAN NULL COMMENT '是否启用旧版成就皮肤开关',
  skin_id VARCHAR(64) NULL COMMENT '具体成就纹样id',
  drawing_json JSON NULL COMMENT '此家具的矢量手绘：version与strokes；不存执行代码',
  PRIMARY KEY (account_key,room_id,furniture_id),
  CONSTRAINT fk_style_room FOREIGN KEY (account_key,room_id) REFERENCES room_floors(account_key,room_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='装修：逐件家具的颜色、贴纸、成就纹样及自由手绘';

CREATE TABLE IF NOT EXISTS room_drawings (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  room_id VARCHAR(16) NOT NULL COMMENT '所属楼层id',
  drawing_json JSON NOT NULL COMMENT '本层涂鸦墙矢量画作，含version与strokes',
  stroke_count SMALLINT UNSIGNED NOT NULL COMMENT '画作笔画数，便于直接检索',
  PRIMARY KEY (account_key,room_id),
  CONSTRAINT fk_drawing_room FOREIGN KEY (account_key,room_id) REFERENCES room_floors(account_key,room_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='装修：每层独立的涂鸦墙画作';

CREATE TABLE IF NOT EXISTS room_extras (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  room_id VARCHAR(16) NOT NULL COMMENT '所属楼层id',
  storage_key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '原始存储键UTF-8的SHA-256；用于长键精确索引',
  storage_key MEDIUMTEXT NOT NULL COMMENT '完整原始附加存储键，例如心愿目标或UI设置；不截断历史长键',
  value_text MEDIUMTEXT NULL COMMENT '原始字符串值；不强迫未知宿主格式转JSON',
  PRIMARY KEY (account_key,room_id,storage_key_hash),
  CONSTRAINT fk_extra_room FOREIGN KEY (account_key,room_id) REFERENCES room_floors(account_key,room_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='装修：按楼层保留宿主附加设置，原键可直接搜索';

CREATE TABLE IF NOT EXISTS pet_ownership (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  pet_sku VARCHAR(64) NOT NULL COMMENT '已经解锁的宠物品种sku',
  is_active BOOLEAN NOT NULL COMMENT '是否为当前主宠',
  acquired_at DATETIME(3) NULL COMMENT '原存档记录的宠物获得时刻；未知为NULL',
  PRIMARY KEY (account_key,pet_sku),
  CONSTRAINT fk_pet_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE,
  CONSTRAINT fk_pet_catalog FOREIGN KEY (pet_sku) REFERENCES cfg_pets(pet_sku)
) ENGINE=InnoDB COMMENT='宠物：解锁品种和当前主宠；临时来访兔子的坐标不作为持久化数据';

CREATE TABLE IF NOT EXISTS pet_rewards (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  reward_id VARCHAR(192) NOT NULL COMMENT '礼物事件稳定编号',
  reward_name VARCHAR(30) NOT NULL COMMENT '礼物中文名称',
  reward_kind VARCHAR(16) NOT NULL COMMENT '礼物形态：star/pumpkin/lantern/flower',
  item_sku VARCHAR(192) NULL COMMENT '能转换为独立家具的礼物sku',
  granted_at DATETIME(3) NULL COMMENT '礼物实际获得时刻，UTC',
  expires_at DATETIME(3) NULL COMMENT '限时礼物到期时刻，UTC；永久为NULL',
  PRIMARY KEY (account_key,reward_id),
  KEY idx_reward_expiration (expires_at),
  CONSTRAINT fk_reward_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='宠物：回访、签到、口令等礼物及有效期';

CREATE TABLE IF NOT EXISTS usr_memories (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  memory_id VARCHAR(192) NOT NULL COMMENT '家具、宠物或礼物记忆原始键',
  acquired_at DATETIME(3) NULL COMMENT '原始获得时刻，UTC；升级前未知时间仍为NULL',
  acquired_by VARCHAR(20) NOT NULL COMMENT '获得人称呼',
  source_text VARCHAR(40) NOT NULL COMMENT '获得来源原文',
  PRIMARY KEY (account_key,memory_id),
  KEY idx_memory_acquired (account_key,acquired_at),
  CONSTRAINT fk_memory_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='账户：物品获得时间与来源记忆，不编造缺失时间';

CREATE TABLE IF NOT EXISTS usr_checkins (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  checkin_date DATE NOT NULL COMMENT '实际签到业务日，保留原日历日期',
  PRIMARY KEY (account_key,checkin_date),
  KEY idx_checkin_date (checkin_date),
  CONSTRAINT fk_checkin_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='账户：逐日签到历史；补签方式原存档未逐日记录，不推断';

CREATE TABLE IF NOT EXISTS usr_visits (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  visit_date DATE NOT NULL COMMENT '伙伴手册中记录的访问业务日',
  PRIMARY KEY (account_key,visit_date),
  CONSTRAINT fk_visit_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='账户：伙伴访问日期，用于成长天数';

CREATE TABLE IF NOT EXISTS usr_badges (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  badge_id VARCHAR(64) NOT NULL COMMENT '已解锁成就或等级徽章id',
  unlocked_date DATE NULL COMMENT '旧版只记录的解锁日期；未知为NULL',
  acquired_at DATETIME(3) NULL COMMENT '精确获得时刻，UTC；未记录时不由日期推算',
  PRIMARY KEY (account_key,badge_id),
  CONSTRAINT fk_badge_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE,
  CONSTRAINT fk_badge_catalog FOREIGN KEY (badge_id) REFERENCES cfg_badges(badge_id)
) ENGINE=InnoDB COMMENT='账户：已获得徽章与真实时间精度';

CREATE TABLE IF NOT EXISTS usr_pending_rewards (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  event_key VARCHAR(160) NOT NULL COMMENT '待补入钱包的幂等奖励事件键',
  points BIGINT UNSIGNED NOT NULL COMMENT '等待结算的积分；尚未计入可用余额',
  PRIMARY KEY (account_key,event_key),
  CONSTRAINT fk_pending_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='积分：个人主页等待钱包入账的补偿队列';

CREATE TABLE IF NOT EXISTS learn_events (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  event_id VARCHAR(160) NOT NULL COMMENT '原有宿主学习事件唯一键；同一键只记一行',
  has_wallet_claim BOOLEAN NOT NULL COMMENT '是否出现在共享钱包学习去重列表',
  has_companion_record BOOLEAN NOT NULL COMMENT '是否出现在伙伴学习/书架列表',
  book_order INT UNSIGNED NULL COMMENT '在伙伴learningEvents中的序号，从0开始；无记录为NULL',
  PRIMARY KEY (account_key,event_id),
  KEY idx_learning_books (account_key,has_companion_record,book_order),
  CONSTRAINT fk_learning_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='学习：原有宿主事件去重及书架来源；不包含已移除的学习乐园题库';

CREATE TABLE IF NOT EXISTS learn_checkin_milestones (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  milestone_id VARCHAR(192) NOT NULL COMMENT '签到礼物里程碑去重键，如2026-10-7',
  PRIMARY KEY (account_key,milestone_id),
  CONSTRAINT fk_milestone_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='学习：签到阶段礼物的防重复领取记录';

CREATE TABLE IF NOT EXISTS wallet_receipts (
  account_key VARCHAR(160) NOT NULL COMMENT '所属账户键',
  scope_room_id VARCHAR(16) NOT NULL DEFAULT '' COMMENT '所属楼层id；空字符串表示共享钱包范围',
  receipt_kind VARCHAR(16) NOT NULL COMMENT '回执类别：request/reward/spend',
  receipt_id VARCHAR(160) NOT NULL COMMENT '原始requestId或eventId；保留幂等键',
  operation VARCHAR(32) NOT NULL COMMENT '原始操作编码，如purchase/expand/store/reward/spend',
  related_sku VARCHAR(192) NULL COMMENT '相关物品或宠物sku，按operation解释',
  related_level TINYINT UNSIGNED NULL COMMENT '扩建或切房对应面积档位',
  points_delta BIGINT NULL COMMENT '原记录明确记载的积分变动，收入正数支出负数；无金额为NULL',
  source_order INT UNSIGNED NOT NULL COMMENT '在来源列表中的顺序，从0开始；不代表发生时刻',
  details_json JSON NOT NULL COMMENT '此条原始回执，保留完整字段',
  PRIMARY KEY (account_key,scope_room_id,receipt_kind,receipt_id),
  KEY idx_receipt_operation (account_key,operation),
  KEY idx_receipt_sku (related_sku),
  CONSTRAINT fk_receipt_user FOREIGN KEY (account_key) REFERENCES usr_accounts(account_key) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='积分：共享及各层幂等交易/奖励/扣减回执；历史金额缺失不会用目录价伪造';

CREATE OR REPLACE VIEW v_account_overview AS
SELECT u.account_key AS `账户键`,u.display_name AS `主人昵称`,u.level AS `等级`,u.xp AS `经验`,
  w.balance_points AS `共享积分`,w.total_spent_points AS `累计购买扩建消费`,
  s.pet_nickname AS `宠物昵称`,s.age_mode AS `适龄模式`,u.active_room_id AS `当前楼层ID`,
  (SELECT COUNT(*) FROM room_floors r WHERE r.account_key=u.account_key) AS `楼层数量`,
  u.study_seconds AS `主页学习秒数`,s.companion_learning_seconds AS `伙伴学习秒数`,
  ss.revision AS `存档修订号`,ss.updated_at AS `最近保存UTC`
FROM usr_accounts u LEFT JOIN wallet_accounts w USING(account_key)
LEFT JOIN usr_settings s USING(account_key) LEFT JOIN sys_save_slots ss ON ss.namespace=u.account_key;

CREATE OR REPLACE VIEW v_room_furniture_search AS
SELECT f.account_key AS `账户键`,r.floor_no AS `楼层`,r.room_name AS `楼层名`,t.tier_name AS `面积档位`,
  l.is_current AS `当前布局`,f.furniture_id AS `家具ID`,f.item_sku AS `物品SKU`,
  COALESCE(i.item_name,NULLIF(f.instance_label,''),f.furniture_id) AS `家具名称`,
  f.pos_x AS `位置X米`,f.pos_y AS `位置Y米`,f.pos_z AS `位置Z米`,f.rot_y AS `朝向弧度`,
  f.scale_x AS `缩放X`,f.scale_y AS `缩放Y`,f.scale_z AS `缩放Z`
FROM room_furniture f JOIN room_floors r USING(account_key,room_id)
JOIN room_layouts l USING(account_key,room_id,tier_level)
LEFT JOIN cfg_room_tiers t ON t.tier_level=f.tier_level LEFT JOIN cfg_items i ON i.item_sku=f.item_sku;

CREATE OR REPLACE VIEW v_room_storage_search AS
SELECT s.account_key AS `账户键`,r.floor_no AS `楼层`,r.room_name AS `楼层名`,s.item_sku AS `物品SKU`,
  i.item_name AS `物品名称`,i.item_kind AS `物品类型`,o.ownership_kind AS `获得方式`,o.acquired_at AS `真实获得UTC`
FROM inv_room_storage s JOIN room_floors r USING(account_key,room_id)
JOIN cfg_items i USING(item_sku) JOIN inv_ownership o USING(account_key,item_sku);

CREATE OR REPLACE VIEW v_wallet_receipt_search AS
SELECT w.account_key AS `账户键`,CASE WHEN w.scope_room_id='' THEN '所有楼层共用' ELSE r.room_name END AS `范围`,
  w.receipt_kind AS `回执类型`,w.receipt_id AS `事件唯一键`,w.operation AS `操作编码`,w.related_sku AS `相关SKU`,
  COALESCE(i.item_name,p.pet_name,w.related_sku) AS `相关名称`,w.related_level AS `面积档位`,
  w.points_delta AS `已知积分变动`,w.source_order AS `来源顺序`
FROM wallet_receipts w LEFT JOIN room_floors r ON r.account_key=w.account_key AND r.room_id=w.scope_room_id
LEFT JOIN cfg_items i ON i.item_sku=w.related_sku LEFT JOIN cfg_pets p ON p.pet_sku=w.related_sku;

INSERT INTO sys_schema_migrations(version,description) VALUES('1.0.0','首版：完整存档与账户、楼层、装修、宠物、积分及原有学习的中文可检索投影')
ON DUPLICATE KEY UPDATE description=VALUES(description);
INSERT INTO sys_schema_migrations(version,description) VALUES('1.0.1','使用NO PAD排序精确保留尾空格事件ID；附加存储键使用完整文本加SHA256索引')
ON DUPLICATE KEY UPDATE description=VALUES(description);
INSERT INTO sys_schema_migrations(version,description) VALUES('1.1.0','每层独立世界及最多五个命名存档点：当前装修和本层快照的可检索投影')
ON DUPLICATE KEY UPDATE description=VALUES(description);

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

-- 联网好友迁移 1.3.0
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

-- 免登录升级 1.3.1
-- Automatic house identities: no password, login or registration interface.
USE pet_room;
ALTER TABLE social_accounts
 MODIFY password_salt VARCHAR(64) CHARACTER SET ascii NULL COMMENT '旧版密码盐；免登录小屋不使用，保留兼容旧数据',
 MODIFY password_hash VARCHAR(128) CHARACTER SET ascii NULL COMMENT '旧版密码摘要；免登录小屋不使用，保留兼容旧数据';
INSERT INTO sys_schema_migrations(version,description) VALUES('1.3.1','删除登录注册入口，自动生成小屋ID，以浏览器私有凭据识别自己的小屋')
ON DUPLICATE KEY UPDATE description=VALUES(description);

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
