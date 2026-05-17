import { io, Socket } from 'socket.io-client';

// Socket.IO usa window.location.origin para funcionar tanto em localhost
// quanto quando acessado via rede interna (ex: 192.168.1.5:3300).
// O Vite proxy redireciona /socket.io para o backend (localhost:3302).
const getSocketUrl = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  // URL relativa (ex: /api) — usa a origem atual do browser
  if (apiUrl.startsWith('/') || apiUrl === '') {
    return window.location.origin;
  }
  // URL absoluta legada — remove o sufixo /api
  if (apiUrl.endsWith('/api')) {
    return apiUrl.slice(0, -4);
  }
  if (apiUrl.endsWith('/api/')) {
    return apiUrl.slice(0, -5);
  }
  return apiUrl;
};

const SOCKET_URL = getSocketUrl();

class SocketService {
  private socket: Socket | null = null;

  connect(token: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    // Desconectar socket anterior se existir
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(SOCKET_URL, {
      auth: {
        token,
      },
      // Polling primeiro, depois upgrade para WebSocket — reduz erro "não conseguiu estabelecer conexão" no carregamento
      transports: ['polling', 'websocket'],
      // Configurações adicionais para melhor compatibilidade
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
      // Não especificar path - usar padrão do Socket.IO
      // O path padrão é '/socket.io/' e será usado automaticamente
    });

    // Adicionar tratamento de erros
    this.socket.on('connect_error', (error) => {
      console.error('Erro de conexão Socket.IO:', error.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO desconectado:', reason);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketService = new SocketService();

