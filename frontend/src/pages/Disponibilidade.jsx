import { useState } from 'react';
import { Alerta, Carregando, ErroApi, Selo, Vazio } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DIAS, nomeDia, useApi } from '../lib/util';

const VAZIO = { dia: 1, inicio: '08:00', fim: '12:20' };
const ROTULO_SOLICITACAO = { inclusao: 'inclusão', alteracao: 'alteração', remocao: 'remoção' };

export default function Disponibilidade() {
  const { usuario } = useAuth();
  const periodos = useApi('/api/periodos');
  const lista = useApi('/api/disponibilidades');
  const [form, setForm] = useState(VAZIO);
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState('');

  if (periodos.carregando || lista.carregando) return <Carregando />;
  if (periodos.erro || lista.erro) return <ErroApi erro={periodos.erro || lista.erro} />;

  const periodo = periodos.dados[0];
  const direta = usuario.perfil === 'coordenador' || (periodo?.status_coleta === 'aberta' && !periodo?.tem_publicada);
  const itens = lista.dados.filter((d) => d.periodo_letivo_id === periodo?.id && d.status !== 'inativa');

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setAviso('');
    try {
      const corpo = { dia: Number(form.dia), inicio: form.inicio, fim: form.fim };
      const r = editando
        ? await api(`/api/disponibilidades/${editando}`, { method: 'PUT', body: corpo })
        : await api('/api/disponibilidades', { method: 'POST', body: corpo });
      setAviso(r.status === 'pendente' ? 'Solicitação enviada à coordenação. A grade oficial não é alterada automaticamente.' : 'Disponibilidade salva.');
      setForm(VAZIO);
      setEditando(null);
      lista.recarregar();
    } catch (err) {
      setErro(err);
    }
  }

  async function remover(d) {
    const msg = d.status === 'pendente' ? 'Cancelar esta solicitação?' : direta ? 'Remover esta disponibilidade?' : 'Solicitar à coordenação a remoção desta disponibilidade?';
    if (!window.confirm(msg)) return;
    setErro(null);
    try {
      const r = await api(`/api/disponibilidades/${d.id}`, { method: 'DELETE' });
      setAviso(r?.status === 'pendente' ? 'Solicitação de remoção enviada à coordenação.' : 'Removida.');
      lista.recarregar();
    } catch (err) {
      setErro(err);
    }
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Minha disponibilidade</h1>
          <p className="subtitulo">
            Período {periodo?.nome} · coleta <Selo valor={periodo?.status_coleta} />
            {periodo?.tem_publicada && <> · <Selo valor="publicada">grade publicada</Selo></>}
          </p>
        </div>
      </div>

      {!direta && (
        <Alerta tipo="info">
          A coleta está encerrada ou a grade já foi publicada: inclusões, alterações e remoções viram <b>solicitações</b> que a
          coordenação aprova. A grade oficial não muda automaticamente.
        </Alerta>
      )}
      <Alerta tipo="sucesso">{aviso}</Alerta>
      <ErroApi erro={erro} />

      <form className="cartao form-linha" onSubmit={salvar}>
        <label>
          Dia
          <select value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })}>
            {DIAS.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </label>
        <label>
          Início
          <input type="time" required value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
        </label>
        <label>
          Fim
          <input type="time" required value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
        </label>
        <div className="acoes">
          <button className="btn btn-primario">{editando ? 'Salvar alteração' : direta ? 'Adicionar' : 'Solicitar inclusão'}</button>
          {editando && <button type="button" className="btn btn-secundario" onClick={() => { setEditando(null); setForm(VAZIO); }}>Cancelar</button>}
        </div>
      </form>

      {itens.length === 0 ? (
        <Vazio>Nenhuma disponibilidade registrada.</Vazio>
      ) : (
        <div className="tabela-rolavel">
          <table className="tabela">
            <thead>
              <tr><th>Dia</th><th>Início</th><th>Fim</th><th>Situação</th><th aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {itens.map((d) => (
                <tr key={d.id}>
                  <td>{nomeDia(d.dia)}</td>
                  <td>{d.inicio}</td>
                  <td>{d.fim}</td>
                  <td>
                    <Selo valor={d.status} />
                    {d.tipo_solicitacao && d.status !== 'vigente' && <small className="nota"> {ROTULO_SOLICITACAO[d.tipo_solicitacao]}</small>}
                  </td>
                  <td className="acoes-tabela">
                    {['vigente', 'pendente'].includes(d.status) && d.tipo_solicitacao !== 'remocao' && (
                      <button className="btn-link" onClick={() => { setEditando(d.id); setForm({ dia: d.dia, inicio: d.inicio, fim: d.fim }); }}>Editar</button>
                    )}
                    {['vigente', 'pendente'].includes(d.status) && (
                      <button className="btn-link perigo" onClick={() => remover(d)}>{d.status === 'pendente' ? 'Cancelar' : 'Remover'}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
