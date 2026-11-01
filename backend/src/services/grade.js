// Acesso a dados da grade: entrada do gerador, persistência de versões, consultas e conflitos.
const { HttpError } = require('../middlewares/erros');
const { gerarGrade, minutos, NOME_DIA } = require('./gerador');

const SELECT_AULAS = `
  select h.id, h.versao_id, h.turma_id, t.nome as turma, h.disciplina_id, d.nome as disciplina, d.codigo,
         h.professor_id, u.nome as professor, h.sala_id, s.identificacao as sala, h.dia,
         to_char(h.inicio, 'HH24:MI') as inicio, to_char(h.fim, 'HH24:MI') as fim, h.situacao
    from horarios h
    join turmas t on t.id = h.turma_id
    join disciplinas d on d.id = h.disciplina_id
    join professores p on p.id = h.professor_id
    join usuarios u on u.id = p.usuario_id
    join salas s on s.id = h.sala_id`;

const SELECT_VERSOES = `
  select v.id, v.periodo_letivo_id, pl.nome as periodo, v.numero, v.status, v.data, v.publicada_em,
         v.origem_id, v.observacao, u.nome as responsavel,
         (select count(*) from horarios h where h.versao_id = v.id)::int as total_aulas,
         (select coalesce(sum(aulas_faltantes), 0) from pendencias_geracao pg where pg.versao_id = v.id)::int as aulas_pendentes
    from versoes_horario v
    join periodos_letivos pl on pl.id = v.periodo_letivo_id
    left join usuarios u on u.id = v.responsavel_id`;

async function buscarVersao(client, versaoId) {
  const { rows } = await client.query(`${SELECT_VERSOES} where v.id = $1`, [versaoId]);
  if (!rows[0]) throw new HttpError(404, 'Versão não encontrada');
  return rows[0];
}

async function versaoPublicada(client, periodoId) {
  const { rows } = await client.query(`${SELECT_VERSOES} where v.periodo_letivo_id = $1 and v.status = 'publicada'`, [periodoId]);
  return rows[0] || null;
}

async function periodoOuAtual(client, periodoId) {
  const { rows } = await client.query(
    'select * from periodos_letivos where ($1::bigint is null or id = $1) order by inicio desc limit 1',
    [periodoId ?? null]
  );
  if (!rows[0]) throw new HttpError(404, 'Período letivo não encontrado');
  return rows[0];
}

// Faixas de aula de cada turno (formato do gerador).
async function faixasDeAula(client) {
  const { rows } = await client.query(
    `select turno_id, to_char(inicio, 'HH24:MI') as inicio, to_char(fim, 'HH24:MI') as fim
       from faixas_horario where tipo = 'aula' order by turno_id, inicio`
  );
  const porTurno = {};
  for (const f of rows) (porTurno[f.turno_id] ||= []).push({ inicio: f.inicio, fim: f.fim });
  return porTurno;
}

async function disponibilidadesVigentes(client, periodoId) {
  const { rows } = await client.query(
    `select professor_id, dia, to_char(inicio, 'HH24:MI') as inicio, to_char(fim, 'HH24:MI') as fim
       from disponibilidades where periodo_letivo_id = $1 and status = 'vigente'`,
    [periodoId]
  );
  const porProf = {};
  for (const d of rows) (porProf[d.professor_id] ||= []).push({ dia: d.dia, inicio: d.inicio, fim: d.fim });
  return porProf;
}

async function proximoNumero(client, periodoId) {
  // Trava o período para evitar dois números iguais em gerações simultâneas.
  await client.query('select id from periodos_letivos where id = $1 for update', [periodoId]);
  const { rows } = await client.query(
    'select coalesce(max(numero), 0) + 1 as n from versoes_horario where periodo_letivo_id = $1',
    [periodoId]
  );
  return rows[0].n;
}

async function inserirAulas(client, versaoId, aulas) {
  if (!aulas.length) return;
  const cols = ['turma_id', 'disciplina_id', 'professor_id', 'sala_id', 'dia', 'inicio', 'fim', 'situacao'];
  await client.query(
    `insert into horarios (versao_id, ${cols.join(', ')})
     select $1, * from unnest($2::bigint[], $3::bigint[], $4::bigint[], $5::bigint[], $6::smallint[], $7::time[], $8::time[], $9::situacao_aula[])`,
    [versaoId, ...cols.map((c) => aulas.map((a) => (c === 'situacao' ? a.situacao || 'gerada' : a[c])))]
  );
}

