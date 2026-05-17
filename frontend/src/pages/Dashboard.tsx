import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { KanbanBoard } from '../components/KanbanBoard';
import { ConversationPanel } from '../components/ConversationPanel';
import { NewConversationModal } from '../components/NewConversationModal';
import { Conversation } from '../types';
import { Settings, Smartphone } from 'lucide-react';
import { whatsappService } from '../services/whatsapp.service';
import { conversationService } from '../services/conversation.service';
import { vmLavService, VmLavCliente, VmLavCredentials } from '../services/vmLav.service';
import { WhatsAppStatus as WhatsAppStatusType } from '../types';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export const Dashboard = () => {
  const { user } = useAuthStore();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatusType | null>(null);
  const [vmLavCredentials, setVmLavCredentials] = useState<VmLavCredentials | null>(null);
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);

  const handleConversationClick = (conversation: Conversation) => {
    setSelectedConversation(conversation);
  };

  const handleClosePanel = () => {
    setSelectedConversation(null);
  };

  const handleConversationUpdate = (updatedConversation: Conversation) => {
    setSelectedConversation(updatedConversation);
  };

  const handleSelectClient = async (client: VmLavCliente) => {
    if (!client.telefone) {
      toast.error('Cliente não possui telefone cadastrado');
      return;
    }

    try {
      // Normalizar telefone (remover caracteres não numéricos, exceto o + inicial se houver)
      let phoneNumber = client.telefone.replace(/\D/g, '');

      // Se não começar com 55 (código do Brasil), adicionar
      if (!phoneNumber.startsWith('55')) {
        phoneNumber = '55' + phoneNumber;
      }

      // Criar ou buscar conversa existente
      const conversation = await conversationService.createConversation(
        phoneNumber,
        client.nome || undefined
      );

      // Abrir a conversa
      setSelectedConversation(conversation);
      toast.success('Conversa iniciada com sucesso');
    } catch (error: any) {
      console.error('Erro ao criar conversa:', error);
      toast.error(error.response?.data?.message || 'Erro ao criar conversa');
    }
  };
  useEffect(() => {
    const loadWhatsAppStatus = async () => {
      try {
        const status = await whatsappService.getStatus();
        setWhatsappStatus(status);
      } catch (error) {
        console.error('Erro ao carregar status do WhatsApp:', error);
      }
    };

    const loadVmLavStatus = async () => {
      try {
        const { credentials } = await vmLavService.obterCredenciais();
        setVmLavCredentials(credentials);
      } catch (error) {
        console.error('Erro ao carregar status do VM Lav:', error);
      }
    };

    loadWhatsAppStatus();
    loadVmLavStatus();

    // Atualizar status a cada 10 segundos
    const interval = setInterval(() => {
      loadWhatsAppStatus();
      loadVmLavStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'authenticated':
        return 'bg-green-100 text-green-800';
      case 'connecting':
        return 'bg-yellow-100 text-yellow-800';
      case 'disconnected':
        return 'bg-red-100 text-red-800';
      case 'connection_failed':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getVmLavStatusColor = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'bg-green-100 text-green-800';
      case 'erro':
        return 'bg-red-100 text-red-800';
      case 'inativo':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getVmLavStatusLabel = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'Conectado';
      case 'erro':
        return 'Erro';
      case 'inativo':
        return 'Inativo';
      default:
        return status;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Conectado';
      case 'authenticated':
        return 'Autenticado';
      case 'connecting':
        return 'Conectando...';
      case 'disconnected':
        return 'Desconectado';
      case 'connection_failed':
        return 'Reconectando...';
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-auto">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Agente Zap 🤖
              </h1>
              <p className="text-sm text-gray-500">
                Bem-vindo, {user?.username}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/whatsapp"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Smartphone className="w-4 h-4" />
                WhatsApp
                {whatsappStatus && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(whatsappStatus.status)}`}>
                    {getStatusLabel(whatsappStatus.status)}
                  </span>
                )}
              </Link>
              <Link
                to="/config"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4" />
                VM Lav
                {vmLavCredentials && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${getVmLavStatusColor(vmLavCredentials.status)}`}>
                    {getVmLavStatusLabel(vmLavCredentials.status)}
                  </span>
                )}
              </Link>
              <Link
                to="/config"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Settings className="w-4 h-4" />
                Configurações
              </Link>
              <button
                onClick={() => {
                  useAuthStore.getState().logout();
                  window.location.href = '/login';
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-8xl mx-auto">
        {selectedConversation ? (
          <ConversationPanel
            conversation={selectedConversation}
            onClose={handleClosePanel}
            onConversationUpdate={handleConversationUpdate}
          />
        ) : (
          <KanbanBoard
            onConversationClick={handleConversationClick}
            onNewConversation={() => setShowNewConversationModal(true)}
          />
        )}
      </div>

      {/* Modal de Nova Conversa */}
      <NewConversationModal
        isOpen={showNewConversationModal}
        onClose={() => setShowNewConversationModal(false)}
        onSelectClient={handleSelectClient}
      />
    </div>
  );
};

