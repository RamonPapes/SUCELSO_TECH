const { Router } = require('express');
const { query, transaction } = require('../db/pool');
const { autenticar, exigirPerfil } = require('../middlewares/auth');
const { HttpError } = require('../middlewares/erros');
const { validar, z, id, hora, paramsId } = require('../middlewares/validar');
const historico = require('../services/historico');
const { crud } = require('./crud');

const texto = z.string().trim().min(1);
const data = z.iso.date();

const disciplinas = crud({
  tabela: 'disciplinas',
  schema: z.object({ nome: texto, codigo: texto.toUpperCase(), carga_horaria: z.number().int().positive() }),
  ordem: 'x.nome',
});

const salas = crud({
  tabela: 'salas',
  schema: z.object({ identificacao: texto, capacidade: z.number().int().positive() }),
  ordem: 'x.identificacao',
});

const periodos = crud({
  tabela: 'periodos_letivos',
  schema: z.object({ nome: texto, inicio: data, fim: data, status_coleta: z.enum(['aberta', 'fechada']) }),
  select: `select x.id, x.nome, to_char(x.inicio, 'YYYY-MM-DD') as inicio, to_char(x.fim, 'YYYY-MM-DD') as fim,
                  x.status_coleta,
                  exists (select 1 from versoes_horario v where v.periodo_letivo_id = x.id and v.status = 'publicada') as tem_publicada
             from periodos_letivos x`,
  ordem: 'x.inicio desc',
  antesDeGravar: async (client, d) => {
    if (d.inicio >= d.fim) throw new HttpError(422, 'A data de início deve ser anterior à data de fim');
  },
});

const turmas = crud({
  tabela: 'turmas',
  schema: z.object({ nome: texto, turno_id: id, periodo_letivo_id: id, qtd_alunos: z.number().int().min(0) }),
  select: `select x.*, t.nome as turno, p.nome as periodo
             from turmas x join turnos t on t.id = x.turno_id join periodos_letivos p on p.id = x.periodo_letivo_id`,
  ordem: 'p.nome desc, x.nome',
});

// Turnos não podem se sobrepor: é o que garante que choques ocorrem sempre na mesma faixa.
const turnos = crud({
  tabela: 'turnos',
  schema: z.object({ nome: texto, inicio: hora, fim: hora }),
  select: `select x.*, coalesce((select json_agg(json_build_object('id', f.id, 'ordem', f.ordem,
                    'inicio', to_char(f.inicio, 'HH24:MI'), 'fim', to_char(f.fim, 'HH24:MI'), 'tipo', f.tipo)
                    order by f.inicio) from faixas_horario f where f.turno_id = x.id), '[]') as faixas
             from turnos x`,
  ordem: 'x.inicio',
  antesDeGravar: async (client, d, idAtual) => {
    if (d.inicio >= d.fim) throw new HttpError(422, 'O início do turno deve ser anterior ao fim');
    const { rows } = await client.query(
      `select nome from turnos where id <> coalesce($3, 0) and inicio < $2::time and fim > $1::time`,
      [d.inicio, d.fim, idAtual]
    );
    if (rows[0]) throw new HttpError(422, `Turno sobrepõe o turno ${rows[0].nome}`);
  },
});

// Faixas de horário (aulas e intervalos) dentro de um turno.
const faixas = Router();
const schemaFaixa = z.object({ ordem: z.number().int().min(1), inicio: hora, fim: hora, tipo: z.enum(['aula', 'intervalo']) });

async function validarFaixa(client, turnoId, d, idAtual) {
  const { rows: [turno] } = await client.query(
    `select to_char(inicio, 'HH24:MI') as inicio, to_char(fim, 'HH24:MI') as fim from turnos where id = $1`,
    [turnoId]
  );
  if (!turno) throw new HttpError(404, 'Turno não encontrado');
  if (d.inicio >= d.fim) throw new HttpError(422, 'O início da faixa deve ser anterior ao fim');
  if (d.inicio < turno.inicio || d.fim > turno.fim) {
    throw new HttpError(422, `A faixa deve estar dentro do turno (${turno.inicio}–${turno.fim})`);
  }
  const { rows } = await client.query(
    `select 1 from faixas_horario where turno_id = $1 and id <> coalesce($4, 0) and inicio < $3::time and fim > $2::time`,
    [turnoId, d.inicio, d.fim, idAtual]
  );
  if (rows[0]) throw new HttpError(422, 'A faixa sobrepõe outra faixa do turno');
}