// RF07: executa o gerador para o período e grava uma nova versão rascunho.
async function gerarVersao(client, { periodoId, usuarioId, minimizarJanelas }) {
  const periodo = await periodoOuAtual(client, periodoId);
  const { rows: demandas } = await client.query(
    `select td.id, td.turma_id, td.disciplina_id, td.professor_id, td.carga_semanal,
            t.turno_id, t.qtd_alunos, t.nome as turma, d.nome as disciplina, u.nome as professor, tu.nome as turno
       from turma_disciplinas td
       join turmas t on t.id = td.turma_id
       join turnos tu on tu.id = t.turno_id
       join disciplinas d on d.id = td.disciplina_id
       join professores p on p.id = td.professor_id
       join usuarios u on u.id = p.usuario_id
      where t.periodo_letivo_id = $1
      order by td.id`,
    [periodo.id]
  );
  if (!demandas.length) throw new HttpError(422, `O período ${periodo.nome} não possui disciplinas vinculadas a turmas`);
  const { rows: salas } = await client.query('select id, capacidade from salas');

  const resultado = gerarGrade({
    demandas,
    faixasPorTurno: await faixasDeAula(client),
    disponibilidades: await disponibilidadesVigentes(client, periodo.id),
    salas,
    minimizarJanelas,
  });

  const numero = await proximoNumero(client, periodo.id);
  const { rows: [versao] } = await client.query(
    `insert into versoes_horario (periodo_letivo_id, numero, status, responsavel_id, observacao)
     values ($1, $2, 'rascunho', $3, $4) returning id`,
    [periodo.id, numero, usuarioId, 'Gerada automaticamente']
  );
  await inserirAulas(client, versao.id, resultado.aulas);
  for (const p of resultado.pendencias) {
    await client.query(
      'insert into pendencias_geracao (versao_id, turma_disciplina_id, aulas_faltantes, motivo) values ($1, $2, $3, $4)',
      [versao.id, p.turma_disciplina_id, p.aulas_faltantes, p.motivo]
    );
  }
  return { versao: await buscarVersao(client, versao.id), estatisticas: resultado.estatisticas, pendencias: resultado.pendencias };
}

async function listarAulas(client, filtros) {
  const { rows } = await client.query(
    `${SELECT_AULAS}
      where h.versao_id = $1
        and ($2::bigint is null or h.turma_id = $2)
        and ($3::bigint is null or h.professor_id = $3)
        and ($4::bigint is null or h.sala_id = $4)
      order by h.dia, h.inicio, t.nome`,
    [filtros.versao_id, filtros.turma_id ?? null, filtros.professor_id ?? null, filtros.sala_id ?? null]
  );
  return rows;
}

async function pendencias(client, versaoId) {
  const { rows } = await client.query(
    `select pg.id, pg.turma_disciplina_id, pg.aulas_faltantes, pg.motivo, t.nome as turma, d.nome as disciplina
       from pendencias_geracao pg
       join turma_disciplinas td on td.id = pg.turma_disciplina_id
       join turmas t on t.id = td.turma_id
       join disciplinas d on d.id = td.disciplina_id
      where pg.versao_id = $1 order by t.nome, d.nome`,
    [versaoId]
  );
  return rows;
}

// ---------------------------------------------------------------------------------------------
// RF09: relatório de conflitos de uma versão.
// ---------------------------------------------------------------------------------------------
const sobrepoe = (a, b) => a.dia === b.dia && minutos(a.inicio) < minutos(b.fim) && minutos(b.inicio) < minutos(a.fim);
const quando = (a) => `${NOME_DIA[a.dia]} ${a.inicio}–${a.fim}`;

async function contexto(client, periodoId) {
  const { rows: turmas } = await client.query('select id, nome, turno_id, qtd_alunos from turmas where periodo_letivo_id = $1', [periodoId]);
  const { rows: salas } = await client.query('select id, identificacao, capacidade from salas');
  const { rows: faixas } = await client.query(
    `select turno_id, to_char(inicio, 'HH24:MI') as inicio, to_char(fim, 'HH24:MI') as fim from faixas_horario where tipo = 'aula'`
  );
  const disp = await disponibilidadesVigentes(client, periodoId);
  return {
    turmas: new Map(turmas.map((t) => [t.id, t])),
    salas: new Map(salas.map((s) => [s.id, s])),
    faixas,
    disp,
  };
}

