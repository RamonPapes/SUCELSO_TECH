const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const authAdmin = require('../services/authAdmin');
const { HttpError } = require('./erros');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function idDoToken(token) {
  if (config.supabaseJwtSecret) {
    try {
      const payload = jwt.verify(token, config.supabaseJwtSecret, { algorithms: ['HS256'], audience: 'authenticated' });
      return payload.sub;
    } catch {
      return null;
    }
  }
  return authAdmin.usuarioDoToken(token);
}

// RF02: identifica o usuário pelo token do Supabase Auth e carrega o perfil do banco.
async function autenticar(req, res, next) {
  const [tipo, token] = (req.get('authorization') || '').split(' ');
  if (tipo !== 'Bearer' || !token) throw new HttpError(401, 'Token de acesso ausente');

  const id = await idDoToken(token);
  if (!id || !UUID.test(id)) throw new HttpError(401, 'Token inválido ou expirado');

  const { rows } = await query(
    `select u.id, u.nome, u.email, u.perfil, u.ativo, p.id as professor_id, a.id as aluno_id, a.turma_id
       from usuarios u
       left join professores p on p.usuario_id = u.id
       left join alunos a on a.usuario_id = u.id
      where u.id = $1`,
    [id]
  );
  const usuario = rows[0];
  if (!usuario || !usuario.ativo) throw new HttpError(403, 'Usuário sem cadastro ativo no sistema');
  req.user = usuario;
  next();
}

// RN01–RN03: autorização por perfil, aplicada em cada rota.
function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!perfis.includes(req.user.perfil)) {
      throw new HttpError(403, 'Seu perfil não tem permissão para esta operação');
    }
    next();
  };
}

module.exports = { autenticar, exigirPerfil };
