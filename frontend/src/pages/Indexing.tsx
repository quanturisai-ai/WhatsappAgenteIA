import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { indexingService, IndexableContent, IndexingStats } from '../services/indexing.service';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Play,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader,
  FileText,
  MessageSquare,
  Image,
  Settings,
} from 'lucide-react';

export const Indexing = () => {
  const navigate = useNavigate();
  const [contents, setContents] = useState<IndexableContent[]>([]);
  const [stats, setStats] = useState<IndexingStats>({
    total: 0,
    indexed: 0,
    pending: 0,
    indexing: 0,
    error: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'indexed' | 'indexing' | 'error'>('all');

  useEffect(() => {
    loadContents();
    // Atualizar a cada 3 segundos quando estiver indexando
    const interval = setInterval(() => {
      if (isIndexing) {
        loadContents();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isIndexing]);

  const loadContents = async () => {
    try {
      setIsLoading(true);
      const data = await indexingService.getStatus();
      setContents(data.contents);
      setStats(data.stats);
      
      // Verificar se ainda há itens sendo indexados
      if (data.stats.indexing === 0 && isIndexing) {
        setIsIndexing(false);
        toast.success('Indexação concluída!');
      }
    } catch (error: any) {
      toast.error('Erro ao carregar conteúdos');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartIndexing = async () => {
    if (stats.pending === 0 && stats.error === 0) {
      toast.info('Não há conteúdos pendentes para indexar');
      return;
    }

    try {
      setIsIndexing(true);
      await indexingService.startIndexing();
      toast.success('Indexação iniciada em background');
      // Começar a atualizar imediatamente
      setTimeout(loadContents, 1000);
    } catch (error: any) {
      toast.error('Erro ao iniciar indexação');
      console.error(error);
      setIsIndexing(false);
    }
  };

  const handleReindex = async (content: IndexableContent) => {
    try {
      await indexingService.indexContent(content.type, content.metadata.id);
      toast.success('Reindexação iniciada');
      setTimeout(loadContents, 1000);
    } catch (error: any) {
      toast.error('Erro ao reindexar conteúdo');
      console.error(error);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'agent_config':
        return <Settings className="w-5 h-5 text-blue-500" />;
      case 'topic':
        return <MessageSquare className="w-5 h-5 text-green-500" />;
      case 'document':
        return <FileText className="w-5 h-5 text-purple-500" />;
      case 'media':
        return <Image className="w-5 h-5 text-orange-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'agent_config':
        return 'Informações do Negócio';
      case 'topic':
        return 'Tópico';
      case 'document':
        return 'Documento';
      case 'media':
        return 'Mídia';
      default:
        return type;
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'indexed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'indexing':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'indexed':
        return 'Indexado';
      case 'indexing':
        return 'Indexando...';
      case 'pending':
        return 'Pendente';
      case 'error':
        return 'Erro';
      default:
        return 'Pendente';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'indexed':
        return 'bg-green-100 text-green-800';
      case 'indexing':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('pt-BR');
  };

  const filteredContents = contents.filter(content => {
    if (filter === 'all') return true;
    return content.indexingStatus === filter;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Voltar ao dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-2xl font-bold text-gray-900">Indexação e Vetorização</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Gerencie a indexação de todo o conteúdo no ChromaDB
            </p>
          </div>

          {/* Stats */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-sm text-gray-500">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.indexed}</div>
                <div className="text-sm text-gray-500">Indexados</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                <div className="text-sm text-gray-500">Pendentes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.indexing}</div>
                <div className="text-sm text-gray-500">Indexando</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.error}</div>
                <div className="text-sm text-gray-500">Erros</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'pending'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Pendentes
              </button>
              <button
                onClick={() => setFilter('indexed')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'indexed'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Indexados
              </button>
              <button
                onClick={() => setFilter('error')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'error'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Erros
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={loadContents}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
              <button
                onClick={handleStartIndexing}
                disabled={isIndexing || (stats.pending === 0 && stats.error === 0)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isIndexing ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Indexando...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Iniciar Indexação
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="px-6 py-4">
            {isLoading && contents.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-6 h-6 animate-spin text-primary-600" />
              </div>
            ) : filteredContents.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum conteúdo encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Título
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Última Indexação
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredContents.map((content) => (
                      <tr key={content.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getTypeIcon(content.type)}
                            <span className="text-sm text-gray-900">{getTypeLabel(content.type)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{content.title}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(content.indexingStatus)}
                            <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(content.indexingStatus)}`}>
                              {getStatusLabel(content.indexingStatus)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(content.lastIndexedAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleReindex(content)}
                            disabled={content.indexingStatus === 'indexing'}
                            className="text-primary-600 hover:text-primary-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Reindexar"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