// Problemas de uma aula isolada (sem considerar choques com outras).
function problemasDaAula(aula, ctx) {
  const lista = [];
  const turma = ctx.turmas.get(aula.turma_id);
  const sala = ctx.salas.get(aula.sala_id);
  if (turma && !ctx.faixas.some((f) => f.turno_id === turma.turno_id && f.inicio === aula.inicio && f.fim === aula.fim)) {
    lista.push({ tipo: 'fora_da_faixa', gravidade: 'erro', mensagem: `${aula.disciplina || 'Aula'} (${aula.turma || turma.nome}) em ${quando(aula)} não corresponde a uma faixa de aula do turno da turma` });
  }
  const disp = ctx.disp[aula.professor_id] || [];
  if (!disp.some((d) => d.dia === aula.dia && minutos(d.inicio) <= minutos(aula.inicio) && minutos(d.fim) >= minutos(aula.fim))) {
    lista.push({ tipo: 'fora_da_disponibilidade', gravidade: 'alerta', mensagem: `${aula.professor || 'Professor'} não tem disponibilidade vigente em ${quando(aula)} (${aula.disciplina || ''} – ${aula.turma || ''})` });
  }
  if (turma && sala && sala.capacidade < turma.qtd_alunos) {
    lista.push({ tipo: 'capacidade', gravidade: 'alerta', mensagem: `${sala.identificacao} (capacidade ${sala.capacidade}) não comporta ${turma.nome} (${turma.qtd_alunos} alunos) em ${quando(aula)}` });
  }
  return lista;
}

// Choques de uma aula com as demais da versão (RN10–RN12).
function choques(aula, outras) {
  const lista = [];
  for (const o of outras) {
    if (o.id === aula.id || !sobrepoe(aula, o)) continue;
    if (o.professor_id === aula.professor_id) {
      lista.push({ tipo: 'choque_professor', gravidade: 'erro', horario_ids: [aula.id, o.id].filter(Boolean), mensagem: `${o.professor} já leciona ${o.disciplina} para ${o.turma} em ${quando(o)}` });
    }
    if (o.sala_id === aula.sala_id) {
      lista.push({ tipo: 'choque_sala', gravidade: 'erro', horario_ids: [aula.id, o.id].filter(Boolean), mensagem: `${o.sala} já está ocupada por ${o.turma} (${o.disciplina}) em ${quando(o)}` });
    }
    if (o.turma_id === aula.turma_id) {
      lista.push({ tipo: 'choque_turma', gravidade: 'erro', horario_ids: [aula.id, o.id].filter(Boolean), mensagem: `${o.turma} já tem ${o.disciplina} em ${quando(o)}` });
    }
  }
  return lista;
}

async function relatorioConflitos(client, versaoId) {
  const versao = await buscarVersao(client, versaoId);
  const aulas = await listarAulas(client, { versao_id: versaoId });
  const ctx = await contexto(client, versao.periodo_letivo_id);
  const conflitos = [];

  for (let i = 0; i < aulas.length; i++) {
    conflitos.push(...choques(aulas[i], aulas.slice(i + 1)));
    for (const p of problemasDaAula(aulas[i], ctx)) conflitos.push({ ...p, horario_ids: [aulas[i].id] });
  }

  // RN14: carga semanal atendida?
  const { rows: vinculos } = await client.query(
    `select td.id, td.turma_id, td.disciplina_id, td.carga_semanal, t.nome as turma, d.nome as disciplina
       from turma_disciplinas td join turmas t on t.id = td.turma_id join disciplinas d on d.id = td.disciplina_id
      where t.periodo_letivo_id = $1 order by t.nome, d.nome`,
    [versao.periodo_letivo_id]
  );
  const motivos = new Map((await pendencias(client, versaoId)).map((p) => [p.turma_disciplina_id, p.motivo]));
  for (const v of vinculos) {
    const qtd = aulas.filter((a) => a.turma_id === v.turma_id && a.disciplina_id === v.disciplina_id).length;
    if (qtd < v.carga_semanal) {
      conflitos.push({
        tipo: 'carga_incompleta', gravidade: 'alerta', turma_disciplina_id: v.id,
        mensagem: `${v.disciplina} (${v.turma}): ${qtd} de ${v.carga_semanal} aulas semanais alocadas`,
        motivo: motivos.get(v.id),
      });
    } else if (qtd > v.carga_semanal) {
      conflitos.push({
        tipo: 'carga_excedente', gravidade: 'alerta', turma_disciplina_id: v.id,
        mensagem: `${v.disciplina} (${v.turma}): ${qtd} aulas alocadas para carga de ${v.carga_semanal}`,
      });
    }
  }

  const resumo = {};
  for (const c of conflitos) resumo[c.tipo] = (resumo[c.tipo] || 0) + 1;
  return {
    versao,
    total: conflitos.length,
    erros: conflitos.filter((c) => c.gravidade === 'erro').length,
    alertas: conflitos.filter((c) => c.gravidade === 'alerta').length,
    resumo,
    conflitos,
  };
}

module.exports = {
  SELECT_AULAS, SELECT_VERSOES, buscarVersao, versaoPublicada, periodoOuAtual, gerarVersao, listarAulas,
  pendencias, relatorioConflitos, contexto, problemasDaAula, choques, inserirAulas, proximoNumero,
};
