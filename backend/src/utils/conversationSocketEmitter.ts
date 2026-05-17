import type { Server } from 'socket.io';
import logger from './logger';

let io: Server | null = null;

export function setConversationSocketIo(server: Server): void {
  io = server;
}

async function emitToUser(userId: number, event: string, data: object): Promise<void> {
  if (!io) return;
  try {
    const sockets = await io.fetchSockets();
    const userSockets = sockets.filter((s) => (s as any).userId === userId);
    userSockets.forEach((s) => s.emit(event, data));
  } catch (err: any) {
    throw err;
  }
}

export function emitConversationUpdated(userId: number, conversation: object): void {
  emitToUser(userId, 'conversation:updated', { conversation }).catch((err) =>
    logger.error(`Erro ao emitir conversation:updated: ${err?.message || err}`)
  );
}

export function emitConversationNew(userId: number, conversation: object): void {
  emitToUser(userId, 'conversation:new', { conversation }).catch((err) =>
    logger.error(`Erro ao emitir conversation:new: ${err?.message || err}`)
  );
}
