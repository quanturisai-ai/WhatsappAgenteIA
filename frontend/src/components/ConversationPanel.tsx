import { useState, useEffect, useCallback } from 'react';
import { Conversation, Message } from '../types';
import { conversationService } from '../services/conversation.service';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { socketService } from '../services/socket.service';
import { authService } from '../services/auth.service';
import toast from 'react-hot-toast';
import { X, Pause, Play, CheckCircle, AlertCircle, Gift } from 'lucide-react';
import { humanAttendantService } from '../services/humanAttendant.service';
import { fidelizacaoService, ClienteFidelidade } from '../services/fidelizacao.service';

interface ConversationPanelProps {
  conversation: Conversation;
  onClose: () => void;
  onConversationUpdate?: (conversation: Conversation) => void;
}

export const ConversationPanel = ({ conversation, onClose, onConversationUpdate }: ConversationPanelProps) => {
  const [currentConversation, setCurrentConversation] = useState<Conversation>(conversation);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fidelizacao, setFidelizacao] = useState<ClienteFidelidade | null>(null);
  const [loadingFidelizacao, setLoadingFidelizacao] = useState(false);
  // Converter valor inicial para boolean (pode vir como 0/1 do banco)
  const initialAutoResponding = conversation.isAutoResponding;
  const initialAutoRespondingBool = initialAutoResponding === true || initialAutoResponding === 1 || initialAutoResponding === '1';
  const [isAutoResponding, setIsAutoResponding] = useState(initialAutoRespondingBool);

  // Atualizar conversa local quando o prop mudar
  useEffect(() => {
    setCurrentConversation(conversation);
  }, [conversation]);

  const loadFidelizacao = useCallback(async (cpf: string) => {
    if (!cpf) return;
    
    setLoadingFidelizacao(true);
    try {
      const data = await fidelizacaoService.obterFidelizacaoPorCpf(cpf);
      setFidelizacao(data);
    } catch (error: any) {
      // Não mostrar erro se não encontrar - cliente pode não ter dados de fidelização
      if (error.response?.status !== 404) {
        console.error('Erro ao carregar fidelização:', error);
      }
      setFidelizacao(null);
    } finally {
      setLoadingFidelizacao(false);
    }
  }, []);

  const loadMessages = async (preserveScroll: boolean = false, silent: boolean = false) => {
    try {
      // Verificar se está no final antes de carregar (para polling)
      const container = document.getElementById(`messages-container-${currentConversation.id}`) as HTMLElement;
      let wasAtBottom = true;
      if (preserveScroll && container) {
        const threshold = 100;
        wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      }

      // Só mostrar loading se não for uma atualização silenciosa
      if (!silent) {
        setIsLoading(true);
      }

      const data = await conversationService.getConversation(currentConversation.id);
      console.log('Mensagens carregadas:', {
        count: data.messages.length,
        messages: data.messages.map(m => ({
          id: m.id,
          content: m.content?.substring(0, 30) + '...',
          direction: m.direction,
          isFromAi: m.isFromAi,
        })),
        cliente: data.conversation.cliente
      });
      
      // Atualizar conversa com dados do cliente
      if (data.conversation.cliente) {
        setCurrentConversation(prev => ({
          ...prev,
          cliente: data.conversation.cliente
        }));
        
        // Carregar dados de fidelização se tiver CPF
        if (data.conversation.cliente.cpf) {
          loadFidelizacao(data.conversation.cliente.cpf);
        }
      }

      // Atualizar estado de forma inteligente - fazer merge em vez de substituir
      setMessages((prevMessages) => {
        // Se for uma atualização silenciosa, fazer merge inteligente
        if (silent && prevMessages.length > 0) {
          const newMessages = data.messages || [];
          
          // Criar sets de IDs e messageIds existentes para comparação rápida
          const existingIds = new Set(prevMessages.map(m => m.id).filter(id => id != null));
          const existingMessageIds = new Set(prevMessages.map(m => m.messageId).filter(id => id != null));
          
          // Adicionar apenas mensagens novas que não existem no estado atual
          // Verificar por ID numérico e por messageId
          const onlyNewMessages = newMessages.filter(m => {
            // Se tem ID numérico, verificar se já existe
            if (m.id && existingIds.has(m.id)) {
              return false;
            }
            // Se tem messageId, verificar se já existe
            if (m.messageId && existingMessageIds.has(m.messageId)) {
              return false;
            }
            return true;
          });
          
          // Se não há mensagens novas, não atualizar nada (evita re-render)
          if (onlyNewMessages.length === 0) {
            console.log('Nenhuma mensagem nova, mantendo estado atual');
            return prevMessages;
          }
          
          // Adicionar apenas as novas mensagens ao final
          console.log(`Adicionando ${onlyNewMessages.length} mensagens novas via polling`);
          return [...prevMessages, ...onlyNewMessages];
        }
        
        // Se não for silencioso ou se não há mensagens anteriores, substituir normalmente
        return data.messages || [];
      });

      // Atualizar estado de auto-resposta do banco de dados
      // Isso garante que o estado sempre reflete o banco de dados
      // Converter explicitamente para boolean (pode vir como 0/1 do banco)
      const autoRespondingValue = data.conversation.isAutoResponding;
      const isAutoRespondingBool = autoRespondingValue === true || autoRespondingValue === 1 || autoRespondingValue === '1';
      console.log(`Estado de auto-resposta carregado:`, {
        raw: autoRespondingValue,
        type: typeof autoRespondingValue,
        converted: isAutoRespondingBool,
        conversationId: currentConversation.id,
      });
      setIsAutoResponding(isAutoRespondingBool);

      // Se estava no final, rolar para o final após atualizar
      if (preserveScroll && wasAtBottom && container) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 100);
      }
    } catch (error: any) {
      if (!silent) {
        toast.error('Erro ao carregar mensagens');
      }
      console.error('Erro ao carregar mensagens:', error);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    // Carregar mensagens e status atualizado ao montar o componente
    // Isso garante que o estado de auto-resposta está sincronizado com o banco
    loadMessages();
    
      // Conectar Socket.IO para receber mensagens em tempo real
      const token = authService.getToken();
      let socket: ReturnType<typeof socketService.connect> | null = null;

      if (token) {
        socket = socketService.connect(token);

        // Logs de debug da conexão Socket.IO
        socket.on('connect', () => {
          console.log(`✅ Socket.IO conectado para conversa ${currentConversation.id}. Socket ID:`, socket?.id);
        });

        socket.on('disconnect', () => {
          console.log(`❌ Socket.IO desconectado para conversa ${currentConversation.id}`);
        });

        socket.on('connect_error', (error) => {
          console.error(`❌ Erro na conexão Socket.IO para conversa ${currentConversation.id}:`, error);
        });

        // Ouvir evento de nova mensagem
        const handleMessage = (data: { conversationId: number; message: any }) => {
          console.log('📨 Nova mensagem recebida via Socket.IO:', {
            conversationId: data.conversationId,
            currentConversationId: currentConversation.id,
          message: data.message,
          socketId: socket?.id,
          socketConnected: socket?.connected,
        });
        
        // Se a mensagem é para esta conversa, adicionar à lista
        if (data.conversationId === currentConversation.id) {
          const newMessage: Message = {
            id: data.message.id || Date.now(), // Usar timestamp como fallback se não tiver ID
            messageId: data.message.messageId || data.message.id,
            content: data.message.content || '',
            messageType: data.message.messageType || 'text',
            direction: data.message.direction || 'incoming',
            isFromAi: data.message.isFromAi || false,
            createdAt: data.message.timestamp 
              ? new Date(data.message.timestamp * 1000).toISOString() 
              : new Date().toISOString(),
            reactions: data.message.reactions || [],
            media: data.message.media || null, // Incluir dados de mídia se houver
          };
          
          console.log('✅ Adicionando nova mensagem via Socket.IO:', {
            message: newMessage,
            conversationId: currentConversation.id,
          });
          
          setMessages((prev) => {
            // Verificar se a mensagem já existe (evitar duplicatas)
            // Priorizar messageId (mais confiável) e depois ID numérico
            const exists = prev.some(m => {
              // Se ambos têm messageId, comparar por messageId (mais confiável)
              if (m.messageId && newMessage.messageId && m.messageId === newMessage.messageId) {
                return true;
              }
              // Se ambos têm ID numérico, comparar por ID
              if (m.id && newMessage.id && typeof m.id === 'number' && typeof newMessage.id === 'number' && m.id === newMessage.id) {
                return true;
              }
              // Fallback: comparar por conteúdo + direção + timestamp (últimos 5 segundos)
              if (m.content === newMessage.content && 
                  m.direction === newMessage.direction &&
                  Math.abs(new Date(m.createdAt).getTime() - new Date(newMessage.createdAt).getTime()) < 5000) {
                return true;
              }
              return false;
            });
            
            if (exists) {
              console.log('⚠️ Mensagem já existe, ignorando:', {
                id: newMessage.id,
                messageId: newMessage.messageId,
                content: newMessage.content?.substring(0, 30)
              });
              return prev;
            }
            console.log('✅ Adicionando mensagem. Total antes:', prev.length, 'Total depois:', prev.length + 1);
            return [...prev, newMessage];
          });
          
          // Não recarregar todas as mensagens - apenas adicionar a nova via Socket.IO
          // Isso evita resetar o scroll e melhora a performance
        }
      };

      socket.on('whatsapp:message', handleMessage);
      
      // Ouvir evento de reação
      const handleReaction = (data: { messageId: string; reactionEmoji: string; reactedBy: string }) => {
        console.log('👍 Reação recebida via Socket.IO:', data);
        
        // Atualizar a mensagem correspondente com a nova reação
        // data.messageId agora é o message_id (string) da mensagem reagida
        setMessages((prev) => {
          return prev.map((msg) => {
            // Procurar mensagem pelo message_id
            // Verificar se msg tem message_id ou se está em outra propriedade
            const msgMessageId = (msg as any).messageId || (msg as any).message_id;
            if (msgMessageId === data.messageId) {
              const existingReactions = msg.reactions || [];
              // Verificar se a reação já existe (mesmo messageId e mesmo usuário)
              const reactionExists = existingReactions.some(
                r => r.messageId === data.messageId && r.reactedBy === data.reactedBy
              );
              
              if (!reactionExists) {
                // Adicionar nova reação
                return {
                  ...msg,
                  reactions: [
                    ...existingReactions,
                    {
                      id: Date.now(), // ID temporário
                      messageId: data.messageId, // message_id da mensagem reagida
                      reactionEmoji: data.reactionEmoji,
                      reactedBy: data.reactedBy,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                };
              } else {
                // Atualizar reação existente se o emoji mudou
                return {
                  ...msg,
                  reactions: existingReactions.map(r => 
                    r.messageId === data.messageId && r.reactedBy === data.reactedBy
                      ? { ...r, reactionEmoji: data.reactionEmoji }
                      : r
                  ),
                };
              }
            }
            return msg;
          });
        });
        
        // Recarregar mensagens para garantir sincronização
        loadMessages(true, true);
      };
      
      socket.on('whatsapp:reaction', handleReaction);
      
      // Ouvir evento de atualização de ack (recebimento/leitura)
      const handleMessageAck = (data: { messageId: string; ack: number; receivedAt: string | null; readAt: string | null }) => {
        console.log('✓ Status de ack recebido via Socket.IO:', data);
        
        // Atualizar a mensagem correspondente com o novo status de ack
        setMessages((prev) => {
          return prev.map((msg) => {
            // Procurar mensagem pelo message_id
            const msgMessageId = (msg as any).messageId || (msg as any).message_id;
            if (msgMessageId === data.messageId) {
              // Atualizar receivedAt e readAt conforme o ack
              const updatedMessage = { ...msg };
              
              if (data.ack === 1 && data.receivedAt) {
                // Mensagem recebida
                updatedMessage.receivedAt = data.receivedAt;
              } else if (data.ack === 2 && data.readAt) {
                // Mensagem lida (também atualiza receivedAt se ainda não estiver)
                updatedMessage.readAt = data.readAt;
                if (!updatedMessage.receivedAt && data.receivedAt) {
                  updatedMessage.receivedAt = data.receivedAt;
                }
              }
              
              return updatedMessage;
            }
            return msg;
          });
        });
      };
      
      socket.on('whatsapp:message_ack', handleMessageAck);
      
      // Log para confirmar que o listener foi registrado
      console.log(`👂 Listener 'whatsapp:message', 'whatsapp:reaction' e 'whatsapp:message_ack' registrados para conversa ${currentConversation.id}`);
      
      // Testar se o socket está funcionando
      socket.on('connect', () => {
        console.log(`✅ Socket.IO conectado e pronto para receber mensagens da conversa ${currentConversation.id}`);
      });
    } else {
      console.warn('⚠️ Token não encontrado, Socket.IO não será conectado');
    }

    // Polling muito menos frequente apenas para sincronização ocasional (a cada 30 segundos)
    // E apenas se não houver mensagens novas via Socket.IO
    const interval = setInterval(() => {
      // Sincronizar apenas ocasionalmente para pegar mensagens que possam ter sido perdidas
      // Preservar scroll se o usuário estiver rolando para cima
      // Atualização silenciosa (sem loading, sem piscar)
      loadMessages(true, true);
    }, 30000); // 30 segundos em vez de 3
    
    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('whatsapp:message');
        socket.off('whatsapp:reaction');
        socket.off('whatsapp:message_ack');
      }
    };
  }, [currentConversation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePauseResume = async () => {
    try {
      if (isAutoResponding) {
        await conversationService.pauseAutoResponding(currentConversation.id);
        setIsAutoResponding(false);
        toast.success('Respostas automáticas pausadas');
      } else {
        await conversationService.resumeAutoResponding(currentConversation.id);
        setIsAutoResponding(true);
        toast.success('Respostas automáticas retomadas');
      }
    } catch (error: any) {
      toast.error('Erro ao alterar status das respostas automáticas');
    }
  };


  const handleFinish = async () => {
    try {
      await conversationService.finishConversation(currentConversation.id);
      toast.success('Atendimento encerrado');
      onClose();
    } catch (error: any) {
      toast.error('Erro ao encerrar atendimento');
    }
  };

  const handleMarkIntervention = async () => {
    try {
      await conversationService.markIntervention(currentConversation.id);
      toast.success('Pendência marcada com sucesso');
      
      // Recarregar a conversa para atualizar o estado
      const updated = await conversationService.getConversation(currentConversation.id);
      
      // Atualizar o estado local
      setCurrentConversation(updated.conversation);
      
      // Atualizar o estado no componente pai se o callback foi fornecido
      if (onConversationUpdate) {
        onConversationUpdate(updated.conversation);
      }
    } catch (error: any) {
      toast.error('Erro ao marcar pendência');
      console.error(error);
    }
  };

  const handleResolveIntervention = async () => {
    try {
      await humanAttendantService.resolveIntervention(currentConversation.id);
      toast.success('Intervenção marcada como resolvida');
      
      // Recarregar a conversa para atualizar o estado
      const updated = await conversationService.getConversation(currentConversation.id);
      
      // Atualizar o estado local
      setCurrentConversation(updated.conversation);
      
      // Atualizar o estado no componente pai se o callback foi fornecido
      if (onConversationUpdate) {
        onConversationUpdate(updated.conversation);
      }
    } catch (error: any) {
      toast.error('Erro ao marcar intervenção como resolvida');
      console.error(error);
    }
  };

  const handleSendMessage = async (content: string) => {
    try {
      await conversationService.sendMessage(currentConversation.id, content);
      toast.success('Mensagem enviada');
      // NÃO recarregar todo o histórico - Socket.IO vai adicionar a mensagem automaticamente
      // Isso evita resetar o scroll e melhora a performance
    } catch (error: any) {
      toast.error('Erro ao enviar mensagem');
    }
  };

  const handleSendMedia = async (mediaId: number) => {
    try {
      await conversationService.sendMedia(currentConversation.id, mediaId);
      toast.success('Mídia enviada com sucesso');
      // NÃO recarregar todo o histórico - Socket.IO vai adicionar a mensagem automaticamente
      // Isso evita resetar o scroll e melhora a performance
    } catch (error: any) {
      toast.error('Erro ao enviar mídia');
    }
  };

  // Carregar fidelização quando o cliente mudar
  useEffect(() => {
    if (currentConversation.cliente?.cpf) {
      loadFidelizacao(currentConversation.cliente.cpf);
    } else {
      setFidelizacao(null);
    }
  }, [currentConversation.cliente?.cpf, loadFidelizacao]);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Banner de Alerta - Precisa Intervenção (Topo - Full Width) */}
      {currentConversation.needsIntervention && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-red-900">Precisa Intervenção Humana</h3>
                <p className="text-xs text-red-700 mt-1">
                  Esta conversa foi marcada como necessitando intervenção humana. O atendente foi notificado.
                </p>
              </div>
            </div>
            <button
              onClick={handleResolveIntervention}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Marcar como Resolvido
            </button>
          </div>
        </div>
      )}

      {/* Layout Principal: 2 Colunas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Coluna Esquerda: Dados do Cliente + Fidelização */}
        {currentConversation.cliente && (
          <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col overflow-y-auto flex-shrink-0">
            {/* Dados do Cliente */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Dados do Cliente</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Nome Completo</p>
                  <p className="font-medium text-gray-900">{currentConversation.cliente.nomeCompleto || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">CPF</p>
                  <p className="font-medium text-gray-900">{currentConversation.cliente.cpf || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Telefone</p>
                  <p className="font-medium text-gray-900">{currentConversation.cliente.telefone || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Email</p>
                  <p className="font-medium text-gray-900">{currentConversation.cliente.email || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Última Compra</p>
                  <p className="font-medium text-gray-900">
                    {currentConversation.cliente.ultimaCompra 
                      ? new Date(currentConversation.cliente.ultimaCompra).toLocaleDateString('pt-BR')
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Data Cadastro</p>
                  <p className="font-medium text-gray-900">
                    {currentConversation.cliente.dataCadastro 
                      ? new Date(currentConversation.cliente.dataCadastro).toLocaleDateString('pt-BR')
                      : '-'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Total Compras</p>
                    <p className="font-medium text-gray-900">{currentConversation.cliente.totalCompras || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Lavagens</p>
                    <p className="font-medium text-gray-900">{fidelizacao?.totalLavagens || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Secagens</p>
                    <p className="font-medium text-gray-900">{fidelizacao?.totalSecagens || 0}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Valor Total</p>
                  <p className="font-medium text-gray-900">
                    {currentConversation.cliente.valorTotalCompras 
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentConversation.cliente.valorTotalCompras)
                      : 'R$ 0,00'}
                  </p>
                </div>
              </div>
            </div>

            {/* Fidelização */}
            <div className="p-4 flex-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Gift className="w-4 h-4 text-blue-600" />
                Fidelização
                {fidelizacao && fidelizacao.premiosConquistados > 0 && (
                  <span className="ml-auto px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                    {fidelizacao.premiosConquistados} 🏆
                  </span>
                )}
              </h3>
              
              {loadingFidelizacao ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : fidelizacao ? (
                <div className="space-y-4">
                  {/* Lavagens */}
                  {fidelizacao.saldoFidelidadeLavagens.proximoObjetivo && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 font-medium">Lavagens</span>
                        <span className="text-gray-900 font-semibold">
                          {fidelizacao.saldoFidelidadeLavagens.atual}
                          {fidelizacao.saldoFidelidadeLavagens.proximoObjetivo && `/${fidelizacao.saldoFidelidadeLavagens.proximoObjetivo}`}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (fidelizacao.saldoFidelidadeLavagens.atual / (fidelizacao.saldoFidelidadeLavagens.proximoObjetivo || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      {fidelizacao.saldoFidelidadeLavagens.proximoPremio && (
                        <p className="text-xs text-gray-500">
                          Próximo: {fidelizacao.saldoFidelidadeLavagens.proximoPremio}
                          {fidelizacao.saldoFidelidadeLavagens.faltam > 0 && ` (faltam ${fidelizacao.saldoFidelidadeLavagens.faltam})`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Secagens */}
                  {fidelizacao.saldoFidelidadeSecagens.proximoObjetivo && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 font-medium">Secagens</span>
                        <span className="text-gray-900 font-semibold">
                          {fidelizacao.saldoFidelidadeSecagens.atual}
                          {fidelizacao.saldoFidelidadeSecagens.proximoObjetivo && `/${fidelizacao.saldoFidelidadeSecagens.proximoObjetivo}`}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (fidelizacao.saldoFidelidadeSecagens.atual / (fidelizacao.saldoFidelidadeSecagens.proximoObjetivo || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      {fidelizacao.saldoFidelidadeSecagens.proximoPremio && (
                        <p className="text-xs text-gray-500">
                          Próximo: {fidelizacao.saldoFidelidadeSecagens.proximoPremio}
                          {fidelizacao.saldoFidelidadeSecagens.faltam > 0 && ` (faltam ${fidelizacao.saldoFidelidadeSecagens.faltam})`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Total */}
                  {fidelizacao.saldoFidelidadeTotal.proximoObjetivo && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 font-medium">Total</span>
                        <span className="text-gray-900 font-semibold">
                          {fidelizacao.saldoFidelidadeTotal.atual}
                          {fidelizacao.saldoFidelidadeTotal.proximoObjetivo && `/${fidelizacao.saldoFidelidadeTotal.proximoObjetivo}`}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-purple-600 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (fidelizacao.saldoFidelidadeTotal.atual / (fidelizacao.saldoFidelidadeTotal.proximoObjetivo || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      {fidelizacao.saldoFidelidadeTotal.proximoPremio && (
                        <p className="text-xs text-gray-500">
                          Próximo: {fidelizacao.saldoFidelidadeTotal.proximoPremio}
                          {fidelizacao.saldoFidelidadeTotal.faltam > 0 && ` (faltam ${fidelizacao.saldoFidelidadeTotal.faltam})`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic py-4">
                  Sem dados de fidelização
                </div>
              )}
            </div>
          </div>
        )}

        {/* Coluna Direita: Chat Completo */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {/* Header do Chat */}
          <div className="border-b border-gray-200 bg-white flex-shrink-0">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-100 rounded-md"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {currentConversation.contactName || currentConversation.contactNumber}
                    </h2>
                    <p className="text-sm text-gray-500">{currentConversation.contactNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePauseResume}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${
                      isAutoResponding
                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                        : 'bg-green-100 text-green-800 hover:bg-green-200'
                    }`}
                  >
                    {isAutoResponding ? (
                      <>
                        <Pause className="w-4 h-4" />
                        Pausar IA
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Retomar IA
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleMarkIntervention}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-800 rounded-md text-sm font-medium hover:bg-orange-200"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Marcar Pendência
                  </button>
                  <button
                    onClick={handleFinish}
                    className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-800 rounded-md text-sm font-medium hover:bg-red-200"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Encerrar Atendimento
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Messages - Ocupa todo o espaço disponível */}
          <div className="flex-1 overflow-y-auto min-h-0" id={`messages-container-${currentConversation.id}`}>
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Carregando mensagens...</p>
                </div>
              </div>
            ) : (
              <MessageList messages={messages} conversationId={currentConversation.id} />
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 px-6 py-4 flex-shrink-0">
            <MessageInput 
              onSend={handleSendMessage} 
              onSendMedia={handleSendMedia}
              conversationId={currentConversation.id}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

