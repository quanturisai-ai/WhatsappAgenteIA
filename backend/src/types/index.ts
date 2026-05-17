export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface WhatsAppSession {
  id: number;
  user_id: number;
  session_data: string | null;
  qr_code?: string | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'connection_failed';
  last_connected_at?: Date | null;
  last_ready_at?: Date | null;
  session_files_path?: string | null;
  session_files_hash?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Conversation {
  id: number;
  user_id: number;
  contact_number: string;
  contact_name?: string;
  lid?: string | null;
  status: 'new' | 'in_progress' | 'paused' | 'finished';
  auto_responding?: boolean | number; // Pode ser boolean ou number (0/1) do banco
  last_message_at?: Date;
  last_message?: string; // Última mensagem da conversa (limitada a 50 caracteres)
  needs_intervention?: boolean;
  intervention_resolved_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: number;
  conversation_id: number;
  message_id?: string;
  content: string;
  message_type?: 'text' | 'audio' | 'media' | 'reaction' | 'system' | 'location' | 'contact' | 'other';
  media_id?: number | null;
  direction: 'incoming' | 'outgoing';
  is_from_ai: boolean;
  created_at: Date;
  received_at?: Date | null; // Data/hora em que a mensagem foi recebida (ack=1)
  read_at?: Date | null; // Data/hora em que a mensagem foi lida (ack=2)
  reactions?: Reaction[];
}

export interface Reaction {
  id: number;
  message_id: string; // VARCHAR(100) - message_id da tabela messages (data.msgId._serialized)
  reaction_emoji: string;
  reacted_by: string;
  created_at: Date;
}

export interface AgentConfig {
  id: number;
  user_id: number;
  business_name?: string;
  business_info?: string;
  services?: string;
  hours?: string;
  personality?: string;
  greeting_message?: string;
  farewell_message?: string;
  absence_message?: string;
  specific_instructions?: string;
  embedding_model?: string; // Modelo para embeddings (ex: deepseek-r1)
  generation_model?: string; // Modelo para geração de respostas (ex: qwen3:30b)
  temperature?: number; // Criatividade (0.0=preciso, 2.0=criativo) - padrão: 0.7
  top_p?: number; // Nucleus sampling (0.0-1.0) - padrão: 0.9
  top_k?: number; // Limita tokens considerados (1-100) - padrão: 40
  repeat_penalty?: number; // Penaliza repetições (0.0-2.0) - padrão: 1.1
  max_age_hours?: number; // Idade máxima em horas para histórico e finalização de conversas - padrão: 12
  created_at: Date;
  updated_at: Date;
}

export interface Document {
  id: number;
  user_id: number;
  filename: string;
  file_type: string;
  file_path: string;
  file_size: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentChunk {
  id: number;
  document_id: number;
  chunk_text: string;
  chunk_index: number;
  embedding?: string;
  created_at: Date;
}

export interface Media {
  id: number;
  user_id: number;
  filename: string;
  file_path: string;
  file_type: 'video' | 'image' | 'document' | 'audio';
  source?: 'outgoing' | 'incoming';
  file_size: number;
  title: string;
  description: string;
  caption?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
  is_active: boolean;
  mandatory_send?: boolean;
  last_indexed_at?: Date | null;
  indexing_status?: 'pending' | 'indexing' | 'indexed' | 'error' | null;
  content_hash?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Topic {
  id: number;
  user_id: number;
  title: string;
  description: string;
  trigger_keywords: string[];
  context: 'greeting' | 'farewell' | 'absence' | 'special_date' | 'custom';
  priority: number;
  is_active: boolean;
  last_indexed_at?: Date | null;
  indexing_status?: 'pending' | 'indexing' | 'indexed' | 'error' | null;
  content_hash?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface HumanAttendant {
  id: number;
  user_id: number;
  phone_number: string;
  name?: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AttendantAlert {
  id: number;
  user_id: number;
  conversation_id: number;
  topic_id?: number | null;
  alert_message: string;
  sent_at: Date;
  resolved_at?: Date | null;
}

