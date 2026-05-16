import api from './api';
import { WhatsAppStatus } from '../types';

export const whatsappService = {
  async initialize(): Promise<void> {
    await api.post('/whatsapp/initialize');
  },

  async getStatus(): Promise<WhatsAppStatus> {
    const response = await api.get<WhatsAppStatus>('/whatsapp/status');
    return response.data;
  },

  async getQRCode(): Promise<string> {
    const response = await api.get<{ qrCode: string }>('/whatsapp/qr');
    return response.data.qrCode;
  },

  async disconnect(): Promise<void> {
    await api.post('/whatsapp/disconnect');
  },

  async logout(): Promise<void> {
    await api.post('/whatsapp/logout');
  },

  async sendMessage(contactNumber: string, content: string): Promise<void> {
    await api.post('/whatsapp/send', { contactNumber, content });
  },
};

