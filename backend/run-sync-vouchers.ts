import { VmLavService } from './src/services/vmLav.service';

async function runSync() {
    const vmLavService = new VmLavService();
    const userId = 1;

    console.log('Iniciando sincronização manual de vouchers...');
    try {
        const result = await vmLavService.sincronizarVouchers(userId);
        console.log('Resultado:', JSON.stringify(result, null, 2));
    } catch (err: any) {
        console.error('Erro fatal:', err.message);
    } finally {
        process.exit(0);
    }
}

runSync();
