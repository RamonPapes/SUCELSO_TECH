const { Router } = require('express');
const { query, transaction } = require('../db/pool');
const { autenticar, exigirPerfil } = require('../middlewares/auth');
const { HttpError } = require('../middlewares/erros');
const { validar, z, id, hora, dia, paramsId } = require('../middlewares/validar');
const historico = require('../services/historico');

const router = Router();
router.use(autenticar, exigirPerfil('professor', 'coordenador'));

const NOMES_DIAS = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta'];

const SELECT = `
  select d.id, d.professor_id, u.nome as professor, d.periodo_letivo_id, d.dia,
         to_char(d.inicio, 'HH24:MI') as inicio, to_char(d.fim, 'HH24:MI') as fim,
         d.status, d.tipo_solicitacao, d.substitui_id, d.criado_em, d.avaliado_em
    from disponibilidades d
    join professores p on p.id = d.professor_id
    join usuarios u on u.id = p.usuario_id`;

async function buscar(client, dispId) {
  const { rows } = await client.query(`${SELECT} where d.id = $1`, [dispId]);
  return rows[0];
}

async function periodoOuAtual(client, periodoId) {
  const { rows } = await client.query(
    `select id, nome, status_coleta,
            exists (select 1 from versoes_horario v where v.periodo_letivo_id = p.id and v.status = 'publicada') as tem_publicada
       from periodos_letivos p where ($1::bigint is null or id = $1) order by inicio desc limit 1`,
    [periodoId ?? null]
  );
  if (!rows[0]) throw new HttpError(404, 'Período letivo não encontrado');
  return rows[0];
}

// RN05: edição direta durante a coleta; depois, solicitação ao coordenador.
// O coordenador é o próprio aprovador, então suas alterações são sempre diretas.
function edicaoDireta(usuario, periodo) {
  return usuario.perfil === 'coordenador' || (periodo.status_coleta === 'aberta' && !periodo.tem_publicada);
}

function exigirDocente(usuario) {
  if (!usuario.professor_id) throw new HttpError(403, 'Seu usuário não possui vínculo docente');
}

// RN04: não pode sobrepor outra disponibilidade vigente/pendente do professor no mesmo dia.
async function verificarSobreposicao(client, d, ignorar = []) {
  const { rows } = await client.query(
    `select to_char(inicio, 'HH24:MI') as inicio, to_char(fim, 'HH24:MI') as fim, status
       from disponibilidades
      where professor_id = $1 and periodo_letivo_id = $2 and dia = $3
        and status in ('vigente', 'pendente') and coalesce(tipo_solicitacao::text, '') <> 'remocao'
        and not (id = any($6::bigint[])) and not (coalesce(substitui_id, 0) = any($6::bigint[]) and status = 'pendente')
        and inicio < $5::time and fim > $4::time`,
    [d.professor_id, d.periodo_letivo_id, d.dia, d.inicio, d.fim, ignorar]
  );
  if (rows[0]) {
    throw new HttpError(422, `Sobrepõe a disponibilidade ${rows[0].status} de ${NOMES_DIAS[d.dia]} ${rows[0].inicio}–${rows[0].fim}`);
  }
}

async function avisarCoordenacao(client, usuario, texto) {
  await historico.notificarPerfis(client, ['coordenador'], `${usuario.nome} solicitou ${texto}. Aguarda aprovação.`);
}

const descrever = (d) => `${NOMES_DIAS[d.dia]} ${d.inicio}–${d.fim}`;

const intervalo = z
  .object({ dia, inicio: hora, fim: hora })
  .refine((d) => d.inicio < d.fim, { message: 'O início deve ser anterior ao fim', path: ['fim'] });

// GET: professor vê as próprias; coordenador vê todas (com filtros).
router.get(
  '/',
  validar({
    query: z.object({
      periodo_letivo_id: id.optional(),
      professor_id: id.optional(),
      status: z.enum(['vigente', 'pendente', 'rejeitada', 'inativa']).optional(),
    }),
  }),
  async (req, res) => {
    const f = { ...req.dados.query };
    if (req.user.perfil !== 'coordenador') {
      exigirDocente(req.user);
      f.professor_id = req.user.professor_id;
    }
    const { rows } = await query(
      `${SELECT}
        where ($1::bigint is null or d.periodo_letivo_id = $1) and ($2::bigint is null or d.professor_id = $2)
          and ($3::status_disponibilidade is null or d.status = $3)
        order by u.nome, d.dia, d.inicio, d.id`,
      [f.periodo_letivo_id ?? null, f.professor_id ?? null, f.status ?? null]
    );
    res.json(rows);
  }
);

