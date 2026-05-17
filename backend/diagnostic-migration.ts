import { migratePedidosUnique } from './src/utils/migratePedidosUnique';
import { migrateVoucherColumn } from './src/utils/migrateVoucherColumn';
import migrateVouchersTable from './src/utils/migrateVouchersTable';
import migrateSyncLogEnum from './src/utils/migrateSyncLogEnum';

async function diagnostic() {
    console.log('1. migratePedidosUnique');
    try { await migratePedidosUnique(); console.log('OK'); } catch (e) { console.error('FAILED', e); }

    console.log('2. migrateVoucherColumn');
    try { await migrateVoucherColumn(); console.log('OK'); } catch (e) { console.error('FAILED', e); }

    console.log('3. migrateSyncLogEnum');
    try { await migrateSyncLogEnum(); console.log('OK'); } catch (e) { console.error('FAILED', e); }

    console.log('4. migrateVouchersTable');
    try { await migrateVouchersTable(); console.log('OK'); } catch (e) { console.error('FAILED', e); }

    process.exit(0);
}

diagnostic();
