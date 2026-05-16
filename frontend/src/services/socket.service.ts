import { io, Socket } from 'socket.io-client';

// Socket.IO precisa apenas do host e porta, não do path /api
// Remover /api se estiver presente na URL
const getSocketUrl = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
  // Se a URL termina com /api, remover
  if (apiUrl.endsWith('/api')) {
    return apiUrl.slice(0, -4); // Remove '/api'
  }
  // Se a URL termina com /api/, remover também
  if (apiUrl.endsWith('/api/')) {
    return apiUrl.slice(0, -5); // Remove '/api/'
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
      transports: ['websocket', 'polling'],
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

