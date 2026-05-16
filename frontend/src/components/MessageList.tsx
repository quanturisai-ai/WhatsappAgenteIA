import { useEffect, useRef, useState, useMemo } from 'react';
import { Message } from '../types';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, User, Check, CheckCheck, Image, Video, FileText } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

interface MessageListProps {
  messages: Message[];
  conversationId: number;
}

interface GroupedMessage {
  date: string;
  dateLabel: string;
  messages: Message[];
}

export const MessageList = ({ messages, conversationId }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(messages.length);
  const [videoErrors, setVideoErrors] = useState<Set<number>>(new Set());

  console.log('MessageList renderizado com', messages.length, 'mensagens:', messages);

  // Função para formatar label de data
  const getDateLabel = (date: Date): string => {
    if (isToday(date)) {
      return 'hoje';
    } else if (isYesterday(date)) {
      return 'ontem';
    } else {
      return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  // Agrupar mensagens por data e ordenar
  const groupedMessages = useMemo(() => {
    if (!messages || messages.length === 0) {
      return [];
    }

    // Ordenar mensagens por data (mais antigas primeiro)
    const sortedMessages = [...messages].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });

    // Agrupar por data (apenas dia, ignorando hora)
    const groups = new Map<string, Message[]>();
    
    sortedMessages.forEach((message) => {
      if (!message.createdAt) return;
      
      try {
        const messageDate = parseISO(message.createdAt);
        // Criar chave única por dia (YYYY-MM-DD)
        const dateKey = format(messageDate, 'yyyy-MM-dd');
        
        if (!groups.has(dateKey)) {
          groups.set(dateKey, []);
        }
        groups.get(dateKey)!.push(message);
      } catch (e) {
        console.error('Erro ao processar data da mensagem:', message.createdAt, e);
      }
    });

    // Converter para array e ordenar por data (mais antigas primeiro)
    const grouped: GroupedMessage[] = Array.from(groups.entries())
      .map(([dateKey, msgs]) => {
        const firstMessageDate = msgs[0]?.createdAt ? parseISO(msgs[0].createdAt) : new Date();
        return {
          date: dateKey,
          dateLabel: getDateLabel(firstMessageDate),
          messages: msgs.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateA - dateB;
          }),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return grouped;
  }, [messages]);

  // Função para verificar se está no final do scroll
  const isAtBottom = () => {
    if (!containerRef.current) return true;
    const container = containerRef.current.parentElement as HTMLElement;
    if (!container) return true;
    
    const threshold = 100; // pixels de tolerância
    const isBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    return isBottom;
  };

  // Função para rolar até o final
  const scrollToBottom = (smooth: boolean = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Verificar posição do scroll e atualizar ref
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current.parentElement as HTMLElement;
    if (!container) return;

    const handleScroll = () => {
      wasAtBottomRef.current = isAtBottom();
    };

    // Verificar posição inicial
    wasAtBottomRef.current = isAtBottom();

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Rolar até o final quando novas mensagens chegam
  useEffect(() => {
    const newMessageAdded = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    // Se estava no final OU se uma nova mensagem foi adicionada, rolar para o final
    if (wasAtBottomRef.current || newMessageAdded) {
      // Usar requestAnimationFrame para garantir que o DOM foi atualizado
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToBottom(true);
          wasAtBottomRef.current = true;
        }, 50);
      });
    }
  }, [messages.length]);

  // Rolar até o final quando o componente monta pela primeira vez ou quando a conversa muda
  useEffect(() => {
    // Resetar refs quando a conversa muda
    wasAtBottomRef.current = true;
    prevMessagesLengthRef.current = 0;
    
    // Rolar para o final após um pequeno delay para garantir que o DOM está pronto
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToBottom(false); // Usar 'auto' para scroll instantâneo no carregamento inicial
        wasAtBottomRef.current = true;
      }, 150);
    });
  }, [conversationId]);

  // Função para renderizar uma mensagem individual
  const renderMessage = (message: Message) => {
    console.log('Renderizando mensagem:', message);
    return (
      <div
        key={message.id}
        className={`flex gap-3 ${
          message.direction === 'outgoing' ? 'justify-end' : 'justify-start'
        }`}
      >
            {message.direction === 'incoming' && (
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary-600" />
                </div>
              </div>
            )}
            <div className="flex flex-col">
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.direction === 'outgoing'
                    ? message.isFromAi
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 text-gray-900'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="flex items-start gap-2">
                  {message.direction === 'outgoing' && message.isFromAi && (
                    <Bot className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    {/* Exibir mídia se houver */}
                    {message.media && (
                      <div className="mb-2">
                        <div className={`rounded-lg overflow-hidden ${
                          message.direction === 'outgoing'
                            ? message.isFromAi
                              ? 'bg-primary-500'
                              : 'bg-gray-100'
                            : 'bg-gray-50'
                        }`}>
                          {message.media.fileType === 'image' && (
                            <img
                              src={`${API_URL}/medias/${message.media.id}/file?token=${localStorage.getItem('token')}`}
                              alt={message.media.title || 'Imagem'}
                              className="w-full max-h-64 object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                          {message.media.fileType === 'video' && (
                            videoErrors.has(message.media.id) ? (
                              <div className={`w-full h-32 flex items-center justify-center ${
                                message.direction === 'outgoing'
                                  ? message.isFromAi
                                    ? 'bg-primary-700'
                                    : 'bg-gray-200'
                                  : 'bg-gray-100'
                              }`}>
                                <div className="text-center">
                                  <Video className={`w-8 h-8 mx-auto mb-1 ${
                                    message.direction === 'outgoing'
                                      ? message.isFromAi
                                        ? 'text-white'
                                        : 'text-gray-600'
                                      : 'text-gray-600'
                                  }`} />
                                  <span className={`text-xs font-medium ${
                                    message.direction === 'outgoing'
                                      ? message.isFromAi
                                        ? 'text-white'
                                        : 'text-gray-600'
                                      : 'text-gray-600'
                                  }`}>Vídeo não disponível</span>
                                </div>
                              </div>
                            ) : (
                              <video
                                src={`${API_URL}/medias/${message.media.id}/file?token=${localStorage.getItem('token')}`}
                                controls
                                className="w-full max-h-64 object-contain bg-black rounded"
                                preload="metadata"
                                onError={() => {
                                  // Marcar este vídeo como com erro
                                  setVideoErrors(prev => new Set(prev).add(message.media.id));
                                }}
                              >
                                Seu navegador não suporta a reprodução de vídeos.
                              </video>
                            )
                          )}
                          {message.media.fileType === 'document' && (
                            <div className={`w-full h-32 flex items-center justify-center ${
                              message.direction === 'outgoing'
                                ? message.isFromAi
                                  ? 'bg-primary-700'
                                  : 'bg-gray-200'
                                : 'bg-gray-100'
                            }`}>
                              <FileText className={`w-8 h-8 ${
                                message.direction === 'outgoing'
                                  ? message.isFromAi
                                    ? 'text-white'
                                    : 'text-gray-600'
                                  : 'text-gray-600'
                              }`} />
                            </div>
                          )}
                          {(message.media.caption || message.content) && (
                            <div className={`p-2 ${
                              message.direction === 'outgoing'
                                ? message.isFromAi
                                  ? 'bg-primary-600'
                                  : 'bg-gray-200'
                                : 'bg-gray-100'
                            }`}>
                              <p className={`text-xs ${
                                message.direction === 'outgoing'
                                  ? message.isFromAi
                                    ? 'text-white'
                                    : 'text-gray-900'
                                  : 'text-gray-900'
                              }`}>
                                {message.media.caption || message.content}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Exibir conteúdo de texto apenas se não for mídia ou se tiver conteúdo além da mídia */}
                    {(!message.media || (message.content && !message.media.caption)) && (
                      <p className="text-sm whitespace-pre-wrap">{message.content || '(sem conteúdo)'}</p>
                    )}
                    
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <p
                        className={`text-xs ${
                          message.direction === 'outgoing'
                            ? message.isFromAi
                              ? 'text-primary-100'
                              : 'text-gray-500'
                            : 'text-gray-500'
                        }`}
                      >
                        {message.createdAt ? (
                          (() => {
                            try {
                              return format(new Date(message.createdAt), 'HH:mm', { locale: ptBR });
                            } catch (e) {
                              console.error('Erro ao formatar data:', message.createdAt, e);
                              return '--:--';
                            }
                          })()
                        ) : (
                          '--:--'
                        )}
                      </p>
                      {message.isFromAi && (
                        <span className={`text-xs ${
                          message.direction === 'outgoing'
                            ? message.isFromAi
                              ? 'text-primary-100'
                              : 'text-gray-500'
                            : 'text-gray-500'
                        }`}>• IA</span>
                      )}
                      {/* Ícones de status de recebimento e leitura */}
                      {message.direction === 'outgoing' && (
                        <div className="flex items-center ml-1">
                          {message.readAt ? (
                            <CheckCheck className={`w-3.5 h-3.5 ${
                              message.isFromAi ? 'text-primary-100' : 'text-gray-500'
                            }`} title={`Lida em ${message.readAt ? format(new Date(message.readAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''}`} />
                          ) : message.receivedAt ? (
                            <Check className={`w-3.5 h-3.5 ${
                              message.isFromAi ? 'text-primary-100' : 'text-gray-500'
                            }`} title={`Recebida em ${message.receivedAt ? format(new Date(message.receivedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''}`} />
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Exibir reações no lado inferior esquerdo da mensagem */}
              {message.reactions && message.reactions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 ml-1">
                  {(() => {
                    // Agrupar reações por emoji
                    const groupedReactions = message.reactions.reduce((acc, reaction) => {
                      if (!acc[reaction.reactionEmoji]) {
                        acc[reaction.reactionEmoji] = [];
                      }
                      acc[reaction.reactionEmoji].push(reaction);
                      return acc;
                    }, {} as Record<string, typeof message.reactions>);

                    return Object.entries(groupedReactions).map(([emoji, reactions]) => (
                      <span
                        key={emoji}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded-full text-xs border border-gray-300 shadow-sm hover:shadow-md transition-shadow"
                        title={`Reagido por: ${reactions.map(r => r.reactedBy).join(', ')}`}
                      >
                        <span className="text-base">{emoji}</span>
                        {reactions.length > 1 && (
                          <span className="text-gray-600 font-medium">
                            {reactions.length}
                          </span>
                        )}
                      </span>
                    ));
                  })()}
                </div>
              )}

            </div>
            {message.direction === 'outgoing' && (
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  {message.isFromAi ? (
                    <Bot className="w-4 h-4 text-gray-600" />
                  ) : (
                    <User className="w-4 h-4 text-gray-600" />
                  )}
                </div>
              </div>
            )}
          </div>
    );
  };

  return (
    <div ref={containerRef} className="p-6 space-y-4">
      {!messages || messages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Nenhuma mensagem ainda</p>
        </div>
      ) : (
        groupedMessages.map((group) => (
          <div key={group.date} className="space-y-4">
            {/* Divisória de data */}
            <div className="flex items-center justify-center my-6">
              <div className="flex items-center gap-3 w-full">
                <div className="flex-1 border-t border-gray-300"></div>
                <span className="text-xs font-medium text-gray-500 uppercase px-3">
                  {group.dateLabel}
                </span>
                <div className="flex-1 border-t border-gray-300"></div>
              </div>
            </div>
            
            {/* Mensagens do grupo */}
            {group.messages.map((message) => renderMessage(message))}
          </div>
        ))
      )}
      {/* Elemento invisível no final para scroll automático */}
      <div ref={messagesEndRef} />
    </div>
  );
};

