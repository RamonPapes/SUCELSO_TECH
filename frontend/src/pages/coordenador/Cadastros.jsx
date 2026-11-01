import { useState } from 'react';
import { Alerta, Carregando, ErroApi, Selo } from '../../components/ui';
import { api } from '../../lib/api';
import { ROTULO_PERFIL, useApi } from '../../lib/util';

// Configuração dos cadastros simples. `opcoes` aponta para um recurso da API usado em <select>.
const RECURSOS = {
  disciplinas: {
    titulo: 'Disciplinas',
    campos: [
      { nome: 'codigo', rotulo: 'Código' },
      { nome: 'nome', rotulo: 'Nome' },
      { nome: 'carga_horaria', rotulo: 'Carga horária (h)', tipo: 'number' },
    ],
  },
  salas: {
    titulo: 'Salas',
    campos: [
      { nome: 'identificacao', rotulo: 'Identificação' },
      { nome: 'capacidade', rotulo: 'Capacidade', tipo: 'number' },
    ],
  },
  turmas: {
    titulo: 'Turmas',
    campos: [
      { nome: 'nome', rotulo: 'Nome' },
      { nome: 'turno_id', rotulo: 'Turno', tipo: 'select', opcoes: '/api/turnos', exibir: 'turno' },
      { nome: 'periodo_letivo_id', rotulo: 'Período', tipo: 'select', opcoes: '/api/periodos', exibir: 'periodo' },
      { nome: 'qtd_alunos', rotulo: 'Alunos', tipo: 'number' },
    ],
  },
  'turma-disciplinas': {
    titulo: 'Vínculos',
    descricao: 'Disciplina ofertada a uma turma, com o docente responsável e a carga semanal (em aulas).',
    campos: [
      { nome: 'turma_id', rotulo: 'Turma', tipo: 'select', opcoes: '/api/turmas', exibir: 'turma' },
      { nome: 'disciplina_id', rotulo: 'Disciplina', tipo: 'select', opcoes: '/api/disciplinas', exibir: 'disciplina' },
      { nome: 'professor_id', rotulo: 'Professor', tipo: 'select', opcoes: '/api/professores', exibir: 'professor' },
      { nome: 'carga_semanal', rotulo: 'Aulas/semana', tipo: 'number' },
    ],
  },
  periodos: {
    titulo: 'Períodos',
    descricao: 'Feche a coleta para que novas disponibilidades virem solicitações.',
    campos: [
      { nome: 'nome', rotulo: 'Nome' },
      { nome: 'inicio', rotulo: 'Início', tipo: 'date' },
      { nome: 'fim', rotulo: 'Fim', tipo: 'date' },
      { nome: 'status_coleta', rotulo: 'Coleta', tipo: 'select', valores: [['aberta', 'Aberta'], ['fechada', 'Fechada']], selo: true },
    ],
  },
  turnos: {
    titulo: 'Turnos',
    campos: [
      { nome: 'nome', rotulo: 'Nome' },
      { nome: 'inicio', rotulo: 'Início', tipo: 'time' },
      { nome: 'fim', rotulo: 'Fim', tipo: 'time' },
    ],
  },
};

const ABAS = [['usuarios', 'Usuários'], ...Object.entries(RECURSOS).map(([k, v]) => [k, v.titulo])];

export default function Cadastros() {
  const [aba, setAba] = useState('usuarios');
  return (
    <section>
      <div className="cabecalho-pagina">
        <h1>Cadastros acadêmicos</h1>
      </div>
      <div className="abas" role="tablist">
        {ABAS.map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>{rotulo}</button>
        ))}
      </div>
      {aba === 'usuarios' ? <Usuarios /> : <Crud key={aba} recurso={aba} config={RECURSOS[aba]} />}
    </section>
  );
}

function nomeOpcao(o) {
  return o.nome || o.identificacao || `${o.turma} · ${o.disciplina}`;
}

function Opcoes({ caminho, ...props }) {
  const { dados } = useApi(caminho);
  return (
    <select {...props}>
      <option value="">Selecione…</option>
      {(dados || []).map((o) => <option key={o.id} value={o.id}>{nomeOpcao(o)}{o.periodo ? ` (${o.periodo})` : ''}</option>)}
    </select>
  );
}

