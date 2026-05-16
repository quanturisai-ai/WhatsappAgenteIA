import fs from 'fs';
import path from 'path';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import logger from '../utils/logger';
import { DocumentModel } from '../models/document.model';
import { DocumentChunkModel } from '../models/documentChunk.model';
import { OllamaService } from './ollama.service';
import { ChromaDBService } from './chromadb.service';

export class DocumentService {
  private documentModel: DocumentModel;
  private chunkModel: DocumentChunkModel;
  private ollamaService: OllamaService;
  private chromaService: ChromaDBService;
  private uploadPath: string;
  private chunkSize: number = 1000; // caracteres

  constructor() {
    this.documentModel = new DocumentModel();
    this.chunkModel = new DocumentChunkModel();
    this.ollamaService = new OllamaService();
    this.chromaService = new ChromaDBService();
    this.uploadPath = path.join(process.cwd(), 'uploads');
    
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
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['.txt', '.pdf', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error(`Tipo de arquivo não permitido. Permitidos: ${allowedTypes.join(', ')}`));
        }
      },
    });
  }

  /**
   * Extrair texto de arquivo
   */
  private async extractText(filePath: string, fileType: string): Promise<string> {
    try {
      switch (fileType.toLowerCase()) {
        case '.txt':
          return fs.readFileSync(filePath, 'utf-8');

        case '.pdf':
          const pdfBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(pdfBuffer);
          return pdfData.text;

        case '.docx':
          const docxBuffer = fs.readFileSync(filePath);
          const docxResult = await mammoth.extractRawText({ buffer: docxBuffer });
          return docxResult.value;

        default:
          throw new Error(`Tipo de arquivo não suportado: ${fileType}`);
      }
    } catch (error: any) {
      logger.error(`Erro ao extrair texto do arquivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Dividir texto em chunks
   */
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    const words = text.split(/\s+/);
    
    let currentChunk = '';
    
    for (const word of words) {
      if ((currentChunk + ' ' + word).length <= this.chunkSize) {
        currentChunk += (currentChunk ? ' ' : '') + word;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = word;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  /**
   * Processar e carregar documento
   */
  async processDocument(
    userId: number,
    filePath: string,
    filename: string,
    fileType: string
  ): Promise<{ documentId: number; chunksCount: number }> {
    try {
      // Criar registro no banco
      const fileStats = fs.statSync(filePath);
      const document = await this.documentModel.create({
        user_id: userId,
        filename,
        file_type: fileType,
        file_path: filePath,
        file_size: fileStats.size,
        status: 'processing',
      });

      try {
        // Extrair texto
        const text = await this.extractText(filePath, fileType);
        
        // Dividir em chunks
        const chunks = this.splitIntoChunks(text);
        
        // Gerar embeddings para cada chunk
        const embeddings = await this.ollamaService.generateEmbeddings(chunks);
        
        // Salvar chunks no banco
        const chunkDocuments = chunks.map((chunkText, index) => ({
          document_id: document.id,
          chunk_text: chunkText,
          chunk_index: index,
          embedding: JSON.stringify(embeddings[index]),
        }));

        await this.chunkModel.createMany(chunkDocuments);

        // Adicionar ao ChromaDB
        const chromaDocuments = chunks.map((chunkText, index) => ({
          id: `doc_${document.id}_chunk_${index}`,
          text: chunkText,
          embedding: embeddings[index],
          metadata: {
            document_id: document.id,
            chunk_index: index,
            filename,
          },
        }));

        await this.chromaService.addDocuments(userId, chromaDocuments);

        // Atualizar status
        await this.documentModel.update(document.id, {
          status: 'completed',
        });

        logger.info(`Documento processado: ${filename} (${chunks.length} chunks)`);

        return {
          documentId: document.id,
          chunksCount: chunks.length,
        };
      } catch (error: any) {
        // Atualizar status com erro
        await this.documentModel.update(document.id, {
          status: 'error',
          error_message: error.message,
        });
        throw error;
      }
    } catch (error: any) {
      logger.error(`Erro ao processar documento: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletar documento
   */
  async deleteDocument(userId: number, documentId: number): Promise<void> {
    try {
      const document = await this.documentModel.findById(documentId);
      
      if (!document || document.user_id !== userId) {
        throw new Error('Documento não encontrado');
      }

      // Deletar chunks do banco
      await this.chunkModel.deleteByDocumentId(documentId);

      // Deletar do ChromaDB
      const chunks = await this.chunkModel.findByDocumentId(documentId);
      const chunkIds = chunks.map((_, index) => `doc_${documentId}_chunk_${index}`);
      await this.chromaService.deleteDocuments(userId, chunkIds);

      // Deletar arquivo
      if (fs.existsSync(document.file_path)) {
        fs.unlinkSync(document.file_path);
      }

      // Deletar registro do banco
      await this.documentModel.delete(documentId);

      logger.info(`Documento deletado: ${document.filename}`);
    } catch (error: any) {
      logger.error(`Erro ao deletar documento: ${error.message}`);
      throw error;
    }
  }

  /**
   * Listar documentos do usuário
   */
  async listDocuments(userId: number): Promise<any[]> {
    try {
      const documents = await this.documentModel.findByUserId(userId);
      return documents.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        fileType: doc.file_type,
        fileSize: doc.file_size,
        status: doc.status,
        errorMessage: doc.error_message,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      }));
    } catch (error: any) {
      logger.error(`Erro ao listar documentos: ${error.message}`);
      throw error;
    }
  }
}

