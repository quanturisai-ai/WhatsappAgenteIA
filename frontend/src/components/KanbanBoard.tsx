import { useState, useEffect } from 'react';
import { Conversation } from '../types';
import { conversationService } from '../services/conversation.service';
import { socketService } from '../services/socket.service';
import { authService } from '../services/auth.service';
import { ConversationCard } from './ConversationCard';
import toast from 'react-hot-toast';
import { Search, X, Plus } from 'lucide-react';

interface KanbanBoardProps {
  onConversationClick: (conversation: Conversation) => void;
  onNewConversation?: () => void;
}

export const KanbanBoard = ({ onConversationClick, onNewConversation }: KanbanBoardProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeSearchTerm, setActiveSearchTerm] = useState<string>('');

  const loadConversations = async (search?: string, silent: boolean = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      const data = await conversationService.listConversations(undefined, search);
      setConversations(data);
    } catch (error: any) {
      if (!silent) {
        toast.error('Erro ao carregar conversas');
      }
      console.error(error);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  const handleSearch = () => {
    const term = searchTerm.trim();
    setActiveSearchTerm(term);
    setIsSearching(true);
    loadConversations(term || undefined, false).finally(() => {
      setIsSearching(false);
    });
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setActiveSearchTerm('');
    setIsSearching(true);
    loadConversations(undefined, false).finally(() => {
      setIsSearching(false);
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Carregar conversas inicialmente
  useEffect(() => {
    loadConversations();
  }, []);

  // Socket: atualizações em tempo real (substitui polling de 5s)
  useEffect(() => {
    const token = authService.getToken();
    if (!token) return;

    const socket = socketService.connect(token);
    if (!socket) return;

    const handleConversationUpdated = (data: { conversation: Conversation }) => {
      if (activeSearchTerm.trim()) return; // Não atualizar durante busca
      setConversations((prev) =>
        prev.map((c) => (c.id === data.conversation.id ? data.conversation : c))
      );
    };

    const handleConversationNew = (data: { conversation: Conversation }) => {
      if (activeSearchTerm.trim()) return;
      setConversations((prev) => {
        if (prev.some((c) => c.id === data.conversation.id)) return prev;
        return [data.conversation, ...prev];
      });
    };

    const handleConnect = () => {
      loadConversations(undefined, true);
    };

    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('conversation:new', handleConversationNew);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('conversation:new', handleConversationNew);
      socket.off('connect', handleConnect);
    };
  }, [activeSearchTerm]);

  // Filtrar conversas que precisam intervenção
  const pendingConversations = conversations.filter((c) => c.needsIntervention === true);
  
  // Filtrar outras colunas excluindo conversas que precisam intervenção
  const newConversations = conversations.filter((c) => c.status === 'new' && c.needsIntervention !== true);
  const inProgressConversations = conversations.filter((c) => c.status === 'in_progress' && c.needsIntervention !== true);
  const finishedConversations = conversations.filter((c) => c.status === 'finished' && c.needsIntervention !== true);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando conversas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {onNewConversation && (
              <button
                onClick={onNewConversation}
                className="w-9 h-9 bg-primary-600 text-white rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-all flex items-center justify-center"
                title="Nova Conversa"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-2xl font-bold text-gray-900">Conversas</h2>
          </div>
          
          {/* Campo de Busca */}
          <div className="flex gap-2 items-center">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Buscar por nome, telefone, CPF, email ou texto da conversa..."
                className="block w-80 pl-10 pr-10 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
              {searchTerm && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <button
                    onClick={handleClearSearch}
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    title="Limpar busca"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isSearching ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Buscando...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  <span>Buscar</span>
                </>
              )}
            </button>
          </div>
        </div>
        {activeSearchTerm && !isSearching && (
          <p className="text-sm text-gray-500">
            {conversations.length} conversa{conversations.length !== 1 ? 's' : ''} encontrada{conversations.length !== 1 ? 's' : ''} para "{activeSearchTerm}"
          </p>
        )}
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
        {/* Coluna: Pendências */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Pendências
            </h3>
            <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {pendingConversations.length}
            </span>
          </div>
          <div className="space-y-3">
            {pendingConversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                conversation={conversation}
                onClick={() => onConversationClick(conversation)}
              />
            ))}
            {pendingConversations.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                Nenhuma pendência
              </p>
            )}
          </div>
        </div>

        {/* Coluna: Nova Interação */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Nova Interação
            </h3>
            <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {newConversations.length}
            </span>
          </div>
          <div className="space-y-3">
            {newConversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                conversation={conversation}
                onClick={() => onConversationClick(conversation)}
              />
            ))}
            {newConversations.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                Nenhuma nova conversa
              </p>
            )}
          </div>
        </div>

        {/* Coluna: Em Atendimento */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Em Atendimento
            </h3>
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {inProgressConversations.length}
            </span>
          </div>
          <div className="space-y-3">
            {inProgressConversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                conversation={conversation}
                onClick={() => onConversationClick(conversation)}
              />
            ))}
            {inProgressConversations.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                Nenhuma conversa em atendimento
              </p>
            )}
          </div>
        </div>

        {/* Coluna: Finalizado */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Finalizado
            </h3>
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {finishedConversations.length}
            </span>
          </div>
          <div className="space-y-3">
            {finishedConversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                conversation={conversation}
                onClick={() => onConversationClick(conversation)}
              />
            ))}
            {finishedConversations.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                Nenhuma conversa finalizada
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

