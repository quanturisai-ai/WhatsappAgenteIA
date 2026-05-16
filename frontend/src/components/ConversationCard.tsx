import { Conversation } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, User, AlertCircle } from 'lucide-react';

interface ConversationCardProps {
  conversation: Conversation;
  onClick: () => void;
}

export const ConversationCard = ({ conversation, onClick }: ConversationCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-green-100 text-green-800';
      case 'finished':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'new':
        return 'Nova';
      case 'in_progress':
        return 'Em Atendimento';
      case 'finished':
        return 'Finalizada';
      default:
        return status;
    }
  };

  const formatLastMessage = (date?: string) => {
    if (!date) return 'Sem mensagens';
    try {
      return formatDistanceToNow(new Date(date), {
        addSuffix: true,
        locale: ptBR,
      });
    } catch {
      return 'Sem mensagens';
    }
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow border border-gray-200"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-gray-900">
              {conversation.contactName || conversation.contactNumber}
            </h4>
            {conversation.needsIntervention && (
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" title="Precisa intervenção humana" />
            )}
          </div>
          <p className="text-sm text-gray-500">{conversation.contactNumber}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor(conversation.status)}`}>
          {getStatusLabel(conversation.status)}
        </span>
      </div>

      {conversation.lastMessage ? (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs italic text-gray-600 line-clamp-2">
            {conversation.lastMessage}
          </p>
        </div>
      ) : (
        // Debug: mostrar se não há lastMessage
        process.env.NODE_ENV === 'development' && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 italic">
              (sem última mensagem)
            </p>
          </div>
        )
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{conversation.messageCount} mensagens</span>
          {conversation.isAutoResponding ? (
            <span className="flex items-center justify-center bg-green-100 text-green-800 w-6 h-6 rounded-full">
              <Bot className="w-3.5 h-3.5" />
            </span>
          ) : (
            <span className="flex items-center justify-center bg-blue-100 text-blue-800 w-6 h-6 rounded-full">
              <User className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {formatLastMessage(conversation.lastMessageAt)}
        </span>
      </div>
    </div>
  );
};