faixas.post(
  '/turnos/:id/faixas',
  autenticar,
  exigirPerfil('coordenador'),
  validar({ params: paramsId, body: schemaFaixa }),
  async (req, res) => {
    const turnoId = req.dados.params.id;
    const d = req.dados.body;
    const faixa = await transaction(async (client) => {
      await validarFaixa(client, turnoId, d, null);
      const { rows } = await client.query(
        `insert into faixas_horario (turno_id, ordem, inicio, fim, tipo) values ($1, $2, $3, $4, $5) returning *`,
        [turnoId, d.ordem, d.inicio, d.fim, d.tipo]
      );
      await historico.registrar(client, req.user.id, 'faixas_horario', rows[0].id, 'criar', { depois: rows[0] });
      return rows[0];
    });
    res.status(201).json(faixa);
  }
);

faixas.put(
  '/faixas/:id',
  autenticar,
  exigirPerfil('coordenador'),
  validar({ params: paramsId, body: schemaFaixa.partial() }),
  async (req, res) => {
    const faixa = await transaction(async (client) => {
      const { rows: [antes] } = await client.query('select * from faixas_horario where id = $1', [req.dados.params.id]);
      if (!antes) throw new HttpError(404, 'Faixa não encontrada');
      const d = { ...antes, ...req.dados.body };
      await validarFaixa(client, antes.turno_id, d, antes.id);
      const { rows: [depois] } = await client.query(
        `update faixas_horario set ordem = $2, inicio = $3, fim = $4, tipo = $5 where id = $1 returning *`,
        [antes.id, d.ordem, d.inicio, d.fim, d.tipo]
      );
      await historico.registrar(client, req.user.id, 'faixas_horario', antes.id, 'alterar', { antes, depois });
      return depois;
    });
    res.json(faixa);
  }
);

faixas.delete('/faixas/:id', autenticar, exigirPerfil('coordenador'), validar({ params: paramsId }), async (req, res) => {
  await transaction(async (client) => {
    const { rows: [antes] } = await client.query('delete from faixas_horario where id = $1 returning *', [req.dados.params.id]);
    if (!antes) throw new HttpError(404, 'Faixa não encontrada');
    await historico.registrar(client, req.user.id, 'faixas_horario', antes.id, 'excluir', { antes });
  });
  res.status(204).end();
});

// Vínculos turma × disciplina × professor. Professor vê os próprios, aluno vê os da turma.
const schemaVinculo = z.object({
  turma_id: id,
  disciplina_id: id,
  professor_id: id,
  carga_semanal: z.number().int().min(1).max(30),
});
const vinculosCrud = crud({ tabela: 'turma_disciplinas', schema: schemaVinculo, leitura: ['coordenador'] });
const vinculos = Router();
const SELECT_VINCULOS = `
  select td.id, td.turma_id, t.nome as turma, td.disciplina_id, d.nome as disciplina, d.codigo,
         td.professor_id, u.nome as professor, td.carga_semanal, tu.nome as turno
    from turma_disciplinas td
    join turmas t on t.id = td.turma_id
    join turnos tu on tu.id = t.turno_id
    join disciplinas d on d.id = td.disciplina_id
    join professores p on p.id = td.professor_id
    join usuarios u on u.id = p.usuario_id`;

vinculos.get(
  '/',
  autenticar,
  validar({ query: z.object({ turma_id: id.optional(), professor_id: id.optional() }) }),
  async (req, res) => {
    const filtros = { ...req.dados.query };
    if (req.user.perfil === 'aluno') filtros.turma_id = req.user.turma_id;
    if (req.user.perfil === 'professor') filtros.professor_id = req.user.professor_id;
    const { rows } = await query(
      `${SELECT_VINCULOS}
       where ($1::bigint is null or td.turma_id = $1) and ($2::bigint is null or td.professor_id = $2)
       order by t.nome, d.nome`,
      [filtros.turma_id ?? null, filtros.professor_id ?? null]
    );
    res.json(rows);
  }
);
vinculos.use(vinculosCrud);

// Professores (para selects do coordenador).
const professores = Router();
professores.get('/', autenticar, exigirPerfil('coordenador'), async (req, res) => {
  const { rows } = await query(
    `select p.id, p.matricula, u.id as usuario_id, u.nome, u.email, u.perfil, u.ativo
       from professores p join usuarios u on u.id = p.usuario_id order by u.nome`
  );
  res.json(rows);
});

module.exports = { disciplinas, salas, periodos, turmas, turnos, faixas, vinculos, professores };
