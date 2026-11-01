import { useState } from 'react';
import { Alerta, Carregando, ErroApi, Selo, Vazio } from '../../components/ui';
import { api } from '../../lib/api';
import { formatarData, nomeDia, useApi } from '../../lib/util';

const ROTULO = { inclusao: 'Inclusão', alteracao: 'Alteração', remocao: 'Remoção' };

export default function Solicitacoes() {
  const todas = useApi('/api/disponibilidades');
  const [msg, setMsg] = useState(null);

  if (todas.carregando) return <Carregando />;
  if (todas.erro) return <ErroApi erro={todas.erro} />;
  const porId = new Map(todas.dados.map((d) => [d.id, d]));
  const pendentes = todas.dados.filter((d) => d.status === 'pendente');
  const avaliadas = todas.dados.filter((d) => d.tipo_solicitacao && d.status !== 'pendente').sort((a, b) => (b.avaliado_em || '').localeCompare(a.avaliado_em || '')).slice(0, 10);
  const faixa = (d) => `${nomeDia(d.dia)} ${d.inicio}–${d.fim}`;

  async function avaliar(d, acao) {
    setMsg(null);
    try {
      await api(`/api/disponibilidades/${d.id}/${acao}`, { method: 'POST' });
      setMsg({ tipo: 'sucesso', texto: `Solicitação de ${d.professor} ${acao === 'aprovar' ? 'aprovada' : 'rejeitada'}. A grade publicada não foi alterada; confira o relatório de conflitos.` });
      todas.recarregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Solicitações de disponibilidade</h1>
          <p className="subtitulo">Mudanças enviadas pelos professores após a coleta ou a publicação da grade.</p>
        </div>
      </div>
      {msg && <Alerta tipo={msg.tipo}>{msg.texto}</Alerta>}

      {pendentes.length === 0 ? (
        <Vazio>Nenhuma solicitação pendente.</Vazio>
      ) : (
        <div className="tabela-rolavel">
          <table className="tabela">
            <thead><tr><th>Professor</th><th>Tipo</th><th>Atual</th><th>Solicitado</th><th>Enviada em</th><th aria-label="Ações" /></tr></thead>
            <tbody>
              {pendentes.map((d) => {
                const original = d.substitui_id ? porId.get(d.substitui_id) : null;
                return (
                  <tr key={d.id}>
                    <td>{d.professor}</td>
                    <td><Selo valor="pendente">{ROTULO[d.tipo_solicitacao]}</Selo></td>
                    <td>{original ? faixa(original) : '—'}</td>
                    <td>{d.tipo_solicitacao === 'remocao' ? <s>{faixa(d)}</s> : faixa(d)}</td>
                    <td>{formatarData(d.criado_em)}</td>
                    <td className="acoes-tabela">
                      <button className="btn btn-sucesso btn-pequeno" onClick={() => avaliar(d, 'aprovar')}>Aprovar</button>
                      <button className="btn btn-secundario btn-pequeno perigo" onClick={() => avaliar(d, 'rejeitar')}>Rejeitar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {avaliadas.length > 0 && (
        <div className="bloco">
          <h2>Avaliadas recentemente</h2>
          <div className="tabela-rolavel">
            <table className="tabela">
              <thead><tr><th>Professor</th><th>Tipo</th><th>Faixa</th><th>Resultado</th><th>Avaliada em</th></tr></thead>
              <tbody>
                {avaliadas.map((d) => (
                  <tr key={d.id}>
                    <td>{d.professor}</td><td>{ROTULO[d.tipo_solicitacao]}</td><td>{faixa(d)}</td>
                    <td><Selo valor={d.status === 'rejeitada' ? 'rejeitada' : 'vigente'}>{d.status === 'rejeitada' ? 'Rejeitada' : 'Aprovada'}</Selo></td>
                    <td>{formatarData(d.avaliado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
