import { useEffect, useMemo, useState } from 'react';
import GradeSemanal from '../../components/GradeSemanal';
import { Alerta, Carregando, ErroApi, Modal, Selo, Vazio } from '../../components/ui';
import { api } from '../../lib/api';
import { DIAS, formatarData, useApi } from '../../lib/util';

const EDITAVEL = ['rascunho', 'em_revisao'];

export default function Grade() {
  const periodos = useApi('/api/periodos');
  const [periodoId, setPeriodoId] = useState(null);
  const versoes = useApi(periodoId ? `/api/horarios/versoes?periodo_letivo_id=${periodoId}` : null);
  const [versaoId, setVersaoId] = useState(null);
  const [modo, setModo] = useState('turma');
  const [alvoId, setAlvoId] = useState(null);
  const [mensagem, setMensagem] = useState(null); // { tipo, texto, detalhes }
  const [ocupado, setOcupado] = useState(false);
  const [edicao, setEdicao] = useState(null); // { aula } ou { nova: {dia, inicio} }
  const [versaoTick, setVersaoTick] = useState(0);

  const turmas = useApi('/api/turmas');
  const professores = useApi('/api/professores');
  const salas = useApi('/api/salas');

  useEffect(() => {
    if (!periodoId && periodos.dados?.length) setPeriodoId(periodos.dados[0].id);
  }, [periodos.dados, periodoId]);

  useEffect(() => {
    if (!versoes.dados) return;
    if (!versoes.dados.some((v) => v.id === versaoId)) {
      const preferida = versoes.dados.find((v) => v.status !== 'arquivada') || versoes.dados[0];
      setVersaoId(preferida?.id ?? null);
    }
  }, [versoes.dados, versaoId]);

  const opcoesAlvo = { turma: turmas.dados, professor: professores.dados, sala: salas.dados }[modo] || [];
  const turmasDoPeriodo = (turmas.dados || []).filter((t) => t.periodo_letivo_id === periodoId);
  useEffect(() => {
    const lista = modo === 'turma' ? turmasDoPeriodo : opcoesAlvo;
    if (lista.length && !lista.some((o) => o.id === alvoId)) setAlvoId(lista[0].id);
  }, [modo, opcoesAlvo, turmasDoPeriodo, alvoId]);

  const consulta = versaoId && alvoId ? `/api/horarios?versao_id=${versaoId}&${modo}_id=${alvoId}&_=${versaoTick}` : null;
  const grade = useApi(consulta);
  const conflitos = useApi(versaoId ? `/api/horarios/conflitos?versao_id=${versaoId}&_=${versaoTick}` : null);

  const versao = versoes.dados?.find((v) => v.id === versaoId);
  const editavel = versao && EDITAVEL.includes(versao.status);
  const destaques = useMemo(
    () => new Set((conflitos.dados?.conflitos || []).filter((c) => c.gravidade === 'erro' || c.tipo !== 'carga_incompleta').flatMap((c) => c.horario_ids || [])),
    [conflitos.dados]
  );

  function atualizar() {
    setVersaoTick((x) => x + 1);
    versoes.recarregar();
  }

  async function executar(acao, texto) {
    setOcupado(true);
    setMensagem(null);
    try {
      const r = await acao();
      if (texto) setMensagem({ tipo: 'sucesso', texto: typeof texto === 'function' ? texto(r) : texto });
      return r;
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: err.message, detalhes: Array.isArray(err.detalhes) ? err.detalhes : null });
    } finally {
      setOcupado(false);
    }
  }

  async function gerar() {
    const r = await executar(
      () => api('/api/horarios/gerar', { method: 'POST', body: { periodo_letivo_id: periodoId } }),
      (r) => {
        const e = r.estatisticas;
        return `Versão ${r.versao.numero} gerada em ${e.tempo_ms} ms: ${e.aulas_alocadas} de ${e.aulas_demandadas} aulas alocadas` +
          (e.aulas_nao_alocadas ? ` · ${e.aulas_nao_alocadas} pendente(s) — veja o painel de conflitos.` : ' · nenhuma pendência.') +
          ` Janelas das turmas: ${e.janelas_turmas_antes} → ${e.janelas_turmas_depois}.`;
      }
    );
    if (r) {
      setVersaoId(r.versao.id);
      atualizar();
    }
  }

  async function transicao(acao, texto, confirmar) {
    if (confirmar && !window.confirm(confirmar)) return;
    const r = await executar(() => api(`/api/horarios/versoes/${versaoId}/${acao}`, { method: acao === 'excluir' ? 'DELETE' : 'POST' }), texto);
    if (r !== undefined) {
      if (acao === 'duplicar' && r) setVersaoId(r.id);
      atualizar();
    }
  }

  async function excluirVersao() {
    if (!window.confirm(`Excluir o rascunho versão ${versao.numero}?`)) return;
    const ok = await executar(() => api(`/api/horarios/versoes/${versaoId}`, { method: 'DELETE' }).then(() => true), 'Rascunho excluído.');
    if (ok) {
      setVersaoId(null);
      atualizar();
    }
  }

  if (periodos.carregando) return <Carregando />;
  if (periodos.erro) return <ErroApi erro={periodos.erro} />;

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Grade horária</h1>
          <p className="subtitulo">Gere propostas, revise conflitos, ajuste alocações e publique a versão oficial.</p>
        </div>
        <div className="acoes nao-imprimir">
          <label className="inline">
            Período
            <select value={periodoId ?? ''} onChange={(e) => { setPeriodoId(Number(e.target.value)); setVersaoId(null); }}>
              {periodos.dados.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          <button className="btn btn-primario" onClick={gerar} disabled={ocupado}>
            {ocupado ? 'Processando…' : 'Gerar nova proposta'}
          </button>
        </div>
      </div>

      {mensagem && <Alerta tipo={mensagem.tipo} detalhes={mensagem.detalhes}>{mensagem.texto}</Alerta>}

      {versoes.dados?.length === 0 && <Vazio>Nenhuma versão neste período. Clique em “Gerar nova proposta”.</Vazio>}

      {versoes.dados?.length > 0 && (
        <>
          <div className="versoes nao-imprimir" role="tablist" aria-label="Versões">
            {versoes.dados.map((v) => (
              <button key={v.id} role="tab" aria-selected={v.id === versaoId} className={`versao ${v.id === versaoId ? 'ativa' : ''}`} onClick={() => setVersaoId(v.id)}>
                <span>Versão {v.numero}</span>
                <Selo valor={v.status} />
              </button>
            ))}
          </div>

          {versao && (
            <div className="cartao barra-versao">
              <div>
                <strong>Versão {versao.numero}</strong> <Selo valor={versao.status} />
                <p className="nota">
                  {versao.total_aulas} aulas · {versao.aulas_pendentes} pendente(s) · criada em {formatarData(versao.data)}
                  {versao.responsavel && ` por ${versao.responsavel}`}
                  {versao.publicada_em && ` · publicada em ${formatarData(versao.publicada_em)}`}
                  {versao.observacao && ` · ${versao.observacao}`}
                </p>
              </div>
              <div className="acoes nao-imprimir">
                {versao.status === 'rascunho' && (
                  <>
                    <button className="btn btn-primario" disabled={ocupado} onClick={() => transicao('revisao', 'Versão enviada para revisão.')}>Enviar para revisão</button>
                    <button className="btn btn-secundario perigo" disabled={ocupado} onClick={excluirVersao}>Excluir rascunho</button>
                  </>
                )}
                {versao.status === 'em_revisao' && (
                  <>
                    <button className="btn btn-sucesso" disabled={ocupado} onClick={() => transicao('publicar', 'Grade publicada! Ela agora é a versão oficial para alunos e professores.', `Publicar a versão ${versao.numero} como grade oficial? A versão publicada atual será arquivada.`)}>Publicar</button>
                    <button className="btn btn-secundario" disabled={ocupado} onClick={() => transicao('devolver', 'Versão devolvida para rascunho.')}>Devolver para rascunho</button>
                  </>
                )}
                {!EDITAVEL.includes(versao.status) && (
                  <button className="btn btn-secundario" disabled={ocupado} onClick={() => transicao('duplicar', (r) => `Rascunho versão ${r.numero} criado a partir da versão ${versao.numero}.`)}>Duplicar para editar</button>
                )}
                <button className="btn btn-secundario" onClick={() => window.print()}>Exportar PDF</button>
              </div>
            </div>
          )}

          <div className="layout-grade">
            <div className="coluna-grade">
              <div className="filtros nao-imprimir">
                <div className="segmentado" role="radiogroup" aria-label="Visualizar por">
                  {[['turma', 'Turma'], ['professor', 'Professor'], ['sala', 'Sala']].map(([id, rotulo]) => (
                    <button key={id} role="radio" aria-checked={modo === id} className={modo === id ? 'ativo' : ''} onClick={() => { setModo(id); setAlvoId(null); }}>
                      {rotulo}
                    </button>
                  ))}
                </div>
                <select value={alvoId ?? ''} onChange={(e) => setAlvoId(Number(e.target.value))} aria-label={`Selecionar ${modo}`}>
                  {(modo === 'turma' ? turmasDoPeriodo : opcoesAlvo).map((o) => (
                    <option key={o.id} value={o.id}>{o.nome || o.identificacao}{o.turno ? ` · ${o.turno}` : ''}</option>
                  ))}
                </select>
              </div>
              {editavel && modo === 'turma' && <p className="nota nao-imprimir">Clique em uma aula para ajustá-la ou em “+” para incluir uma aula.</p>}
              {editavel && modo !== 'turma' && <p className="nota nao-imprimir">Para editar, visualize por turma.</p>}
              {grade.carregando && !grade.dados && <Carregando />}
              <ErroApi erro={grade.erro} />
              {grade.dados && (
                <GradeSemanal
                  faixas={grade.dados.faixas}
                  aulas={grade.dados.aulas}
                  mostrar={{ turma: modo !== 'turma', professor: modo !== 'professor', sala: modo !== 'sala' }}
                  compactar={modo !== 'turma'}
                  destaques={destaques}
                  aoClicarAula={editavel && modo === 'turma' ? (aula) => setEdicao({ aula }) : undefined}
                  aoClicarVazio={editavel && modo === 'turma' ? (nova) => setEdicao({ nova }) : undefined}
                />
              )}
            </div>
            <PainelConflitos estado={conflitos} />
          </div>
        </>
      )}

      {edicao && grade.dados && (
        <EditarAula
          edicao={edicao}
          versaoId={versaoId}
          turmaId={alvoId}
          faixas={grade.dados.faixas.filter((f) => f.tipo === 'aula')}
          salas={salas.dados || []}
          professores={professores.dados || []}
          aoFechar={() => setEdicao(null)}
          aoSalvar={(texto) => {
            setEdicao(null);
            setMensagem({ tipo: 'sucesso', texto });
            atualizar();
          }}
        />
      )}
    </section>
  );
}

