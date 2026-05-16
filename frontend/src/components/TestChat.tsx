import { useState, useEffect, useRef } from 'react';
import { X, Send, Bot, User, Image, Video, FileText } from 'lucide-react';
import { testChatService } from '../services/testChat.service';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

interface Media {
  id: number;
  title: string;
  description: string;
  caption?: string | null;
  fileType: string;
  filename: string;
}

interface Message {
  id: string;
  content: string;
  isFromAi: boolean;
  timestamp: Date;
  media?: Media;
}

interface TestChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestChat = ({ isOpen, onClose }: TestChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isNewConversation, setIsNewConversation] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Limpar histórico no backend quando abrir o chat
      // Isso garante que a IA não misture conversas anteriores
      testChatService.clearHistory().catch((error) => {
        console.error('Erro ao limpar histórico de teste:', error);
        // Não mostrar erro ao usuário, apenas logar
      });
      
      // Limpar mensagens ao abrir
      setMessages([]);
      // Marcar como nova conversa (primeira mensagem resetará o contexto)
      setIsNewConversation(true);
      // Focar no input quando abrir
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      // Limpar mensagens ao fechar
      setMessages([]);
      setInput('');
      setIsNewConversation(true);
    }
  }, [isOpen]);

  useEffect(() => {
    // Rolar para o final quando novas mensagens chegarem
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: input.trim(),
      isFromAi: false,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageToSend = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      // Se for a primeira mensagem de uma nova conversa, passar reset: true
      // Isso garante que o contexto da IA seja limpo no backend
      const reset = isNewConversation;
      const response = await testChatService.sendMessage(messageToSend, reset);
      
      // Após a primeira mensagem, não é mais uma nova conversa
      if (isNewConversation) {
        setIsNewConversation(false);
      }
      
      // Se houver mídias obrigatórias, adicionar mensagens de mídia antes da resposta da IA
      if (response.mandatoryMedias && response.mandatoryMedias.length > 0) {
        const baseTimestamp = Date.now();
        response.mandatoryMedias.forEach((media, index) => {
          // Usar caption se disponível e não vazio, caso contrário usar título + descrição
          const content = media.caption && media.caption.trim() 
            ? media.caption.trim() 
            : `${media.title}\n\n${media.description}`;
          
          const mediaMessage: Message = {
            id: `media-${media.id}-${baseTimestamp}-${index}`,
            content: content,
            isFromAi: true,
            timestamp: new Date(baseTimestamp + index), // Pequeno delay para ordenação
            media: media,
          };
          setMessages((prev) => [...prev, mediaMessage]);
        });
      }
      
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        content: response.response,
        isFromAi: true,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      
      // Mostrar mensagem de erro mais específica
      const errorMsg = error.message || 'Erro ao processar mensagem. Tente novamente.';
      toast.error(errorMsg);
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: errorMsg,
        isFromAi: true,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 h-[600px] bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col z-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <div>
            <h3 className="font-semibold">Teste de IA</h3>
            <p className="text-xs text-blue-100">Simule uma conversa com o agente</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-blue-800 rounded-full p-1 transition-colors"
          aria-label="Fechar chat"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-2 ${message.isFromAi ? 'justify-start' : 'justify-end'}`}
          >
            {message.isFromAi && (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-lg px-4 py-2 ${
                message.isFromAi
                  ? 'bg-white border border-gray-200 text-gray-800'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {/* Exibir mídia se houver */}
              {message.media && (
                <div className="mb-2">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    {message.media.fileType === 'image' && (
                      <img
                        src={`${API_URL}/medias/${message.media.id}/file?token=${localStorage.getItem('token')}`}
                        alt=""
                        className="w-full rounded-lg max-h-48 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    {message.media.fileType === 'video' && (
                      <div className="w-full h-32 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex items-center justify-center">
                        <div className="text-center">
                          <Video className="w-8 h-8 text-white mx-auto mb-1 opacity-80" />
                          <span className="text-white text-xs font-medium">Vídeo</span>
                        </div>
                      </div>
                    )}
                    {message.media.fileType === 'document' && (
                      <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>
              )}
              {message.content && (
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              )}
              <p className={`text-xs mt-1 ${
                message.isFromAi ? 'text-gray-500' : 'text-blue-100'
              }`}>
                {message.timestamp.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            {!message.isFromAi && (
              <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4 bg-white rounded-b-lg">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua mensagem..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Pressione Enter para enviar
        </p>
      </div>
    </div>
  );
};

