import {setTimeout as delay} from 'node:timers/promises';
/** Retry only a proven rolled-back InnoDB deadlock; never replay uncertain commits. */
export async function entryTransaction(pool,operation,{attempts=4,pause=delay}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  const connection=await pool.getConnection();let retry=false;
  try{await connection.beginTransaction();const result=await operation(connection);await connection.commit();return result;}
  catch(error){let rolledBack=false;try{await connection.rollback();rolledBack=true;}catch{/* An uncertain transaction must never be replayed. */}
   retry=rolledBack&&error.code==='ER_LOCK_DEADLOCK'&&Number(error.errno)===1213&&attempt+1<attempts;if(!retry)throw error;
  }finally{connection.release();}
  if(retry)await pause((attempt+1)*15);
 }
}
