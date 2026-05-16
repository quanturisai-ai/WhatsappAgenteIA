import { useState, useEffect, useRef } from 'react';
import { X, Search, User, Phone, CreditCard, Loader2 } from 'lucide-react';
import { vmLavService, VmLavCliente } from '../services/vmLav.service';
import toast from 'react-hot-toast';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectClient: (client: VmLavCliente) => void;
}

export const NewConversationModal = ({ isOpen, onClose, onSelectClient }: NewConversationModalProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<VmLavCliente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setClients([]);
      return;
    }

    // Cleanup: limpar timer quando o modal fechar
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isOpen]);

  const handleSearch = async (term: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const timer = setTimeout(async () => {
      if (!term.trim()) {
        setClients([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await vmLavService.listarClientes({
          page: 1,
          limit: 50,
          search: term.trim(),
        });
        setClients(response.clientes || []);
      } catch (error: any) {
        console.error('Erro ao buscar clientes:', error);
        toast.error('Erro ao buscar clientes');
        setClients([]);
      } finally {
        setIsLoading(false);
      }
    }, term ? 500 : 0); // Debounce apenas se houver termo de busca

    debounceTimerRef.current = timer;
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    handleSearch(value);
  };

  const handleSelectClient = (client: VmLavCliente) => {
    if (!client.telefone) {
      toast.error('Cliente não possui telefone cadastrado');
      return;
    }
    onSelectClient(client);
    onClose();
  };

  const formatPhone = (phone: string | null) => {
    if (!phone) return '-';
    // Remove caracteres não numéricos
    const cleaned = phone.replace(/\D/g, '');
    // Formata como (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const formatCPF = (cpf: string | null) => {
    if (!cpf) return '-';
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
    }
    return cpf;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Nova Conversa
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Search Input */}
          <div className="p-6 border-b border-gray-200">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Buscar por CPF, nome ou telefone (aceita formatação ou apenas números)..."
                className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                autoFocus
              />
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">
                  {searchTerm ? 'Nenhum cliente encontrado' : 'Digite para buscar clientes'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleSelectClient(client)}
                    disabled={!client.telefone}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      client.telefone
                        ? 'border-gray-200 hover:border-primary-500 hover:bg-primary-50 cursor-pointer'
                        : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {client.nome || 'Sem nome'}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3" />
                            <span>{formatCPF(client.cpf)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{formatPhone(client.telefone)}</span>
                          </div>
                        </div>
                        {!client.telefone && (
                          <p className="mt-1 text-xs text-red-500">
                            Cliente sem telefone cadastrado
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

