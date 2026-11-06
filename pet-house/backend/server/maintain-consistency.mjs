// 只读数据一致性检查：找出孤儿存档与缺失投影。
// 用途：sys_save_slots 与 social_accounts 之间未设外键（免登录/本地存档可合法存在），
// 此脚本用于运维发现“有存档但没有社交账号”或“有投影但没有存档”的异常行，辅助人工清理。
// 运行方式：node server/maintain-consistency.mjs（需要应用账户或管理员连接配置与口令）。
import mysql from 'mysql2/promise';
import {loadConfig,connectionOptions} from './config.mjs';

let connection;
try {
  const config = await loadConfig();
  connection = await mysql.createConnection({...connectionOptions(config), connectTimeout: 5000});
  const [slotCount] = await connection.execute('SELECT COUNT(*) n FROM sys_save_slots');
  const [accountCount] = await connection.execute('SELECT COUNT(*) n FROM social_accounts');
  const [projectionCount] = await connection.execute('SELECT COUNT(*) n FROM usr_accounts');
  const [orphanSlots] = await connection.execute(
    'SELECT s.namespace, s.updated_at FROM sys_save_slots s LEFT JOIN social_accounts a ON a.account_key=s.namespace WHERE a.account_key IS NULL ORDER BY s.updated_at DESC LIMIT 100'
  );
  const [orphanAccounts] = await connection.execute(
    'SELECT u.account_key, u.updated_at FROM usr_accounts u LEFT JOIN sys_save_slots s ON s.namespace=u.account_key WHERE s.namespace IS NULL ORDER BY u.updated_at DESC LIMIT 100'
  );
  console.log(JSON.stringify({
    ok: true,
    counts: {saveSlots: Number(slotCount[0].n), socialAccounts: Number(accountCount[0].n), projections: Number(projectionCount[0].n)},
    orphanSaveSlots: orphanSlots.map(row => ({namespace: row.namespace, updatedAt: row.updated_at})),
    orphanProjections: orphanAccounts.map(row => ({accountKey: row.account_key, updatedAt: row.updated_at})),
  }, null, 2));
} catch (error) {
  console.error(error.code ? ('一致性检查失败：' + error.code) : error.message);
  process.exitCode = 1;
} finally {
  await connection?.end();
}
