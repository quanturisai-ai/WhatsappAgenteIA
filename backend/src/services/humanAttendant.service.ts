import { HumanAttendantModel } from '../models/humanAttendant.model';
import { AttendantAlertModel } from '../models/attendantAlert.model';
import { HumanAttendant, AttendantAlert } from '../types';
import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp.service';

export class HumanAttendantService {
  private attendantModel: HumanAttendantModel;
  private alertModel: AttendantAlertModel;

  constructor() {
    this.attendantModel = new HumanAttendantModel();
    this.alertModel = new AttendantAlertModel();
  }

  async getAttendants(userId: number): Promise<HumanAttendant[]> {
    try {
      return await this.attendantModel.findByUserId(userId);
    } catch (error: any) {
      logger.error(`Erro ao buscar atendentes: ${error.message}`);
      throw error;
    }
  }

  async createAttendant(
    userId: number,
    phoneNumber: string,
    name?: string | null,
    isActive?: boolean
  ): Promise<HumanAttendant> {
    try {
      return await this.attendantModel.create({
        user_id: userId,
        phone_number: phoneNumber,
        name: name || null,
        is_active: isActive !== undefined ? isActive : true,
      });
    } catch (error: any) {
      logger.error(`Erro ao criar atendente: ${error.message}`);
      throw error;
    }
  }

  async updateAttendant(
    id: number,
    userId: number,
    phoneNumber: string,
    name?: string | null,
    isActive?: boolean
  ): Promise<HumanAttendant> {
    try {
      // Verificar se o atendente pertence ao usuário
      const attendant = await this.attendantModel.findById(id);
      if (!attendant || attendant.user_id !== userId) {
        throw new Error('Atendente não encontrado ou não autorizado');
      }

      const updated = await this.attendantModel.update(id, {
        phone_number: phoneNumber,
        name: name || null,
        is_active: isActive !== undefined ? isActive : attendant.is_active,
      });
      
      if (!updated) {
        throw new Error('Erro ao atualizar atendente');
      }
      
      return updated;
    } catch (error: any) {
      logger.error(`Erro ao atualizar atendente: ${error.message}`);
      throw error;
    }
  }

  async deleteAttendant(id: number, userId: number): Promise<boolean> {
    try {
      // Verificar se o atendente pertence ao usuário
      const attendant = await this.attendantModel.findById(id);
      if (!attendant || attendant.user_id !== userId) {
        throw new Error('Atendente não encontrado ou não autorizado');
      }

      return await this.attendantModel.delete(id);
    } catch (error: any) {
      logger.error(`Erro ao deletar atendente: ${error.message}`);
      throw error;
    }
  }

  async sendAlert(
    userId: number,
    conversationId: number,
    alertMessage: string,
    topicId?: number | null,
    whatsappService?: WhatsAppService
  ): Promise<AttendantAlert> {
    try {
      // Buscar todos os atendentes ativos
      const attendants = await this.attendantModel.findByUserId(userId);
      const activeAttendants = attendants.filter(a => a.is_active);
      
      if (activeAttendants.length === 0) {
        throw new Error('Nenhum atendente humano ativo cadastrado');
      }

      // Criar registro do alerta
      const alert = await this.alertModel.create({
        user_id: userId,
        conversation_id: conversationId,
        topic_id: topicId || null,
        alert_message: alertMessage,
      });

      // Enviar mensagem via WhatsApp para todos os atendentes ativos se o serviço foi fornecido
      if (whatsappService) {
        try {
          // Buscar informações da conversa para incluir no alerta
          const { ConversationModel } = await import('../models/conversation.model');
          const conversationModel = new ConversationModel();
          const conversation = await conversationModel.findById(conversationId);
          
          const contactName = conversation?.contact_name || 'Não informado';
          const contactNumber = conversation?.contact_number || 'Não informado';
          
          const message = `🚨 ALERTA DE ATENDIMENTO

Cliente: ${contactName}
Telefone: ${contactNumber}
Conversa ID: ${conversationId}

Mensagem do alerta:
${alertMessage}

Acesse o dashboard para atender.`;

          // Enviar para todos os atendentes ativos
          const sendPromises = activeAttendants.map(async (attendant) => {
            try {
              await whatsappService.sendMessage(attendant.phone_number, message);
              logger.info(`Alerta enviado para atendente ${attendant.phone_number} (conversa ${conversationId})`);
            } catch (error: any) {
              logger.error(`Erro ao enviar alerta para atendente ${attendant.phone_number}: ${error.message}`);
            }
          });

          await Promise.all(sendPromises);
        } catch (error: any) {
          logger.error(`Erro ao enviar alerta via WhatsApp: ${error.message}`);
          // Não lançar erro - o alerta foi registrado mesmo se o envio falhar
        }
      }

      return alert;
    } catch (error: any) {
      logger.error(`Erro ao enviar alerta: ${error.message}`);
      throw error;
    }
  }

  async sendTestMessage(phoneNumber: string, whatsappService: WhatsAppService): Promise<void> {
    try {
      const message = `✅ Teste de envio de alertas

Esta é uma mensagem de teste do sistema de alertas para atendente humano.

Se você recebeu esta mensagem, o sistema está configurado corretamente!`;

      await whatsappService.sendMessage(phoneNumber, message);
      logger.info(`Mensagem de teste enviada para ${phoneNumber}`);
    } catch (error: any) {
      logger.error(`Erro ao enviar mensagem de teste: ${error.message}`);
      throw error;
    }
  }

  async getAlertsByConversation(conversationId: number): Promise<AttendantAlert[]> {
    try {
      return await this.alertModel.findByConversationId(conversationId);
    } catch (error: any) {
      logger.error(`Erro ao buscar alertas da conversa: ${error.message}`);
      throw error;
    }
  }

  async getAlertsByUser(userId: number, limit: number = 50): Promise<AttendantAlert[]> {
    try {
      return await this.alertModel.findByUserId(userId, limit);
    } catch (error: any) {
      logger.error(`Erro ao buscar alertas do usuário: ${error.message}`);
      throw error;
    }
  }
}

