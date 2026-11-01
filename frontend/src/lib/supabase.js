import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Cliente público (chave anon): usado SOMENTE para login/sessão. Os dados vêm da API.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
