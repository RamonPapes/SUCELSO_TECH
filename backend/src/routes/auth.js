const { Router } = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { autenticar } = require('../middlewares/auth');
const { HttpError } = require('../middlewares/erros');
const { validar, z } = require('../middlewares/validar');

const router = Router();

router.get('/me', autenticar, (req, res) => {
  res.json(req.user);
});

// Login local SEM Supabase, apenas para desenvolvimento e testes automatizados.
// Desligado quando NODE_ENV=production ou DEV_LOGIN != true. Em produção o login é feito pelo
// frontend diretamente no Supabase Auth, e a API apenas valida o token recebido.
if (config.devLogin && config.supabaseJwtSecret) {
  router.post(
    '/dev-login',
    validar({ body: z.object({ email: z.email(), senha: z.string().min(1) }) }),
    async (req, res) => {
      const { email, senha } = req.dados.body;
      const { rows } = await query(
        `select id from auth.users where email = $1 and encrypted_password = crypt($2, encrypted_password)`,
        [email, senha]
      );
      if (!rows[0]) throw new HttpError(401, 'E-mail ou senha inválidos');
      const token = jwt.sign({ sub: rows[0].id, email, role: 'authenticated' }, config.supabaseJwtSecret, {
        audience: 'authenticated',
        expiresIn: '8h',
      });
      res.json({ access_token: token, token_type: 'bearer' });
    }
  );
}

module.exports = router;
