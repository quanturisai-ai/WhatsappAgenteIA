import api from './api';
import { HumanAttendant, AttendantAlert } from '../types';

export const humanAttendantService = {
  async getAttendants(): Promise<HumanAttendant[]> {
    try {
      const response = await api.get<{ attendants: HumanAttendant[] }>('/human-attendant');
      return response.data.attendants || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  },

  async createAttendant(
    phoneNumber: string,
    name?: string | null,
    isActive?: boolean
  ): Promise<HumanAttendant> {
    const response = await api.post<{ attendant: HumanAttendant; message: string }>('/human-attendant', {
      phoneNumber,
      name,
      isActive,
    });
    return response.data.attendant;
  },

  async updateAttendant(
    id: number,
    phoneNumber: string,
    name?: string | null,
    isActive?: boolean
  ): Promise<HumanAttendant> {
    const response = await api.put<{ attendant: HumanAttendant; message: string }>(`/human-attendant/${id}`, {
      phoneNumber,
      name,
      isActive,
    });
    return response.data.attendant;
  },

  async deleteAttendant(id: number): Promise<void> {
    await api.delete(`/human-attendant/${id}`);
  },

  async sendTestMessage(phoneNumber: string): Promise<void> {
    await api.post('/human-attendant/test', { phoneNumber });
  },

  async getAlertsByConversation(conversationId: number): Promise<AttendantAlert[]> {
    const response = await api.get<{ alerts: AttendantAlert[] }>(
      `/human-attendant/alerts/conversation/${conversationId}`
    );
    return response.data.alerts;
  },

  async resolveIntervention(conversationId: number): Promise<void> {
    await api.post(`/human-attendant/conversation/${conversationId}/resolve`);
  },
};

