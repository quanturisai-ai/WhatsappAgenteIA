import api from './api';

export interface TestChatResponse {
  response: string;
  mandatoryMedias?: Array<{
    id: number;
    title: string;
    description: string;
    caption?: string | null;
    fileType: string;
    filename: string;
  }>;
  error?: string;
  message?: string;
  details?: string;
}

export const testChatService = {
  async sendMessage(message: string, reset: boolean = false): Promise<TestChatResponse> {
    try {
      const response = await api.post<TestChatResponse>('/test-chat', { message, reset });
      
      // Se a resposta contém erro (mesmo com status 200), lançar exceção
      if (response.data.error) {
        const errorMsg = response.data.message || response.data.error || 'Erro desconhecido';
        throw new Error(errorMsg);
      }
      
      // Se não há campo 'response', pode ser uma resposta de erro
      if (!response.data.response) {
        const errorMsg = response.data.message || 'Erro ao processar mensagem';
        throw new Error(errorMsg);
      }
      
      return {
        response: response.data.response,
        mandatoryMedias: response.data.mandatoryMedias,
      };
    } catch (error: any) {
      // Se for uma resposta de erro do backend (status 400 ou 500)
      if (error.response?.data) {
        const errorData = error.response.data;
        const errorMessage = errorData.message || errorData.error || error.message || 'Erro desconhecido';
        
        // Mensagens mais específicas para erros comuns
        if (errorMessage.includes('não encontrado no Ollama') || errorMessage.includes('Modelo não encontrado')) {
          throw new Error('Modelo não encontrado. Verifique se o modelo está instalado no Ollama e configurado corretamente nas Configurações.');
        }
        if (errorMessage.includes('não suporta embeddings') || errorMessage.includes('não suporta embeddings')) {
          throw new Error('O modelo configurado não suporta embeddings. Configure um modelo que suporte embeddings nas Configurações.');
        }
        if (errorMessage.includes('404')) {
          throw new Error('Modelo não encontrado no Ollama. Verifique a configuração do modelo nas Configurações.');
        }
        if (errorMessage.includes('500')) {
          throw new Error('Erro no servidor Ollama. Verifique se o Ollama está rodando e se o modelo está disponível.');
        }
        
        throw new Error(errorMessage);
      }
      
      // Erro de rede ou outro tipo
      const errorMessage = error.message || 'Erro ao processar mensagem. Tente novamente.';
      throw new Error(errorMessage);
    }
  },

  async clearHistory(): Promise<void> {
    await api.delete('/test-chat');
  },
};

