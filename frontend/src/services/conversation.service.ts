import api from './api';
import { Conversation, Message } from '../types';

export const conversationService = {
  async listConversations(status?: string, search?: string): Promise<Conversation[]> {
    const params: any = {};
    if (status) params.status = status;
    if (search && search.trim()) params.search = search.trim();
    const response = await api.get<{ conversations: Conversation[] }>('/conversations', { params });
    return response.data.conversations;
  },

  async getConversation(id: number): Promise<{ conversation: Conversation; messages: Message[] }> {
    const response = await api.get<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}`);
    return response.data;
  },

  async pauseAutoResponding(id: number): Promise<void> {
    await api.post(`/conversations/${id}/pause`);
  },

  async resumeAutoResponding(id: number): Promise<void> {
    await api.post(`/conversations/${id}/resume`);
  },

  async pauseAllConversations(): Promise<void> {
    await api.post('/conversations/pause-all');
  },

  async resumeAllConversations(): Promise<void> {
    await api.post('/conversations/resume-all');
  },

  async takeOverConversation(id: number): Promise<void> {
    await api.post(`/conversations/${id}/takeover`);
  },

  async finishConversation(id: number): Promise<void> {
    await api.post(`/conversations/${id}/finish`);
  },

  async markIntervention(conversationId: number): Promise<void> {
    await api.post(`/conversations/${conversationId}/mark-intervention`);
  },

  async sendMessage(conversationId: number, content: string): Promise<void> {
    await api.post('/conversations/send', { conversationId, content });
  },

  async sendMedia(conversationId: number, mediaId: number): Promise<void> {
    await api.post('/conversations/send-media', { conversationId, mediaId });
  },

  async createConversation(contactNumber: string, contactName?: string): Promise<Conversation> {
    const response = await api.post<{ conversation: Conversation; message: string }>('/conversations', {
      contactNumber,
      contactName,
    });
    return response.data.conversation;
  },
};