function Crud({ recurso, config }) {
  const lista = useApi(`/api/${recurso}`);
  const vazio = Object.fromEntries(config.campos.map((c) => [c.nome, '']));
  const [form, setForm] = useState(vazio);
  const [editando, setEditando] = useState(null);
  const [msg, setMsg] = useState(null);

  function converter(dados) {
    const saida = {};
    for (const c of config.campos) {
      const v = dados[c.nome];
      saida[c.nome] = c.tipo === 'number' || (c.tipo === 'select' && c.opcoes) ? Number(v) : v;
    }
    return saida;
  }

  async function salvar(e) {
    e.preventDefault();
    setMsg(null);
    try {
      if (editando) await api(`/api/${recurso}/${editando}`, { method: 'PUT', body: converter(form) });
      else await api(`/api/${recurso}`, { method: 'POST', body: converter(form) });
      setMsg({ tipo: 'sucesso', texto: editando ? 'Registro atualizado.' : 'Registro criado.' });
      setForm(vazio);
      setEditando(null);
      lista.recarregar();
    } catch (err) {
      setMsg({ tipo: 'erro', erro: err });
    }
  }

  async function excluir(item) {
    if (!window.confirm('Excluir este registro?')) return;
    setMsg(null);
    try {
      await api(`/api/${recurso}/${item.id}`, { method: 'DELETE' });
      lista.recarregar();
    } catch (err) {
      setMsg({ tipo: 'erro', erro: err });
    }
  }

  function editar(item) {
    setEditando(item.id);
    setForm(Object.fromEntries(config.campos.map((c) => [c.nome, item[c.nome] ?? ''])));
  }

  const entrada = (c) => {
    const props = { value: form[c.nome], required: true, onChange: (e) => setForm({ ...form, [c.nome]: e.target.value }) };
    if (c.tipo === 'select' && c.opcoes) return <Opcoes caminho={c.opcoes} {...props} />;
    if (c.tipo === 'select') return <select {...props}><option value="">Selecione…</option>{c.valores.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>;
    return <input type={c.tipo || 'text'} min={c.tipo === 'number' ? 0 : undefined} {...props} />;
  };

  return (
    <div>
      {config.descricao && <p className="nota">{config.descricao}</p>}
      <form className="cartao form-linha" onSubmit={salvar}>
        {config.campos.map((c) => (
          <label key={c.nome}>{c.rotulo}{entrada(c)}</label>
        ))}
        <div className="acoes">
          <button className="btn btn-primario">{editando ? 'Salvar' : 'Adicionar'}</button>
          {editando && <button type="button" className="btn btn-secundario" onClick={() => { setEditando(null); setForm(vazio); }}>Cancelar</button>}
        </div>
      </form>
      {msg?.tipo === 'sucesso' && <Alerta tipo="sucesso">{msg.texto}</Alerta>}
      {msg?.erro && <ErroApi erro={msg.erro} />}
      {lista.carregando && <Carregando />}
      <ErroApi erro={lista.erro} />
      {lista.dados && (
        <div className="tabela-rolavel">
          <table className="tabela">
            <thead>
              <tr>{config.campos.map((c) => <th key={c.nome}>{c.rotulo}</th>)}{recurso === 'turnos' && <th>Faixas</th>}<th aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {lista.dados.map((item) => (
                <tr key={item.id}>
                  {config.campos.map((c) => (
                    <td key={c.nome}>{c.selo ? <Selo valor={item[c.nome]} /> : c.exibir ? item[c.exibir] : item[c.nome]}</td>
                  ))}
                  {recurso === 'turnos' && <td><Faixas turno={item} aoMudar={lista.recarregar} /></td>}
                  <td className="acoes-tabela">
                    <button className="btn-link" onClick={() => editar(item)}>Editar</button>
                    <button className="btn-link perigo" onClick={() => excluir(item)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Faixas({ turno, aoMudar }) {
  const [nova, setNova] = useState(null);
  const [erro, setErro] = useState(null);

  async function adicionar(e) {
    e.preventDefault();
    try {
      await api(`/api/turnos/${turno.id}/faixas`, { method: 'POST', body: { ...nova, ordem: turno.faixas.length + 1 } });
      setNova(null);
      setErro(null);
      aoMudar();
    } catch (err) {
      setErro(err);
    }
  }

  async function remover(f) {
    if (!window.confirm(`Remover a faixa ${f.inicio}–${f.fim}?`)) return;
    await api(`/api/faixas/${f.id}`, { method: 'DELETE' }).catch(setErro);
    aoMudar();
  }

  return (
    <div className="faixas">
      {turno.faixas.map((f) => (
        <span key={f.id} className={`chip ${f.tipo === 'intervalo' ? 'chip-intervalo' : ''}`}>
          {f.inicio}–{f.fim}{f.tipo === 'intervalo' && ' (int.)'}
          <button className="btn-icone" onClick={() => remover(f)} aria-label={`Remover faixa ${f.inicio}`}>×</button>
        </span>
      ))}
      {nova ? (
        <form className="faixa-nova" onSubmit={adicionar}>
          <input type="time" required value={nova.inicio} onChange={(e) => setNova({ ...nova, inicio: e.target.value })} aria-label="Início" />
          <input type="time" required value={nova.fim} onChange={(e) => setNova({ ...nova, fim: e.target.value })} aria-label="Fim" />
          <select value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value })} aria-label="Tipo">
            <option value="aula">Aula</option>
            <option value="intervalo">Intervalo</option>
          </select>
          <button className="btn btn-primario btn-pequeno">OK</button>
        </form>
      ) : (
        <button className="btn-link" onClick={() => setNova({ inicio: '', fim: '', tipo: 'aula' })}>+ faixa</button>
      )}
      <ErroApi erro={erro} />
    </div>
  );
}

function Usuarios() {
  const lista = useApi('/api/usuarios');
  const turmas = useApi('/api/turmas');
  const VAZIO = { nome: '', email: '', senha: '', perfil: 'aluno', matricula: '', turma_id: '', docente: false };
  const [form, setForm] = useState(VAZIO);
  const [msg, setMsg] = useState(null);

  async function criar(e) {
    e.preventDefault();
    setMsg(null);
    const corpo = { nome: form.nome, email: form.email, senha: form.senha, perfil: form.perfil };
    if (form.matricula) corpo.matricula = form.matricula;
    if (form.perfil === 'aluno') corpo.turma_id = Number(form.turma_id);
    if (form.perfil === 'coordenador') corpo.docente = form.docente;
    try {
      await api('/api/usuarios', { method: 'POST', body: corpo });
      setMsg({ tipo: 'sucesso', texto: `Usuário ${form.email} criado.` });
      setForm(VAZIO);
      lista.recarregar();
    } catch (err) {
      setMsg({ erro: err });
    }
  }

  async function alternarAtivo(u) {
    setMsg(null);
    try {
      await api(`/api/usuarios/${u.id}`, { method: 'PUT', body: { ativo: !u.ativo } });
      lista.recarregar();
    } catch (err) {
      setMsg({ erro: err });
    }
  }

  async function excluir(u) {
    if (!window.confirm(`Excluir ${u.nome}? Docentes com vínculos devem ser desativados em vez de excluídos.`)) return;
    setMsg(null);
    try {
      await api(`/api/usuarios/${u.id}`, { method: 'DELETE' });
      lista.recarregar();
    } catch (err) {
      setMsg({ erro: err });
    }
  }

  const precisaMatricula = form.perfil !== 'coordenador' || form.docente;

  return (
    <div>
      <form className="cartao form-linha" onSubmit={criar}>
        <label>Nome<input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
        <label>E-mail<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Senha inicial<input type="password" required minLength={8} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} autoComplete="new-password" /></label>
        <label>
          Perfil
          <select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })}>
            {Object.entries(ROTULO_PERFIL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        {precisaMatricula && <label>Matrícula<input required value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} /></label>}
        {form.perfil === 'aluno' && (
          <label>
            Turma
            <select required value={form.turma_id} onChange={(e) => setForm({ ...form, turma_id: e.target.value })}>
              <option value="">Selecione…</option>
              {(turmas.dados || []).map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.periodo})</option>)}
            </select>
          </label>
        )}
        {form.perfil === 'coordenador' && (
          <label className="checkbox"><input type="checkbox" checked={form.docente} onChange={(e) => setForm({ ...form, docente: e.target.checked })} /> Também leciona</label>
        )}
        <div className="acoes"><button className="btn btn-primario">Criar usuário</button></div>
      </form>
      {msg?.tipo === 'sucesso' && <Alerta tipo="sucesso">{msg.texto}</Alerta>}
      {msg?.erro && <ErroApi erro={msg.erro} />}
      {lista.carregando && <Carregando />}
      <ErroApi erro={lista.erro} />
      {lista.dados && (
        <div className="tabela-rolavel">
          <table className="tabela">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Matrícula</th><th>Turma</th><th>Situação</th><th aria-label="Ações" /></tr></thead>
            <tbody>
              {lista.dados.map((u) => (
                <tr key={u.id} className={u.ativo ? '' : 'inativo'}>
                  <td>{u.nome}</td>
                  <td>{u.email}</td>
                  <td>{ROTULO_PERFIL[u.perfil]}{u.perfil === 'coordenador' && u.professor_id ? ' · docente' : ''}</td>
                  <td>{u.matricula || '—'}</td>
                  <td>{u.turma || '—'}</td>
                  <td><Selo valor={u.ativo ? 'vigente' : 'inativa'}>{u.ativo ? 'Ativo' : 'Inativo'}</Selo></td>
                  <td className="acoes-tabela">
                    <button className="btn-link" onClick={() => alternarAtivo(u)}>{u.ativo ? 'Desativar' : 'Reativar'}</button>
                    <button className="btn-link perigo" onClick={() => excluir(u)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
