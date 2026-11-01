const { Router } = require('express');
const { query, pool, transaction } = require('../db/pool');
const { autenticar, exigirPerfil } = require('../middlewares/auth');
const { HttpError } = require('../middlewares/erros');
const { validar, z, id, paramsId } = require('../middlewares/validar');
const authAdmin = require('../services/authAdmin');
const historico = require('../services/historico');

// Administração de usuários (alunos, professores e coordenadores): somente coordenador.
const router = Router();
router.use(autenticar, exigirPerfil('coordenador'));

const SELECT = `
  select u.id, u.nome, u.email, u.perfil, u.ativo, u.criado_em,
         p.id as professor_id, coalesce(p.matricula, a.matricula) as matricula,
         a.id as aluno_id, a.turma_id, t.nome as turma
    from usuarios u
    left join professores p on p.usuario_id = u.id
    left join alunos a on a.usuario_id = u.id
    left join turmas t on t.id = a.turma_id`;

async function buscar(client, usuarioId) {
  const { rows } = await client.query(`${SELECT} where u.id = $1`, [usuarioId]);
  return rows[0];
}

router.get(
  '/',
  validar({ query: z.object({ perfil: z.enum(['aluno', 'professor', 'coordenador']).optional() }) }),
  async (req, res) => {
    const { rows } = await query(`${SELECT} where ($1::perfil_usuario is null or u.perfil = $1) order by u.perfil, u.nome`, [
      req.dados.query.perfil ?? null,
    ]);
    res.json(rows);
  }
);

const schemaNovo = z
  .object({
    nome: z.string().trim().min(2),
    email: z.email().toLowerCase(),
    senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
    perfil: z.enum(['aluno', 'professor', 'coordenador']),
    matricula: z.string().trim().min(1).optional(),
    turma_id: id.optional(),
    docente: z.boolean().optional(), // coordenador que também leciona
  })
  .refine((d) => d.perfil !== 'aluno' || (d.turma_id && d.matricula), {
    message: 'Aluno exige matrícula e turma',
    path: ['turma_id'],
  })
  .refine((d) => d.perfil !== 'professor' || d.matricula, { message: 'Professor exige matrícula', path: ['matricula'] });

router.post('/', validar({ body: schemaNovo }), async (req, res) => {
  const d = req.dados.body;
  const { rows: existente } = await query('select 1 from usuarios where email = $1', [d.email]);
  if (existente[0]) throw new HttpError(409, 'Já existe um usuário com este e-mail');

  // A conta de login é criada fora da transação (no Supabase é uma chamada HTTP) e desfeita se o cadastro falhar.
  const contaId = await authAdmin.criarConta(pool, d.email, d.senha);
  try {
    const usuario = await transaction(async (client) => {
      await client.query('insert into usuarios (id, nome, email, perfil) values ($1, $2, $3, $4)', [
        contaId, d.nome, d.email, d.perfil,
      ]);
      if (d.perfil === 'professor' || (d.perfil === 'coordenador' && d.docente)) {
        if (!d.matricula) throw new HttpError(400, 'Docente exige matrícula');
        await client.query('insert into professores (usuario_id, matricula) values ($1, $2)', [contaId, d.matricula]);
      }
      if (d.perfil === 'aluno') {
        await client.query('insert into alunos (usuario_id, matricula, turma_id) values ($1, $2, $3)', [
          contaId, d.matricula, d.turma_id,
        ]);
      }
      const novo = await buscar(client, contaId);
      await historico.registrar(client, req.user.id, 'usuarios', contaId, 'criar', { depois: novo });
      return novo;
    });
    res.status(201).json(usuario);
  } catch (err) {
    await authAdmin.removerConta(pool, contaId).catch(() => {});
    throw err;
  }
});

const schemaEdicao = z.object({
  nome: z.string().trim().min(2).optional(),
  ativo: z.boolean().optional(),
  matricula: z.string().trim().min(1).optional(),
  turma_id: id.optional(),
});

router.put('/:id', validar({ params: z.object({ id: z.uuid() }), body: schemaEdicao }), async (req, res) => {
  const usuarioId = req.dados.params.id;
  const d = req.dados.body;
  if (usuarioId === req.user.id && d.ativo === false) throw new HttpError(422, 'Você não pode desativar o próprio usuário');
  const usuario = await transaction(async (client) => {
    const antes = await buscar(client, usuarioId);
    if (!antes) throw new HttpError(404, 'Usuário não encontrado');
    if (d.nome !== undefined || d.ativo !== undefined) {
      await client.query('update usuarios set nome = coalesce($2, nome), ativo = coalesce($3, ativo) where id = $1', [
        usuarioId, d.nome ?? null, d.ativo ?? null,
      ]);
    }
    if (d.matricula !== undefined && antes.professor_id) {
      await client.query('update professores set matricula = $2 where usuario_id = $1', [usuarioId, d.matricula]);
    }
    if (antes.aluno_id && (d.matricula !== undefined || d.turma_id !== undefined)) {
      await client.query(
        'update alunos set matricula = coalesce($2, matricula), turma_id = coalesce($3, turma_id) where usuario_id = $1',
        [usuarioId, d.matricula ?? null, d.turma_id ?? null]
      );
    }
    const depois = await buscar(client, usuarioId);
    await historico.registrar(client, req.user.id, 'usuarios', usuarioId, 'alterar', { antes, depois });
    return depois;
  });
  res.json(usuario);
});

router.delete('/:id', validar({ params: z.object({ id: z.uuid() }) }), async (req, res) => {
  const usuarioId = req.dados.params.id;
  if (usuarioId === req.user.id) throw new HttpError(422, 'Você não pode excluir o próprio usuário');
  await transaction(async (client) => {
    const antes = await buscar(client, usuarioId);
    if (!antes) throw new HttpError(404, 'Usuário não encontrado');
    // Docente com vínculos/aulas não pode ser removido (FK restrict) — desative-o em vez disso.
    await client.query('delete from usuarios where id = $1', [usuarioId]);
    await historico.registrar(client, req.user.id, 'usuarios', usuarioId, 'excluir', { antes });
  });
  await authAdmin.removerConta(pool, usuarioId);
  res.status(204).end();
});

module.exports = router;
