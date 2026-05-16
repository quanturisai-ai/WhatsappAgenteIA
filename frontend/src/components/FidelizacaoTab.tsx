import { useState, useEffect } from 'react';
import { fidelizacaoService, Premio, ClienteFidelidade, Conquista, TipoServico } from '../services/fidelizacao.service';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, Search, Trophy, Users, Award, CheckCircle, Clock, Gift, Loader, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type FidelizacaoSubTab = 'premios' | 'clientes' | 'conquistas';

export const FidelizacaoTab = () => {
  const [activeSubTab, setActiveSubTab] = useState<FidelizacaoSubTab>('premios');
  
  // Estados para Prêmios
  const [premios, setPremios] = useState<Premio[]>([]);
  const [premiosLoading, setPremiosLoading] = useState(false);
  const [showPremioModal, setShowPremioModal] = useState(false);
  const [editingPremio, setEditingPremio] = useState<Premio | null>(null);
  const [premioServico, setPremioServico] = useState<TipoServico>('LAVAGEM');
  const [premioObjetivo, setPremioObjetivo] = useState<number>(10);
  const [premioDescricao, setPremioDescricao] = useState('');
  const [premioDataInicio, setPremioDataInicio] = useState<string>('');
  const [premioDataFim, setPremioDataFim] = useState<string>('');
  const [premioTipoAtingimento, setPremioTipoAtingimento] = useState<'UNICO' | 'PERPETUO'>('UNICO');
  const [premioValidadeDias, setPremioValidadeDias] = useState<number | null>(null);
  const [premioAtivo, setPremioAtivo] = useState(true);
  const [isSavingPremio, setIsSavingPremio] = useState(false);

  // Estados para Clientes
  const [clientes, setClientes] = useState<ClienteFidelidade[]>([]);
  const [clientesLoading, setClientesLoading] = useState(false);
  const [clientesPage, setClientesPage] = useState(1);
  const [clientesTotal, setClientesTotal] = useState(0);
  const [clientesSearch, setClientesSearch] = useState('');
  const [filtroPercentual, setFiltroPercentual] = useState<string>('');
  const [filtroTipoServico, setFiltroTipoServico] = useState<TipoServico | 'TODOS'>('TODOS');
  const [showGraficoModal, setShowGraficoModal] = useState(false);
  const [graficoTipoServico, setGraficoTipoServico] = useState<TipoServico | 'TODOS'>('TODOS');
  const [distribuicao, setDistribuicao] = useState<Array<{ faixa: string; lavagem: number; secagem: number; total: number }>>([]);
  const [distribuicaoLoading, setDistribuicaoLoading] = useState(false);
  const limit = 50;

  // Estados para Conquistas
  const [conquistas, setConquistas] = useState<Conquista[]>([]);
  const [conquistasLoading, setConquistasLoading] = useState(false);
  const [conquistasPage, setConquistasPage] = useState(1);
  const [conquistasTotal, setConquistasTotal] = useState(0);
  const [conquistasFilter, setConquistasFilter] = useState<'all' | 'utilizado' | 'nao_utilizado'>('all');

  // Carregar dados quando a sub-aba mudar
  useEffect(() => {
    if (activeSubTab === 'premios') {
      loadPremios();
    } else if (activeSubTab === 'clientes') {
      loadClientes();
    } else if (activeSubTab === 'conquistas') {
      loadConquistas();
    }
  }, [activeSubTab, clientesPage, clientesSearch, conquistasPage, conquistasFilter, filtroPercentual, filtroTipoServico]);

  // Funções para Prêmios
  const loadPremios = async () => {
    try {
      setPremiosLoading(true);
      const data = await fidelizacaoService.listarPremios();
      setPremios(data);
    } catch (error: any) {
      toast.error('Erro ao carregar prêmios');
      console.error(error);
    } finally {
      setPremiosLoading(false);
    }
  };

  const handleOpenPremioModal = (premio?: Premio) => {
    if (premio) {
      setEditingPremio(premio);
      setPremioServico(premio.servico);
      setPremioObjetivo(premio.objetivo);
      setPremioDescricao(premio.descricao);
      // Parsear data_inicio_utilizacoes - pode vir como string ISO ou Date
      if (premio.data_inicio_utilizacoes) {
        try {
          const data = new Date(premio.data_inicio_utilizacoes);
          if (!isNaN(data.getTime())) {
            setPremioDataInicio(data.toISOString().split('T')[0]);
          } else {
            // Tentar usar diretamente se já estiver no formato YYYY-MM-DD
            setPremioDataInicio(premio.data_inicio_utilizacoes.split('T')[0]);
          }
        } catch {
          setPremioDataInicio('');
        }
      } else {
        setPremioDataInicio('');
      }
      // Parsear data_fim_utilizacoes
      if (premio.data_fim_utilizacoes) {
        try {
          const data = new Date(premio.data_fim_utilizacoes);
          if (!isNaN(data.getTime())) {
            setPremioDataFim(data.toISOString().split('T')[0]);
          } else {
            setPremioDataFim(premio.data_fim_utilizacoes.split('T')[0]);
          }
        } catch {
          setPremioDataFim('');
        }
      } else {
        setPremioDataFim('');
      }
      setPremioTipoAtingimento(premio.tipo_atingimento || 'UNICO');
      setPremioValidadeDias(premio.validade_dias);
      setPremioAtivo(premio.ativo);
    } else {
      setEditingPremio(null);
      setPremioServico('LAVAGEM');
      setPremioObjetivo(10);
      setPremioDescricao('');
      // Data padrão: 1 ano atrás
      const dataPadrao = new Date();
      dataPadrao.setFullYear(dataPadrao.getFullYear() - 1);
      setPremioDataInicio(dataPadrao.toISOString().split('T')[0]);
      setPremioDataFim('');
      setPremioTipoAtingimento('UNICO');
      setPremioValidadeDias(null);
      setPremioAtivo(true);
    }
    setShowPremioModal(true);
  };

  const handleClosePremioModal = () => {
    setShowPremioModal(false);
    setEditingPremio(null);
    setPremioServico('LAVAGEM');
    setPremioObjetivo(10);
    setPremioDescricao('');
    setPremioDataInicio('');
    setPremioDataFim('');
    setPremioTipoAtingimento('UNICO');
    setPremioValidadeDias(null);
    setPremioAtivo(true);
  };

  const handleSavePremio = async () => {
    if (!premioDescricao.trim() || premioObjetivo <= 0 || !premioDataInicio) {
      toast.error('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    setIsSavingPremio(true);
    try {
      if (editingPremio) {
        await fidelizacaoService.atualizarPremio(editingPremio.id, {
          servico: premioServico,
          objetivo: premioObjetivo,
          descricao: premioDescricao.trim(),
          data_inicio_utilizacoes: premioDataInicio,
          data_fim_utilizacoes: premioDataFim || null,
          tipo_atingimento: premioTipoAtingimento,
          validade_dias: premioValidadeDias,
          ativo: premioAtivo,
        });
        toast.success('Prêmio atualizado com sucesso');
      } else {
        await fidelizacaoService.criarPremio({
          servico: premioServico,
          objetivo: premioObjetivo,
          descricao: premioDescricao.trim(),
          data_inicio_utilizacoes: premioDataInicio,
          data_fim_utilizacoes: premioDataFim || null,
          tipo_atingimento: premioTipoAtingimento,
          validade_dias: premioValidadeDias,
          ativo: premioAtivo,
        });
        toast.success('Prêmio criado com sucesso');
      }
      handleClosePremioModal();
      loadPremios();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar prêmio');
      console.error(error);
    } finally {
      setIsSavingPremio(false);
    }
  };

  const handleDeletePremio = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este prêmio?')) return;
    
    try {
      await fidelizacaoService.deletarPremio(id);
      toast.success('Prêmio deletado com sucesso');
      loadPremios();
    } catch (error: any) {
      toast.error('Erro ao deletar prêmio');
      console.error(error);
    }
  };

  // Funções para Clientes
  const loadClientes = async () => {
    try {
      setClientesLoading(true);
      
      // Parsear filtro de percentual (ex: "30-40" -> min: 30, max: 40)
      let percentualMin: number | undefined;
      let percentualMax: number | undefined;
      if (filtroPercentual) {
        const [min, max] = filtroPercentual.split('-').map(Number);
        percentualMin = min;
        percentualMax = max;
      }
      
      const tipoServico = filtroTipoServico === 'TODOS' ? undefined : filtroTipoServico;
      
      const result = await fidelizacaoService.listarClientesFidelidade(
        clientesPage,
        limit,
        clientesSearch || undefined,
        percentualMin,
        percentualMax,
        tipoServico
      );
      setClientes(result.clientes);
      setClientesTotal(result.total);
    } catch (error: any) {
      toast.error('Erro ao carregar clientes');
      console.error(error);
    } finally {
      setClientesLoading(false);
    }
  };

  const loadDistribuicao = async () => {
    try {
      setDistribuicaoLoading(true);
      const tipoServico = graficoTipoServico === 'TODOS' ? undefined : graficoTipoServico;
      const result = await fidelizacaoService.obterDistribuicaoPorPercentual(tipoServico);
      setDistribuicao(result);
    } catch (error: any) {
      toast.error('Erro ao carregar distribuição');
      console.error(error);
    } finally {
      setDistribuicaoLoading(false);
    }
  };

  const handleOpenGraficoModal = () => {
    setShowGraficoModal(true);
    loadDistribuicao();
  };

  const handleCloseGraficoModal = () => {
    setShowGraficoModal(false);
    setGraficoTipoServico('TODOS');
  };

  // Recarregar distribuição quando o filtro do gráfico mudar
  useEffect(() => {
    if (showGraficoModal) {
      loadDistribuicao();
    }
  }, [graficoTipoServico, showGraficoModal]);

  const handleApurarPremios = async (cpf: string) => {
    try {
      const result = await fidelizacaoService.apurarPremiosCliente(cpf);
      toast.success(`${result.premiosConcedidos} prêmio(s) concedido(s)`);
      loadClientes();
    } catch (error: any) {
      toast.error('Erro ao apurar prêmios');
      console.error(error);
    }
  };

  // Funções para Conquistas
  const loadConquistas = async () => {
    try {
      setConquistasLoading(true);
      const utilizado = conquistasFilter === 'utilizado' ? true : conquistasFilter === 'nao_utilizado' ? false : undefined;
      const result = await fidelizacaoService.listarConquistas(conquistasPage, limit, undefined, utilizado);
      setConquistas(result.conquistas);
      setConquistasTotal(result.total);
    } catch (error: any) {
      toast.error('Erro ao carregar conquistas');
      console.error(error);
    } finally {
      setConquistasLoading(false);
    }
  };

  const handleMarcarUtilizado = async (id: number) => {
    try {
      await fidelizacaoService.marcarPremioUtilizado(id);
      toast.success('Prêmio marcado como utilizado');
      loadConquistas();
    } catch (error: any) {
      toast.error('Erro ao marcar prêmio como utilizado');
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveSubTab('premios')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeSubTab === 'premios'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Prêmios
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab('clientes')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeSubTab === 'clientes'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Clientes
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab('conquistas')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeSubTab === 'conquistas'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4" />
              Conquistas
            </div>
          </button>
        </nav>
      </div>

      {/* Conteúdo das sub-tabs */}
      {activeSubTab === 'premios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Prêmios de Fidelidade</h3>
              <p className="mt-1 text-sm text-gray-500">
                Configure os prêmios que serão concedidos aos clientes baseado no uso de serviços
              </p>
            </div>
            <button
              onClick={() => handleOpenPremioModal()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Prêmio
            </button>
          </div>

          {premiosLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : premios.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Nenhum prêmio cadastrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {premios.map((premio) => (
                <div
                  key={premio.id}
                  className={`p-4 border rounded-lg ${
                    premio.ativo ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-1 rounded bg-primary-100 text-primary-700">
                          {premio.servico}
                        </span>
                        {!premio.ativo && (
                          <span className="text-xs text-gray-500">Inativo</span>
                        )}
                      </div>
                      <h4 className="font-semibold text-gray-900">{premio.descricao}</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Objetivo: {premio.objetivo} utilizações
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Início: {new Date(premio.data_inicio_utilizacoes).toLocaleDateString('pt-BR')}
                      </p>
                      {premio.validade_dias && (
                        <p className="text-xs text-gray-500 mt-1">
                          Validade: {premio.validade_dias} dias
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenPremioModal(premio)}
                        className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeletePremio(premio.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'clientes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Clientes e Fidelidade</h3>
              <p className="mt-1 text-sm text-gray-500">
                Acompanhe o progresso de fidelidade dos seus clientes
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={clientesSearch}
                  onChange={(e) => setClientesSearch(e.target.value)}
                  placeholder="Buscar por nome, CPF ou telefone..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <select
                value={filtroTipoServico}
                onChange={(e) => setFiltroTipoServico(e.target.value as TipoServico | 'TODOS')}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="TODOS">Todos os Tipos</option>
                <option value="LAVAGEM">Lavagem</option>
                <option value="SECAGEM">Secagem</option>
                <option value="TOTAL">Total</option>
              </select>
              <select
                value={filtroPercentual}
                onChange={(e) => setFiltroPercentual(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Todos os Percentuais</option>
                <option value="0-10">0-10%</option>
                <option value="10-20">10-20%</option>
                <option value="20-30">20-30%</option>
                <option value="30-40">30-40%</option>
                <option value="40-50">40-50%</option>
                <option value="50-60">50-60%</option>
                <option value="60-70">60-70%</option>
                <option value="70-80">70-80%</option>
                <option value="80-90">80-90%</option>
                <option value="90-100">90-100%</option>
              </select>
              <button
                onClick={handleOpenGraficoModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Trophy className="w-4 h-4" />
                Ver Distribuição
              </button>
            </div>
          </div>

          {clientesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Nenhum cliente encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Utilizações
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progresso Lavagens
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progresso Secagens
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progresso Total
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prêmios
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clientes.map((cliente) => (
                    <tr key={cliente.cpf} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{cliente.nome}</div>
                          <div className="text-xs text-gray-500">{cliente.cpf}</div>
                          {cliente.telefone && (
                            <div className="text-xs text-gray-500">{cliente.telefone}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>Lavagens: {cliente.totalLavagens}</div>
                        <div>Secagens: {cliente.totalSecagens}</div>
                        <div className="font-medium">Total: {cliente.totalUtilizacoes}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        {cliente.saldoFidelidadeLavagens.proximoPremio && (
                          <div className="text-xs text-gray-500 mb-1">
                            Próximo prêmio: {cliente.saldoFidelidadeLavagens.proximoPremio}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary-600 h-2 rounded-full"
                              style={{
                                width: `${Math.min(100, (cliente.saldoFidelidadeLavagens.atual / (cliente.saldoFidelidadeLavagens.proximoObjetivo || 1)) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-600">
                            {cliente.saldoFidelidadeLavagens.atual}
                            {cliente.saldoFidelidadeLavagens.proximoObjetivo && `/${cliente.saldoFidelidadeLavagens.proximoObjetivo}`}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Conquistas: {cliente.saldoFidelidadeLavagens.conquistas || 0}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        {cliente.saldoFidelidadeSecagens.proximoPremio && (
                          <div className="text-xs text-gray-500 mb-1">
                            Próximo prêmio: {cliente.saldoFidelidadeSecagens.proximoPremio}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary-600 h-2 rounded-full"
                              style={{
                                width: `${Math.min(100, (cliente.saldoFidelidadeSecagens.atual / (cliente.saldoFidelidadeSecagens.proximoObjetivo || 1)) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-600">
                            {cliente.saldoFidelidadeSecagens.atual}
                            {cliente.saldoFidelidadeSecagens.proximoObjetivo && `/${cliente.saldoFidelidadeSecagens.proximoObjetivo}`}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Conquistas: {cliente.saldoFidelidadeSecagens.conquistas || 0}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        {cliente.saldoFidelidadeTotal.proximoPremio && (
                          <div className="text-xs text-gray-500 mb-1">
                            Próximo prêmio: {cliente.saldoFidelidadeTotal.proximoPremio}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary-600 h-2 rounded-full"
                              style={{
                                width: `${Math.min(100, (cliente.saldoFidelidadeTotal.atual / (cliente.saldoFidelidadeTotal.proximoObjetivo || 1)) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-600">
                            {cliente.saldoFidelidadeTotal.atual}
                            {cliente.saldoFidelidadeTotal.proximoObjetivo && `/${cliente.saldoFidelidadeTotal.proximoObjetivo}`}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Conquistas: {cliente.saldoFidelidadeTotal.conquistas || 0}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>Conquistados: {cliente.premiosConquistados}</div>
                        <div className="text-gray-500">Utilizados: {cliente.premiosUtilizados}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleApurarPremios(cliente.cpf)}
                          className="text-primary-600 hover:text-primary-800"
                        >
                          Apurar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {clientesTotal > limit && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Mostrando {(clientesPage - 1) * limit + 1} a {Math.min(clientesPage * limit, clientesTotal)} de {clientesTotal}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setClientesPage(p => Math.max(1, p - 1))}
                  disabled={clientesPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setClientesPage(p => p + 1)}
                  disabled={clientesPage * limit >= clientesTotal}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'conquistas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Conquistas</h3>
              <p className="mt-1 text-sm text-gray-500">
                Histórico de prêmios concedidos aos clientes
              </p>
            </div>
            <select
              value={conquistasFilter}
              onChange={(e) => setConquistasFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Todos</option>
              <option value="nao_utilizado">Não Utilizados</option>
              <option value="utilizado">Utilizados</option>
            </select>
          </div>

          {conquistasLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : conquistas.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Award className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Nenhuma conquista encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prêmio
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data Conquista
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Validade
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {conquistas.map((conquista) => {
                    const isExpired = conquista.dataValidade && new Date(conquista.dataValidade) < new Date();
                    return (
                      <tr key={conquista.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {conquista.cpfCliente}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{conquista.premioDescricao}</div>
                          <div className="text-xs text-gray-500">{conquista.premioServico}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(conquista.dataConquista).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {conquista.dataValidade ? (
                            <span className={isExpired ? 'text-red-600' : ''}>
                              {new Date(conquista.dataValidade).toLocaleDateString('pt-BR')}
                            </span>
                          ) : (
                            <span className="text-gray-400">Sem validade</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {conquista.utilizado ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 flex items-center gap-1 w-fit">
                              <CheckCircle className="w-3 h-3" />
                              Utilizado
                            </span>
                          ) : isExpired ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                              Expirado
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1 w-fit">
                              <Clock className="w-3 h-3" />
                              Disponível
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {!conquista.utilizado && !isExpired && (
                            <button
                              onClick={() => handleMarcarUtilizado(conquista.id)}
                              className="text-primary-600 hover:text-primary-800"
                            >
                              Marcar como Utilizado
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {conquistasTotal > limit && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Mostrando {(conquistasPage - 1) * limit + 1} a {Math.min(conquistasPage * limit, conquistasTotal)} de {conquistasTotal}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConquistasPage(p => Math.max(1, p - 1))}
                  disabled={conquistasPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setConquistasPage(p => p + 1)}
                  disabled={conquistasPage * limit >= conquistasTotal}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Prêmio */}
      {showPremioModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingPremio ? 'Editar Prêmio' : 'Novo Prêmio'}
              </h3>
              <button
                onClick={handleClosePremioModal}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Serviço *
                </label>
                <select
                  value={premioServico}
                  onChange={(e) => setPremioServico(e.target.value as TipoServico)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="LAVAGEM">Lavagem</option>
                  <option value="SECAGEM">Secagem</option>
                  <option value="TOTAL">Total (Lavagem + Secagem)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Objetivo (Quantidade de Utilizações) *
                </label>
                <input
                  type="number"
                  value={premioObjetivo}
                  onChange={(e) => setPremioObjetivo(parseInt(e.target.value) || 0)}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição do Prêmio *
                </label>
                <input
                  type="text"
                  value={premioDescricao}
                  onChange={(e) => setPremioDescricao(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Cupom de desconto de 30%"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Início das Utilizações *
                </label>
                <input
                  type="date"
                  value={premioDataInicio}
                  onChange={(e) => setPremioDataInicio(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Utilizações a partir desta data contarão para este prêmio
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Fim das Utilizações - Opcional
                </label>
                <input
                  type="date"
                  value={premioDataFim}
                  onChange={(e) => setPremioDataFim(e.target.value)}
                  min={premioDataInicio}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Utilizações até esta data contarão para este prêmio. Deixe em branco para vigência indefinida.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Atingimento *
                </label>
                <select
                  value={premioTipoAtingimento}
                  onChange={(e) => setPremioTipoAtingimento(e.target.value as 'UNICO' | 'PERPETUO')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="UNICO">Único (conquista uma vez)</option>
                  <option value="PERPETUO">Perpétuo (pode conquistar múltiplas vezes)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {premioTipoAtingimento === 'UNICO' 
                    ? 'O cliente recebe o prêmio uma vez ao atingir o objetivo'
                    : 'O cliente pode receber o mesmo prêmio múltiplas vezes, recomeçando a contagem após cada conquista'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Validade (Dias) - Opcional
                </label>
                <input
                  type="number"
                  value={premioValidadeDias || ''}
                  onChange={(e) => setPremioValidadeDias(e.target.value ? parseInt(e.target.value) : null)}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Deixe em branco para sem validade"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPremioAtivo(!premioAtivo)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    premioAtivo ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      premioAtivo ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <label className="text-sm font-medium text-gray-700">
                  Prêmio Ativo
                </label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClosePremioModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePremio}
                disabled={isSavingPremio}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSavingPremio ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Gift className="w-4 h-4" />
                    Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gráfico de Distribuição */}
      {showGraficoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Distribuição de Clientes por Percentual</h3>
              <div className="flex items-center gap-2">
                <select
                  value={graficoTipoServico}
                  onChange={(e) => {
                    setGraficoTipoServico(e.target.value as TipoServico | 'TODOS');
                    // Recarregar dados quando mudar o filtro
                    setTimeout(() => {
                      const tipoServico = e.target.value === 'TODOS' ? undefined : (e.target.value as TipoServico);
                      fidelizacaoService.obterDistribuicaoPorPercentual(tipoServico).then(setDistribuicao);
                    }, 0);
                  }}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="TODOS">Todos os Tipos</option>
                  <option value="LAVAGEM">Lavagem</option>
                  <option value="SECAGEM">Secagem</option>
                  <option value="TOTAL">Total</option>
                </select>
                <button
                  onClick={handleCloseGraficoModal}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="px-6 py-6">
              {distribuicaoLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : distribuicao.length === 0 ? (
                <div className="text-center py-12">
                  <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Nenhum dado disponível</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={distribuicao}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="faixa" 
                        label={{ value: 'Faixa de Percentual', position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis 
                        label={{ value: 'Quantidade de Clientes', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip />
                      <Legend />
                      {graficoTipoServico === 'TODOS' ? (
                        <>
                          <Bar dataKey="lavagem" fill="#3b82f6" name="Lavagem" />
                          <Bar dataKey="secagem" fill="#10b981" name="Secagem" />
                          <Bar dataKey="total" fill="#f59e0b" name="Total" />
                        </>
                      ) : graficoTipoServico === 'LAVAGEM' ? (
                        <Bar dataKey="lavagem" fill="#3b82f6" name="Lavagem" />
                      ) : graficoTipoServico === 'SECAGEM' ? (
                        <Bar dataKey="secagem" fill="#10b981" name="Secagem" />
                      ) : (
                        <Bar dataKey="total" fill="#f59e0b" name="Total" />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                  
                  {/* Tabela com os dados */}
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Detalhamento</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Faixa</th>
                            {graficoTipoServico === 'TODOS' && (
                              <>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lavagem</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Secagem</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                              </>
                            )}
                            {graficoTipoServico === 'LAVAGEM' && (
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lavagem</th>
                            )}
                            {graficoTipoServico === 'SECAGEM' && (
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Secagem</th>
                            )}
                            {graficoTipoServico === 'TOTAL' && (
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {distribuicao.map((item, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-sm text-gray-900">{item.faixa}</td>
                              {graficoTipoServico === 'TODOS' && (
                                <>
                                  <td className="px-4 py-2 text-sm text-gray-900">{item.lavagem}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900">{item.secagem}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900">{item.total}</td>
                                </>
                              )}
                              {graficoTipoServico === 'LAVAGEM' && (
                                <td className="px-4 py-2 text-sm text-gray-900">{item.lavagem}</td>
                              )}
                              {graficoTipoServico === 'SECAGEM' && (
                                <td className="px-4 py-2 text-sm text-gray-900">{item.secagem}</td>
                              )}
                              {graficoTipoServico === 'TOTAL' && (
                                <td className="px-4 py-2 text-sm text-gray-900">{item.total}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end">
              <button
                onClick={handleCloseGraficoModal}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

