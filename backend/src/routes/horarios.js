const { Router } = require('express');
const { query, transaction } = require('../db/pool');
const { autenticar, exigirPerfil } = require('../middlewares/auth');
const { HttpError } = require('../middlewares/erros');
const { validar, z, id, hora, dia, paramsId } = require('../middlewares/validar');
const historico = require('../services/historico');
const grade = require('../services/grade');

const router = Router();
router.use(autenticar);
const coordenador = exigirPerfil('coordenador');

// Faixas (aulas e intervalos) do turno, para o frontend montar a grade.
async function faixasDoTurno(client, turnoId) {
  const { rows } = await client.query(
    `select to_char(inicio, 'HH24:MI') as inicio, to_char(fim, 'HH24:MI') as fim, tipo
       from faixas_horario where turno_id = $1 order by inicio`,
    [turnoId]
  );
  return rows;
}

async function faixasDeTodosTurnos(client) {
  const { rows } = await client.query(
    `select distinct to_char(inicio, 'HH24:MI') as inicio, to_char(fim, 'HH24:MI') as fim, tipo
       from faixas_horario order by inicio`
  );
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Consultas da grade publicada (RF10, RN09)
// ---------------------------------------------------------------------------------------------

// Aluno: grade publicada da própria turma.
router.get('/minha-turma', exigirPerfil('aluno'), async (req, res) => {
  const { rows: [turma] } = await query(
    `select t.id, t.nome, t.turno_id, tu.nome as turno, t.periodo_letivo_id, p.nome as periodo
       from turmas t join turnos tu on tu.id = t.turno_id join periodos_letivos p on p.id = t.periodo_letivo_id
      where t.id = $1`,
    [req.user.turma_id]
  );
  if (!turma) throw new HttpError(404, 'Aluno sem turma vinculada');
  const versao = await grade.versaoPublicada({ query }, turma.periodo_letivo_id);
  res.json({
    turma,
    versao,
    faixas: await faixasDoTurno({ query }, turma.turno_id),
    aulas: versao ? await grade.listarAulas({ query }, { versao_id: versao.id, turma_id: turma.id }) : [],
  });
});

// Professor: a própria grade publicada. Coordenador pode consultar qualquer professor (?professor_id=).
router.get(
  '/professor',
  exigirPerfil('professor', 'coordenador'),
  validar({ query: z.object({ professor_id: id.optional(), periodo_letivo_id: id.optional() }) }),
  async (req, res) => {
    const professorId = req.user.perfil === 'coordenador' && req.dados.query.professor_id
      ? req.dados.query.professor_id
      : req.user.professor_id;
    if (!professorId) throw new HttpError(403, 'Seu usuário não possui vínculo docente');
    const periodo = await grade.periodoOuAtual({ query }, req.dados.query.periodo_letivo_id);
    const versao = await grade.versaoPublicada({ query }, periodo.id);
    const aulas = versao ? await grade.listarAulas({ query }, { versao_id: versao.id, professor_id: professorId }) : [];
    const { rows: turmas } = await query(
      `select distinct t.id, t.nome, tu.nome as turno from turma_disciplinas td
         join turmas t on t.id = td.turma_id join turnos tu on tu.id = t.turno_id
        where td.professor_id = $1 and t.periodo_letivo_id = $2 order by t.nome`,
      [professorId, periodo.id]
    );
    res.json({ periodo: { id: periodo.id, nome: periodo.nome }, versao, turmas, faixas: await faixasDeTodosTurnos({ query }), aulas });
  }
);

// Qualquer perfil: grade publicada filtrada por turma, professor ou sala (somente leitura).
router.get(
  '/publicados',
  validar({
    query: z
      .object({ periodo_letivo_id: id.optional(), turma_id: id.optional(), professor_id: id.optional(), sala_id: id.optional() })
      .refine((q) => q.turma_id || q.professor_id || q.sala_id, { message: 'Informe turma_id, professor_id ou sala_id' }),
  }),
  async (req, res) => {
    const q = req.dados.query;
    const periodo = await grade.periodoOuAtual({ query }, q.periodo_letivo_id);
    const versao = await grade.versaoPublicada({ query }, periodo.id);
    let faixas;
    if (q.turma_id) {
      const { rows: [turma] } = await query('select turno_id from turmas where id = $1', [q.turma_id]);
      if (!turma) throw new HttpError(404, 'Turma não encontrada');
      faixas = await faixasDoTurno({ query }, turma.turno_id);
    } else {
      faixas = await faixasDeTodosTurnos({ query });
    }
    const aulas = versao ? await grade.listarAulas({ query }, { versao_id: versao.id, ...q }) : [];
    res.json({ periodo: { id: periodo.id, nome: periodo.nome }, versao, faixas, aulas });
  }
);

// ---------------------------------------------------------------------------------------------
// Coordenador: geração, conflitos, edição e versões (RF07–RF13)
// ---------------------------------------------------------------------------------------------

router.post(
  '/gerar',
  coordenador,
  validar({ body: z.object({ periodo_letivo_id: id.optional(), minimizar_janelas: z.boolean().default(true) }) }),
  async (req, res) => {
    const r = await transaction(async (client) => {
      const gerado = await grade.gerarVersao(client, {
        periodoId: req.dados.body.periodo_letivo_id,
        usuarioId: req.user.id,
        minimizarJanelas: req.dados.body.minimizar_janelas,
      });
      await historico.registrar(client, req.user.id, 'versoes_horario', gerado.versao.id, 'gerar', {
        depois: { numero: gerado.versao.numero, periodo: gerado.versao.periodo, ...gerado.estatisticas },
      });
      return gerado;
    });
    res.status(201).json(r);
  }
);

router.get('/conflitos', coordenador, validar({ query: z.object({ versao_id: id }) }), async (req, res) => {
  res.json(await grade.relatorioConflitos({ query }, req.dados.query.versao_id));
});

router.get(
  '/versoes',
  coordenador,
  validar({ query: z.object({ periodo_letivo_id: id.optional() }) }),
  async (req, res) => {
    const { rows } = await query(
      `${grade.SELECT_VERSOES} where ($1::bigint is null or v.periodo_letivo_id = $1) order by v.periodo_letivo_id desc, v.numero desc`,
      [req.dados.query.periodo_letivo_id ?? null]
    );
    res.json(rows);
  }
);

router.get('/versoes/:id', coordenador, validar({ params: paramsId }), async (req, res) => {
  const versao = await grade.buscarVersao({ query }, req.dados.params.id);
  res.json({ ...versao, pendencias: await grade.pendencias({ query }, versao.id) });
});

// Transições de estado (RF12): rascunho → em_revisao → publicada → arquivada.
const TRANSICOES = {
  revisao: { de: ['rascunho'], para: 'em_revisao', operacao: 'enviar_revisao' },
  devolver: { de: ['em_revisao'], para: 'rascunho', operacao: 'devolver_rascunho' },
};

for (const [acao, t] of Object.entries(TRANSICOES)) {
  router.post(`/versoes/:id/${acao}`, coordenador, validar({ params: paramsId }), async (req, res) => {
    const versao = await transaction(async (client) => {
      const antes = await grade.buscarVersao(client, req.dados.params.id);
      if (!t.de.includes(antes.status)) {
        throw new HttpError(409, `Versão ${antes.status} não pode passar para ${t.para}`);
      }
      await client.query('update versoes_horario set status = $2 where id = $1', [antes.id, t.para]);
      await historico.registrar(client, req.user.id, 'versoes_horario', antes.id, t.operacao, { antes: { status: antes.status }, depois: { status: t.para } });
      return grade.buscarVersao(client, antes.id);
    });
    res.json(versao);
  });
}

// Publicar (RN07): só a partir de "em revisão"; arquiva a publicada anterior; notifica todos.
router.post('/versoes/:id/publicar', coordenador, validar({ params: paramsId }), async (req, res) => {
  const resultado = await transaction(async (client) => {
    const v = await grade.buscarVersao(client, req.dados.params.id);
    if (v.status !== 'em_revisao') {
      throw new HttpError(409, v.status === 'rascunho'
        ? 'Envie a versão para revisão antes de publicar'
        : `Versão ${v.status} não pode ser publicada`);
    }
    const relatorio = await grade.relatorioConflitos(client, v.id);
    if (relatorio.erros) {
      throw new HttpError(422, `A versão possui ${relatorio.erros} conflito(s) grave(s) e não pode ser publicada`, relatorio.conflitos.filter((c) => c.gravidade === 'erro'));
    }
    const anterior = await grade.versaoPublicada(client, v.periodo_letivo_id);
    if (anterior) {
      await client.query(`update versoes_horario set status = 'arquivada' where id = $1`, [anterior.id]);
      await historico.registrar(client, req.user.id, 'versoes_horario', anterior.id, 'arquivar', { antes: { status: 'publicada' }, depois: { status: 'arquivada' } });
    }
    await client.query(`update versoes_horario set status = 'publicada', publicada_em = now() where id = $1`, [v.id]);
    await historico.registrar(client, req.user.id, 'versoes_horario', v.id, 'publicar', {
      antes: { status: v.status }, depois: { status: 'publicada' }, versao_arquivada: anterior?.id ?? null,
    });
    await historico.notificarPerfis(client, ['aluno', 'professor', 'coordenador'],
      `Nova grade oficial publicada: período ${v.periodo}, versão ${v.numero}.`);
    return { versao: await grade.buscarVersao(client, v.id), alertas: relatorio.conflitos };
  });
  res.json(resultado);
});

// Duplicar (RN08): única forma de alterar uma grade publicada — gera um novo rascunho a partir dela.
router.post('/versoes/:id/duplicar', coordenador, validar({ params: paramsId }), async (req, res) => {
  const versao = await transaction(async (client) => {
    const origem = await grade.buscarVersao(client, req.dados.params.id);
    const numero = await grade.proximoNumero(client, origem.periodo_letivo_id);
    const { rows: [nova] } = await client.query(
      `insert into versoes_horario (periodo_letivo_id, numero, status, responsavel_id, origem_id, observacao)
       values ($1, $2, 'rascunho', $3, $4, $5) returning id`,
      [origem.periodo_letivo_id, numero, req.user.id, origem.id, `Cópia da versão ${origem.numero}`]
    );
    await client.query(
      `insert into horarios (versao_id, turma_id, disciplina_id, professor_id, sala_id, dia, inicio, fim, situacao)
       select $1, turma_id, disciplina_id, professor_id, sala_id, dia, inicio, fim, situacao from horarios where versao_id = $2`,
      [nova.id, origem.id]
    );
    await client.query(
      `insert into pendencias_geracao (versao_id, turma_disciplina_id, aulas_faltantes, motivo)
       select $1, turma_disciplina_id, aulas_faltantes, motivo from pendencias_geracao where versao_id = $2`,
      [nova.id, origem.id]
    );
    await historico.registrar(client, req.user.id, 'versoes_horario', nova.id, 'duplicar', { origem: origem.id });
    return grade.buscarVersao(client, nova.id);
  });
  res.status(201).json(versao);
});

router.delete('/versoes/:id', coordenador, validar({ params: paramsId }), async (req, res) => {
  await transaction(async (client) => {
    const v = await grade.buscarVersao(client, req.dados.params.id);
    if (v.status !== 'rascunho') throw new HttpError(409, 'Somente rascunhos podem ser excluídos');
    await client.query('delete from versoes_horario where id = $1', [v.id]);
    await historico.registrar(client, req.user.id, 'versoes_horario', v.id, 'excluir', { antes: v });
  });
  res.status(204).end();
});

// Aulas de uma versão (qualquer status) — visão do coordenador.
router.get(
  '/',
  coordenador,
  validar({ query: z.object({ versao_id: id, turma_id: id.optional(), professor_id: id.optional(), sala_id: id.optional() }) }),
  async (req, res) => {
    const versao = await grade.buscarVersao({ query }, req.dados.query.versao_id);
    let faixas;
    if (req.dados.query.turma_id) {
      const { rows: [turma] } = await query('select turno_id from turmas where id = $1', [req.dados.query.turma_id]);
      if (!turma) throw new HttpError(404, 'Turma não encontrada');
      faixas = await faixasDoTurno({ query }, turma.turno_id);
    } else {
      faixas = await faixasDeTodosTurnos({ query });
    }
    res.json({ versao, faixas, aulas: await grade.listarAulas({ query }, req.dados.query) });
  }
);

// ---------------------------------------------------------------------------------------------
// Edição de alocações (RF11, RN08). Choques → 409; regras flexíveis (disponibilidade, capacidade)
// → 422, a menos que o coordenador confirme com "forcar": true.
// ---------------------------------------------------------------------------------------------
async function validarAlocacao(client, aula, { forcar }) {
  const versao = await grade.buscarVersao(client, aula.versao_id);
  if (!['rascunho', 'em_revisao'].includes(versao.status)) {
    throw new HttpError(409, `A versão ${versao.numero} está ${versao.status} e não pode ser editada. Duplique-a para criar um novo rascunho.`);
  }
  const { rows: [turma] } = await client.query('select turno_id from turmas where id = $1', [aula.turma_id]);
  const { rows: [faixa] } = await client.query(
    `select to_char(fim, 'HH24:MI') as fim from faixas_horario where turno_id = $1 and tipo = 'aula' and inicio = $2::time`,
    [turma.turno_id, aula.inicio]
  );
  if (!faixa) throw new HttpError(422, `${aula.inicio} não é início de uma faixa de aula do turno da turma (RN15)`);
  aula.fim = faixa.fim;

  // Nomes para mensagens e checagens.
  const { rows: [nomes] } = await client.query(
    `select t.nome as turma, d.nome as disciplina, u.nome as professor
       from turmas t, disciplinas d, professores p join usuarios u on u.id = p.usuario_id
      where t.id = $1 and d.id = $2 and p.id = $3`,
    [aula.turma_id, aula.disciplina_id, aula.professor_id]
  );
  if (!nomes) throw new HttpError(404, 'Turma, disciplina ou professor inexistente');
  const { rows: [sala] } = await client.query('select identificacao from salas where id = $1', [aula.sala_id]);
  if (!sala) throw new HttpError(404, 'Sala inexistente');
  Object.assign(aula, nomes, { sala: sala.identificacao });

  const outras = await grade.listarAulas(client, { versao_id: aula.versao_id });
  const duros = grade.choques(aula, outras);
  if (duros.length) throw new HttpError(409, 'A alteração gera conflito de horário', duros);

  const ctx = await grade.contexto(client, versao.periodo_letivo_id);
  const flexiveis = grade.problemasDaAula(aula, ctx);
  if (flexiveis.length && !forcar) {
    throw new HttpError(422, 'A alteração viola regras de alocação. Envie "forcar": true para confirmar.', flexiveis);
  }
  return flexiveis;
}

const schemaAula = z.object({
  versao_id: id,
  turma_id: id,
  disciplina_id: id,
  professor_id: id,
  sala_id: id,
  dia,
  inicio: hora,
  forcar: z.boolean().default(false),
});

router.post('/', coordenador, validar({ body: schemaAula }), async (req, res) => {
  const { forcar, ...aula } = req.dados.body;
  const r = await transaction(async (client) => {
    const alertas = await validarAlocacao(client, aula, { forcar });
    const { rows: [nova] } = await client.query(
      `insert into horarios (versao_id, turma_id, disciplina_id, professor_id, sala_id, dia, inicio, fim, situacao)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'ajustada') returning id`,
      [aula.versao_id, aula.turma_id, aula.disciplina_id, aula.professor_id, aula.sala_id, aula.dia, aula.inicio, aula.fim]
    );
    const { rows: [depois] } = await client.query(`${grade.SELECT_AULAS} where h.id = $1`, [nova.id]);
    await historico.registrar(client, req.user.id, 'horarios', nova.id, 'criar', { depois, alertas });
    return { aula: depois, alertas };
  });
  res.status(201).json(r);
});

router.put(
  '/:id',
  coordenador,
  validar({
    params: paramsId,
    body: z
      .object({ dia: dia.optional(), inicio: hora.optional(), sala_id: id.optional(), professor_id: id.optional(), forcar: z.boolean().default(false) })
      .refine((b) => b.dia || b.inicio || b.sala_id || b.professor_id, { message: 'Informe ao menos um campo para alterar' }),
  }),
  async (req, res) => {
    const { forcar, ...mudancas } = req.dados.body;
    const r = await transaction(async (client) => {
      const { rows: [antes] } = await client.query(`${grade.SELECT_AULAS} where h.id = $1 for update of h`, [req.dados.params.id]);
      if (!antes) throw new HttpError(404, 'Aula não encontrada');
      const aula = { ...antes, ...mudancas };
      const alertas = await validarAlocacao(client, aula, { forcar });
      await client.query(
        `update horarios set dia = $2, inicio = $3, fim = $4, sala_id = $5, professor_id = $6, situacao = 'ajustada' where id = $1`,
        [antes.id, aula.dia, aula.inicio, aula.fim, aula.sala_id, aula.professor_id]
      );
      const { rows: [depois] } = await client.query(`${grade.SELECT_AULAS} where h.id = $1`, [antes.id]);
      await historico.registrar(client, req.user.id, 'horarios', antes.id, 'alterar', { antes, depois, alertas });
      return { aula: depois, alertas };
    });
    res.json(r);
  }
);

router.delete('/:id', coordenador, validar({ params: paramsId }), async (req, res) => {
  await transaction(async (client) => {
    const { rows: [antes] } = await client.query(`${grade.SELECT_AULAS} where h.id = $1`, [req.dados.params.id]);
    if (!antes) throw new HttpError(404, 'Aula não encontrada');
    const versao = await grade.buscarVersao(client, antes.versao_id);
    if (!['rascunho', 'em_revisao'].includes(versao.status)) {
      throw new HttpError(409, `A versão está ${versao.status} e não pode ser editada`);
    }
    await client.query('delete from horarios where id = $1', [antes.id]);
    await historico.registrar(client, req.user.id, 'horarios', antes.id, 'excluir', { antes });
  });
  res.status(204).end();
});

module.exports = router;
