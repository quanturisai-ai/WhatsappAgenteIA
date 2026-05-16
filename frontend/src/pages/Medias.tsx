import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Media } from '../types';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  Upload, 
  Trash2, 
  Video, 
  Image, 
  FileText, 
  Loader, 
  AlertCircle, 
  Send, 
  X, 
  Edit2, 
  Plus,
  Play,
  File,
  ArrowLeft,
  Star
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

export const Medias = () => {
  const navigate = useNavigate();
  const [medias, setMedias] = useState<Media[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Estados do modal de upload
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados do modal de edição
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMedia, setEditingMedia] = useState<Media | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editIsActive, setEditIsActive] = useState(false);
  const [editMandatorySend, setEditMandatorySend] = useState(false);

  useEffect(() => {
    loadMedias();
  }, []);

  const loadMedias = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<{ medias: Media[] }>('/medias/list');
      setMedias(response.data.medias);
    } catch (error: any) {
      toast.error('Erro ao carregar mídias');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tamanho (50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Tamanho máximo: 50MB');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setSelectedFile(file);

    // Criar preview para imagens
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenUploadModal = () => {
    setShowUploadModal(true);
  };

  const handleCloseUploadModal = () => {
    setShowUploadModal(false);
    setTitle('');
    setDescription('');
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error('Por favor, selecione um arquivo');
      return;
    }

    if (!title.trim() || !description.trim()) {
      toast.error('Por favor, preencha o título e a descrição');
      return;
    }

    await uploadMedia(selectedFile);
  };

  const uploadMedia = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('media', file);
    formData.append('title', title);
    formData.append('description', description);

    try {
      await api.post('/medias/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      toast.success('Mídia enviada e está sendo processada');
      handleCloseUploadModal();
      setTimeout(loadMedias, 2000);
    } catch (error: any) {
      toast.error('Erro ao enviar mídia');
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleEdit = (media: Media) => {
    setEditingMedia(media);
    setEditTitle(media.title);
    setEditDescription(media.description);
    setEditCaption(media.caption || '');
    setEditIsActive(media.isActive);
    setEditMandatorySend(media.mandatorySend || false);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingMedia(null);
    setEditTitle('');
    setEditDescription('');
    setEditCaption('');
    setEditIsActive(false);
    setEditMandatorySend(false);
  };

  const handleUpdate = async () => {
    if (!editingMedia) return;

    if (!editTitle.trim() || !editDescription.trim()) {
      toast.error('Por favor, preencha o título e a descrição');
      return;
    }

    setIsUpdating(true);
    try {
      await api.put(`/medias/${editingMedia.id}`, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        caption: editCaption.trim() || null,
        isActive: editIsActive,
        mandatorySend: editMandatorySend,
      });
      
      toast.success('Mídia atualizada com sucesso');
      handleCloseEditModal();
      loadMedias();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao atualizar mídia');
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar esta mídia?')) {
      return;
    }

    try {
      await api.delete(`/medias/${id}`);
      toast.success('Mídia deletada com sucesso');
      loadMedias();
    } catch (error: any) {
      toast.error('Erro ao deletar mídia');
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

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case 'video':
        return <Video className="w-5 h-5 text-red-500" />;
      case 'image':
        return <Image className="w-5 h-5 text-blue-500" />;
      case 'document':
        return <FileText className="w-5 h-5 text-gray-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getMediaUrl = (mediaId: number) => {
    const token = localStorage.getItem('token');
    return `${API_URL}/medias/${mediaId}/file?token=${token}`;
  };

  const getMediaPreview = (media: Media) => {
    if (media.fileType === 'image') {
      return (
        <img
          src={getMediaUrl(media.id)}
          alt={media.title}
          className="w-full h-48 object-cover rounded-t-lg"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    } else if (media.fileType === 'video') {
      return (
        <div className="w-full h-48 bg-gradient-to-br from-gray-800 to-gray-900 rounded-t-lg flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Play className="w-16 h-16 text-white mx-auto mb-2 opacity-80" />
              <span className="text-white text-xs font-medium">Vídeo</span>
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="w-full h-48 bg-gray-100 rounded-t-lg flex items-center justify-center">
          {getFileTypeIcon(media.fileType)}
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Voltar ao dashboard"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Mídias</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Gerencie suas mídias para envio automático pelo WhatsApp
                </p>
              </div>
            </div>
            <button
              onClick={handleOpenUploadModal}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Nova Mídia
            </button>
          </div>
        </div>

        {/* Lista de Mídias */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Carregando mídias...</p>
            </div>
          </div>
        ) : medias.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4 text-lg">Nenhuma mídia carregada ainda</p>
            <p className="text-sm text-gray-400 mb-6">
              Envie mídias para que o agente possa enviá-las aos clientes quando for pertinente
            </p>
            <button
              onClick={handleOpenUploadModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Adicionar Primeira Mídia
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {medias.map((media) => (
              <div
                key={media.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
              >
                {/* Preview */}
                {getMediaPreview(media)}
                
                {/* Conteúdo */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{media.title}</h3>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{media.description}</p>
                  
                  {/* Informações */}
                  <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
                    {getFileTypeIcon(media.fileType)}
                    <span>{formatFileSize(media.fileSize)}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100">
                      {media.fileType}
                    </span>
                  </div>

                  {/* Status e Envio Obrigatório */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(media.status)}`}
                      >
                        {getStatusLabel(media.status)}
                      </span>
                      {media.mandatorySend && (
                        <span
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"
                          title="Envio obrigatório ativado"
                        >
                          <Star className="w-3 h-3 fill-yellow-600" />
                          Obrigatório
                        </span>
                      )}
                    </div>
                    {media.status === 'error' && media.errorMessage && (
                      <div className="flex items-center gap-1 text-red-600" title={media.errorMessage}>
                        <AlertCircle className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => handleEdit(media)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(media.id)}
                      className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Deletar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Upload */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Nova Mídia</h3>
                <button
                  onClick={handleCloseUploadModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isUploading}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Preview do arquivo */}
                {filePreview && (
                  <div className="mb-4">
                    <img
                      src={filePreview}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-lg border border-gray-200"
                    />
                  </div>
                )}

                {/* Seleção de arquivo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Arquivo *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*,image/*,.pdf,.doc,.docx,.txt"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="media-upload"
                      disabled={isUploading}
                    />
                    <label
                      htmlFor="media-upload"
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Upload className="w-5 h-5" />
                      {selectedFile ? 'Trocar Arquivo' : 'Selecionar Arquivo'}
                    </label>
                    {selectedFile && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg flex-1">
                        <File className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-700 flex-1 truncate">
                          {selectedFile.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatFileSize(selectedFile.size)}
                        </span>
                        <button
                          onClick={handleRemoveFile}
                          className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          disabled={isUploading}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Formatos aceitos: Vídeos (MP4, MOV, AVI), Imagens (JPG, PNG, GIF), Documentos (PDF, DOC, DOCX, TXT). Máximo: 50MB
                  </p>
                </div>

                {/* Título */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Catálogo de Produtos 2024"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={isUploading}
                  />
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descrição *
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descreva brevemente o conteúdo da mídia. Esta descrição será usada pela IA para decidir quando enviar aos clientes."
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={isUploading}
                  />
                </div>

                {/* Botões */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleCloseUploadModal}
                    disabled={isUploading}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isUploading || !selectedFile || !title.trim() || !description.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Enviar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      {showEditModal && editingMedia && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Editar Mídia</h3>
                <button
                  onClick={handleCloseEditModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isUpdating}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Preview da mídia */}
              <div className="mb-6">
                {getMediaPreview(editingMedia)}
              </div>

              <div className="space-y-4">
                {/* Título */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título *
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Ex: Catálogo de Produtos 2024"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={isUpdating}
                  />
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descrição *
                  </label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Descreva brevemente o conteúdo da mídia."
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={isUpdating}
                  />
                </div>

                {/* Caption */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Caption
                  </label>
                  <textarea
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    placeholder="Texto que será usado como legenda ao enviar esta mídia no início de interações (quando marcada como Envio Obrigatório). Se deixado em branco, nenhuma legenda será enviada."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={isUpdating}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Usado exclusivamente para mídias de envio obrigatório no início de interações.
                  </p>
                </div>

                {/* Mídia Ativa */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 mr-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mídia Ativa
                    </label>
                    <p className="text-xs text-gray-500">
                      Quando ativado, esta mídia aparecerá nos resultados da busca RAG e poderá ser enviada pela IA.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="sr-only peer"
                      disabled={isUpdating}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>

                {/* Envio Obrigatório */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 mr-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Envio Obrigatório
                    </label>
                    <p className="text-xs text-gray-500">
                      Quando ativado, esta mídia será enviada automaticamente para novas interações de clientes antes da resposta da IA.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={editMandatorySend}
                      onChange={(e) => setEditMandatorySend(e.target.checked)}
                      className="sr-only peer"
                      disabled={isUpdating}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>

                {/* Botões */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleCloseEditModal}
                    disabled={isUpdating}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={isUpdating || !editTitle.trim() || !editDescription.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpdating ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Salvar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
