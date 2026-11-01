import { useEffect } from 'react';
import { ROTULO_STATUS } from '../lib/util';

export function Carregando({ texto = 'Carregando…' }) {
  return (
    <div className="carregando" role="status">
      <span className="spinner" aria-hidden="true" /> {texto}
    </div>
  );
}

export function Alerta({ tipo = 'erro', children, detalhes }) {
  if (!children) return null;
  return (
    <div className={`alerta alerta-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <div>{children}</div>
      {Array.isArray(detalhes) && detalhes.length > 0 && (
        <ul>
          {detalhes.map((d, i) => (
            <li key={i}>{d.mensagem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ErroApi({ erro }) {
  if (!erro) return null;
  const detalhes = Array.isArray(erro.detalhes)
    ? erro.detalhes.map((d) => ({ mensagem: d.campo ? `${d.campo}: ${d.mensagem}` : d.mensagem }))
    : null;
  return <Alerta detalhes={detalhes}>{erro.message}</Alerta>;
}

export function Selo({ valor, children }) {
  return <span className={`selo selo-${valor}`}>{children ?? ROTULO_STATUS[valor] ?? valor}</span>;
}

export function Modal({ titulo, aoFechar, children, rodape }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aoFechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <header>
          <h2>{titulo}</h2>
          <button className="btn-icone" onClick={aoFechar} aria-label="Fechar">×</button>
        </header>
        <div className="modal-corpo">{children}</div>
        {rodape && <footer>{rodape}</footer>}
      </div>
    </div>
  );
}

export function Vazio({ children }) {
  return <p className="vazio">{children}</p>;
}
