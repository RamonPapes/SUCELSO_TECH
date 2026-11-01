import { supabase } from './supabase';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const CHAVE_TOKEN_LOCAL = 'sucelso.token';

export class ApiError extends Error {
  constructor(status, corpo) {
    super(corpo?.erro || `Erro ${status}`);
    this.status = status;
    this.detalhes = corpo?.detalhes;
  }
}

// Avisa a interface quando a API demora (o plano gratuito do Render hiberna após inatividade).
const ouvintesLentidao = new Set();
export function aoDemorar(fn) {
  ouvintesLentidao.add(fn);
  return () => ouvintesLentidao.delete(fn);
}
let pendentesLentas = 0;
const avisar = () => ouvintesLentidao.forEach((fn) => fn(pendentesLentas > 0));

export async function tokenAtual() {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }
  try {
    return localStorage.getItem(CHAVE_TOKEN_LOCAL);
  } catch {
    return null;
  }
}

export function salvarTokenLocal(token) {
  try {
    if (token) localStorage.setItem(CHAVE_TOKEN_LOCAL, token);
    else localStorage.removeItem(CHAVE_TOKEN_LOCAL);
  } catch {
    /* armazenamento indisponível: a sessão dura até recarregar a página */
  }
}

let aoExpirar = () => {};
export function definirAoExpirar(fn) {
  aoExpirar = fn;
}

export async function api(caminho, { method = 'GET', body, semToken = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!semToken) {
    const token = await tokenAtual();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let lenta = false;
  const timer = setTimeout(() => {
    lenta = true;
    pendentesLentas++;
    avisar();
  }, 2500);

  let res;
  try {
    res = await fetch(`${BASE}${caminho}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { erro: 'Não foi possível conectar à API. Verifique sua conexão ou tente novamente em instantes.' });
  } finally {
    clearTimeout(timer);
    if (lenta) {
      pendentesLentas--;
      avisar();
    }
  }

  if (res.status === 204) return null;
  const corpo = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !semToken) aoExpirar();
    throw new ApiError(res.status, corpo);
  }
  return corpo;
}
