import axios from 'axios';
import { VmLavService } from './src/services/vmLav.service';

async function debugVouchers() {
    const vmLavService = new VmLavService();
    const userId = 1;
    // @ts-ignore
    const token = await vmLavService.obterTokenValido(userId);

    if (!token) {
        console.error('Nao foi possivel obter token');
        process.exit(1);
    }

    const vouchersApiUrl = 'https://apps.vmhub.vmtecnologia.io/wallet/api/v1/vouchers/listaVoucher';
    const queryParams = new URLSearchParams({
        execCount: 'true',
        pagina: '0',
        quantidade: '100',
        direcaoOrdenacao: 'DESC',
        campoOrdenacao: 'voucher.dataCriacao',
    });

    const url = `${vouchersApiUrl}?${queryParams.toString()}`;

    const body = {
        idEmpresaLogada: 1737,
        listaIdEmpresas: [1737],
        listaIdCategoria: [],
        tipoHierarquia: "FILHOS",
        ativa: [],
        restricoesCarteira: [{
            id: null,
            classe: { nome: "CLIENTE", descricao: "Cliente", tipo: "AUTOCOMPLETE", selecionada: false },
            limiteUsoItemRestricao: null,
            limiteValorItemRestricao: null,
            itens: []
        }],
        vigente: []
    };

    try {
        const response = await axios.post(url, body, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Authorization': `Bearer ${token}`,
                'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
                'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
                'Time-Zone': 'America/Sao_Paulo',
                'X-Vm-App': 'vmlav',
                'X-Vm-Emp': 'lavateriajdnovomundo',
            }
        });

        const elementos = response.data?.resultadoPaginado?.elementos || [];
        console.log('Elementos encontrados:', elementos.length);

        for (const [idx, item] of elementos.entries()) {
            const clienteStr = String(item[9] || '');
            if (clienteStr.length > 200) {
                console.log(`Elemento ${idx} possui cliente longo (${clienteStr.length}): ${clienteStr}`);
            }

            // Check ALL string fields just in case
            for (let i = 0; i < item.length; i++) {
                if (typeof item[i] === 'string' && item[i].length > 200) {
                    console.log(`Campo ${i} no elemento ${idx} tem length ${item[i].length}: ${item[i]}`);
                }
            }
        }

    } catch (err: any) {
        console.error('Erro:', err.message);
    }

    process.exit(0);
}

debugVouchers();