const ROTULO_CONFLITO = {
  choque_professor: 'Choque de professor',
  choque_sala: 'Choque de sala',
  choque_turma: 'Choque de turma',
  fora_da_faixa: 'Fora das faixas do turno',
  fora_da_disponibilidade: 'Fora da disponibilidade',
  capacidade: 'Capacidade da sala',
  carga_incompleta: 'Carga não atendida',
  carga_excedente: 'Carga excedente',
};

function PainelConflitos({ estado }) {
  const r = estado.dados;
  return (
    <aside className="cartao painel-conflitos" aria-label="Conflitos e pendências">
      <h2>Conflitos e pendências</h2>
      {estado.carregando && !r && <Carregando />}
      <ErroApi erro={estado.erro} />
      {r && (
        <>
          <div className="contadores">
            <span className={r.erros ? 'cont erro' : 'cont ok'}><b>{r.erros}</b> erro(s)</span>
            <span className={r.alertas ? 'cont alerta' : 'cont ok'}><b>{r.alertas}</b> alerta(s)</span>
          </div>
          {r.total === 0 ? (
            <p className="ok-texto">✓ Nenhum conflito: professores, salas e turmas sem choques, disponibilidades respeitadas e carga horária atendida.</p>
          ) : (
            <ul className="lista-conflitos">
              {r.conflitos.map((c, i) => (
                <li key={i} className={`conflito-${c.gravidade}`}>
                  <span className="tipo">{ROTULO_CONFLITO[c.tipo] || c.tipo}</span>
                  <p>{c.mensagem}</p>
                  {c.motivo && <p className="motivo">{c.motivo}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}

function EditarAula({ edicao, versaoId, turmaId, faixas, salas, professores, aoFechar, aoSalvar }) {
  const nova = Boolean(edicao.nova);
  const base = edicao.aula || {};
  const vinculos = useApi(nova ? `/api/turma-disciplinas?turma_id=${turmaId}` : null);
  const [form, setForm] = useState({
    dia: base.dia ?? edicao.nova?.dia,
    inicio: base.inicio ?? edicao.nova?.inicio,
    sala_id: base.sala_id ?? '',
    professor_id: base.professor_id ?? '',
    disciplina_id: base.disciplina_id ?? '',
  });
  const [erro, setErro] = useState(null);
  const [podeForcar, setPodeForcar] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function escolherDisciplina(id) {
    const v = vinculos.dados?.find((x) => x.disciplina_id === Number(id));
    setForm({ ...form, disciplina_id: id, professor_id: v ? v.professor_id : form.professor_id });
  }

  async function salvar(forcar = false) {
    setSalvando(true);
    setErro(null);
    try {
      const corpo = {
        dia: Number(form.dia),
        inicio: form.inicio,
        sala_id: Number(form.sala_id),
        professor_id: Number(form.professor_id),
        forcar,
      };
      if (nova) {
        await api('/api/horarios', { method: 'POST', body: { ...corpo, versao_id: versaoId, turma_id: turmaId, disciplina_id: Number(form.disciplina_id) } });
        aoSalvar('Aula incluída.');
      } else {
        await api(`/api/horarios/${base.id}`, { method: 'PUT', body: corpo });
        aoSalvar(`Alocação de ${base.disciplina} ajustada.`);
      }
    } catch (err) {
      setErro(err);
      setPodeForcar(err.status === 422 && Array.isArray(err.detalhes) && err.detalhes.every((d) => d.gravidade === 'alerta'));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Remover a aula de ${base.disciplina}?`)) return;
    try {
      await api(`/api/horarios/${base.id}`, { method: 'DELETE' });
      aoSalvar('Aula removida.');
    } catch (err) {
      setErro(err);
    }
  }

  const campo = (k) => ({ value: form[k], onChange: (e) => { setForm({ ...form, [k]: e.target.value }); setPodeForcar(false); } });
  const valido = form.sala_id && form.professor_id && (!nova || form.disciplina_id);

  return (
    <Modal
      titulo={nova ? 'Incluir aula' : `Ajustar ${base.disciplina}`}
      aoFechar={aoFechar}
      rodape={
        <>
          {!nova && <button className="btn btn-secundario perigo" onClick={excluir}>Remover aula</button>}
          <span className="espaco" />
          <button className="btn btn-secundario" onClick={aoFechar}>Cancelar</button>
          {podeForcar && <button className="btn btn-alerta" disabled={salvando} onClick={() => salvar(true)}>Salvar mesmo assim</button>}
          <button className="btn btn-primario" disabled={salvando || !valido} onClick={() => salvar(false)}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </>
      }
    >
      {!nova && <p className="nota">Turma {base.turma} · atual: {DIAS.find((d) => d.id === base.dia)?.nome} {base.inicio}, {base.sala}, {base.professor}</p>}
      <div className="form-grade">
        {nova && (
          <label className="largo">
            Disciplina
            <select value={form.disciplina_id} onChange={(e) => escolherDisciplina(e.target.value)}>
              <option value="">Selecione…</option>
              {(vinculos.dados || []).map((v) => <option key={v.id} value={v.disciplina_id}>{v.disciplina} ({v.carga_semanal} aulas/sem)</option>)}
            </select>
          </label>
        )}
        <label>
          Dia
          <select {...campo('dia')}>{DIAS.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select>
        </label>
        <label>
          Horário
          <select {...campo('inicio')}>{faixas.map((f) => <option key={f.inicio} value={f.inicio}>{f.inicio}–{f.fim}</option>)}</select>
        </label>
        <label>
          Sala
          <select {...campo('sala_id')}>
            <option value="">Selecione…</option>
            {salas.map((s) => <option key={s.id} value={s.id}>{s.identificacao} (cap. {s.capacidade})</option>)}
          </select>
        </label>
        <label>
          Professor
          <select {...campo('professor_id')}>
            <option value="">Selecione…</option>
            {professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      </div>
      {erro && (
        <Alerta tipo={podeForcar ? 'aviso' : 'erro'} detalhes={Array.isArray(erro.detalhes) ? erro.detalhes : null}>
          {erro.message}
          {podeForcar && ' Você pode confirmar a alocação mesmo assim.'}
        </Alerta>
      )}
    </Modal>
  );
}
