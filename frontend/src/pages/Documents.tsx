import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Document } from '../types';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Upload, Trash2, FileText, Loader, AlertCircle, ArrowLeft } from 'lucide-react';

export const Documents = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<{ documents: Document[] }>('/documents/list');
      setDocuments(response.data.documents);
    } catch (error: any) {
      toast.error('Erro ao carregar documentos');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    const allowedTypes = ['.txt', '.pdf', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      toast.error(`Tipo de arquivo não permitido. Permitidos: ${allowedTypes.join(', ')}`);
      return;
    }

    // Validar tamanho (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Tamanho máximo: 10MB');
      return;
    }

    await uploadDocument(file);
  };

  const uploadDocument = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('document', file);

    try {
      await api.post('/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      toast.success('Documento enviado e está sendo processado');
      setTimeout(loadDocuments, 2000);
    } catch (error: any) {
      toast.error('Erro ao enviar documento');
      console.error(error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este documento?')) {
      return;
    }

    try {
      await api.delete(`/documents/${id}`);
      toast.success('Documento deletado com sucesso');
      loadDocuments();
    } catch (error: any) {
      toast.error('Erro ao deletar documento');
      console.error(error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Concluído';
      case 'processing':
        return 'Processando';
      case 'pending':
        return 'Pendente';
      case 'error':
        return 'Erro';
      default:
        return status;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Voltar ao dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-2xl font-bold text-gray-900">Documentos</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500 mb-4">
              Carregue documentos (.txt, .pdf, .docx) para enriquecer o conhecimento do agente
            </p>
            <div className="flex items-center justify-end">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.docx"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Enviar Documento
                  </>
                )}
              </label>
            </div>
          </div>

          <div className="px-6 py-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Carregando documentos...</p>
                </div>
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">Nenhum documento carregado ainda</p>
                <p className="text-sm text-gray-400">
                  Envie documentos para que o agente possa usar as informações em suas respostas
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <FileText className="w-8 h-8 text-gray-400" />
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{doc.filename}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span>{formatFileSize(doc.fileSize)}</span>
                          <span className="capitalize">{doc.fileType}</span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}
                          >
                            {getStatusLabel(doc.status)}
                          </span>
                          {doc.status === 'error' && doc.errorMessage && (
                            <div className="flex items-center gap-1 text-red-600">
                              <AlertCircle className="w-4 h-4" />
                              <span className="text-xs">{doc.errorMessage}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md"
                      title="Deletar documento"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

