import { useState, FormEvent, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Plus, Image, Paperclip, X, Video } from 'lucide-react';
import api from '../services/api';
import { Media } from '../types';
import toast from 'react-hot-toast';

interface MessageInputProps {
  onSend: (message: string) => void;
  onSendMedia?: (mediaId: number) => void;
  conversationId: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

export const MessageInput = ({ onSend, onSendMedia, conversationId }: MessageInputProps) => {
  const [message, setMessage] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [medias, setMedias] = useState<Media[]>([]);
  const [isLoadingMedias, setIsLoadingMedias] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };

    if (showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOptions]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleOpenMediaModal = async () => {
    setShowOptions(false);
    setShowMediaModal(true);
    setIsLoadingMedias(true);
    
    try {
      const response = await api.get<{ medias: Media[] }>('/medias/list');
      // Filtrar apenas mídias ativas e completas
      const activeMedias = response.data.medias.filter(
        m => m.isActive && m.status === 'completed'
      );
      setMedias(activeMedias);
    } catch (error: any) {
      toast.error('Erro ao carregar mídias');
      console.error(error);
    } finally {
      setIsLoadingMedias(false);
    }
  };

  const handleSelectMedia = async (media: Media) => {
    setShowMediaModal(false);
    
    if (onSendMedia) {
      try {
        await onSendMedia(media.id);
        toast.success('Mídia enviada com sucesso');
      } catch (error: any) {
        toast.error('Erro ao enviar mídia');
        console.error(error);
      }
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2 relative">
        {/* Botão [+] */}
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center"
          title="Anexar mídia ou arquivo"
        >
          <Plus className="w-5 h-5 text-gray-600" />
        </button>

        {/* Dropdown de opções */}
        {showOptions && (
          <div
            ref={optionsRef}
            className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[200px]"
          >
            <button
              type="button"
              onClick={handleOpenMediaModal}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-sm"
            >
              <Image className="w-4 h-4 text-gray-600" />
              Mídia cadastrada
            </button>
            <button
              type="button"
              disabled
              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed"
            >
              <Paperclip className="w-4 h-4" />
              Anexar arquivo
              <span className="text-xs ml-auto">Em breve</span>
            </button>
          </div>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Digite sua mensagem..."
          rows={1}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!message.trim()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Send className="w-5 h-5" />
          Enviar
        </button>
      </form>

      {/* Modal de seleção de mídias */}
      {showMediaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Selecionar Mídia</h3>
              <button
                onClick={() => setShowMediaModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de mídias */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingMedias ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Carregando mídias...</p>
                </div>
              ) : medias.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Nenhuma mídia cadastrada</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {medias.map((media) => (
                    <button
                      key={media.id}
                      onClick={() => handleSelectMedia(media)}
                      className="border border-gray-200 rounded-lg p-3 hover:border-primary-500 hover:shadow-md transition-all text-left"
                    >
                      {media.fileType === 'image' && (
                        <img
                          src={`${API_URL}/medias/${media.id}/file?token=${localStorage.getItem('token')}`}
                          alt={media.title}
                          className="w-full h-32 object-cover rounded mb-2"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      {(media.fileType === 'video' || media.fileType === 'document') && (
                        <div className="w-full h-32 bg-gray-100 rounded mb-2 flex items-center justify-center">
                          {media.fileType === 'video' ? (
                            <Video className="w-8 h-8 text-gray-400" />
                          ) : (
                            <Paperclip className="w-8 h-8 text-gray-400" />
                          )}
                        </div>
                      )}
                      <p className="text-sm font-medium text-gray-900 truncate">{media.title}</p>
                      {media.caption && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{media.caption}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

