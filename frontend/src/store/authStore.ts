import { create } from 'zustand';
import { authService, User } from '../services/auth.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCheckingAuth: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: authService.getUser(),
  isAuthenticated: authService.isAuthenticated(),
  isLoading: false,
  isCheckingAuth: false,

  login: async (username: string, password: string) => {
    set({ isLoading: true });
    try {
      console.log('Tentando fazer login...', { username });
      const response = await authService.login({ username, password });
      console.log('Login bem-sucedido:', response);
      
      if (!response || !response.user || !response.token) {
        throw new Error('Resposta inválida do servidor');
      }
      
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      console.error('Erro no authStore.login:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (username: string, email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authService.register({ username, email, password });
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    authService.logout();
    set({
      user: null,
      isAuthenticated: false,
    });
  },

  checkAuth: async () => {
    // Evitar múltiplas chamadas simultâneas
    const currentState = useAuthStore.getState();
    if (currentState.isCheckingAuth || currentState.isLoading) {
      return;
    }

    if (!authService.isAuthenticated()) {
      set({ user: null, isAuthenticated: false });
      return;
    }

    set({ isCheckingAuth: true, isLoading: true });
    try {
      const user = await authService.getProfile();
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        isCheckingAuth: false,
      });
    } catch (error) {
      authService.logout();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isCheckingAuth: false,
      });
    }
  },
}));

