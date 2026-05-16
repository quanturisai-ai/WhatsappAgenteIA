import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { whatsappService } from '../services/whatsapp.service';
import { WhatsAppStatus as WhatsAppStatusType } from '../types';
import { socketService } from '../services/socket.service';
import { authService } from '../services/auth.service';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { RefreshCw, Power, PowerOff, LogOut, ArrowLeft } from 'lucide-react';

export const WhatsAppStatus = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<WhatsAppStatusType>({
    status: 'disconnected',
    qrCode: null,
    isReady: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    loadStatus();
    // IMPORTANTE: Polling reduzido para 10 segundos para evitar sobrecarga
    // Socket.IO é usado para atualizações em tempo real, polling é apenas fallback
    const interval = setInterval(loadStatus, 10000);

    // Conectar Socket.IO para receber QR code em tempo real
    const token = authService.getToken();
    let socket: ReturnType<typeof socketService.connect> | null = null;

    if (token) {
      try {
        socket = socketService.connect(token);
        
        // Log de conexão
        socket.on('connect', () => {
          console.log('Socket.IO conectado!');
        });

        socket.on('connect_error', (error) => {
          console.error('Erro ao conectar Socket.IO:', error);
          // Não mostrar toast para erros de autenticação - apenas logar
          if (error.message && !error.message.includes('Invalid namespace')) {
            // Se não for erro de namespace, pode ser problema de autenticação
            console.warn('Possível problema de autenticação Socket.IO:', error.message);
          }
        });

        // Ouvir evento de QR code
        socket.on('whatsapp:qr', (data: { qr: string }) => {
          console.log('QR Code recebido via Socket.IO:', data.qr?.substring(0, 50) + '...');
          setStatus((prev) => ({
            ...prev,
            qrCode: data.qr,
            status: 'connecting',
          }));
          toast.success('QR Code recebido! Escaneie com seu WhatsApp.');
        });

        // Ouvir evento de QR code expirado
        socket.on('whatsapp:qr_expired', () => {
          console.log('QR Code expirado - aguardando novo QR code...');
          setStatus((prev) => ({
            ...prev,
            qrCode: null,
            status: 'connecting',
          }));
          toast.info('QR Code expirado. Aguardando novo QR code...');
        });

        // Ouvir evento de ready
        socket.on('whatsapp:ready', () => {
          console.log('WhatsApp pronto');
          setStatus((prev) => ({
            ...prev,
            status: 'connected',
            qrCode: null,
            isReady: true,
          }));
          toast.success('WhatsApp conectado com sucesso!');
          loadStatus();
        });

        // Ouvir evento de authenticated
        socket.on('whatsapp:authenticated', () => {
          console.log('WhatsApp autenticado');
          setStatus((prev) => ({
            ...prev,
            status: 'authenticated',
            qrCode: null,
          }));
          loadStatus();
        });

        // Ouvir evento de erro
        socket.on('whatsapp:error', (data: { error: string }) => {
          console.error('Erro do WhatsApp:', data.error);
          toast.error(`Erro: ${data.error}`);
        });
      } catch (error) {
        console.error('Erro ao conectar Socket.IO:', error);
        // Continuar mesmo se Socket.IO falhar - usar polling via API
        socket = null;
      }
    }

    // Limpar ao desmontar
    return () => {
      clearInterval(interval);
      if (socket) {
        try {
          socket.off('whatsapp:qr');
          socket.off('whatsapp:qr_expired');
          socket.off('whatsapp:ready');
          socket.off('whatsapp:authenticated');
          socket.off('whatsapp:error');
          socket.off('connect');
          socket.off('connect_error');
        } catch (error) {
          console.error('Erro ao limpar listeners do Socket.IO:', error);
        }
      }
    };
  }, []);

  const loadStatus = async () => {
    try {
      const data = await whatsappService.getStatus();
      // Garantir que qrCode seja null se vazio ou string "null"
      const qrCode = data.qrCode && data.qrCode !== 'null' && data.qrCode !== '' ? data.qrCode : null;
      
      console.log('Status carregado:', { 
        status: data.status, 
        qrCode: qrCode ? 'presente (' + qrCode.substring(0, 30) + '...)' : 'null',
        isReady: data.isReady 
      });
      
      setStatus({
        ...data,
        qrCode,
      });
    } catch (error: any) {
      console.error('Erro ao carregar status:', error);
    }
  };

  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      await whatsappService.initialize();
      toast.success('WhatsApp inicializado! Escaneie o QR Code quando aparecer.');
      
      // Socket.IO deve entregar o QR code, mas verificar periodicamente como fallback
      // Polling reduzido: 3 segundos entre tentativas, máximo de 10 tentativas = 30 segundos
      let attempts = 0;
      const maxAttempts = 10; // 10 tentativas = 30 segundos
      
      const checkQRCode = setInterval(async () => {
        attempts++;
        const data = await whatsappService.getStatus();
        const qrCode = data.qrCode && data.qrCode !== 'null' && data.qrCode !== '' ? data.qrCode : null;
        
        // Atualizar status
        setStatus({
          ...data,
          qrCode,
        });
        
        // Se obteve QR code ou excedeu tentativas, parar
        if (qrCode || attempts >= maxAttempts) {
          clearInterval(checkQRCode);
          if (qrCode) {
            toast.success('QR Code disponível! Escaneie com seu WhatsApp.');
          }
        }
      }, 3000);
      
      // Limpar intervalo após timeout
      setTimeout(() => clearInterval(checkQRCode), maxAttempts * 3000);
    } catch (error: any) {
      toast.error('Erro ao inicializar WhatsApp');
      console.error(error);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await whatsappService.disconnect();
      toast.success('WhatsApp desconectado');
      loadStatus();
    } catch (error: any) {
      toast.error('Erro ao desconectar WhatsApp');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Tem certeza que deseja fazer logout do WhatsApp? Isso removerá a sessão atual.')) {
      return;
    }

    setIsLoading(true);
    try {
      await whatsappService.logout();
      toast.success('Logout realizado com sucesso');
      loadStatus();
    } catch (error: any) {
      toast.error('Erro ao fazer logout');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'authenticated':
        return 'bg-green-100 text-green-800';
      case 'connecting':
        return 'bg-yellow-100 text-yellow-800';
      case 'disconnected':
        return 'bg-red-100 text-red-800';
      case 'connection_failed':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Conectado';
      case 'authenticated':
        return 'Autenticado';
      case 'connecting':
        return 'Conectando...';
      case 'disconnected':
        return 'Desconectado';
      case 'connection_failed':
        return 'Reconectando...';
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
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
              <h2 className="text-2xl font-bold text-gray-900">Status do WhatsApp</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Gerencie a conexão do WhatsApp
            </p>
          </div>

          <div className="px-6 py-6 space-y-6">
            {/* Status Atual */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">Status Atual</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mt-2 ${getStatusColor(status.status)}`}>
                  {getStatusLabel(status.status)}
                </span>
              </div>
              <button
                onClick={loadStatus}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                title="Atualizar status"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            {/* QR Code */}
            {status.qrCode && status.qrCode !== 'null' && status.qrCode !== '' && (
              <div className="flex flex-col items-center p-6 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Escaneie o QR Code
                </h3>
                <div className="bg-white p-4 rounded-lg shadow">
                  <QRCodeSVG value={status.qrCode} size={256} />
                </div>
                <p className="mt-4 text-sm text-gray-600 text-center">
                  Abra o WhatsApp no seu celular, vá em Configurações {'>'} Aparelhos conectados {'>'} Conectar um aparelho
                </p>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex flex-col sm:flex-row gap-3">
              {(status.status === 'disconnected' || status.status === 'connection_failed') && (
                <button
                  onClick={handleInitialize}
                  disabled={isInitializing}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isInitializing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Inicializando...
                    </>
                  ) : (
                    <>
                      <Power className="w-4 h-4" />
                      {status.status === 'connection_failed' ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
                    </>
                  )}
                </button>
              )}

              {/* Botão de desconectar aparece em todos os status, exceto 'disconnected' */}
              {status.status !== 'disconnected' && (
                <>
                  <button
                    onClick={handleDisconnect}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <PowerOff className="w-4 h-4" />
                    Desconectar
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </>
              )}
            </div>

            {/* Informações */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Dica:</strong> A sessão do WhatsApp permanece ativa mesmo após fechar o navegador. 
                Use "Logout" apenas se desejar desconectar completamente e remover a sessão.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

