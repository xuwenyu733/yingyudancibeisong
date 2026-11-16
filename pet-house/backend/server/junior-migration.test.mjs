import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrateJuniorStyle} from './migrate-junior-style.mjs';
test('junior upgrade requires explicit admin configuration',async()=>{
 let called=false;await assert.rejects(migrateJuniorStyle({env:{},connect:async()=>{called=true;}}),/ADMIN_CONFIG/);assert.equal(called,false);
});
test('fresh and upgrade schemas allow junior and migration never rewrites user data',async()=>{
 const sql=await readFile(new URL('../migrations/1.6.2-junior-style.sql',import.meta.url),'utf8'),schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
 assert.match(schema,/CHECK \(age_mode IN \('kindergarten','primary','junior'\)\)/);
 assert.match(sql,/information_schema.TABLE_CONSTRAINTS/);assert.match(sql,/ON DUPLICATE KEY UPDATE/);
 assert.equal(/(?:DELETE FROM|TRUNCATE|DROP TABLE|UPDATE usr_|UPDATE sys_save_slots)/i.test(sql),false);
});
