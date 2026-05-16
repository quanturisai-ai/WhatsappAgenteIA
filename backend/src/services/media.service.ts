import fs from 'fs';
import path from 'path';
import multer from 'multer';
import logger from '../utils/logger';
import { MediaModel } from '../models/media.model';
import { OllamaService } from './ollama.service';
import { ChromaDBService } from './chromadb.service';

export class MediaService {
  private mediaModel: MediaModel;
  private ollamaService: OllamaService;
  private chromaService: ChromaDBService;
  private uploadPath: string;

  constructor() {
    this.mediaModel = new MediaModel();
    this.ollamaService = new OllamaService();
    this.chromaService = new ChromaDBService();
    this.uploadPath = path.join(process.cwd(), 'uploads', 'medias');
    
    // Criar diretório de uploads se não existir
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  /**
   * Configurar multer para upload de arquivos
   */
  getUploadMiddleware() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.uploadPath);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}-${file.originalname}`);
      },
    });

    return multer({
      storage,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
      fileFilter: (req, file, cb) => {
        // Permitir vídeos, imagens e documentos
        const allowedMimeTypes = [
          // Vídeos
          'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm',
          // Imagens
          'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
          // Documentos
          'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain', 'text/markdown'
        ];
        
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
        }
      },
    });
  }

  /**
   * Determinar tipo de arquivo baseado na extensão
   */
  private getFileType(filename: string): 'video' | 'image' | 'document' {
    const ext = path.extname(filename).toLowerCase();
    
    const videoExts = ['.mp4', '.mpeg', '.mov', '.avi', '.webm'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    
    if (videoExts.includes(ext)) {
      return 'video';
    } else if (imageExts.includes(ext)) {
      return 'image';
    } else {
      return 'document';
    }
  }

  /**
   * Processar e fazer embedding da mídia no ChromaDB
   */
  async processMedia(
    userId: number,
    filePath: string,
    filename: string,
    title: string,
    description: string
  ): Promise<{ mediaId: number }> {
    try {
      // Criar registro no banco
      const fileStats = fs.statSync(filePath);
      const fileType = this.getFileType(filename);
      
      const media = await this.mediaModel.create({
        user_id: userId,
        filename,
        file_path: filePath,
        file_type: fileType,
        file_size: fileStats.size,
        title,
        description,
        status: 'processing',
        indexing_status: 'pending',
      });

      try {
        // Criar texto para embedding: título + descrição + ID da mídia
        // IMPORTANTE: Incluir o ID da mídia no texto para que a IA possa identificá-lo
        const textForEmbedding = `Título: ${title}\n\nDescrição: ${description}\n\nTipo de mídia: ${fileType}\nArquivo: ${filename}\n\nID da mídia: ${media.id}\nMídia ID: ${media.id}\nmedia_id: ${media.id}`;
        
        // Gerar embedding
        const embeddings = await this.ollamaService.generateEmbeddings([textForEmbedding]);
        
        if (embeddings && embeddings.length > 0) {
          // Adicionar ao ChromaDB
          await this.chromaService.addDocuments(userId, [
            {
              id: `media_${media.id}`,
              text: textForEmbedding,
              embedding: embeddings[0],
              metadata: {
                type: 'media',
                media_id: media.id,
                file_type: fileType,
                title,
                filename,
              },
            },
          ]);

          // Atualizar status para completed e indexing_status para indexed
          await this.mediaModel.update(media.id, {
            status: 'completed',
            indexing_status: 'indexed',
            last_indexed_at: new Date(),
          });

          logger.info(`Mídia processada e embedada: ${filename} (ID: ${media.id})`);
        } else {
          throw new Error('Erro ao gerar embedding');
        }
      } catch (error: any) {
        logger.error(`Erro ao processar mídia ${media.id}: ${error.message}`);
        await this.mediaModel.update(media.id, {
          status: 'error',
          error_message: error.message,
          indexing_status: 'error',
        });
        throw error;
      }

      return { mediaId: media.id };
    } catch (error: any) {
      logger.error(`Erro ao processar mídia: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obter mídia por ID
   */
  async getMediaById(mediaId: number): Promise<any | null> {
    try {
      const media = await this.mediaModel.findById(mediaId);
      if (!media) {
        return null;
      }
      return media;
    } catch (error: any) {
      logger.error(`Erro ao obter mídia: ${error.message}`);
      throw error;
    }
  }

  /**
   * Listar mídias do usuário
   */
  async listMedias(userId: number): Promise<any[]> {
    try {
      const medias = await this.mediaModel.findByUserId(userId);
      return medias.map((media) => ({
        id: media.id,
        filename: media.filename,
        fileType: media.file_type,
        fileSize: typeof media.file_size === 'bigint' ? Number(media.file_size) : media.file_size,
        title: media.title,
        description: media.description,
        caption: media.caption || null,
        status: media.status,
        errorMessage: media.error_message,
        isActive: media.is_active !== undefined ? media.is_active : true,
        mandatorySend: media.mandatory_send !== undefined ? media.mandatory_send : false,
        createdAt: media.created_at,
        updatedAt: media.updated_at,
      }));
    } catch (error: any) {
      logger.error(`Erro ao listar mídias: ${error.message}`);
      throw error;
    }
  }

  /**
   * Atualizar mídia (título, descrição, is_active e mandatory_send)
   */
  async updateMedia(
    userId: number,
    mediaId: number,
    title: string,
    description: string,
    caption?: string | null,
    isActive?: boolean,
    mandatorySend?: boolean
  ): Promise<any> {
    try {
      const media = await this.mediaModel.findById(mediaId);
      
      if (!media) {
        throw new Error('Mídia não encontrada');
      }

      if (media.user_id !== userId) {
        throw new Error('Não autorizado a atualizar esta mídia');
      }

      // Validar se título e descrição foram fornecidos
      if (!title.trim() || !description.trim()) {
        throw new Error('Título e descrição são obrigatórios');
      }

      // Atualizar no banco de dados
      // Marcar como pending na indexação e limpar status de erro antes de atualizar
      const updateData: any = {
        title: title.trim(),
        description: description.trim(),
        caption: caption !== undefined ? (caption?.trim() || null) : undefined,
        indexing_status: 'pending', // Marcar como pendente para re-indexação
        status: 'processing', // Marcar como processando durante a re-indexação
        error_message: null, // Limpar mensagem de erro anterior
      };
      
      if (isActive !== undefined) {
        updateData.is_active = isActive;
      }
      
      if (mandatorySend !== undefined) {
        updateData.mandatory_send = mandatorySend;
      }
      
      const updatedMedia = await this.mediaModel.update(mediaId, updateData);

      if (!updatedMedia) {
        throw new Error('Erro ao atualizar mídia');
      }

      // Atualizar embedding no ChromaDB (deletar antigo e adicionar novo)
      try {
        const collection = await this.chromaService.getOrCreateCollection(userId);
        
        // Deletar documento antigo do ChromaDB
        try {
          await collection.delete({
            ids: [`media_${mediaId}`],
          });
          logger.info(`Documento antigo removido do ChromaDB: media_${mediaId}`);
        } catch (error: any) {
          logger.warn(`Erro ao remover documento antigo do ChromaDB: ${error.message}`);
        }

        // Criar novo texto para embedding com título e descrição atualizados
        // IMPORTANTE: Incluir o ID da mídia no texto para que a IA possa identificá-lo
        const textForEmbedding = `Título: ${title.trim()}\n\nDescrição: ${description.trim()}\n\nTipo de mídia: ${media.file_type}\nArquivo: ${media.filename}\n\nID da mídia: ${mediaId}\nMídia ID: ${mediaId}\nmedia_id: ${mediaId}`;
        
        // Gerar novo embedding
        const embeddings = await this.ollamaService.generateEmbeddings([textForEmbedding]);
        
        if (embeddings && embeddings.length > 0) {
          // Adicionar novo documento ao ChromaDB
          await this.chromaService.addDocuments(userId, [
            {
              id: `media_${mediaId}`,
              text: textForEmbedding,
              embedding: embeddings[0],
              metadata: {
                type: 'media',
                media_id: mediaId,
                file_type: media.file_type,
                title: title.trim(),
                filename: media.filename,
              },
            },
          ]);

          // Atualizar indexing_status para indexed e status para completed após sucesso
          await this.mediaModel.update(mediaId, {
            status: 'completed',
            indexing_status: 'indexed',
            last_indexed_at: new Date(),
            error_message: null, // Garantir que não há mensagem de erro
          });

          logger.info(`Mídia atualizada e re-embeda: ${media.filename} (ID: ${mediaId})`);
        } else {
          // Marcar como erro na indexação
          await this.mediaModel.update(mediaId, {
            status: 'error',
            indexing_status: 'error',
            error_message: 'Erro ao gerar embedding',
          });
          throw new Error('Erro ao gerar embedding');
        }
      } catch (error: any) {
        // Marcar como erro na indexação
        await this.mediaModel.update(mediaId, {
          status: 'error',
          indexing_status: 'error',
          error_message: error.message || 'Erro ao atualizar embedding no ChromaDB',
        });
        logger.error(`Erro ao atualizar embedding no ChromaDB: ${error.message}`);
        // Não lançar erro aqui, pois a atualização no banco já foi feita
        // Apenas logar o erro
      }

      return {
        id: updatedMedia.id,
        filename: updatedMedia.filename,
        fileType: updatedMedia.file_type,
        fileSize: typeof updatedMedia.file_size === 'bigint' ? Number(updatedMedia.file_size) : updatedMedia.file_size,
        title: updatedMedia.title,
        description: updatedMedia.description,
        status: updatedMedia.status,
        errorMessage: updatedMedia.error_message,
        isActive: updatedMedia.is_active !== undefined ? updatedMedia.is_active : true,
        mandatorySend: updatedMedia.mandatory_send !== undefined ? updatedMedia.mandatory_send : false,
        createdAt: updatedMedia.created_at,
        updatedAt: updatedMedia.updated_at,
      };
    } catch (error: any) {
      logger.error(`Erro ao atualizar mídia: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletar mídia
   */
  async deleteMedia(userId: number, mediaId: number): Promise<void> {
    try {
      const media = await this.mediaModel.findById(mediaId);
      
      if (!media) {
        throw new Error('Mídia não encontrada');
      }

      if (media.user_id !== userId) {
        throw new Error('Não autorizado a deletar esta mídia');
      }

      // Deletar arquivo físico
      if (fs.existsSync(media.file_path)) {
        try {
          fs.unlinkSync(media.file_path);
          logger.info(`Arquivo físico deletado: ${media.file_path}`);
        } catch (error: any) {
          logger.warn(`Erro ao deletar arquivo físico: ${error.message}`);
        }
      }

      // Remover do ChromaDB (se existir)
      try {
        const collection = await this.chromaService.getOrCreateCollection(userId);
        await collection.delete({
          ids: [`media_${mediaId}`],
        });
        logger.info(`Mídia removida do ChromaDB: media_${mediaId}`);
      } catch (error: any) {
        logger.warn(`Erro ao remover mídia do ChromaDB: ${error.message}`);
      }

      // Deletar do banco
      await this.mediaModel.delete(mediaId);
      
      logger.info(`Mídia deletada: ${mediaId}`);
    } catch (error: any) {
      logger.error(`Erro ao deletar mídia: ${error.message}`);
      throw error;
    }
  }
}

