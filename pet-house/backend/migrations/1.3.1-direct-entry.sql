-- Automatic house identities: no password, login or registration interface.
USE pet_room;
ALTER TABLE social_accounts
 MODIFY password_salt VARCHAR(64) CHARACTER SET ascii NULL COMMENT '旧版密码盐；免登录小屋不使用，保留兼容旧数据',
 MODIFY password_hash VARCHAR(128) CHARACTER SET ascii NULL COMMENT '旧版密码摘要；免登录小屋不使用，保留兼容旧数据';
INSERT INTO sys_schema_migrations(version,description) VALUES('1.3.1','删除登录注册入口，自动生成小屋ID，以浏览器私有凭据识别自己的小屋')
ON DUPLICATE KEY UPDATE description=VALUES(description);
