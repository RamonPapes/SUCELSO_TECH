import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { aoDemorar, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatarData, ROTULO_PERFIL } from '../lib/util';

const MENUS = {
  aluno: [
    ['/minha-turma', 'Minha turma'],
    ['/consultas', 'Consultas'],
  ],
  professor: [
    ['/minha-grade', 'Minha grade'],
    ['/disponibilidade', 'Disponibilidade'],
    ['/consultas', 'Consultas'],
  ],
  coordenador: [
    ['/painel', 'Painel'],
    ['/grade', 'Grade'],
    ['/solicitacoes', 'Solicitações'],
    ['/cadastros', 'Cadastros'],
    ['/historico', 'Histórico'],
    ['/consultas', 'Consultas'],
  ],
};

export function AvisoServidor() {
  const [lento, setLento] = useState(false);
  useEffect(() => aoDemorar(setLento), []);
  if (!lento) return null;
  return (
    <div className="aviso-servidor" role="status">
      <span className="spinner" aria-hidden="true" /> Servidor iniciando… a primeira resposta pode levar até um minuto.
    </div>
  );
}

function Notificacoes() {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState([]);
  const carregar = () => api('/api/notificacoes').then(setLista).catch(() => {});
  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 60000);
    return () => clearInterval(id);
  }, []);
  const naoLidas = lista.filter((n) => !n.lida).length;

  async function marcarTodas() {
    await api('/api/notificacoes/lidas', { method: 'POST' });
    carregar();
  }

  return (
    <div className="notificacoes">
      <button className="btn-icone sino" onClick={() => setAberto(!aberto)} aria-label={`Notificações (${naoLidas} não lidas)`} aria-expanded={aberto}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"/></svg>
        {naoLidas > 0 && <span className="contador">{naoLidas}</span>}
      </button>
      {aberto && (
        <div className="painel-notificacoes">
          <header>
            <strong>Notificações</strong>
            {naoLidas > 0 && <button className="btn-link" onClick={marcarTodas}>Marcar todas como lidas</button>}
          </header>
          {lista.length === 0 && <p className="vazio">Nenhuma notificação.</p>}
          <ul>
            {lista.map((n) => (
              <li key={n.id} className={n.lida ? '' : 'nao-lida'}>
                <p>{n.mensagem}</p>
                <small>{formatarData(n.criado_em)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { usuario, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const menu = [...(MENUS[usuario.perfil] || [])];
  if (usuario.perfil === 'coordenador' && usuario.professor_id) menu.splice(3, 0, ['/disponibilidade', 'Disponibilidade']);

  return (
    <div className="app">
      <AvisoServidor />
      <header className="topo">
        <div className="marca">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>SUCELSO <b>TECH</b></span>
        </div>
        <button className="btn-icone menu-movel" onClick={() => setMenuAberto(!menuAberto)} aria-label="Abrir menu" aria-expanded={menuAberto}>
          ☰
        </button>
        <nav className={menuAberto ? 'aberto' : ''} onClick={() => setMenuAberto(false)}>
          {menu.map(([para, rotulo]) => (
            <NavLink key={para} to={para}>{rotulo}</NavLink>
          ))}
        </nav>
        <div className="usuario">
          <Notificacoes />
          <div className="quem">
            <strong>{usuario.nome}</strong>
            <small>{ROTULO_PERFIL[usuario.perfil]}</small>
          </div>
          <button className="btn btn-secundario btn-pequeno" onClick={sair}>Sair</button>
        </div>
      </header>
      <main className="conteudo-principal">
        <Outlet />
      </main>
    </div>
  );
}
