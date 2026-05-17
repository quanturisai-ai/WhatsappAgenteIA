import { migratePedidosUnique } from './src/utils/migratePedidosUnique';
import { migrateVoucherColumn } from './src/utils/migrateVoucherColumn';
import migrateVouchersTable from './src/utils/migrateVouchersTable';
import migrateSyncLogEnum from './src/utils/migrateSyncLogEnum';
import fixVouchersTableColumns from './src/utils/fixVouchersTableColumns';

(async () => {
    try {
        console.log('Iniciando migrações...');
        await migratePedidosUnique();
        await migrateVoucherColumn();
        await migrateSyncLogEnum();
        await migrateVouchersTable();
        await fixVouchersTableColumns();
        console.log('✅ Todas as migrações concluídas com sucesso!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erro nas migrações:', err);
        process.exit(1);
    }
})();
