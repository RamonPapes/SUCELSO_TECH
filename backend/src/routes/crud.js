const { Router } = require('express');
const { query, transaction } = require('../db/pool');
const { autenticar, exigirPerfil } = require('../middlewares/auth');
const { HttpError } = require('../middlewares/erros');
const { validar, paramsId } = require('../middlewares/validar');
const historico = require('../services/historico');

// CRUD padrão: leitura para qualquer usuário autenticado, escrita somente para o coordenador (RN03).
// `schema` é um z.object cujas chaves são exatamente as colunas graváveis da tabela.
// `antesDeGravar(client, dados, id)` permite validações de regra de negócio adicionais.
function crud({ tabela, schema, select = `select * from ${tabela} x`, ordem = 'x.id', leitura = [], antesDeGravar }) {
  const router = Router();
  const perfisLeitura = leitura.length ? [exigirPerfil(...leitura)] : [];

  async function buscar(client, id) {
    const { rows } = await client.query(`${select} where x.id = $1`, [id]);
    return rows[0];
  }

  router.get('/', autenticar, ...perfisLeitura, async (req, res) => {
    const { rows } = await query(`${select} order by ${ordem}`);
    res.json(rows);
  });

  router.get('/:id', autenticar, ...perfisLeitura, validar({ params: paramsId }), async (req, res) => {
    const item = await buscar({ query }, req.dados.params.id);
    if (!item) throw new HttpError(404, 'Registro não encontrado');
    res.json(item);
  });

  router.post('/', autenticar, exigirPerfil('coordenador'), validar({ body: schema }), async (req, res) => {
    const dados = req.dados.body;
    const item = await transaction(async (client) => {
      if (antesDeGravar) await antesDeGravar(client, dados, null);
      const cols = Object.keys(dados);
      const { rows } = await client.query(
        `insert into ${tabela} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
        cols.map((c) => dados[c])
      );
      const novo = await buscar(client, rows[0].id);
      await historico.registrar(client, req.user.id, tabela, novo.id, 'criar', { depois: novo });
      return novo;
    });
    res.status(201).json(item);
  });

  router.put(
    '/:id',
    autenticar,
    exigirPerfil('coordenador'),
    validar({ params: paramsId, body: schema.partial() }),
    async (req, res) => {
      const { id } = req.dados.params;
      const dados = req.dados.body;
      const cols = Object.keys(dados);
      if (!cols.length) throw new HttpError(400, 'Nenhum campo para atualizar');
      const item = await transaction(async (client) => {
        const antes = await buscar(client, id);
        if (!antes) throw new HttpError(404, 'Registro não encontrado');
        if (antesDeGravar) await antesDeGravar(client, { ...antes, ...dados }, id);
        await client.query(
          `update ${tabela} set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1`,
          [id, ...cols.map((c) => dados[c])]
        );
        const depois = await buscar(client, id);
        await historico.registrar(client, req.user.id, tabela, id, 'alterar', { antes, depois });
        return depois;
      });
      res.json(item);
    }
  );

  router.delete('/:id', autenticar, exigirPerfil('coordenador'), validar({ params: paramsId }), async (req, res) => {
    const { id } = req.dados.params;
    await transaction(async (client) => {
      const antes = await buscar(client, id);
      if (!antes) throw new HttpError(404, 'Registro não encontrado');
      await client.query(`delete from ${tabela} where id = $1`, [id]);
      await historico.registrar(client, req.user.id, tabela, id, 'excluir', { antes });
    });
    res.status(204).end();
  });

  return router;
}

module.exports = { crud };