router.post(
  '/',
  validar({ body: intervalo.and(z.object({ periodo_letivo_id: id.optional() })) }),
  async (req, res) => {
    exigirDocente(req.user);
    const resultado = await transaction(async (client) => {
      const periodo = await periodoOuAtual(client, req.dados.body.periodo_letivo_id);
      const d = { ...req.dados.body, professor_id: req.user.professor_id, periodo_letivo_id: periodo.id };
      await verificarSobreposicao(client, d);
      const direta = edicaoDireta(req.user, periodo);
      const { rows } = await client.query(
        `insert into disponibilidades (professor_id, periodo_letivo_id, dia, inicio, fim, status, tipo_solicitacao)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [d.professor_id, d.periodo_letivo_id, d.dia, d.inicio, d.fim, direta ? 'vigente' : 'pendente', direta ? null : 'inclusao']
      );
      const nova = await buscar(client, rows[0].id);
      await historico.registrar(client, req.user.id, 'disponibilidades', nova.id, direta ? 'criar' : 'solicitar_inclusao', { depois: nova });
      if (!direta) await avisarCoordenacao(client, req.user, `inclusão de disponibilidade (${descrever(nova)})`);
      return nova;
    });
    res.status(resultado.status === 'pendente' ? 202 : 201).json(resultado);
  }
);

async function carregarPropria(client, req) {
  exigirDocente(req.user);
  const atual = await buscar(client, req.dados.params.id);
  if (!atual) throw new HttpError(404, 'Disponibilidade não encontrada');
  // RN02: professor altera exclusivamente a própria disponibilidade.
  if (atual.professor_id !== req.user.professor_id) {
    throw new HttpError(403, 'Você só pode alterar a sua própria disponibilidade');
  }
  if (!['vigente', 'pendente'].includes(atual.status)) {
    throw new HttpError(409, `Disponibilidade ${atual.status} não pode ser alterada`);
  }
  return atual;
}

async function semSolicitacaoAberta(client, dispId) {
  const { rows } = await client.query(`select 1 from disponibilidades where substitui_id = $1 and status = 'pendente'`, [dispId]);
  if (rows[0]) throw new HttpError(409, 'Já existe uma solicitação pendente para esta disponibilidade');
}

router.put('/:id', validar({ params: paramsId, body: intervalo }), async (req, res) => {
  const { resultado, status } = await transaction(async (client) => {
    const atual = await carregarPropria(client, req);
    const d = { ...atual, ...req.dados.body };
    if (atual.tipo_solicitacao === 'remocao') throw new HttpError(409, 'Solicitação de remoção não pode ser editada');

    // Solicitação ainda pendente: o professor apenas ajusta o pedido.
    if (atual.status === 'pendente') {
      await verificarSobreposicao(client, d, [atual.id, atual.substitui_id].filter(Boolean));
      await client.query('update disponibilidades set dia = $2, inicio = $3, fim = $4 where id = $1', [atual.id, d.dia, d.inicio, d.fim]);
      const depois = await buscar(client, atual.id);
      await historico.registrar(client, req.user.id, 'disponibilidades', atual.id, 'alterar_solicitacao', { antes: atual, depois });
      return { resultado: depois, status: 202 };
    }

    await verificarSobreposicao(client, d, [atual.id]);
    const periodo = await periodoOuAtual(client, atual.periodo_letivo_id);
    if (edicaoDireta(req.user, periodo)) {
      await client.query('update disponibilidades set dia = $2, inicio = $3, fim = $4 where id = $1', [atual.id, d.dia, d.inicio, d.fim]);
      const depois = await buscar(client, atual.id);
      await historico.registrar(client, req.user.id, 'disponibilidades', atual.id, 'alterar', { antes: atual, depois });
      return { resultado: depois, status: 200 };
    }

    // Após a publicação: cria solicitação de alteração; a disponibilidade vigente (e a grade) permanecem.
    await semSolicitacaoAberta(client, atual.id);
    const { rows } = await client.query(
      `insert into disponibilidades (professor_id, periodo_letivo_id, dia, inicio, fim, status, tipo_solicitacao, substitui_id)
       values ($1, $2, $3, $4, $5, 'pendente', 'alteracao', $6) returning id`,
      [atual.professor_id, atual.periodo_letivo_id, d.dia, d.inicio, d.fim, atual.id]
    );
    const pedido = await buscar(client, rows[0].id);
    await historico.registrar(client, req.user.id, 'disponibilidades', pedido.id, 'solicitar_alteracao', { antes: atual, depois: pedido });
    await avisarCoordenacao(client, req.user, `alteração de disponibilidade (${descrever(atual)} → ${descrever(pedido)})`);
    return { resultado: pedido, status: 202 };
  });
  res.status(status).json(resultado);
});

router.delete('/:id', validar({ params: paramsId }), async (req, res) => {
  const { resultado, status } = await transaction(async (client) => {
    const atual = await carregarPropria(client, req);

    if (atual.status === 'pendente') {
      // Cancelar uma solicitação ainda não avaliada.
      await client.query('delete from disponibilidades where id = $1', [atual.id]);
      await historico.registrar(client, req.user.id, 'disponibilidades', atual.id, 'cancelar_solicitacao', { antes: atual });
      return { status: 204 };
    }

    const periodo = await periodoOuAtual(client, atual.periodo_letivo_id);
    if (edicaoDireta(req.user, periodo)) {
      await client.query(`update disponibilidades set status = 'inativa' where id = $1`, [atual.id]);
      await historico.registrar(client, req.user.id, 'disponibilidades', atual.id, 'excluir', { antes: atual });
      return { status: 204 };
    }

    await semSolicitacaoAberta(client, atual.id);
    const { rows } = await client.query(
      `insert into disponibilidades (professor_id, periodo_letivo_id, dia, inicio, fim, status, tipo_solicitacao, substitui_id)
       values ($1, $2, $3, $4, $5, 'pendente', 'remocao', $6) returning id`,
      [atual.professor_id, atual.periodo_letivo_id, atual.dia, atual.inicio, atual.fim, atual.id]
    );
    const pedido = await buscar(client, rows[0].id);
    await historico.registrar(client, req.user.id, 'disponibilidades', pedido.id, 'solicitar_remocao', { antes: atual });
    await avisarCoordenacao(client, req.user, `remoção de disponibilidade (${descrever(atual)})`);
    return { resultado: pedido, status: 202 };
  });
  if (status === 204) return res.status(204).end();
  res.status(status).json(resultado);
});

// RN06: somente o coordenador avalia solicitações. Aprovar NÃO altera a grade publicada.
async function avaliar(req, aprovar) {
  return transaction(async (client) => {
    const pedido = await buscar(client, req.dados.params.id);
    if (!pedido) throw new HttpError(404, 'Solicitação não encontrada');
    if (pedido.status !== 'pendente') throw new HttpError(409, `A disponibilidade já está ${pedido.status}`);

    if (!aprovar) {
      await client.query(
        `update disponibilidades set status = 'rejeitada', avaliado_por = $2, avaliado_em = now() where id = $1`,
        [pedido.id, req.user.id]
      );
    } else {
      if (pedido.tipo_solicitacao !== 'remocao') {
        await verificarSobreposicao(client, pedido, [pedido.id, pedido.substitui_id].filter(Boolean));
      }
      if (pedido.substitui_id) {
        await client.query(`update disponibilidades set status = 'inativa' where id = $1`, [pedido.substitui_id]);
      }
      await client.query(
        `update disponibilidades set status = $3, avaliado_por = $2, avaliado_em = now() where id = $1`,
        [pedido.id, req.user.id, pedido.tipo_solicitacao === 'remocao' ? 'inativa' : 'vigente']
      );
    }
    const depois = await buscar(client, pedido.id);
    await historico.registrar(client, req.user.id, 'disponibilidades', pedido.id, aprovar ? 'aprovar' : 'rejeitar', { antes: pedido, depois });

    const { rows: [prof] } = await client.query('select usuario_id from professores where id = $1', [pedido.professor_id]);
    await historico.notificar(
      client,
      [prof.usuario_id],
      `Sua solicitação de ${pedido.tipo_solicitacao} de disponibilidade (${descrever(pedido)}) foi ${aprovar ? 'aprovada' : 'rejeitada'}.` +
        (aprovar ? ' A grade publicada não foi alterada automaticamente.' : '')
    );
    return depois;
  });
}

router.post('/:id/aprovar', exigirPerfil('coordenador'), validar({ params: paramsId }), async (req, res) => {
  res.json(await avaliar(req, true));
});

router.post('/:id/rejeitar', exigirPerfil('coordenador'), validar({ params: paramsId }), async (req, res) => {
  res.json(await avaliar(req, false));
});

module.exports = router;
