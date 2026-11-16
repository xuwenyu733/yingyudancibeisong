/** UTC epoch milliseconds, independent of the MySQL session/system time zone. */
export async function databaseNow(connection){
 const [rows]=await connection.query("SELECT TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', UTC_TIMESTAMP(3)) DIV 1000 AS now_ms");
 const value=Number(rows[0]?.now_ms);
 if(!Number.isSafeInteger(value)||value<=0)throw new Error('数据库时间读取失败，请稍后重试');
 return value;
}
