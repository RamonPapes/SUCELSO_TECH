const { z } = require('zod');

// Valida body/query/params com zod e expõe os valores convertidos em req.dados.
function validar({ body, query, params }) {
  return (req, res, next) => {
    req.dados = {
      body: body ? body.parse(req.body ?? {}) : req.body,
      query: query ? query.parse(req.query) : req.query,
      params: params ? params.parse(req.params) : req.params,
    };
    next();
  };
}

const id = z.coerce.number().int().positive();
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');
const dia = z.coerce.number().int().min(1, 'Dia entre 1 (segunda) e 5 (sexta)').max(5, 'Dia entre 1 (segunda) e 5 (sexta)');
const paramsId = z.object({ id });

module.exports = { validar, z, id, hora, dia, paramsId };
