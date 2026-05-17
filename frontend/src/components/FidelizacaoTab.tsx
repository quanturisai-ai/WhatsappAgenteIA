import { useState, useEffect } from 'react';
import {
  fidelizacaoService,
  Premio,
  ClienteFidelidade,
  Conquista,
  TipoServico,
  FidelizacaoTipoGatilho,
  FidelizacaoRegra,
  FidelizacaoRegrasConfig,
  SegmentacaoPublico,
  PreviewRegraResult,
} from '../services/fidelizacao.service';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, Search, Trophy, Users, Award, CheckCircle, Clock, Gift, Loader, BarChart3, Bell, Send, TestTube, AlertCircle, Zap, Eye, Power, PowerOff } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PedidosClienteModal } from './PedidosClienteModal';

type FidelizacaoSubTab = 'premios' | 'clientes' | 'conquistas' | 'notificacoes' | 'automacoes';

/** Igual ao padrão de entrega no backend quando template_mensagem_entrega está vazio */
const DEFAULT_TEMPLATE_ENTREGA = `Olá, {nome}!

Segue a entrega do seu prêmio: {descricao_premio}

{data_validade}

Use o código e a validade informados abaixo ao utilizar o voucher.`;

/**
 * Substitui variáveis do template de entrega no modal.
 * {data_validade} = só a data (dd/mm/aaaa) da validade do voucher no formulário — sem prefixo (o template pode escrever "Válido até:").
 * {validade_dias} = dias configurados no cadastro do prêmio, se houver.
 */
