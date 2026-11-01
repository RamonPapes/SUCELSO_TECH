import { useState } from 'react';
import { AvisoServidor } from '../components/Layout';
import { Alerta } from '../components/ui';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function Login() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <AvisoServidor />
      <form className="cartao login-cartao" onSubmit={enviar}>
        <div className="marca marca-grande">
          <img src="/favicon.svg" alt="" width="40" height="40" />
          <span>SUCELSO <b>TECH</b></span>
        </div>
        <p className="subtitulo">Sistema Inteligente de Horários Escolares</p>
        <label>
          E-mail
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        <Alerta>{erro}</Alerta>
        <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        {!supabase && <p className="dica">Modo de desenvolvimento local (sem Supabase Auth).</p>}
      </form>
    </div>
  );
}
