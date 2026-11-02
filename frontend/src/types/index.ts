export interface User {
  id: number;
  username: string;
  email: string;
  createdAt: string;
}

export interface ClienteData {
  id: number;
  nomeCompleto: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  ultimaCompra: string | null;
  dataCadastro: string | null;
  totalCompras: number;
  valorTotalCompras: number;
}

export interface Conversation {
  id: number;
  contactNumber: string;
  contactName?: string;
  status: 'new' | 'in_progress' | 'paused' | 'finished';
  lastMessageAt?: string;
  lastMessage?: string; // Última mensagem (limitada a 50 caracteres)
  createdAt: string;
  updatedAt: string;
  isAutoResponding: boolean;
  messageCount: number;
  needsIntervention?: boolean;
  interventionResolvedAt?: string | null;
  handler?: 'none' | 'ai' | 'human'; // Quem está atendendo a conversa agora
  origin?: 'inbound' | 'campaign' | 'outbound'; // Como a conversa nasceu
  cliente?: ClienteData | null;
}

export interface Reaction {
  id: number;
  messageId: string; // message_id da mensagem reagida (VARCHAR)
  reactionEmoji: string;
  reactedBy: string;
  createdAt: string;
}

export interface Message {
  id: number;
  messageId?: string | null; // message_id da mensagem (para identificar em eventos Socket.IO)
  content: string;
  messageType?: 'text' | 'audio' | 'media' | 'reaction' | 'system' | 'location' | 'contact' | 'other';
  direction: 'incoming' | 'outgoing';
  isFromAi: boolean;
  createdAt: string;
  receivedAt?: string | null; // Data/hora em que a mensagem foi recebida (ack=1)
  readAt?: string | null; // Data/hora em que a mensagem foi lida (ack=2)
  reactions?: Reaction[];
  media?: {
    id: number;
    filename: string;
    fileType: 'video' | 'image' | 'document' | 'audio';
    fileSize: number;
    title: string;
    description: string;
    caption?: string | null;
  } | null;
}

export interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'connection_failed';
  qrCode: string | null;
  isReady: boolean;
}

export interface AgentConfig {
  id?: number;
  businessName: string;
  businessInfo: string;
  services: string;
  hours: string;
  personality: string;
  greetingMessage: string;
  farewellMessage: string;
  absenceMessage: string;
  specificInstructions: string;
  embeddingModel?: string; // Modelo para embeddings (ex: deepseek-r1)
  generationModel?: string; // Modelo para geração de respostas (vazio = padrão do .env)
  visionModel?: string; // Etapa 6: descreve foto/vídeo que o modelo principal não entende (vazio = padrão do .env)
  transcriptionModel?: string; // Etapa 6: transcreve áudio (vazio = padrão do .env)
  /** Etapa 6: presente só com AGENTE_MODELO_PAINEL ligado no backend */
  modelosPainel?: { ativo: boolean; padroes: { geracao: string; visao: string; transcricao: string } };
  temperature?: number; // Criatividade (0.0=preciso, 2.0=criativo) - padrão: 0.7
  topP?: number; // Nucleus sampling (0.0-1.0) - padrão: 0.9
  topK?: number; // Limita tokens considerados (1-100) - padrão: 40
  repeatPenalty?: number; // Penaliza repetições (0.0-2.0) - padrão: 1.1
  maxAgeHours?: number; // Idade máxima em horas para histórico e finalização de conversas - padrão: 12
  createdAt?: string;
  updatedAt?: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: string;
}

export interface Document {
  id: number;
  filename: string;
  fileType: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Media {
  id: number;
  filename: string;
  fileType: 'video' | 'image' | 'document';
  fileSize: number;
  title: string;
  description: string;
  caption?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  isActive: boolean;
  mandatorySend?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: number;
  title: string;
  description: string;
  triggerKeywords: string[];
  context: 'greeting' | 'farewell' | 'absence' | 'special_date' | 'custom';
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HumanAttendant {
  id: number;
  phoneNumber: string;
  name?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttendantAlert {
  id: number;
  conversationId: number;
  topicId?: number | null;
  alertMessage: string;
  sentAt: string;
  resolvedAt?: string | null;
}


/** Etapa 6: modelo do catálogo do OpenRouter (GET /api/agent-config/modelos) */
export interface ModeloCatalogo {
  id: string;
  nome: string;
  entrada: string[];
  saida: string[];
  tools: boolean | null;
  raciocinioObrigatorio: boolean;
  precoMilhao: { entrada?: number; saida?: number };
  contexto: number | null;
}