function buildMensagemEntregaModalCompleta(
  template: string,
  nomeCliente: string,
  descricaoPremio: string,
  validadeDiasPremio: number | null | undefined,
  codigoVoucher: string,
  dataVoucherIso: string
): string {
  const nome = (nomeCliente || '').trim() || 'Cliente';
  const primeiroNome = nome.split(/\s+/)[0] || 'Cliente';
  let m = template.replace(/{nome}/g, nome);
  m = m.replace(/{primeiro_nome}/g, primeiroNome);
  m = m.replace(/{descricao_premio}/g, descricaoPremio);

  if (validadeDiasPremio != null && validadeDiasPremio > 0) {
    m = m.replace(/{validade_dias}/g, String(validadeDiasPremio));
  } else {
    m = m.replace(/{validade_dias}/g, '');
  }

  const dataValidadeSoData =
    dataVoucherIso && !isNaN(new Date(dataVoucherIso + 'T12:00:00').getTime())
      ? new Date(dataVoucherIso + 'T12:00:00').toLocaleDateString('pt-BR')
      : 'Sem data';
  m = m.replace(/{data_validade}/g, dataValidadeSoData);

  const codigo = (codigoVoucher || '').trim();
  m = m.replace(/{voucher_codigo}/g, codigo || '—');

  m = m.replace(/\n{3,}/g, '\n\n');
  return m.trim();
}

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
  const [premioValorVoucher, setPremioValorVoucher] = useState<number | ''>('');
  const [premioQuantidadeUtilizacoes, setPremioQuantidadeUtilizacoes] = useState<number | ''>('');
  const [premioGerarAutomatico, setPremioGerarAutomatico] = useState(false);
  const [premioEntregaAutomatico, setPremioEntregaAutomatico] = useState(false);
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
  const [showPedidosModal, setShowPedidosModal] = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState<{ cpf: string, nome: string } | null>(null);
  const limit = 50;

  // Estados para Conquistas
  const [conquistas, setConquistas] = useState<Conquista[]>([]);
  const [conquistasLoading, setConquistasLoading] = useState(false);
  const [conquistasPage, setConquistasPage] = useState(1);
  const [conquistasTotal, setConquistasTotal] = useState(0);
  const [conquistasFilter, setConquistasFilter] = useState<'all' | 'utilizado' | 'nao_utilizado'>('all');

  // Estados para Entrega de Prêmio
  const [showEntregaModal, setShowEntregaModal] = useState(false);
  const [conquistaSelecionada, setConquistaSelecionada] = useState<Conquista | null>(null);
  const [voucherCodigo, setVoucherCodigo] = useState('');
  const [voucherValidade, setVoucherValidade] = useState('');
  const [voucherMensagem, setVoucherMensagem] = useState('');
  const [isSavingEntrega, setIsSavingEntrega] = useState(false);
  const [gerandoVoucherId, setGerandoVoucherId] = useState<number | null>(null);

  // Estados para Notificações (aba Notificações)
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [notificacoesLoading, setNotificacoesLoading] = useState(false);
  const [notificacoesPage, setNotificacoesPage] = useState(1);
  const [notificacoesTotal, setNotificacoesTotal] = useState(0);
  const [notificacoesSearch, setNotificacoesSearch] = useState('');
  const [configSimulacao, setConfigSimulacao] = useState<boolean>(true);
  const [configLoading, setConfigLoading] = useState(false);
  const [simulacaoToggling, setSimulacaoToggling] = useState(false);
  const [reenviandoId, setReenviandoId] = useState<number | null>(null);
  const notificacoesLimit = 50;

  // Estados para Automações
  const [automacoesTipos, setAutomacoesTipos] = useState<FidelizacaoTipoGatilho[]>([]);
  const [automacoesConfig, setAutomacoesConfig] = useState<FidelizacaoRegrasConfig | null>(null);
  const [automacoesRegras, setAutomacoesRegras] = useState<FidelizacaoRegra[]>([]);
  const [automacoesLoading, setAutomacoesLoading] = useState(false);
  const [showRegraModal, setShowRegraModal] = useState(false);
  const [editingRegra, setEditingRegra] = useState<FidelizacaoRegra | null>(null);
  const [regraNome, setRegraNome] = useState('');
  const [regraTipoGatilhoId, setRegraTipoGatilhoId] = useState<number | ''>('');
  const [regraParametros, setRegraParametros] = useState<Record<string, number | string>>({});
  const [regraMensagem, setRegraMensagem] = useState('');
  const [regraFrequenciaMinima, setRegraFrequenciaMinima] = useState(30);
  const [regraHorarioInicio, setRegraHorarioInicio] = useState('08:00');
  const [regraHorarioFim, setRegraHorarioFim] = useState('20:00');
  const [regraVigenciaInicio, setRegraVigenciaInicio] = useState(() => new Date().toISOString().split('T')[0]);
  const [regraVigenciaFim, setRegraVigenciaFim] = useState<string>('');
  const [regraSegmentacao, setRegraSegmentacao] = useState<SegmentacaoPublico>({});
  const [showSegmentacao, setShowSegmentacao] = useState(false);
  const [regraAtivo, setRegraAtivo] = useState(true);
  const [isSavingRegra, setIsSavingRegra] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewRegraResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [configAutomacoesSaving, setConfigAutomacoesSaving] = useState(false);
  // Modal de pré-visualização (lista de clientes impactados) ao clicar em Pré-visualizar na tabela
  const [showPreviewListModal, setShowPreviewListModal] = useState(false);
  const [previewListRegraNome, setPreviewListRegraNome] = useState('');
  const [previewListData, setPreviewListData] = useState<PreviewRegraResult | null>(null);
  const [previewListLoading, setPreviewListLoading] = useState(false);
  const [previewListSearch, setPreviewListSearch] = useState('');
  const [previewListPage, setPreviewListPage] = useState(1);
  const [previewListPageSize] = useState(15);
  const [previewListExpandedRow, setPreviewListExpandedRow] = useState<string | null>(null);

  // Carregar dados quando a sub-aba mudar
  useEffect(() => {
    if (activeSubTab === 'premios') {
      loadPremios();
    } else if (activeSubTab === 'clientes') {
      loadClientes();
    } else if (activeSubTab === 'conquistas') {
      loadConquistas();
    } else if (activeSubTab === 'notificacoes') {
      loadNotificacoes();
      loadConfigFidelizacao();
    } else if (activeSubTab === 'automacoes') {
      loadAutomacoesData();
    }
  }, [activeSubTab, clientesPage, clientesSearch, conquistasPage, conquistasFilter, filtroPercentual, filtroTipoServico, notificacoesPage, notificacoesSearch]);

  useEffect(() => {
    if (activeSubTab !== 'notificacoes') return;
    setNotificacoesPage(1);
  }, [notificacoesSearch]);

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
      setPremioValorVoucher(premio.valor_voucher ?? '');
      setPremioQuantidadeUtilizacoes(premio.quantidade_utilizacoes ?? '');
      setPremioGerarAutomatico(Boolean(premio.gerar_automatico));
      setPremioEntregaAutomatico(Boolean(premio.entrega_automatico));
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
      setPremioValorVoucher('');
      setPremioQuantidadeUtilizacoes('');
      setPremioGerarAutomatico(false);
      setPremioEntregaAutomatico(false);
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
    setPremioValorVoucher('');
    setPremioQuantidadeUtilizacoes('');
    setPremioGerarAutomatico(false);
    setPremioEntregaAutomatico(false);
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
          valor_voucher: premioValorVoucher !== '' ? Number(premioValorVoucher) : null,
          quantidade_utilizacoes: premioQuantidadeUtilizacoes !== '' ? Number(premioQuantidadeUtilizacoes) : null,
          gerar_automatico: premioGerarAutomatico,
          entrega_automatico: premioEntregaAutomatico,
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
          valor_voucher: premioValorVoucher !== '' ? Number(premioValorVoucher) : null,
          quantidade_utilizacoes: premioQuantidadeUtilizacoes !== '' ? Number(premioQuantidadeUtilizacoes) : null,
          gerar_automatico: premioGerarAutomatico,
          entrega_automatico: premioEntregaAutomatico,
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

  const handleApurarPremios = async (cpf: string, nome: string) => {
    setClienteSelecionado({ cpf, nome });
    setShowPedidosModal(true);
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

  const loadNotificacoes = async () => {
    try {
      setNotificacoesLoading(true);
      const result = await fidelizacaoService.listarNotificacoes({
        search: notificacoesSearch || undefined,
        page: notificacoesPage,
        limit: notificacoesLimit,
      });
      setNotificacoes(result.notificacoes);
      setNotificacoesTotal(result.total);
    } catch (error: any) {
      toast.error('Erro ao carregar notificações');
      console.error(error);
    } finally {
      setNotificacoesLoading(false);
    }
  };

  const loadConfigFidelizacao = async () => {
    try {
      setConfigLoading(true);
      const { config } = await fidelizacaoService.getConfigFidelizacao();
      setConfigSimulacao(!!config.simulacao);
    } catch (error: any) {
      toast.error('Erro ao carregar configuração');
      console.error(error);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleToggleSimulacao = async () => {
    try {
      setSimulacaoToggling(true);
      const newValue = !configSimulacao;
      await fidelizacaoService.atualizarSimulacao(newValue);
      setConfigSimulacao(newValue);
      toast.success(newValue ? 'Simulação ativada' : 'Simulação desativada');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao alterar simulação');
      console.error(error);
    } finally {
      setSimulacaoToggling(false);
    }
  };

  const getStatusNotificacao = (n: any) => {
    if (n.erro) return { label: 'Erro', icon: AlertCircle, className: 'bg-red-100 text-red-800' };
    if (n.enviado_whatsapp) return { label: 'Enviado ao cliente', icon: Send, className: 'bg-green-100 text-green-800' };
    return { label: 'Simulação', icon: TestTube, className: 'bg-amber-100 text-amber-800' };
  };

  // --- Automações
  const loadAutomacoesData = async () => {
    try {
      setAutomacoesLoading(true);
      const [tipos, config, regras] = await Promise.all([
        fidelizacaoService.getAutomacoesTipos(),
        fidelizacaoService.getAutomacoesConfig(),
        fidelizacaoService.listarRegrasAutomacoes(),
      ]);
      setAutomacoesTipos(tipos);
      setAutomacoesConfig(config ?? null);
      setAutomacoesRegras(regras);
    } catch (error: any) {
      toast.error('Erro ao carregar automações');
      console.error(error);
    } finally {
      setAutomacoesLoading(false);
    }
  };

  const handleSaveAutomacoesConfig = async () => {
    if (!automacoesConfig) return;
    try {
      setConfigAutomacoesSaving(true);
      const updated = await fidelizacaoService.updateAutomacoesConfig({
        ativo: automacoesConfig.ativo,
        max_mensagens_por_cliente_semana: automacoesConfig.max_mensagens_por_cliente_semana,
        max_mensagens_por_cliente_mes: automacoesConfig.max_mensagens_por_cliente_mes,
        simulacao: automacoesConfig.simulacao,
      });
      setAutomacoesConfig(updated);
      toast.success('Configuração salva');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar configuração');
    } finally {
      setConfigAutomacoesSaving(false);
    }
  };

  const getTipoGatilhoById = (id: number) => automacoesTipos.find((t) => t.id === id);
  const formatRegraParametros = (regra: FidelizacaoRegra) => {
    const tipo = getTipoGatilhoById(regra.tipo_gatilho_id);
    if (!tipo || !regra.parametros || Object.keys(regra.parametros).length === 0) return '—';
    const parts: string[] = [];
    for (const [k, v] of Object.entries(regra.parametros)) {
      if (v !== undefined && v !== null && v !== '') parts.push(`${k}: ${v}`);
    }
    return parts.length ? parts.join(', ') : '—';
  };

  const handleOpenRegraModal = (regra?: FidelizacaoRegra) => {
    setPreviewResult(null);
    if (regra) {
      setEditingRegra(regra);
      setRegraNome(regra.nome_regra);
      setRegraTipoGatilhoId(regra.tipo_gatilho_id);
      setRegraParametros(regra.parametros || {});
      setRegraMensagem(regra.mensagem_template);
      setRegraFrequenciaMinima(regra.frequencia_minima_dias);
      setRegraHorarioInicio(regra.horario_inicio?.slice(0, 5) || '08:00');
      setRegraHorarioFim(regra.horario_fim?.slice(0, 5) || '20:00');
      setRegraVigenciaInicio(regra.vigencia_inicio?.toString().split('T')[0] || new Date().toISOString().split('T')[0]);
      setRegraVigenciaFim(regra.vigencia_fim ? new Date(regra.vigencia_fim).toISOString().split('T')[0] : '');
      setRegraSegmentacao(() => {
        const seg = regra.segmentacao && typeof regra.segmentacao === 'object' ? regra.segmentacao : {};
        const genero = seg.genero;
        const generoNorm = genero === 'F' ? 'Feminino' : genero === 'M' ? 'Masculino' : genero === 'O' ? 'Outro' : genero;
        return { ...seg, ...(generoNorm !== undefined ? { genero: generoNorm } : {}) };
      });
      setShowSegmentacao(!!(regra.segmentacao && Object.keys(regra.segmentacao).length > 0));
      setRegraAtivo(regra.ativo);
    } else {
      setEditingRegra(null);
      setRegraNome('');
      setRegraTipoGatilhoId('');
      setRegraParametros({});
      setRegraMensagem('');
      setRegraFrequenciaMinima(30);
      setRegraHorarioInicio('08:00');
      setRegraHorarioFim('20:00');
      setRegraVigenciaInicio(new Date().toISOString().split('T')[0]);
      setRegraVigenciaFim('');
      setRegraSegmentacao({});
      setShowSegmentacao(false);
      setRegraAtivo(true);
      const tipo = automacoesTipos[0];
      if (tipo) {
        setRegraTipoGatilhoId(tipo.id);
        setRegraFrequenciaMinima(tipo.frequencia_minima_dias_default);
        const defaults: Record<string, number | string> = {};
        tipo.parametros_schema?.campos?.forEach((c) => { if (c.default !== undefined) defaults[c.nome] = c.default; });
        setRegraParametros(defaults);
      }
    }
    setShowRegraModal(true);
  };

  const handleRegraTipoChange = (tipoId: number) => {
    setRegraTipoGatilhoId(tipoId);
    const tipo = getTipoGatilhoById(tipoId);
    if (tipo) {
      setRegraFrequenciaMinima(tipo.frequencia_minima_dias_default);
      const defaults: Record<string, number | string> = {};
      tipo.parametros_schema?.campos?.forEach((c) => { if (c.default !== undefined) defaults[c.nome] = c.default; });
      setRegraParametros(defaults);
    }
  };

  const handlePreviewRegra = async () => {
    const tipoId = regraTipoGatilhoId === '' ? 0 : regraTipoGatilhoId;
    if (!tipoId || !regraMensagem.trim()) {
      toast.error('Selecione o tipo de gatilho e preencha a mensagem para pré-visualizar.');
      return;
    }
    try {
      setPreviewLoading(true);
      const payload = {
        user_id: 0,
        tipo_gatilho_id: tipoId,
        nome_regra: regraNome || 'Preview',
        parametros: regraParametros,
        mensagem_template: regraMensagem,
        frequencia_minima_dias: regraFrequenciaMinima,
        horario_inicio: regraHorarioInicio.length === 5 ? `${regraHorarioInicio}:00` : regraHorarioInicio,
        horario_fim: regraHorarioFim.length === 5 ? `${regraHorarioFim}:00` : regraHorarioFim,
        vigencia_inicio: regraVigenciaInicio,
        vigencia_fim: regraVigenciaFim || null,
        segmentacao: (() => {
          const cleaned = Object.fromEntries(
            Object.entries(regraSegmentacao).filter(([, v]) => v != null && v !== '')
          ) as SegmentacaoPublico;
          return Object.keys(cleaned).length > 0 ? cleaned : null;
        })(),
        ativo: true,
      };
      const result = await fidelizacaoService.previewRegraAutomacaoByBody(payload as any);
      setPreviewResult(result);
      toast.success(`${result.clientes.length} cliente(s) encontrado(s)`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao pré-visualizar');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveRegra = async () => {
    const tipoId = regraTipoGatilhoId === '' ? 0 : regraTipoGatilhoId;
    if (!regraNome.trim() || !tipoId || !regraMensagem.trim()) {
      toast.error('Preencha nome da regra, tipo de gatilho e mensagem.');
      return;
    }
    try {
      setIsSavingRegra(true);
      const payload = {
        tipo_gatilho_id: tipoId,
        nome_regra: regraNome.trim(),
        parametros: regraParametros,
        mensagem_template: regraMensagem.trim(),
        frequencia_minima_dias: regraFrequenciaMinima,
        horario_inicio: regraHorarioInicio.length === 5 ? `${regraHorarioInicio}:00` : regraHorarioInicio,
        horario_fim: regraHorarioFim.length === 5 ? `${regraHorarioFim}:00` : regraHorarioFim,
        vigencia_inicio: regraVigenciaInicio,
        vigencia_fim: regraVigenciaFim || null,
        segmentacao: (() => {
          const cleaned = Object.fromEntries(
            Object.entries(regraSegmentacao).filter(([, v]) => v != null && v !== '')
          ) as SegmentacaoPublico;
          return Object.keys(cleaned).length > 0 ? cleaned : null;
        })(),
        ativo: regraAtivo,
      };
      if (editingRegra) {
        await fidelizacaoService.updateRegraAutomacao(editingRegra.id, payload as any);
        toast.success('Regra atualizada');
      } else {
        await fidelizacaoService.criarRegraAutomacao(payload as any);
        toast.success('Regra criada');
      }
      loadAutomacoesData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar regra');
    } finally {
      setIsSavingRegra(false);
    }
  };

  const handleDeleteRegra = async (id: number) => {
    if (!window.confirm('Excluir esta regra?')) return;
    try {
      await fidelizacaoService.deleteRegraAutomacao(id);
      toast.success('Regra excluída');
      loadAutomacoesData();
    } catch (error: any) {
      toast.error('Erro ao excluir regra');
    }
  };

  const handleToggleRegra = async (regra: FidelizacaoRegra) => {
    try {
      await fidelizacaoService.toggleRegraAutomacao(regra.id);
      toast.success(regra.ativo ? 'Regra desativada' : 'Regra ativada');
      loadAutomacoesData();
    } catch (error: any) {
      toast.error('Erro ao alterar status');
    }
  };

  /** Abre o modal de pré-visualização com a lista de clientes impactados pela regra */
  const handleOpenPreviewListModal = async (regra: FidelizacaoRegra) => {
    setPreviewListRegraNome(regra.nome_regra);
    setPreviewListData(null);
    setPreviewListSearch('');
    setPreviewListPage(1);
    setPreviewListExpandedRow(null);
    setShowPreviewListModal(true);
    setPreviewListLoading(true);
    try {
      const result = await fidelizacaoService.previewRegraAutomacaoById(regra.id);
      setPreviewListData(result);
      toast.success(`${result.clientes.length} cliente(s) encontrado(s)`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao carregar pré-visualização');
      setPreviewListData({ total_qualificados: 0, total_bloqueados_antispam: 0, clientes: [] });
    } finally {
      setPreviewListLoading(false);
    }
  };

  /** Filtra e pagina clientes do modal de pré-visualização */
  const getPreviewListFilteredAndPaged = () => {
    if (!previewListData?.clientes) return { filtered: [], total: 0, totalPages: 0 };
    const search = previewListSearch.trim().toLowerCase();
    const filtered = search
      ? previewListData.clientes.filter(
          (c) =>
            (c.nome || '').toLowerCase().includes(search) ||
            (c.cpf || '').toLowerCase().includes(search) ||
            (c.telefone || '').toLowerCase().includes(search) ||
            (c.mensagem_previa || '').toLowerCase().includes(search) ||
            (c.data_ultima_visita || '').toLowerCase().includes(search) ||
            (c.data_nascimento || '').toLowerCase().includes(search) ||
            (c.data_cadastro || '').toLowerCase().includes(search) ||
            (c.data_ultima_compra || '').toLowerCase().includes(search) ||
            String(c.qtd_compras ?? '').includes(search)
        )
      : previewListData.clientes;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / previewListPageSize));
    const page = Math.min(previewListPage, totalPages);
    const start = (page - 1) * previewListPageSize;
    const paged = filtered.slice(start, start + previewListPageSize);
    return { filtered: paged, total, totalPages, page };
  };

  const handleReenviarNotificacao = async (id: number) => {
    setReenviandoId(id);
    try {
      const result = await fidelizacaoService.reenviarNotificacao(id);
      if (result.success) {
        toast.success('Mensagem reenviada');
        loadNotificacoes();
      } else {
        toast.error(result.error || 'Falha ao reenviar');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Falha ao reenviar');
      loadNotificacoes();
    } finally {
      setReenviandoId(null);
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

  const handleGerarVoucher = async (conquista: Conquista) => {
    if (conquista.premioServico === 'TOTAL') {
      toast.error('Não é possível gerar voucher para prêmio do tipo TOTAL');
      return;
    }
    setGerandoVoucherId(conquista.id);
    try {
      const result = await fidelizacaoService.gerarVoucherConquista(conquista.id);
      toast.success(`Voucher gerado: ${result.codigo_voucher}`);
      loadConquistas();
      if (conquistaSelecionada?.id === conquista.id) {
        setVoucherCodigo(result.codigo_voucher);
        if (result.data_validade) setVoucherValidade(result.data_validade.split('T')[0]);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao gerar voucher');
      console.error(error);
    } finally {
      setGerandoVoucherId(null);
    }
  };

  const handleOpenEntregaModal = async (conquista: Conquista) => {
    setConquistaSelecionada(conquista);
    const codigoInicial = (conquista.codigoVoucher || '').trim();
    setVoucherCodigo(conquista.codigoVoucher || '');

    let validadeIso = '';
    if (conquista.dataValidade) {
      try {
        const data = new Date(conquista.dataValidade);
        if (!isNaN(data.getTime())) {
          validadeIso = data.toISOString().split('T')[0];
        }
      } catch {
        /* ignore */
      }
    }
    if (!validadeIso) {
      const dataPadrao = new Date();
      dataPadrao.setDate(dataPadrao.getDate() + 30);
      validadeIso = dataPadrao.toISOString().split('T')[0];
    }
    setVoucherValidade(validadeIso);

    setVoucherMensagem('Carregando modelo da mensagem…');
    setShowEntregaModal(true);

    const aplicarTemplate = (raw: string, validadeDiasPremio: number | null | undefined) =>
      buildMensagemEntregaModalCompleta(
        raw,
        conquista.nomeCliente || 'Cliente',
        conquista.premioDescricao,
        validadeDiasPremio,
        codigoInicial,
        validadeIso
      );

    try {
      const [{ config }, premiosList] = await Promise.all([
        fidelizacaoService.getConfigFidelizacao(),
        fidelizacaoService.listarPremios(),
      ]);
      const premio = premiosList.find((p) => p.id === conquista.premioId);
      const raw =
        typeof config.template_mensagem_entrega === 'string' && config.template_mensagem_entrega.trim()
          ? config.template_mensagem_entrega
          : DEFAULT_TEMPLATE_ENTREGA;
      setVoucherMensagem(aplicarTemplate(raw, premio?.validade_dias ?? null));
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar o template de entrega; usando texto padrão.');
      setVoucherMensagem(aplicarTemplate(DEFAULT_TEMPLATE_ENTREGA, null));
    }
  };

  const handleSaveEntrega = async () => {
    if (!conquistaSelecionada) return;
    if (!voucherCodigo.trim()) {
      toast.error('O código do voucher é obrigatório');
      return;
    }

    setIsSavingEntrega(true);
    try {
      // Substituir variáveis na mensagem
      const mensagemFinal = voucherMensagem
        .replace(/{voucher_codigo}/g, voucherCodigo)
        .replace(/{data_validade}/g, voucherValidade ? new Date(voucherValidade).toLocaleDateString('pt-BR') : 'Sem data');

      await fidelizacaoService.registrarEntregaPremio(conquistaSelecionada.id, {
        codigo_voucher: voucherCodigo.trim(),
        data_validade: voucherValidade,
        mensagem: mensagemFinal
      });

      toast.success('Entrega registrada e notificação enviada!');
      setShowEntregaModal(false);
      loadConquistas();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao registrar entrega');
      console.error(error);
    } finally {
      setIsSavingEntrega(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveSubTab('premios')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeSubTab === 'premios'
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
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeSubTab === 'clientes'
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
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeSubTab === 'conquistas'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4" />
              Conquistas
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab('notificacoes')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeSubTab === 'notificacoes'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notificações
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab('automacoes')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeSubTab === 'automacoes'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Automações
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
                  className={`p-4 border rounded-lg ${premio.ativo ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
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
                      {(premio.gerar_automatico || premio.entrega_automatico) && (
                        <p className="text-xs text-primary-700 mt-1">
                          {premio.gerar_automatico && 'Geração automática de voucher · '}
                          {premio.entrega_automatico && 'Entrega automática (VM)'}
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
                      Prêmios Conquistados
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
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-yellow-500" />
                          <span className="font-semibold">{cliente.premiosConquistados}</span>
                          <span className="text-gray-500 text-xs">(Utilizados: {cliente.premiosUtilizados})</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleApurarPremios(cliente.cpf, cliente.nome)}
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
                          <div>
                            <div className="font-medium">{conquista.nomeCliente || 'Sem nome'}</div>
                            <div className="text-gray-500 text-xs">{conquista.cpfCliente}</div>
                            {conquista.telefoneCliente && (
                              <div className="text-gray-500 text-xs">{conquista.telefoneCliente}</div>
                            )}
                          </div>
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
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleMarcarUtilizado(conquista.id)}
                                className="text-primary-600 hover:text-primary-800 text-left font-medium"
                              >
                                Marcar como Utilizado
                              </button>
                              {!conquista.codigoVoucher && (conquista.premioServico === 'LAVAGEM' || conquista.premioServico === 'SECAGEM') && (
                                <button
                                  onClick={() => handleGerarVoucher(conquista)}
                                  disabled={gerandoVoucherId === conquista.id}
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                                >
                                  {gerandoVoucherId === conquista.id ? (
                                    <Loader className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Zap className="w-3 h-3" />
                                  )}
                                  Gerar Voucher
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenEntregaModal(conquista)}
                                className="flex items-center gap-1 text-green-600 hover:text-green-800 font-medium"
                              >
                                <Gift className="w-3 h-3" />
                                Notificar Cliente
                              </button>
                            </div>
                          )}
                          {conquista.codigoVoucher && (
                            <div className="mt-1 text-xs text-gray-500">
                              Voucher: <span className="font-medium text-gray-700">{conquista.codigoVoucher}</span>
                            </div>
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

      {activeSubTab === 'notificacoes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Notificações enviadas</h3>
              <p className="mt-1 text-sm text-gray-500">
                Histórico de notificações de fidelização enviadas aos clientes
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={notificacoesSearch}
                  onChange={(e) => setNotificacoesSearch(e.target.value)}
                  placeholder="Buscar (nome, CPF, telefone, mensagem, tipo)..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
                />
              </div>
              <button
                onClick={handleToggleSimulacao}
                disabled={configLoading || simulacaoToggling}
                className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors disabled:opacity-50 ${
                  configSimulacao
                    ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                    : 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200'
                }`}
              >
                {simulacaoToggling ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : configSimulacao ? (
                  <TestTube className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {configSimulacao ? 'Simulação ativa' : 'Envio real ativo'}
              </button>
            </div>
          </div>

          {notificacoesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : notificacoes.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Nenhuma notificação encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CPF</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telefone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mensagem</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data venda</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {notificacoes.map((n) => {
                    const status = getStatusNotificacao(n);
                    const StatusIcon = status.icon;
                    return (
                      <tr key={n.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{n.cliente_nome ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{n.cpf_cliente ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{n.cliente_telefone ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {n.data_envio ? new Date(n.data_envio).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-700">{n.tipo_notificacao}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" title={n.mensagem_enviada || ''}>
                          {n.mensagem_enviada || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {n.data_venda ? new Date(n.data_venda).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${status.className}`}>
                            <StatusIcon className="w-3 h-3" />
                            {status.label}
                          </span>
                          {n.erro && (
                            <div className="mt-1 text-xs text-red-600 max-w-xs truncate" title={n.erro}>{n.erro}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <button
                            type="button"
                            onClick={() => handleReenviarNotificacao(n.id)}
                            disabled={reenviandoId === n.id}
                            className="text-primary-600 hover:text-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {reenviandoId === n.id ? 'Enviando…' : 'Reenviar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {notificacoesTotal > notificacoesLimit && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Mostrando {(notificacoesPage - 1) * notificacoesLimit + 1} a {Math.min(notificacoesPage * notificacoesLimit, notificacoesTotal)} de {notificacoesTotal}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setNotificacoesPage(p => Math.max(1, p - 1))}
                  disabled={notificacoesPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setNotificacoesPage(p => p + 1)}
                  disabled={notificacoesPage * notificacoesLimit >= notificacoesTotal}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'automacoes' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Automações de relacionamento</h3>
            <p className="mt-1 text-sm text-gray-500">
              Regras parametrizáveis para envio automático de mensagens (inatividade, aniversário, data fixa, etc.)
            </p>
          </div>

          {/* Bloco 1 — Config */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Configurações do módulo</h4>
            {automacoesConfig && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={automacoesConfig.ativo}
                    onChange={(e) => setAutomacoesConfig({ ...automacoesConfig, ativo: e.target.checked })}
                  />
                  <span className="text-sm">Módulo ativo</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={automacoesConfig.simulacao}
                    onChange={(e) => setAutomacoesConfig({ ...automacoesConfig, simulacao: e.target.checked })}
                  />
                  <span className="text-sm">Modo simulação</span>
                </label>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Máx. por cliente/semana</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={automacoesConfig.max_mensagens_por_cliente_semana}
                    onChange={(e) => setAutomacoesConfig({ ...automacoesConfig, max_mensagens_por_cliente_semana: parseInt(e.target.value) || 2 })}
                    className="w-20 px-2 py-1 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Máx. por cliente/mês</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={automacoesConfig.max_mensagens_por_cliente_mes}
                    onChange={(e) => setAutomacoesConfig({ ...automacoesConfig, max_mensagens_por_cliente_mes: parseInt(e.target.value) || 4 })}
                    className="w-20 px-2 py-1 border border-gray-300 rounded"
                  />
                </div>
              </div>
            )}
            {automacoesConfig && (
              <div className="mt-3">
                <button
                  onClick={handleSaveAutomacoesConfig}
                  disabled={configAutomacoesSaving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {configAutomacoesSaving ? <Loader className="w-4 h-4 animate-spin inline" /> : null} Salvar configuração
                </button>
              </div>
            )}
          </div>

          {/* Bloco 2 — Lista de regras */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700">Regras</h4>
            <button
              onClick={() => handleOpenRegraModal()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" />
              Nova regra
            </button>
          </div>

          {automacoesLoading ? (
            <div className="flex justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : automacoesRegras.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Nenhuma regra cadastrada</p>
              <button
                onClick={() => handleOpenRegraModal()}
                className="mt-2 text-primary-600 hover:text-primary-800 font-medium"
              >
                Criar primeira regra
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parâmetro</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Horário</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Freq. mín.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vigência</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {automacoesRegras.map((r) => {
                    const tipo = getTipoGatilhoById(r.tipo_gatilho_id);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.nome_regra}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{tipo?.nome_exibicao ?? r.tipo_gatilho_id}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatRegraParametros(r)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{r.horario_inicio?.slice(0, 5)}–{r.horario_fim?.slice(0, 5)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{r.frequencia_minima_dias} dias</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                              {r.vigencia_inicio ? new Date(r.vigencia_inicio).toLocaleDateString('pt-BR') : '—'}
                              {r.vigencia_fim ? ` → ${new Date(r.vigencia_fim).toLocaleDateString('pt-BR')}` : ' → ∞'}
                            </td>
                        <td className="px-4 py-3">
                          {r.ativo ? (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Ativa</span>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">Inativa</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenPreviewListModal(r)}
                              className="text-primary-600 hover:text-primary-800 flex items-center gap-1 text-sm"
                            >
                              <Eye className="w-4 h-4" />
                              Pré-visualizar
                            </button>
                            <button onClick={() => handleOpenRegraModal(r)} className="p-1 text-gray-400 hover:text-primary-600" title="Editar">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleToggleRegra(r)} className="p-1 text-gray-400 hover:text-amber-600" title={r.ativo ? 'Desativar' : 'Ativar'}>
                              {r.ativo ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                            </button>
                            <button onClick={() => handleDeleteRegra(r.id)} className="p-1 text-gray-400 hover:text-red-600" title="Excluir">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Pré-visualização: lista de clientes impactados pela regra */}
      {showPreviewListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-5xl w-full my-8 max-h-[90vh] flex flex-col">
            <div className="flex-shrink-0 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Pré-visualização: {previewListRegraNome}
              </h3>
              <button
                type="button"
                onClick={() => setShowPreviewListModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={previewListSearch}
                  onChange={(e) => { setPreviewListSearch(e.target.value); setPreviewListPage(1); }}
                  placeholder="Buscar por nome, CPF, telefone, mensagem..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              {previewListData && (
                <span className="text-sm text-gray-600">
                  {previewListData.total_qualificados} qualificado(s) · {previewListData.total_bloqueados_antispam} bloqueado(s) · {previewListData.clientes.length} total
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              {previewListLoading ? (
                <div className="flex justify-center py-12">
                  <Loader className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : previewListData ? (
                (() => {
                  const { filtered, total, totalPages, page } = getPreviewListFilteredAndPaged();
                  return (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Telefone</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">CPF</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data nasc.</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data cadastro</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data última compra</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qtd compras</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mensagem</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {filtered.map((c, idx) => {
                              const rowKey = `${c.cpf}-${(page - 1) * previewListPageSize + idx}`;
                              const isExpanded = previewListExpandedRow === rowKey;
                              return (
                                <tr key={rowKey} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{c.nome || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{c.telefone || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{c.cpf || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{c.data_nascimento || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{c.data_cadastro ?? '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{c.data_ultima_compra || c.data_ultima_visita || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{c.qtd_compras ?? '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <span className={c.status === 'qualificado' ? 'text-green-600 font-medium' : 'text-amber-600'}>
                                      {c.status === 'qualificado' ? 'Qualificado' : 'Bloqueado (anti-spam)'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 max-w-xs">
                                    <div className="flex items-center gap-1">
                                      <span
                                        className="truncate block"
                                        title={c.mensagem_previa}
                                      >
                                        {c.mensagem_previa ? (c.mensagem_previa.length > 50 ? `${c.mensagem_previa.slice(0, 50)}…` : c.mensagem_previa) : '—'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setPreviewListExpandedRow(isExpanded ? null : rowKey)}
                                        className="text-primary-600 hover:text-primary-800 text-xs whitespace-nowrap"
                                      >
                                        {isExpanded ? 'Ocultar' : 'Expandir'}
                                      </button>
                                    </div>
                                    {isExpanded && (
                                      <div className="mt-1 p-2 bg-gray-50 rounded text-gray-700 text-xs whitespace-pre-wrap break-words">
                                        {c.mensagem_previa || '—'}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {total === 0 && (
                        <p className="text-center py-8 text-gray-500">
                          {previewListSearch.trim() ? 'Nenhum cliente encontrado com esse filtro.' : 'Nenhum cliente impactado.'}
                        </p>
                      )}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                          <p className="text-sm text-gray-600">
                            Mostrando {(page - 1) * previewListPageSize + 1} a {Math.min(page * previewListPageSize, total)} de {total}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewListPage((p) => Math.max(1, p - 1))}
                              disabled={page <= 1}
                              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                            >
                              Anterior
                            </button>
                            <span className="py-1 text-sm text-gray-600">
                              Página {page} de {totalPages}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPreviewListPage((p) => Math.min(totalPages, p + 1))}
                              disabled={page >= totalPages}
                              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                            >
                              Próxima
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova/Editar Regra (Automações) */}
      {showRegraModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingRegra ? 'Editar regra' : 'Nova regra'}
              </h3>
              <button type="button" onClick={() => { setShowRegraModal(false); setPreviewResult(null); }} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da regra *</label>
                <input
                  type="text"
                  value={regraNome}
                  onChange={(e) => setRegraNome(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Saudades 30 dias"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de gatilho *</label>
                <select
                  value={regraTipoGatilhoId === '' ? '' : String(regraTipoGatilhoId)}
                  onChange={(e) => handleRegraTipoChange(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Selecione</option>
                  {automacoesTipos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome_exibicao}</option>
                  ))}
                </select>
                {regraTipoGatilhoId && getTipoGatilhoById(Number(regraTipoGatilhoId))?.descricao && (
                  <p className="mt-1 text-xs text-gray-500">{getTipoGatilhoById(Number(regraTipoGatilhoId))!.descricao}</p>
                )}
              </div>
              {regraTipoGatilhoId && getTipoGatilhoById(Number(regraTipoGatilhoId))?.parametros_schema?.campos?.length ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Parâmetros</label>
                  {getTipoGatilhoById(Number(regraTipoGatilhoId))!.parametros_schema.campos.map((campo) => (
                    <div key={campo.nome}>
                      <label className="block text-xs text-gray-500 mb-0.5">{campo.label}</label>
                      {campo.tipo === 'number' ? (
                        <input
                          type="number"
                          min={campo.min}
                          max={campo.max}
                          value={regraParametros[campo.nome] ?? campo.default ?? ''}
                          onChange={(e) => setRegraParametros({ ...regraParametros, [campo.nome]: parseInt(e.target.value, 10) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(regraParametros[campo.nome] ?? campo.default ?? '')}
                          onChange={(e) => setRegraParametros({ ...regraParametros, [campo.nome]: e.target.value })}
                          placeholder={campo.placeholder}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Horário início</label>
                  <input
                    type="time"
                    value={regraHorarioInicio}
                    onChange={(e) => setRegraHorarioInicio(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Horário fim</label>
                  <input
                    type="time"
                    value={regraHorarioFim}
                    onChange={(e) => setRegraHorarioFim(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vigência início *</label>
                  <input
                    type="date"
                    value={regraVigenciaInicio}
                    onChange={(e) => setRegraVigenciaInicio(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vigência fim (opcional)</label>
                  <input
                    type="date"
                    value={regraVigenciaFim}
                    onChange={(e) => setRegraVigenciaFim(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="mt-0.5 text-xs text-gray-500">Deixe em branco para execução permanente</p>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSegmentacao((s) => !s)}
                  className="w-full px-4 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 text-left text-sm font-medium text-gray-700"
                >
                  <span>Segmentação de público (opcional)</span>
                  {Object.values(regraSegmentacao).filter((v) => v != null && v !== '').length > 0 && (
                    <span className="text-xs bg-primary-100 text-primary-800 px-2 py-0.5 rounded">
                      {Object.values(regraSegmentacao).filter((v) => v != null && v !== '').length} filtros ativos
                    </span>
                  )}
                  <span className="text-gray-400">{showSegmentacao ? '▼' : '▶'}</span>
                </button>
                {showSegmentacao && (
                  <div className="p-4 grid grid-cols-2 gap-4 bg-white border-t border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gênero</label>
                      <select
                        value={regraSegmentacao.genero ?? ''}
                        onChange={(e) => setRegraSegmentacao((s) => ({ ...s, genero: e.target.value || undefined }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Qualquer</option>
                        <option value="Masculino">Masculino</option>
                        <option value="Feminino">Feminino</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Idade mín.</label>
                        <input
                          type="number"
                          min={0}
                          value={regraSegmentacao.idade_min ?? ''}
                          onChange={(e) => setRegraSegmentacao((s) => ({ ...s, idade_min: e.target.value ? Number(e.target.value) : undefined }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Idade máx.</label>
                        <input
                          type="number"
                          min={0}
                          value={regraSegmentacao.idade_max ?? ''}
                          onChange={(e) => setRegraSegmentacao((s) => ({ ...s, idade_max: e.target.value ? Number(e.target.value) : undefined }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tempo cadastro mín. (dias)</label>
                      <input
                        type="number"
                        min={0}
                        value={regraSegmentacao.tempo_cadastro_min_dias ?? ''}
                        onChange={(e) => setRegraSegmentacao((s) => ({ ...s, tempo_cadastro_min_dias: e.target.value ? Number(e.target.value) : undefined }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. compras mín.</label>
                        <input
                          type="number"
                          min={0}
                          value={regraSegmentacao.qtd_compras_min ?? ''}
                          onChange={(e) => setRegraSegmentacao((s) => ({ ...s, qtd_compras_min: e.target.value ? Number(e.target.value) : undefined }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. compras máx.</label>
                        <input
                          type="number"
                          min={0}
                          value={regraSegmentacao.qtd_compras_max ?? ''}
                          onChange={(e) => setRegraSegmentacao((s) => ({ ...s, qtd_compras_max: e.target.value ? Number(e.target.value) : undefined }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor gasto mín.</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={regraSegmentacao.valor_gasto_min ?? ''}
                          onChange={(e) => setRegraSegmentacao((s) => ({ ...s, valor_gasto_min: e.target.value ? Number(e.target.value) : undefined }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor gasto máx.</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={regraSegmentacao.valor_gasto_max ?? ''}
                          onChange={(e) => setRegraSegmentacao((s) => ({ ...s, valor_gasto_max: e.target.value ? Number(e.target.value) : undefined }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. compras últimos 90 dias mín.</label>
                      <input
                        type="number"
                        min={0}
                        value={regraSegmentacao.qtd_compras_90_min ?? ''}
                        onChange={(e) => setRegraSegmentacao((s) => ({ ...s, qtd_compras_90_min: e.target.value ? Number(e.target.value) : undefined }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cadastro de</label>
                      <input
                        type="date"
                        value={regraSegmentacao.cadastro_de ?? ''}
                        onChange={(e) => setRegraSegmentacao((s) => ({ ...s, cadastro_de: e.target.value || undefined }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cadastro até</label>
                      <input
                        type="date"
                        value={regraSegmentacao.cadastro_ate ?? ''}
                        onChange={(e) => setRegraSegmentacao((s) => ({ ...s, cadastro_ate: e.target.value || undefined }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pedido de</label>
                      <input
                        type="date"
                        value={regraSegmentacao.pedido_de ?? ''}
                        onChange={(e) => setRegraSegmentacao((s) => ({ ...s, pedido_de: e.target.value || undefined }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pedido até</label>
                      <input
                        type="date"
                        value={regraSegmentacao.pedido_ate ?? ''}
                        onChange={(e) => setRegraSegmentacao((s) => ({ ...s, pedido_ate: e.target.value || undefined }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="col-span-2 flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setRegraSegmentacao({})}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem *</label>
                <textarea
                  value={regraMensagem}
                  onChange={(e) => setRegraMensagem(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  placeholder="Olá {primeiro_nome}, ..."
                />
                {regraTipoGatilhoId && getTipoGatilhoById(Number(regraTipoGatilhoId))?.placeholders_disponiveis?.length ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Placeholders: {getTipoGatilhoById(Number(regraTipoGatilhoId))!.placeholders_disponiveis.join(', ')}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequência mínima (dias)</label>
                <input
                  type="number"
                  min={1}
                  value={regraFrequenciaMinima}
                  onChange={(e) => setRegraFrequenciaMinima(parseInt(e.target.value, 10) || 30)}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-500">Não reenviar para o mesmo cliente antes de X dias</span>
              </div>
              {!editingRegra && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={regraAtivo} onChange={(e) => setRegraAtivo(e.target.checked)} />
                  <span className="text-sm">Regra ativa</span>
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePreviewRegra}
                  disabled={previewLoading || !regraMensagem.trim()}
                  className="flex items-center gap-2 px-4 py-2 border border-primary-600 text-primary-600 rounded-md hover:bg-primary-50 disabled:opacity-50"
                >
                  {previewLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Pré-visualizar
                </button>
                <button
                  type="button"
                  onClick={handleSaveRegra}
                  disabled={isSavingRegra}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {isSavingRegra ? <Loader className="w-4 h-4 animate-spin inline" /> : null} Salvar
                </button>
                <button
                  type="button"
                  onClick={() => { setShowRegraModal(false); setPreviewResult(null); }}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
              {previewResult && (
                <div className="mt-4 border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Pré-visualização — {previewResult.total_qualificados} qualificado(s), {previewResult.total_bloqueados_antispam} bloqueado(s)
                  </h4>
                  <div className="max-h-60 overflow-y-auto border rounded">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Nome</th>
                          <th className="px-3 py-2 text-left">Telefone</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">Mensagem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {previewResult.clientes.slice(0, 50).map((c, i) => (
                          <tr key={c.cpf + i}>
                            <td className="px-3 py-2">{c.nome}</td>
                            <td className="px-3 py-2">{c.telefone ?? '—'}</td>
                            <td className="px-3 py-2">
                              <span className={c.status === 'qualificado' ? 'text-green-600' : 'text-amber-600'}>{c.status}</span>
                            </td>
                            <td className="px-3 py-2 max-w-xs truncate" title={c.mensagem_previa}>{c.mensagem_previa}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewResult.clientes.length > 50 && (
                      <p className="text-xs text-gray-500 px-3 py-2">Mostrando 50 de {previewResult.clientes.length}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor do Voucher (R$) - Opcional
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={premioValorVoucher}
                  onChange={(e) => setPremioValorVoucher(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: 16.95 (para geração via API)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantidade de Utilizações - Opcional
                </label>
                <input
                  type="number"
                  min="1"
                  value={premioQuantidadeUtilizacoes}
                  onChange={(e) => setPremioQuantidadeUtilizacoes(e.target.value === '' ? '' : parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: 1 ou 2 (para geração via API)"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPremioGerarAutomatico(!premioGerarAutomatico)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${premioGerarAutomatico ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${premioGerarAutomatico ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
                <label className="text-sm font-medium text-gray-700">
                  Gerar voucher automaticamente (ciclo VM)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPremioEntregaAutomatico(!premioEntregaAutomatico)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${premioEntregaAutomatico ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${premioEntregaAutomatico ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
                <label className="text-sm font-medium text-gray-700">
                  Entrega automática (WhatsApp com código; sem código, mensagem de conquista)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPremioAtivo(!premioAtivo)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${premioAtivo ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${premioAtivo ? 'translate-x-6' : 'translate-x-1'
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

      {/* Modal de Pedidos Detalhados */}
      {showPedidosModal && clienteSelecionado && (
        <PedidosClienteModal
          isOpen={showPedidosModal}
          onClose={() => setShowPedidosModal(false)}
          cpf={clienteSelecionado.cpf}
          nomeCliente={clienteSelecionado.nome}
        />
      )}

      {/* Modal de Entrega de Prêmio / Notificação */}
      {showEntregaModal && conquistaSelecionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Notificar / Entregar Prêmio</h3>
              <button
                onClick={() => setShowEntregaModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4 overflow-y-auto">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Cliente:</span> {conquistaSelecionada.nomeCliente} ({conquistaSelecionada.cpfCliente})
                </p>
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Prêmio:</span> {conquistaSelecionada.premioDescricao}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código do Voucher / Cupom *
                  </label>
                  <input
                    type="text"
                    value={voucherCodigo}
                    onChange={(e) => setVoucherCodigo(e.target.value)}
                    placeholder="Ex: CUPOM30OFF"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data de Validade
                  </label>
                  <input
                    type="date"
                    value={voucherValidade}
                    onChange={(e) => setVoucherValidade(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensagem de Notificação (WhatsApp)
                </label>
                <textarea
                  value={voucherMensagem}
                  onChange={(e) => setVoucherMensagem(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono"
                  placeholder="Componha sua mensagem aqui..."
                />
                <p className="mt-1 text-xs text-gray-500">
                  Gerado a partir de <strong>template_mensagem_entrega</strong> com nome, prêmio, código e datas já
                  preenchidos. Se alterar código ou validade acima, ao enviar as variáveis restantes no texto ainda
                  serão atualizadas.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-lg">
              <button
                type="button"
                onClick={() => setShowEntregaModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEntrega}
                disabled={isSavingEntrega}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingEntrega ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Gift className="w-4 h-4" />
                    Enviar e Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

