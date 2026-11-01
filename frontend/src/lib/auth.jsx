import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, definirAoExpirar, salvarTokenLocal, tokenAtual } from './api';
import { supabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregarPerfil = useCallback(async () => {
    if (!(await tokenAtual())) return setUsuario(null);
    try {
      setUsuario(await api('/api/auth/me'));
    } catch {
      setUsuario(null);
    }
  }, []);

  const sair = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    salvarTokenLocal(null);
    setUsuario(null);
  }, []);

  useEffect(() => {
    definirAoExpirar(() => {
      salvarTokenLocal(null);
      setUsuario(null);
    });
    carregarPerfil().finally(() => setCarregando(false));
  }, [carregarPerfil]);

  async function entrar(email, senha) {
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos' : error.message);
    } else {
      const { access_token } = await api('/api/auth/dev-login', { method: 'POST', body: { email, senha }, semToken: true });
      salvarTokenLocal(access_token);
    }
    const me = await api('/api/auth/me').catch(async (err) => {
      await sair();
      throw err;
    });
    setUsuario(me);
    return me;
  }

  return <AuthContext.Provider value={{ usuario, carregando, entrar, sair }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
