const { ZodError } = require('zod');

class HttpError extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

// Erros do PostgreSQL que representam violações de integridade viram respostas HTTP legíveis.
const ERROS_PG = {
  23505: [409, 'Registro em conflito com outro já existente'],
  23503: [409, 'Operação viola a integridade referencial (registro relacionado inexistente ou em uso)'],
  23514: [400, 'Valor fora das regras permitidas'],
  '22P02': [400, 'Formato de valor inválido'],
  22007: [400, 'Data ou hora inválida'],
  22008: [400, 'Data ou hora inválida'],
};

function naoEncontrado(req, res) {
  res.status(404).json({ erro: `Rota ${req.method} ${req.path} não encontrada` });
}

// eslint-disable-next-line no-unused-vars
function tratarErros(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      erro: 'Dados inválidos',
      detalhes: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ erro: err.message, ...(err.detalhes && { detalhes: err.detalhes }) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON malformado' });
  }
  if (err.code && ERROS_PG[err.code]) {
    const [status, mensagem] = ERROS_PG[err.code];
    return res.status(status).json({ erro: mensagem, detalhes: err.constraint || err.detail });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ erro: err.message });
  }
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
}

module.exports = { HttpError, naoEncontrado, tratarErros };
