const { Router } = require('express');
const { query } = require('../db/pool');
const { autenticar, exigirPerfil } = require('../middlewares/auth');
const { HttpError } = require('../middlewares/erros');
const { validar, z, id, paramsId } = require('../middlewares/validar');
const grade = require('../services/grade');

// ---------------------------------------------------------------------------------------------
// Histórico de alterações (RF13) — coordenador
// ---------------------------------------------------------------------------------------------
const historico = Router();
historico.get(
  '/',
  autenticar,
  exigirPerfil('coordenador'),
  validar({ query: z.object({ entidade: z.string().optional(), limite: z.coerce.number().int().min(1).max(500).default(100) }) }),
  async (req, res) => {
    const { rows } = await query(
      `select h.id, h.data, h.entidade, h.entidade_id, h.operacao, h.valores_alterados, u.nome as usuario, u.perfil
         from historico_alteracoes h left join usuarios u on u.id = h.usuario_id
        where ($1::text is null or h.entidade = $1)
        order by h.data desc, h.id desc limit $2`,
      [req.dados.query.entidade ?? null, req.dados.query.limite]
    );
    res.json(rows);
  }
);

// ---------------------------------------------------------------------------------------------
// Notificações (diferencial) — cada usuário vê apenas as suas
// ---------------------------------------------------------------------------------------------
const notificacoes = Router();
notificacoes.use(autenticar);

notificacoes.get('/', async (req, res) => {
  const { rows } = await query(
    'select id, mensagem, lida, criado_em from notificacoes where usuario_id = $1 order by criado_em desc, id desc limit 50',
    [req.user.id]
  );
  res.json(rows);
});

notificacoes.post('/lidas', async (req, res) => {
  await query('update notificacoes set lida = true where usuario_id = $1 and not lida', [req.user.id]);
  res.status(204).end();
});

notificacoes.post('/:id/lida', validar({ params: paramsId }), async (req, res) => {
  const { rowCount } = await query('update notificacoes set lida = true where id = $1 and usuario_id = $2', [
    req.dados.params.id, req.user.id,
  ]);
  if (!rowCount) throw new HttpError(404, 'Notificação não encontrada');
  res.status(204).end();
});

// ---------------------------------------------------------------------------------------------
// Relatórios gerais (RF14) — coordenador
// ---------------------------------------------------------------------------------------------
const relatorios = Router();
relatorios.use(autenticar, exigirPerfil('coordenador'));

// Indicadores de ocupação das salas (diferencial): aulas alocadas / horários de aula disponíveis.
relatorios.get('/ocupacao-salas', validar({ query: z.object({ versao_id: id.optional() }) }), async (req, res) => {
  let versao;
  if (req.dados.query.versao_id) {
    versao = await grade.buscarVersao({ query }, req.dados.query.versao_id);
  } else {
    const periodo = await grade.periodoOuAtual({ query }, null);
    versao = await grade.versaoPublicada({ query }, periodo.id);
    if (!versao) return res.json({ versao: null, salas: [] });
  }
  const { rows: turnos } = await query(
    `select t.id, t.nome, count(f.id)::int * 5 as horarios_semana
       from turnos t left join faixas_horario f on f.turno_id = t.id and f.tipo = 'aula'
      group by t.id order by t.inicio`
  );
  const { rows } = await query(
    `select s.id, s.identificacao, s.capacidade, tu.id as turno_id, count(h.id)::int as aulas,
            coalesce(avg(t.qtd_alunos::numeric / s.capacidade), 0) as aproveitamento
       from salas s
       cross join turnos tu
       left join (horarios h join turmas t on t.id = h.turma_id)
              on h.sala_id = s.id and h.versao_id = $1 and t.turno_id = tu.id
      group by s.id, tu.id order by s.identificacao, tu.inicio`,
    [versao.id]
  );
  const totalSemana = turnos.reduce((s, t) => s + t.horarios_semana, 0);
  const salas = new Map();
  for (const r of rows) {
    if (!salas.has(r.id)) {
      salas.set(r.id, { id: r.id, identificacao: r.identificacao, capacidade: r.capacidade, aulas: 0, por_turno: [], somaAprov: 0 });
    }
    const s = salas.get(r.id);
    const turno = turnos.find((t) => t.id === r.turno_id);
    s.aulas += r.aulas;
    s.somaAprov += r.aproveitamento * r.aulas;
    s.por_turno.push({
      turno: turno.nome,
      aulas: r.aulas,
      taxa: turno.horarios_semana ? r.aulas / turno.horarios_semana : 0,
    });
  }
  const resultado = [...salas.values()].map(({ somaAprov, ...s }) => ({
    ...s,
    horarios_semana: totalSemana,
    taxa_ocupacao: totalSemana ? s.aulas / totalSemana : 0,
    aproveitamento_medio: s.aulas ? somaAprov / s.aulas : 0, // alunos / capacidade nas aulas alocadas
  }));
  res.json({ versao, salas: resultado });
});

relatorios.get('/resumo', async (req, res) => {
  const periodo = await grade.periodoOuAtual({ query }, null);
  const { rows: [contagens] } = await query(
    `select (select count(*) from turmas where periodo_letivo_id = $1)::int as turmas,
            (select count(*) from professores)::int as professores,
            (select count(*) from alunos)::int as alunos,
            (select count(*) from disciplinas)::int as disciplinas,
            (select count(*) from salas)::int as salas,
            (select count(*) from disponibilidades where status = 'pendente' and periodo_letivo_id = $1)::int as solicitacoes_pendentes,
            (select count(*) from versoes_horario where periodo_letivo_id = $1)::int as versoes`,
    [periodo.id]
  );
  const publicada = await grade.versaoPublicada({ query }, periodo.id);
  res.json({ periodo, ...contagens, versao_publicada: publicada });
});

module.exports = { historico, notificacoes, relatorios };
