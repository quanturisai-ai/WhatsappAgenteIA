import { VmLavService } from './src/services/vmLav.service';

async function testSync() {
    const vmLavService = new VmLavService();
    const userId = 1;

    console.log('Iniciando teste de sincronização de utilização...');
    try {
        const result = await vmLavService.sincronizarUtilizacaoVouchersPremios(userId);
        console.log('Resultado:', JSON.stringify(result, null, 2));
    } catch (err: any) {
        console.error('Erro:', err.message);
    } finally {
        process.exit(0);
    }
}

testSync();
