import { useState, useEffect, FormEvent, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { agentConfigService } from '../services/agentConfig.service';
import { topicService } from '../services/topic.service';
import { indexingService, IndexableContent, IndexingStats } from '../services/indexing.service';
import { ollamaService } from '../services/ollama.service';
import { AgentConfig as AgentConfigType, Topic, Document, Media, OllamaModel } from '../types';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  Save, 
  Loader, 
  ArrowLeft, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Search, 
  Upload,
  FileText,
  Video,
  Image,
  Play,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  CheckCircle,
  Clock,
  Settings as SettingsIcon,
  MessageSquare,
  Bot,
  HelpCircle,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { TestChat } from '../components/TestChat';
import { humanAttendantService } from '../services/humanAttendant.service';
import { HumanAttendant } from '../types';
import { vmLavService, VmLavCliente, VmLavCredentials } from '../services/vmLav.service';
import { FidelizacaoTab } from '../components/FidelizacaoTab';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3002/api';

type TabType = 'business' | 'topics' | 'documents' | 'medias' | 'indexing' | 'humanAttendant' | 'clientes' | 'fidelizacao';

export const AgentConfig = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('business');
  const [isTestChatOpen, setIsTestChatOpen] = useState(false);
  
  // Estados para Informações do Negócio
  const [config, setConfig] = useState<AgentConfigType>({
    businessName: '',
    businessInfo: '',
    services: '',
    hours: '',
    personality: '',
    greetingMessage: '',
    farewellMessage: '',
    absenceMessage: '',
    specificInstructions: '',
    embeddingModel: 'deepseek-r1',
    generationModel: 'deepseek-r1',
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    repeatPenalty: 1.1,
    maxAgeHours: 12,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados para modelos do Ollama
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Estados para Tópicos
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [topicKeywords, setTopicKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [topicContext, setTopicContext] = useState<'greeting' | 'farewell' | 'absence' | 'special_date' | 'custom'>('custom');
  const [topicPriority, setTopicPriority] = useState(0);
  const [topicIsActive, setTopicIsActive] = useState(true);
  const [topicFilter, setTopicFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [topicSearch, setTopicSearch] = useState('');
  const [isSavingTopic, setIsSavingTopic] = useState(false);

  // Estados para Documentos
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Estados para Mídias
  const [medias, setMedias] = useState<Media[]>([]);
  const [mediasLoading, setMediasLoading] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isUpdatingMedia, setIsUpdatingMedia] = useState(false);
  const [showMediaUploadModal, setShowMediaUploadModal] = useState(false);
  const [showMediaEditModal, setShowMediaEditModal] = useState(false);
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaDescription, setMediaDescription] = useState('');
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);
  const [mediaFilePreview, setMediaFilePreview] = useState<string | null>(null);
  const [editingMedia, setEditingMedia] = useState<Media | null>(null);
  const [editMediaTitle, setEditMediaTitle] = useState('');
  const [editMediaDescription, setEditMediaDescription] = useState('');
  const [editMediaCaption, setEditMediaCaption] = useState('');
  const [editMediaIsActive, setEditMediaIsActive] = useState(true);
  const [editMediaMandatorySend, setEditMediaMandatorySend] = useState(false);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);

  // Estados para Indexação
  const [indexingContents, setIndexingContents] = useState<IndexableContent[]>([]);
  const [indexingStats, setIndexingStats] = useState<IndexingStats>({
    total: 0,
    indexed: 0,
    pending: 0,
    indexing: 0,
    error: 0,
  });

  // Estados para Atendente Humano
  const [attendants, setAttendants] = useState<HumanAttendant[]>([]);
  const [attendantLoading, setAttendantLoading] = useState(false);
  const [showAttendantModal, setShowAttendantModal] = useState(false);
  const [editingAttendant, setEditingAttendant] = useState<HumanAttendant | null>(null);
  const [attendantName, setAttendantName] = useState('');
  const [attendantPhone, setAttendantPhone] = useState('');
  const [attendantIsActive, setAttendantIsActive] = useState(true);
  const [isSavingAttendant, setIsSavingAttendant] = useState(false);
  const [isTestingAttendant, setIsTestingAttendant] = useState(false);
  const [showTopicHelpModal, setShowTopicHelpModal] = useState(false);
  const [indexingLoading, setIndexingLoading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingFilter, setIndexingFilter] = useState<'all' | 'pending' | 'indexed' | 'indexing' | 'error'>('all');

  // Estados para Clientes VM Lav
  const [clientes, setClientes] = useState<(VmLavCliente & { total_lavagens?: number; total_secagens?: number })[]>([]);
  const [clientesLoading, setClientesLoading] = useState(false);
  const [clientesTotal, setClientesTotal] = useState(0);
  const [clientesPage, setClientesPage] = useState(1);
  const [clientesLimit] = useState(50);
  const [clientesSearch, setClientesSearch] = useState('');
  const [clientesOrderBy, setClientesOrderBy] = useState<string>('nome');
  const [clientesOrderDir, setClientesOrderDir] = useState<'ASC' | 'DESC'>('ASC');
  const [showVmLavModal, setShowVmLavModal] = useState(false);
  const [vmLavEmail, setVmLavEmail] = useState('');
  const [vmLavSenha, setVmLavSenha] = useState('');
  const [isConfiguringVmLav, setIsConfiguringVmLav] = useState(false);
  const [isTestingVmLav, setIsTestingVmLav] = useState(false);
  const [isSyncingVmLav, setIsSyncingVmLav] = useState(false);
  const [vmLavCredentials, setVmLavCredentials] = useState<VmLavCredentials | null>(null);

  useEffect(() => {
    loadConfig();
    loadOllamaModels();
  }, []);

  useEffect(() => {
    if (activeTab === 'topics') loadTopics();
    if (activeTab === 'documents') loadDocuments();
    if (activeTab === 'medias') loadMedias();
    if (activeTab === 'indexing') loadIndexingContents();
    if (activeTab === 'humanAttendant') loadAttendant();
    if (activeTab === 'clientes') {
      loadVmLavCredentials();
      // loadClientes será chamado pelo useEffect abaixo quando necessário
    }
  }, [activeTab]);

  // Recarregar clientes quando ordenação ou busca mudar, ou quando a tab for aberta
  useEffect(() => {
    if (activeTab === 'clientes') {
      loadClientes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesPage, clientesSearch, clientesOrderBy, clientesOrderDir, activeTab]);

  // Atualizar indexação automaticamente quando estiver indexando
  useEffect(() => {
    if (isIndexing && activeTab === 'indexing') {
      const interval = setInterval(() => {
        loadIndexingContents();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isIndexing, activeTab]);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const data = await agentConfigService.getConfig();
      if (data) {
        setConfig({
          businessName: data.businessName ?? '',
          businessInfo: data.businessInfo ?? '',
          services: data.services ?? '',
          hours: data.hours ?? '',
          personality: data.personality ?? '',
          greetingMessage: data.greetingMessage ?? '',
          farewellMessage: data.farewellMessage ?? '',
          absenceMessage: data.absenceMessage ?? '',
          specificInstructions: data.specificInstructions ?? '',
          embeddingModel: data.embeddingModel ?? 'deepseek-r1',
          generationModel: data.generationModel ?? 'deepseek-r1',
          temperature: data.temperature ?? 0.7,
          topP: data.topP ?? 0.9,
          topK: data.topK ?? 40,
          repeatPenalty: data.repeatPenalty ?? 1.1,
          maxAgeHours: (data as any).max_age_hours ?? (data as any).maxAgeHours ?? 12,
        });
      }
    } catch (error: any) {
      toast.error('Erro ao carregar configurações');
      console.error('Erro ao carregar configurações:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await agentConfigService.updateConfig(config);
      toast.success('Configurações salvas com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar configurações');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof AgentConfigType, value: string | number) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  // ========== FUNÇÕES DE MODELOS OLLAMA ==========
  const loadOllamaModels = async () => {
    try {
      setModelsLoading(true);
      const models = await ollamaService.listModels();
      setOllamaModels(models);
    } catch (error: any) {
      toast.error('Erro ao carregar modelos do Ollama');
      console.error(error);
    } finally {
      setModelsLoading(false);
    }
  };

  // ========== FUNÇÕES DE TÓPICOS ==========
  const loadTopics = async () => {
    try {
      setTopicsLoading(true);
      const data = await topicService.listTopics();
      // Os tópicos já são normalizados no serviço (triggerKeywords sempre é array)
      setTopics(data);
    } catch (error: any) {
      toast.error('Erro ao carregar tópicos');
      console.error(error);
    } finally {
      setTopicsLoading(false);
    }
  };

  const handleOpenTopicModal = (topic?: Topic) => {
    if (topic) {
      setEditingTopic(topic);
      setTopicTitle(topic.title);
      setTopicDescription(topic.description);
      setTopicKeywords(Array.isArray(topic.triggerKeywords) ? [...topic.triggerKeywords] : []);
      setTopicContext(topic.context);
      setTopicPriority(topic.priority);
      setTopicIsActive(topic.isActive);
    } else {
      setEditingTopic(null);
      setTopicTitle('');
      setTopicDescription('');
      setTopicKeywords([]);
      setTopicContext('custom');
      setTopicPriority(0);
      setTopicIsActive(true);
    }
    setShowTopicModal(true);
  };

  const handleCloseTopicModal = () => {
    setShowTopicModal(false);
    setEditingTopic(null);
    setTopicTitle('');
    setTopicDescription('');
    setTopicKeywords([]);
    setKeywordInput('');
    setTopicContext('custom');
    setTopicPriority(0);
    setTopicIsActive(true);
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !topicKeywords.includes(keywordInput.trim())) {
      setTopicKeywords([...topicKeywords, keywordInput.trim()]);
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setTopicKeywords(topicKeywords.filter(k => k !== keyword));
  };

  const handleSaveTopic = async () => {
    if (!topicTitle.trim() || !topicDescription.trim()) {
      toast.error('Por favor, preencha o título e a descrição');
      return;
    }

    setIsSavingTopic(true);
    try {
      if (editingTopic) {
        await topicService.updateTopic(editingTopic.id, {
          title: topicTitle.trim(),
          description: topicDescription.trim(),
          triggerKeywords: topicKeywords,
          context: topicContext,
          priority: topicPriority,
          isActive: topicIsActive,
        });
        toast.success('Tópico atualizado com sucesso');
      } else {
        await topicService.createTopic({
          title: topicTitle.trim(),
          description: topicDescription.trim(),
          triggerKeywords: topicKeywords,
          context: topicContext,
          priority: topicPriority,
          isActive: topicIsActive,
        });
        toast.success('Tópico criado com sucesso');
      }
      handleCloseTopicModal();
      loadTopics();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar tópico');
      console.error(error);
    } finally {
      setIsSavingTopic(false);
    }
  };

  const handleDeleteTopic = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este tópico?')) return;
    
    try {
      await topicService.deleteTopic(id);
      toast.success('Tópico deletado com sucesso');
      loadTopics();
    } catch (error: any) {
      toast.error('Erro ao deletar tópico');
      console.error(error);
    }
  };

  const handleToggleTopic = async (topic: Topic) => {
    try {
      await topicService.updateTopic(topic.id, {
        isActive: !topic.isActive,
      });
      toast.success(`Tópico ${!topic.isActive ? 'ativado' : 'desativado'} com sucesso`);
      loadTopics();
    } catch (error: any) {
      toast.error('Erro ao atualizar tópico');
      console.error(error);
    }
  };

  const filteredTopics = topics.filter(topic => {
    const matchesSearch = topicSearch === '' || 
      topic.title.toLowerCase().includes(topicSearch.toLowerCase()) ||
      topic.description.toLowerCase().includes(topicSearch.toLowerCase());
    
    const matchesFilter = topicFilter === 'all' || 
      (topicFilter === 'active' && topic.isActive) ||
      (topicFilter === 'inactive' && !topic.isActive);
    
    return matchesSearch && matchesFilter;
  });

  // ========== FUNÇÕES DE DOCUMENTOS ==========
  const loadDocuments = async () => {
    try {
      setDocumentsLoading(true);
      const response = await api.get<{ documents: Document[] }>('/documents/list');
      setDocuments(response.data.documents);
    } catch (error: any) {
      toast.error('Erro ao carregar documentos');
      console.error(error);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const handleDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['.txt', '.pdf', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      toast.error(`Tipo de arquivo não permitido. Permitidos: ${allowedTypes.join(', ')}`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Tamanho máximo: 10MB');
      return;
    }

    await uploadDocument(file);
  };

  const uploadDocument = async (file: File) => {
    setIsUploadingDoc(true);
    const formData = new FormData();
    formData.append('document', file);

    try {
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Documento enviado e está sendo processado');
      setTimeout(loadDocuments, 2000);
    } catch (error: any) {
      toast.error('Erro ao enviar documento');
      console.error(error);
    } finally {
      setIsUploadingDoc(false);
      if (docFileInputRef.current) {
        docFileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteDocument = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este documento?')) return;
    
    try {
      await api.delete(`/documents/${id}`);
      toast.success('Documento deletado com sucesso');
      loadDocuments();
    } catch (error: any) {
      toast.error('Erro ao deletar documento');
      console.error(error);
    }
  };

  // ========== FUNÇÕES DE MÍDIAS ==========
  const loadMedias = async () => {
    try {
      setMediasLoading(true);
      const response = await api.get<{ medias: Media[] }>('/medias/list');
      setMedias(response.data.medias);
    } catch (error: any) {
      toast.error('Erro ao carregar mídias');
      console.error(error);
    } finally {
      setMediasLoading(false);
    }
  };

  const handleMediaFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Tamanho máximo: 50MB');
      if (mediaFileInputRef.current) {
        mediaFileInputRef.current.value = '';
      }
      return;
    }

    setSelectedMediaFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setMediaFilePreview(null);
    }
  };

  const handleOpenMediaUploadModal = () => {
    setShowMediaUploadModal(true);
  };

  const handleCloseMediaUploadModal = () => {
    setShowMediaUploadModal(false);
    setMediaTitle('');
    setMediaDescription('');
    setSelectedMediaFile(null);
    setMediaFilePreview(null);
    if (mediaFileInputRef.current) {
      mediaFileInputRef.current.value = '';
    }
  };

  const handleMediaSubmit = async () => {
    if (!selectedMediaFile || !mediaTitle.trim() || !mediaDescription.trim()) {
      toast.error('Por favor, preencha todos os campos');
      return;
    }

    setIsUploadingMedia(true);
    const formData = new FormData();
    formData.append('media', selectedMediaFile);
    formData.append('title', mediaTitle);
    formData.append('description', mediaDescription);

    try {
      await api.post('/medias/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Mídia enviada e está sendo processada');
      handleCloseMediaUploadModal();
      setTimeout(loadMedias, 2000);
    } catch (error: any) {
      toast.error('Erro ao enviar mídia');
      console.error(error);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleEditMedia = (media: Media) => {
    setEditingMedia(media);
    setEditMediaTitle(media.title);
    setEditMediaDescription(media.description);
    setEditMediaCaption(media.caption || '');
    setEditMediaIsActive(media.isActive);
    setEditMediaMandatorySend(media.mandatorySend || false);
    setShowMediaEditModal(true);
  };

  const handleCloseMediaEditModal = () => {
    setShowMediaEditModal(false);
    setEditingMedia(null);
    setEditMediaTitle('');
    setEditMediaDescription('');
    setEditMediaCaption('');
    setEditMediaIsActive(true);
    setEditMediaMandatorySend(false);
  };

  const handleUpdateMedia = async () => {
    if (!editingMedia || !editMediaTitle.trim() || !editMediaDescription.trim()) {
      toast.error('Por favor, preencha o título e a descrição');
      return;
    }

    setIsUpdatingMedia(true);
    try {
      await api.put(`/medias/${editingMedia.id}`, {
        title: editMediaTitle.trim(),
        description: editMediaDescription.trim(),
        caption: editMediaCaption.trim() || null,
        isActive: editMediaIsActive,
        mandatorySend: editMediaMandatorySend,
      });
      toast.success('Mídia atualizada com sucesso');
      handleCloseMediaEditModal();
      loadMedias();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao atualizar mídia');
      console.error(error);
    } finally {
      setIsUpdatingMedia(false);
    }
  };

  const handleToggleMedia = async (media: Media) => {
    try {
      await api.put(`/medias/${media.id}`, {
        title: media.title,
        description: media.description,
        isActive: !media.isActive,
      });
      toast.success(`Mídia ${!media.isActive ? 'ativada' : 'desativada'} com sucesso`);
      loadMedias();
    } catch (error: any) {
      toast.error('Erro ao atualizar status da mídia');
      console.error(error);
    }
  };

  const handleDeleteMedia = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar esta mídia?')) return;
    
    try {
      await api.delete(`/medias/${id}`);
      toast.success('Mídia deletada com sucesso');
      loadMedias();
    } catch (error: any) {
      toast.error('Erro ao deletar mídia');
      console.error(error);
    }
  };

  // ========== FUNÇÕES AUXILIARES ==========
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-yellow-100 text-yellow-800';
      case 'pending': return 'bg-blue-100 text-blue-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Concluído';
      case 'processing': return 'Processando';
      case 'pending': return 'Pendente';
      case 'error': return 'Erro';
      default: return status;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getContextLabel = (context: string) => {
    switch (context) {
      case 'greeting': return 'Saudação';
      case 'farewell': return 'Despedida';
      case 'absence': return 'Ausência';
      case 'special_date': return 'Data Especial';
      case 'custom': return 'Personalizado';
      default: return context;
    }
  };

  const getMediaUrl = (mediaId: number) => {
    const token = localStorage.getItem('token');
    return `${API_URL}/medias/${mediaId}/file?token=${token}`;
  };

  // ========== FUNÇÕES DE INDEXAÇÃO ==========
  const loadIndexingContents = async () => {
    try {
      setIndexingLoading(true);
      const data = await indexingService.getStatus();
      setIndexingContents(data.contents);
      setIndexingStats(data.stats);
      
      // Verificar se ainda há itens sendo indexados
      if (data.stats.indexing === 0 && isIndexing) {
        setIsIndexing(false);
        toast.success('Indexação concluída!');
      }
    } catch (error: any) {
      toast.error('Erro ao carregar status de indexação');
      console.error(error);
    } finally {
      setIndexingLoading(false);
    }
  };

  // ========== FUNÇÕES DE ATENDENTE HUMANO ==========
  const loadAttendant = async () => {
    try {
      setAttendantLoading(true);
      const data = await humanAttendantService.getAttendants();
      setAttendants(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar atendentes humanos');
      console.error(error);
    } finally {
      setAttendantLoading(false);
    }
  };

  const handleOpenAttendantModal = (attendant?: HumanAttendant) => {
    if (attendant) {
      setEditingAttendant(attendant);
      setAttendantName(attendant.name || '');
      setAttendantPhone(attendant.phoneNumber);
      setAttendantIsActive(attendant.isActive);
    } else {
      setEditingAttendant(null);
      setAttendantName('');
      setAttendantPhone('');
      setAttendantIsActive(true);
    }
    setShowAttendantModal(true);
  };

  const handleCloseAttendantModal = () => {
    setShowAttendantModal(false);
    setEditingAttendant(null);
    setAttendantName('');
    setAttendantPhone('');
    setAttendantIsActive(true);
  };

  // ========== FUNÇÕES DE CLIENTES VM LAV ==========
  const loadClientes = async () => {
    try {
      setClientesLoading(true);
      const data = await vmLavService.listarClientes({
        page: clientesPage,
        limit: clientesLimit,
        search: clientesSearch || undefined,
        orderBy: clientesOrderBy,
        orderDir: clientesOrderDir,
      });
      setClientes(data.clientes);
      setClientesTotal(data.total);
    } catch (error: any) {
      toast.error('Erro ao carregar clientes');
      console.error(error);
    } finally {
      setClientesLoading(false);
    }
  };

  const handleSortClientes = (column: string) => {
    if (clientesOrderBy === column) {
      // Inverter direção se já está ordenando por esta coluna
      setClientesOrderDir(clientesOrderDir === 'ASC' ? 'DESC' : 'ASC');
    } else {
      // Nova coluna, começar com ASC
      setClientesOrderBy(column);
      setClientesOrderDir('ASC');
    }
  };

  const loadVmLavCredentials = async () => {
    try {
      const data = await vmLavService.obterCredenciais();
      setVmLavCredentials(data.credentials);
      if (data.credentials) {
        setVmLavEmail(data.credentials.email);
      }
    } catch (error: any) {
      console.error('Erro ao carregar credenciais VM Lav:', error);
    }
  };

  const handleOpenVmLavModal = () => {
    setShowVmLavModal(true);
    if (vmLavCredentials) {
      setVmLavEmail(vmLavCredentials.email);
      // Preencher com a senha do banco (se disponível)
      setVmLavSenha((vmLavCredentials as any).senha || '');
    } else {
      setVmLavEmail('');
      setVmLavSenha('');
    }
  };

  const handleCloseVmLavModal = () => {
    setShowVmLavModal(false);
    setVmLavEmail('');
    setVmLavSenha('');
  };

  const handleConfigurarVmLav = async () => {
    if (!vmLavEmail || !vmLavSenha) {
      toast.error('Por favor, preencha email e senha');
      return;
    }

    try {
      setIsConfiguringVmLav(true);
      // Sempre enviar a senha que está no campo (pode ser a do banco ou uma nova)
      const resultado = await vmLavService.configurarCredenciais(vmLavEmail, vmLavSenha);
      
      if (resultado.captchaReady) {
        toast.success('Navegador aberto! Por favor, resolva o CAPTCHA e aguarde...');
        // Aguardar um pouco e verificar novamente
        setTimeout(async () => {
          await loadVmLavCredentials();
          if (vmLavCredentials) {
            toast.success('Credenciais configuradas com sucesso!');
            handleCloseVmLavModal();
          }
        }, 5000);
      } else {
        toast.success(resultado.message || 'Credenciais configuradas com sucesso!');
        await loadVmLavCredentials();
        handleCloseVmLavModal();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Erro ao configurar credenciais';
      toast.error(errorMessage);
      console.error('Erro ao configurar credenciais VM Lav:', error);
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
    } finally {
      setIsConfiguringVmLav(false);
    }
  };

  const handleTestarConexaoVmLav = async () => {
    try {
      setIsTestingVmLav(true);
      const resultado = await vmLavService.testarConexao();
      toast.success(resultado.message || 'Conexão testada com sucesso!');
      await loadVmLavCredentials();
      await loadClientes();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao testar conexão');
      console.error(error);
    } finally {
      setIsTestingVmLav(false);
    }
  };

  const handleSincronizarClientes = async () => {
    try {
      setIsSyncingVmLav(true);
      const resultado = await vmLavService.sincronizarClientes();
      toast.success(resultado.message || `Sincronização concluída! ${resultado.total || 0} clientes atualizados.`);
      await loadClientes();
      await loadVmLavCredentials();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao sincronizar clientes');
      console.error(error);
    } finally {
      setIsSyncingVmLav(false);
    }
  };

  // Recarregar clientes quando página ou busca mudar
  useEffect(() => {
    if (activeTab === 'clientes') {
      const timeoutId = setTimeout(() => {
        loadClientes();
      }, 500); // Debounce de 500ms para busca
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesPage, clientesSearch, activeTab]);

  const handleSaveAttendant = async () => {
    if (!attendantPhone || !attendantPhone.trim()) {
      toast.error('Por favor, preencha o número de telefone');
      return;
    }

    setIsSavingAttendant(true);
    try {
      if (editingAttendant) {
        await humanAttendantService.updateAttendant(
          editingAttendant.id,
          attendantPhone.trim(),
          attendantName?.trim() || null,
          attendantIsActive
        );
        toast.success('Atendente humano atualizado com sucesso');
      } else {
        await humanAttendantService.createAttendant(
          attendantPhone.trim(),
          attendantName?.trim() || null,
          attendantIsActive
        );
        toast.success('Atendente humano criado com sucesso');
      }
      handleCloseAttendantModal();
      loadAttendant();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar atendente humano');
      console.error(error);
    } finally {
      setIsSavingAttendant(false);
    }
  };

  const handleDeleteAttendant = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este atendente?')) {
      return;
    }

    try {
      await humanAttendantService.deleteAttendant(id);
      toast.success('Atendente humano excluído com sucesso');
      loadAttendant();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao excluir atendente humano');
      console.error(error);
    }
  };

  const handleTestAttendant = async (phoneNumber: string) => {
    setIsTestingAttendant(true);
    try {
      await humanAttendantService.sendTestMessage(phoneNumber);
      toast.success('Mensagem de teste enviada com sucesso!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao enviar mensagem de teste');
      console.error(error);
    } finally {
      setIsTestingAttendant(false);
    }
  };

  const handleStartIndexing = async () => {
    if (indexingStats.pending === 0 && indexingStats.error === 0) {
      toast.error('Não há conteúdos pendentes para indexar');
      return;
    }

    try {
      setIsIndexing(true);
      await indexingService.startIndexing();
      toast.success('Indexação iniciada em background');
      // Começar a atualizar imediatamente
      setTimeout(loadIndexingContents, 1000);
    } catch (error: any) {
      toast.error('Erro ao iniciar indexação');
      console.error(error);
      setIsIndexing(false);
    }
  };

  const handleReindexContent = async (content: IndexableContent) => {
    try {
      await indexingService.indexContent(content.type, content.metadata.id);
      toast.success('Reindexação iniciada');
      setTimeout(loadIndexingContents, 1000);
    } catch (error: any) {
      toast.error('Erro ao reindexar conteúdo');
      console.error(error);
    }
  };

  const getIndexingTypeIcon = (type: string) => {
    switch (type) {
      case 'agent_config':
        return <SettingsIcon className="w-5 h-5 text-blue-500" />;
      case 'topic':
        return <MessageSquare className="w-5 h-5 text-green-500" />;
      case 'document':
        return <FileText className="w-5 h-5 text-purple-500" />;
      case 'media':
        return <Image className="w-5 h-5 text-orange-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getIndexingTypeLabel = (type: string) => {
    switch (type) {
      case 'agent_config':
        return 'Informações do Negócio';
      case 'topic':
        return 'Tópico';
      case 'document':
        return 'Documento';
      case 'media':
        return 'Mídia';
      default:
        return type;
    }
  };

  const getIndexingStatusIcon = (status?: string) => {
    switch (status) {
      case 'indexed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'indexing':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getIndexingStatusLabel = (status?: string) => {
    switch (status) {
      case 'indexed':
        return 'Indexado';
      case 'indexing':
        return 'Indexando...';
      case 'pending':
        return 'Pendente';
      case 'error':
        return 'Erro';
      default:
        return 'Pendente';
    }
  };

  const getIndexingStatusColor = (status?: string) => {
    switch (status) {
      case 'indexed':
        return 'bg-green-100 text-green-800';
      case 'indexing':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('pt-BR');
  };

  const filteredIndexingContents = indexingContents.filter(content => {
    if (indexingFilter === 'all') return true;
    return content.indexingStatus === indexingFilter;
  });

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
          <FileText className="w-12 h-12 text-gray-400" />
        </div>
      );
    }
  };

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case 'video': return <Video className="w-5 h-5 text-red-500" />;
      case 'image': return <Image className="w-5 h-5 text-blue-500" />;
      case 'document': return <FileText className="w-5 h-5 text-gray-500" />;
      default: return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  title="Voltar ao dashboard"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-2xl font-bold text-gray-900">Configurações do Agente</h2>
              </div>
              <button
                onClick={() => setIsTestChatOpen(!isTestChatOpen)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                title="Testar conversa com IA"
              >
                <Bot className="w-4 h-4" />
                Testar IA
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Configure as informações do seu negócio, tópicos, documentos, mídias e indexação
            </p>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px px-6 overflow-x-auto flex-nowrap">
              <button
                onClick={() => setActiveTab('business')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'business'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Informações do Negócio
              </button>
              <button
                onClick={() => setActiveTab('topics')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'topics'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Tópicos
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'documents'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Documentos
              </button>
              <button
                onClick={() => setActiveTab('medias')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'medias'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Mídias
              </button>
              <button
                onClick={() => setActiveTab('indexing')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'indexing'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Indexação
              </button>
              <button
                onClick={() => setActiveTab('humanAttendant')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'humanAttendant'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Atendente Humano
              </button>
              <button
                onClick={() => setActiveTab('clientes')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'clientes'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Clientes
              </button>
              <button
                onClick={() => setActiveTab('fidelizacao')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'fidelizacao'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Fidelização
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="px-6 py-6">
            {/* Tab: Informações do Negócio */}
            {activeTab === 'business' && (
              <form onSubmit={handleSubmit} className="space-y-6">
            {/* Informações do Negócio */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Informações do Negócio</h3>
              
              <div>
                <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do Negócio
                </label>
                <input
                  type="text"
                  id="businessName"
                  value={config.businessName || ''}
                  onChange={(e) => handleChange('businessName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Loja de Roupas XYZ"
                />
              </div>

              <div>
                <label htmlFor="businessInfo" className="block text-sm font-medium text-gray-700 mb-1">
                  Informações sobre o Negócio
                </label>
                <textarea
                  id="businessInfo"
                  rows={4}
                  value={config.businessInfo || ''}
                  onChange={(e) => handleChange('businessInfo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Descreva seu negócio, história, valores, etc."
                />
              </div>

              <div>
                <label htmlFor="services" className="block text-sm font-medium text-gray-700 mb-1">
                  Serviços Oferecidos
                </label>
                <textarea
                  id="services"
                  rows={4}
                  value={config.services || ''}
                  onChange={(e) => handleChange('services', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Liste os serviços ou produtos que você oferece"
                />
              </div>

              <div>
                <label htmlFor="hours" className="block text-sm font-medium text-gray-700 mb-1">
                  Horários de Atendimento
                </label>
                <input
                  type="text"
                  id="hours"
                  value={config.hours || ''}
                  onChange={(e) => handleChange('hours', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Segunda a Sexta: 9h às 18h"
                />
              </div>
            </div>

            {/* Personalidade do Agente */}
            <div className="space-y-4 border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900">Personalidade do Agente</h3>
              
              <div>
                <label htmlFor="personality" className="block text-sm font-medium text-gray-700 mb-1">
                  Personalidade e Tom de Voz
                </label>
                <textarea
                  id="personality"
                  rows={4}
                  value={config.personality || ''}
                  onChange={(e) => handleChange('personality', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Agente amigável, prestativo, usa linguagem formal mas acessível..."
                />
              </div>
            </div>

            {/* Modelos de IA */}
            <div className="space-y-4 border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900">Modelos de IA</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure os modelos do Ollama para embeddings e geração de respostas
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="embeddingModel" className="block text-sm font-medium text-gray-700 mb-1">
                    Modelo para Embeddings *
                  </label>
                  <select
                    id="embeddingModel"
                    value={config.embeddingModel || 'deepseek-r1'}
                    onChange={(e) => handleChange('embeddingModel', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={modelsLoading}
                  >
                    {modelsLoading ? (
                      <option>Carregando modelos...</option>
                    ) : ollamaModels.length === 0 ? (
                      <option>Nenhum modelo disponível</option>
                    ) : (
                      ollamaModels.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name} ({model.sizeFormatted})
                        </option>
                      ))
                    )}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Modelo usado para gerar embeddings (busca semântica)
                  </p>
                </div>
                
                <div>
                  <label htmlFor="generationModel" className="block text-sm font-medium text-gray-700 mb-1">
                    Modelo para Geração de Respostas *
                  </label>
                  <select
                    id="generationModel"
                    value={config.generationModel || 'deepseek-r1'}
                    onChange={(e) => handleChange('generationModel', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={modelsLoading}
                  >
                    {modelsLoading ? (
                      <option>Carregando modelos...</option>
                    ) : ollamaModels.length === 0 ? (
                      <option>Nenhum modelo disponível</option>
                    ) : (
                      ollamaModels.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name} ({model.sizeFormatted})
                        </option>
                      ))
                    )}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Modelo usado para gerar respostas ao cliente
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={loadOllamaModels}
                  disabled={modelsLoading}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-4 h-4 ${modelsLoading ? 'animate-spin' : ''}`} />
                  Atualizar Lista de Modelos
                </button>
              </div>
            </div>

            {/* Parâmetros de Geração */}
            <div className="space-y-4 border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900">Parâmetros de Geração</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure a criatividade e precisão das respostas do agente
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Temperature */}
                <div>
                  <label htmlFor="temperature" className="block text-sm font-medium text-gray-700 mb-1">
                    Temperatura (Criatividade) *
                  </label>
                  <input
                    type="number"
                    id="temperature"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.temperature ?? 0.7}
                    onChange={(e) => handleChange('temperature', parseFloat(e.target.value) || 0.7)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    0.0 = Preciso (determinístico) | 2.0 = Criativo (aleatório)
                  </p>
                </div>

                {/* Top P */}
                <div>
                  <label htmlFor="topP" className="block text-sm font-medium text-gray-700 mb-1">
                    Top P (Nucleus Sampling) *
                  </label>
                  <input
                    type="number"
                    id="topP"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.topP ?? 0.9}
                    onChange={(e) => handleChange('topP', parseFloat(e.target.value) || 0.9)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Controla a diversidade das respostas (0.0-1.0)
                  </p>
                </div>

                {/* Top K */}
                <div>
                  <label htmlFor="topK" className="block text-sm font-medium text-gray-700 mb-1">
                    Top K (Limite de Tokens) *
                  </label>
                  <input
                    type="number"
                    id="topK"
                    min="1"
                    max="100"
                    value={config.topK ?? 40}
                    onChange={(e) => handleChange('topK', parseInt(e.target.value) || 40)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Limita o número de tokens considerados (1-100)
                  </p>
                </div>

                {/* Repeat Penalty */}
                <div>
                  <label htmlFor="repeatPenalty" className="block text-sm font-medium text-gray-700 mb-1">
                    Penalidade de Repetição *
                  </label>
                  <input
                    type="number"
                    id="repeatPenalty"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.repeatPenalty ?? 1.1}
                    onChange={(e) => handleChange('repeatPenalty', parseFloat(e.target.value) || 1.1)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Penaliza repetições (0.0-2.0). Valores maiores reduzem repetições
                  </p>
                </div>

                {/* Max Age Hours */}
                <div>
                  <label htmlFor="maxAgeHours" className="block text-sm font-medium text-gray-700 mb-1">
                    Idade Máxima do Histórico (horas) *
                  </label>
                  <input
                    type="number"
                    id="maxAgeHours"
                    min="1"
                    max="168"
                    step="1"
                    value={config.maxAgeHours ?? 12}
                    onChange={(e) => handleChange('maxAgeHours', parseInt(e.target.value) || 12)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Define quantas horas de histórico serão usadas no prompt e quando conversas serão finalizadas automaticamente (1-168 horas)
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-blue-800">
                  <strong>Dica:</strong> Para respostas mais precisas e determinísticas, use valores baixos de temperatura (0.1-0.5). 
                  Para respostas mais criativas e variadas, use valores mais altos (0.7-1.5).
                </p>
              </div>
            </div>

                {/* Botão Salvar */}
                <div className="flex justify-end border-t border-gray-200 pt-6">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Salvar Configurações
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Tab: Tópicos */}
            {activeTab === 'topics' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">Tópicos</h3>
                    <button
                      onClick={() => setShowTopicHelpModal(true)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Ajuda sobre gatilhos de alerta"
                    >
                      <HelpCircle className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTopicHelpModal(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <HelpCircle className="w-4 h-4" />
                      Ajuda
                    </button>
                    <button
                      onClick={() => handleOpenTopicModal()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                    >
                      <Plus className="w-5 h-5" />
                      Novo Tópico
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-500">
                  Gerencie os tópicos que o agente pode usar para responder
                </p>

                {/* Filtros */}
                <div className="flex gap-4 items-center">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Buscar tópicos..."
                      value={topicSearch}
                      onChange={(e) => setTopicSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTopicFilter('all')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        topicFilter === 'all'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setTopicFilter('active')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        topicFilter === 'active'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Ativos
                    </button>
                    <button
                      onClick={() => setTopicFilter('inactive')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        topicFilter === 'inactive'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Inativos
                    </button>
                  </div>
                </div>

                {/* Lista de Tópicos */}
                {topicsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : filteredTopics.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Nenhum tópico encontrado</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredTopics.map((topic) => (
                      <div
                        key={topic.id}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-gray-900">{topic.title}</h4>
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                topic.isActive
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {topic.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{topic.description}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>Contexto: {getContextLabel(topic.context)}</span>
                              <span>•</span>
                              <span>Prioridade: {topic.priority}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleTopic(topic)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            title={topic.isActive ? 'Desativar' : 'Ativar'}
                          >
                            {topic.isActive ? (
                              <ToggleRight className="w-5 h-5 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        </div>
                        {topic.triggerKeywords && Array.isArray(topic.triggerKeywords) && topic.triggerKeywords.length > 0 && (
                          <div className="mb-3">
                            <div className="flex flex-wrap gap-1">
                              {topic.triggerKeywords.map((keyword, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenTopicModal(topic)}
                            className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteTopic(topic.id)}
                            className="px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Documentos */}
            {activeTab === 'documents' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Documentos</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Faça upload de documentos para o agente usar como referência
                    </p>
                  </div>
                  <div>
                    <input
                      ref={docFileInputRef}
                      type="file"
                      accept=".txt,.pdf,.docx"
                      onChange={handleDocumentSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => docFileInputRef.current?.click()}
                      disabled={isUploadingDoc}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploadingDoc ? (
                        <>
                          <Loader className="w-5 h-5 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Enviar Documento
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {documentsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : documents.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Nenhum documento encontrado</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className="p-2 bg-blue-50 rounded-lg">
                            <FileText className="w-6 h-6 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 truncate">{doc.filename}</h4>
                            <p className="text-sm text-gray-500 mt-1">
                              {formatFileSize(doc.fileSize || 0)}
                            </p>
                            <span className={`inline-block mt-2 px-2 py-1 text-xs rounded-full ${getStatusColor(doc.status)}`}>
                              {getStatusLabel(doc.status)}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="flex-1 px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Deletar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Mídias */}
            {activeTab === 'medias' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Mídias</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Gerencie suas mídias para envio automático pelo WhatsApp
                    </p>
                  </div>
                  <button
                    onClick={handleOpenMediaUploadModal}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                  >
                    <Plus className="w-5 h-5" />
                    Nova Mídia
                  </button>
                </div>

                {mediasLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : medias.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Nenhuma mídia encontrada</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {medias.map((media) => (
                      <div
                        key={media.id}
                        className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                      >
                        {getMediaPreview(media)}
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-gray-900">{media.title}</h4>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  media.isActive
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {media.isActive ? 'Ativa' : 'Inativa'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getFileTypeIcon(media.fileType)}
                              <button
                                onClick={() => handleToggleMedia(media)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                title={media.isActive ? 'Desativar' : 'Ativar'}
                              >
                                {media.isActive ? (
                                  <ToggleRight className="w-5 h-5 text-green-600" />
                                ) : (
                                  <ToggleLeft className="w-5 h-5 text-gray-400" />
                                )}
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{media.description}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditMedia(media)}
                              className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                            >
                              <Edit2 className="w-4 h-4" />
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteMedia(media.id)}
                              className="px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center justify-center gap-2"
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
            )}

            {/* Tab: Indexação */}
            {activeTab === 'indexing' && (
              <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                    <div className="text-2xl font-bold text-gray-900">{indexingStats.total}</div>
                    <div className="text-sm text-gray-500">Total</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200 text-center">
                    <div className="text-2xl font-bold text-green-600">{indexingStats.indexed}</div>
                    <div className="text-sm text-gray-600">Indexados</div>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{indexingStats.pending}</div>
                    <div className="text-sm text-gray-600">Pendentes</div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 text-center">
                    <div className="text-2xl font-bold text-blue-600">{indexingStats.indexing}</div>
                    <div className="text-sm text-gray-600">Indexando</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg border border-red-200 text-center">
                    <div className="text-2xl font-bold text-red-600">{indexingStats.error}</div>
                    <div className="text-sm text-gray-600">Erros</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIndexingFilter('all')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        indexingFilter === 'all'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setIndexingFilter('pending')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        indexingFilter === 'pending'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Pendentes
                    </button>
                    <button
                      onClick={() => setIndexingFilter('indexed')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        indexingFilter === 'indexed'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Indexados
                    </button>
                    <button
                      onClick={() => setIndexingFilter('error')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        indexingFilter === 'error'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Erros
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={loadIndexingContents}
                      disabled={indexingLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-4 h-4 ${indexingLoading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </button>
                    <button
                      onClick={handleStartIndexing}
                      disabled={isIndexing || (indexingStats.pending === 0 && indexingStats.error === 0)}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isIndexing ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          Indexando...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Iniciar Indexação
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Table */}
                {indexingLoading && indexingContents.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : filteredIndexingContents.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Nenhum conteúdo encontrado</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Tipo
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Título
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Última Indexação
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredIndexingContents.map((content) => (
                          <tr key={content.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {getIndexingTypeIcon(content.type)}
                                <span className="text-sm text-gray-900">{getIndexingTypeLabel(content.type)}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">{content.title}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {getIndexingStatusIcon(content.indexingStatus)}
                                <span className={`px-2 py-1 text-xs rounded-full ${getIndexingStatusColor(content.indexingStatus)}`}>
                                  {getIndexingStatusLabel(content.indexingStatus)}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(content.lastIndexedAt)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => handleReindexContent(content)}
                                disabled={content.indexingStatus === 'indexing'}
                                className="text-primary-600 hover:text-primary-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reindexar"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Atendente Humano */}
            {activeTab === 'humanAttendant' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Atendentes Humanos</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Configure os números de telefone dos atendentes humanos que receberão alertas quando a IA detectar que um cliente precisa de intervenção humana.
                    </p>
                  </div>
                  <button
                    onClick={() => handleOpenAttendantModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                  >
                    <Plus className="w-5 h-5" />
                    Novo Atendente
                  </button>
                </div>

                {attendantLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : attendants.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Nenhum atendente humano cadastrado</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Clique em "Novo Atendente" para adicionar um atendente humano
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {attendants.map((attendant) => (
                      <div key={attendant.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">
                              {attendant.name || 'Sem nome'}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">{attendant.phoneNumber}</p>
                          </div>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            attendant.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {attendant.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => handleOpenAttendantModal(attendant)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                            Editar
                          </button>
                          <button
                            onClick={() => handleTestAttendant(attendant.phoneNumber)}
                            disabled={isTestingAttendant || !attendant.isActive}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Testar envio"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Testar
                          </button>
                          <button
                            onClick={() => handleDeleteAttendant(attendant.id)}
                            className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                            title="Excluir atendente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Clientes */}
            {activeTab === 'clientes' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Clientes VM Lav</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Lista de clientes sincronizados automaticamente do sistema VM Lav
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {vmLavCredentials && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          vmLavCredentials.status === 'ativo'
                            ? 'bg-green-100 text-green-800'
                            : vmLavCredentials.status === 'erro'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {vmLavCredentials.status === 'ativo' ? 'Conectado' : vmLavCredentials.status === 'erro' ? 'Erro' : 'Inativo'}
                        </span>
                        {vmLavCredentials.ultima_sincronizacao && (
                          <span className="text-gray-500 text-xs">
                            Última sync: {new Date(vmLavCredentials.ultima_sincronizacao).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                    )}
                    <button
                      onClick={handleSincronizarClientes}
                      disabled={isSyncingVmLav || !vmLavCredentials}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSyncingVmLav ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Sincronizar
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleOpenVmLavModal}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      <SettingsIcon className="w-4 h-4" />
                      Config VM Lav
                    </button>
                  </div>
                </div>

                {/* Busca */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={clientesSearch}
                      onChange={(e) => setClientesSearch(e.target.value)}
                      placeholder="Buscar por nome, CPF, telefone, email, data cadastro ou total de compras..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Lista de Clientes */}
                {clientesLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <Loader className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : clientes.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">
                      {clientesSearch ? 'Nenhum cliente encontrado' : 'Nenhum cliente sincronizado ainda'}
                    </p>
                    {!vmLavCredentials && (
                      <p className="text-sm text-gray-500 mt-2">
                        Configure as credenciais VM Lav para começar a sincronizar clientes
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => handleSortClientes('nome')}
                              >
                                <div className="flex items-center gap-2">
                                  Nome
                                  {clientesOrderBy === 'nome' && (
                                    clientesOrderDir === 'ASC' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => handleSortClientes('cpf')}
                              >
                                <div className="flex items-center gap-2">
                                  CPF
                                  {clientesOrderBy === 'cpf' && (
                                    clientesOrderDir === 'ASC' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => handleSortClientes('telefone')}
                              >
                                <div className="flex items-center gap-2">
                                  Telefone
                                  {clientesOrderBy === 'telefone' && (
                                    clientesOrderDir === 'ASC' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => handleSortClientes('email')}
                              >
                                <div className="flex items-center gap-2">
                                  Email
                                  {clientesOrderBy === 'email' && (
                                    clientesOrderDir === 'ASC' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => handleSortClientes('data_cadastro')}
                              >
                                <div className="flex items-center gap-2">
                                  Data Cadastro
                                  {clientesOrderBy === 'data_cadastro' && (
                                    clientesOrderDir === 'ASC' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => handleSortClientes('data_ultima_compra')}
                              >
                                <div className="flex items-center gap-2">
                                  Última Compra
                                  {clientesOrderBy === 'data_ultima_compra' && (
                                    clientesOrderDir === 'ASC' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => handleSortClientes('qtd_compras')}
                              >
                                <div className="flex items-center gap-2">
                                  Total Compras
                                  {clientesOrderBy === 'qtd_compras' && (
                                    clientesOrderDir === 'ASC' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => handleSortClientes('total_lavagens')}
                              >
                                <div className="flex items-center gap-2">
                                  Total Lavagens
                                  {clientesOrderBy === 'total_lavagens' && (
                                    clientesOrderDir === 'ASC' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => handleSortClientes('total_secagens')}
                              >
                                <div className="flex items-center gap-2">
                                  Total Secagens
                                  {clientesOrderBy === 'total_secagens' && (
                                    clientesOrderDir === 'ASC' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                  )}
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {clientes.map((cliente) => (
                              <tr key={cliente.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {cliente.nome || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {cliente.cpf || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {cliente.telefone || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {cliente.email || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {cliente.data_cadastro
                                    ? new Date(cliente.data_cadastro).toLocaleDateString('pt-BR')
                                    : '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {cliente.data_ultima_compra
                                    ? new Date(cliente.data_ultima_compra).toLocaleDateString('pt-BR')
                                    : '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {cliente.qtd_compras || 0}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {cliente.total_lavagens || 0}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {cliente.total_secagens || 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Paginação */}
                    {clientesTotal > clientesLimit && (
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-700">
                          Mostrando {((clientesPage - 1) * clientesLimit) + 1} a {Math.min(clientesPage * clientesLimit, clientesTotal)} de {clientesTotal} clientes
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setClientesPage(p => Math.max(1, p - 1))}
                            disabled={clientesPage === 1 || clientesLoading}
                            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Anterior
                          </button>
                          <span className="text-sm text-gray-700">
                            Página {clientesPage} de {Math.ceil(clientesTotal / clientesLimit)}
                          </span>
                          <button
                            onClick={() => setClientesPage(p => p + 1)}
                            disabled={clientesPage >= Math.ceil(clientesTotal / clientesLimit) || clientesLoading}
                            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab: Fidelização */}
      {activeTab === 'fidelizacao' && (
        <FidelizacaoTab />
      )}

      {/* Modal de Configuração VM Lav */}
      {showVmLavModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Configurar VM Lav
              </h3>
              <button
                onClick={handleCloseVmLavModal}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={vmLavEmail}
                  onChange={(e) => setVmLavEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="seu-email@exemplo.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha *
                </label>
                <input
                  type="password"
                  value={vmLavSenha}
                  onChange={(e) => setVmLavSenha(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Sua senha"
                />
              </div>

              {vmLavCredentials && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Status:</strong> {vmLavCredentials.status === 'ativo' ? 'Conectado' : vmLavCredentials.status === 'erro' ? 'Erro' : 'Inativo'}
                    {vmLavCredentials.ultimo_erro && (
                      <>
                        <br />
                        <strong>Último erro:</strong> {vmLavCredentials.ultimo_erro}
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseVmLavModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleTestarConexaoVmLav}
                disabled={isTestingVmLav || !vmLavCredentials}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTestingVmLav ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Testando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Testar Conexão
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleConfigurarVmLav}
                disabled={isConfiguringVmLav || !vmLavEmail || !vmLavSenha}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConfiguringVmLav ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Configurando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {vmLavCredentials ? 'Atualizar' : 'Conectar'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Tópico */}
      {showTopicModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingTopic ? 'Editar Tópico' : 'Novo Tópico'}
              </h3>
              <button
                onClick={handleCloseTopicModal}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Título *
                </label>
                <input
                  type="text"
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Saudação"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição *
                </label>
                <textarea
                  value={topicDescription}
                  onChange={(e) => setTopicDescription(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Descreva o tópico e como o agente deve responder"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Palavras-chave de Disparo
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Digite uma palavra-chave e pressione Enter"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                  >
                    Adicionar
                  </button>
                </div>
                {topicKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {topicKeywords.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm flex items-center gap-2"
                      >
                        {keyword}
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(keyword)}
                          className="text-blue-700 hover:text-blue-900"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contexto
                  </label>
                  <select
                    value={topicContext}
                    onChange={(e) => setTopicContext(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="greeting">Saudação</option>
                    <option value="farewell">Despedida</option>
                    <option value="absence">Ausência</option>
                    <option value="special_date">Data Especial</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prioridade
                  </label>
                  <input
                    type="number"
                    value={topicPriority}
                    onChange={(e) => setTopicPriority(parseInt(e.target.value) || 0)}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTopicIsActive(!topicIsActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    topicIsActive ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      topicIsActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <label className="text-sm font-medium text-gray-700">
                  Tópico Ativo
                </label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseTopicModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTopic}
                disabled={isSavingTopic}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSavingTopic ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Upload de Mídia */}
      {showMediaUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Nova Mídia</h3>
              <button
                onClick={handleCloseMediaUploadModal}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Arquivo *
                </label>
                <input
                  ref={mediaFileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleMediaFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => mediaFileInputRef.current?.click()}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 transition-colors text-center"
                >
                  {selectedMediaFile ? (
                    <span className="text-sm text-gray-700">{selectedMediaFile.name}</span>
                  ) : (
                    <span className="text-sm text-gray-500">Clique para selecionar um arquivo</span>
                  )}
                </button>
                {mediaFilePreview && (
                  <div className="mt-4">
                    <img
                      src={mediaFilePreview}
                      alt="Preview"
                      className="max-w-full h-48 object-cover rounded-lg"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Título *
                </label>
                <input
                  type="text"
                  value={mediaTitle}
                  onChange={(e) => setMediaTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Imagem de Produto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição *
                </label>
                <textarea
                  value={mediaDescription}
                  onChange={(e) => setMediaDescription(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Descreva a mídia"
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseMediaUploadModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleMediaSubmit}
                disabled={isUploadingMedia}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isUploadingMedia ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Enviar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Mídia */}
      {showMediaEditModal && editingMedia && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Editar Mídia</h3>
              <button
                onClick={handleCloseMediaEditModal}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Título *
                </label>
                <input
                  type="text"
                  value={editMediaTitle}
                  onChange={(e) => setEditMediaTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição *
                </label>
                <textarea
                  value={editMediaDescription}
                  onChange={(e) => setEditMediaDescription(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caption
                </label>
                <textarea
                  value={editMediaCaption}
                  onChange={(e) => setEditMediaCaption(e.target.value)}
                  placeholder="Texto que será usado como legenda ao enviar esta mídia no início de interações (quando marcada como Envio Obrigatório). Se deixado em branco, nenhuma legenda será enviada."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                    checked={editMediaIsActive}
                    onChange={(e) => setEditMediaIsActive(e.target.checked)}
                    className="sr-only peer"
                    disabled={isUpdatingMedia}
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
                    checked={editMediaMandatorySend}
                    onChange={(e) => setEditMediaMandatorySend(e.target.checked)}
                    className="sr-only peer"
                    disabled={isUpdatingMedia}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseMediaEditModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpdateMedia}
                disabled={isUpdatingMedia}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isUpdatingMedia ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ajuda - Gatilhos de Alerta */}
      {showTopicHelpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Ajuda: Gatilhos de Alerta para Atendente Humano
              </h3>
              <button
                onClick={() => setShowTopicHelpModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 space-y-6">
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">O que são Gatilhos de Alerta?</h4>
                <p className="text-sm text-gray-700 mb-4">
                  Os gatilhos de alerta permitem que a IA acione automaticamente o atendente humano quando detectar que um cliente precisa de intervenção humana. 
                  Isso é feito através do comando especial <code className="bg-gray-100 px-2 py-1 rounded text-sm">[ALERTAR_ATENDENTE:mensagem]</code> na descrição do tópico.
                </p>
              </div>

              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Como Funciona?</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                  <li>Na descrição do tópico, você escreve um mini prompt que instrui a IA sobre quando e como acionar o atendente.</li>
                  <li>Quando a IA identifica que o tópico é relevante e segue as instruções, ela inclui o comando <code className="bg-gray-100 px-2 py-1 rounded text-xs">[ALERTAR_ATENDENTE:mensagem]</code> na resposta.</li>
                  <li>O sistema detecta o comando, remove-o da resposta enviada ao cliente, e envia um alerta para o atendente humano cadastrado.</li>
                  <li>A conversa é marcada como "precisa intervenção" e aparece na coluna "Pendências" do dashboard.</li>
                </ol>
              </div>

              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Exemplo de Uso</h4>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700 mb-2 font-medium">Descrição do Tópico:</p>
                  <p className="text-sm text-gray-600 italic mb-4">
                    "Caso solicitado pelo cliente, informe que irá acionar o atendente humano. Utilize o comando [ALERTAR_ATENDENTE:{'{mensagem com solicitação do cliente e resumo do histórico da conversa}'}] para acionar o atendente."
                  </p>
                  <p className="text-sm text-gray-700 mb-2 font-medium">O que acontece:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                    <li>A IA detecta que o cliente quer falar com um humano</li>
                    <li>A IA gera uma resposta incluindo o comando: <code className="bg-gray-200 px-1 rounded text-xs">[ALERTAR_ATENDENTE:Cliente João solicitou atendimento humano. Histórico: dúvidas sobre produto X]</code></li>
                    <li>O sistema remove o comando da resposta e envia apenas a mensagem limpa ao cliente</li>
                    <li>O atendente humano recebe um alerta via WhatsApp com a mensagem do comando</li>
                    <li>A conversa é marcada como precisa intervenção</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Formato da Mensagem</h4>
                <p className="text-sm text-gray-700 mb-2">
                  A mensagem dentro do comando pode conter qualquer texto que você desejar. Exemplos:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                  <li>Resumo da solicitação do cliente</li>
                  <li>Contexto da conversa</li>
                  <li>Informações relevantes sobre o problema</li>
                  <li>Histórico das últimas mensagens</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Dica:</strong> Configure o atendente humano na aba "Atendente Humano" antes de usar os gatilhos de alerta nos tópicos.
                </p>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end">
              <button
                onClick={() => setShowTopicHelpModal(false)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Atendente Humano */}
      {showAttendantModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingAttendant ? 'Editar Atendente Humano' : 'Novo Atendente Humano'}
              </h3>
              <button
                onClick={handleCloseAttendantModal}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do Atendente (Opcional)
                </label>
                <input
                  type="text"
                  value={attendantName}
                  onChange={(e) => setAttendantName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: João Silva"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de Telefone (WhatsApp) *
                </label>
                <input
                  type="text"
                  value={attendantPhone}
                  onChange={(e) => setAttendantPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="5511999999999 (com código do país e DDD)"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Formato: código do país + DDD + número (ex: 5511999999999)
                </p>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 mr-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ativo
                  </label>
                  <p className="text-xs text-gray-500">
                    Quando ativado, o atendente receberá alertas quando a IA detectar necessidade de intervenção humana.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={attendantIsActive}
                    onChange={(e) => setAttendantIsActive(e.target.checked)}
                    className="sr-only peer"
                    disabled={isSavingAttendant}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseAttendantModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAttendant}
                disabled={isSavingAttendant || !attendantPhone || !attendantPhone.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingAttendant ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingAttendant ? 'Atualizar' : 'Criar'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat de Teste */}
      <TestChat isOpen={isTestChatOpen} onClose={() => setIsTestChatOpen(false)} />
    </div>
  );
};

