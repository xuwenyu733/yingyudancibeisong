-- Extends the settings constraint only. Existing settings and archives are preserved.
SET @room_age_check_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='usr_settings' AND CONSTRAINT_NAME='ck_settings_age' AND CONSTRAINT_TYPE='CHECK');
SET @room_age_ddl = IF(@room_age_check_exists > 0,
 'ALTER TABLE usr_settings DROP CHECK ck_settings_age, ADD CONSTRAINT ck_settings_age CHECK (age_mode IN (''kindergarten'',''primary'',''junior''))',
 'ALTER TABLE usr_settings ADD CONSTRAINT ck_settings_age CHECK (age_mode IN (''kindergarten'',''primary'',''junior''))');
PREPARE room_age_migration FROM @room_age_ddl;
EXECUTE room_age_migration;
DEALLOCATE PREPARE room_age_migration;
ALTER TABLE usr_settings MODIFY age_mode VARCHAR(20) NOT NULL COMMENT 'UI密度：kindergarten幼儿园/primary小学/junior初中';
INSERT INTO sys_schema_migrations(version,description) VALUES('1.6.2','初中简洁创作模式；仅扩展适龄模式约束，保留已有存档')
 ON DUPLICATE KEY UPDATE description=VALUES(description);
