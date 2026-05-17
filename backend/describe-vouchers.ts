```typescript
import pool from './src/config/database';

async function describeTable() {
    const conn = await pool.getConnection();
    try {
        const queryResult = await conn.query('DESCRIBE vm_lav_vouchers');
    let rows: any[] = [];
    if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
    }
    
    for (const row of rows) {
      console.log(JSON.stringify(row));
    }
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

describeTable();
