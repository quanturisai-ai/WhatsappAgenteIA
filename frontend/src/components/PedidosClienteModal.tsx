import { useState, useEffect } from 'react';
import { X, Loader, CheckCircle, Clock, Gift } from 'lucide-react';
import { fidelizacaoService } from '../services/fidelizacao.service';
import toast from 'react-hot-toast';

interface PedidoDetalhado {
    id: number;
    cliente_nome: string;
    tipo_servico: 'LAVAGEM' | 'SECAGEM';
    data_pedido: Date;
    tipo_pagamento: string;
    contabilizado: boolean;
    pago_com_fidelidade: boolean;
    premio_id: number | null;
    premio_descricao: string | null;
}

interface PedidosClienteModalProps {
    isOpen: boolean;
    onClose: () => void;
    cpf: string;
    nomeCliente: string;
}

export const PedidosClienteModal = ({ isOpen, onClose, cpf, nomeCliente }: PedidosClienteModalProps) => {
    const [loading, setLoading] = useState(false);
    const [pedidos, setPedidos] = useState<PedidoDetalhado[]>([]);

    useEffect(() => {
        if (isOpen && cpf) {
            loadPedidos();
        }
    }, [isOpen, cpf]);

    const loadPedidos = async () => {
        try {
            setLoading(true);
            const data = await fidelizacaoService.obterPedidosDetalhados(cpf);
            // Garantir que a tipagem bata, embora deva ser automática agora
            setPedidos(data.pedidos as PedidoDetalhado[]);
        } catch (error: any) {
            toast.error('Erro ao carregar pedidos');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            Pedidos de {nomeCliente}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">CPF: {cpf}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader className="w-8 h-8 animate-spin text-primary-600" />
                        </div>
                    ) : pedidos.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-600">Nenhum pedido encontrado para este cliente.</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Cliente
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Serviço
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Data
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Pagamento
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {pedidos.map((pedido) => (
                                            <tr key={pedido.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {pedido.cliente_nome}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${pedido.tipo_servico === 'LAVAGEM'
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : 'bg-purple-100 text-purple-800'
                                                        }`}>
                                                        {pedido.tipo_servico}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {new Date(pedido.data_pedido).toLocaleString('pt-BR')}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {pedido.tipo_pagamento}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    {pedido.contabilizado ? (
                                                        <div className="flex items-center gap-2">
                                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                                            <span className="text-sm text-green-600 font-medium">Utilizado</span>
                                                            {pedido.premio_descricao && (
                                                                <span className="text-xs text-gray-500">
                                                                    ({pedido.premio_descricao})
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : pedido.pago_com_fidelidade ? (
                                                        <div className="flex items-center gap-2">
                                                            <Gift className="w-4 h-4 text-blue-600" />
                                                            <span className="text-sm text-blue-600 font-medium">Pago com Fidelidade</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="w-4 h-4 text-yellow-600" />
                                                            <span className="text-sm text-yellow-600 font-medium">Livre</span>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Legenda */}
                            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                                <p className="text-sm text-gray-600 flex flex-wrap gap-4">
                                    <span className="font-medium">Legenda:</span>
                                    <span className="flex items-center gap-1">
                                        <CheckCircle className="w-4 h-4 text-green-600" /> Utilizado (Contou para prêmio)
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Gift className="w-4 h-4 text-blue-600" /> Pago com Fidelidade (Não conta)
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-4 h-4 text-yellow-600" /> Livre (Disponível)
                                    </span>
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};
