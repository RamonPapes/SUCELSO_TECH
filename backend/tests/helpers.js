const request = require('supertest');
const app = require('../src/app');
const { pool, query } = require('../src/db/pool');
const { setup } = require('../scripts/db-setup');
const { seed, SENHA_PADRAO } = require('../scripts/seed');

const EMAILS = {
  coordenador: 'coordenacao@sucelso.tech',
  ana: 'ana.souza@sucelso.tech',
  bruno: 'bruno.lima@sucelso.tech',
  carla: 'carla.mendes@sucelso.tech',
  aluno: 'lucas.pereira@aluno.sucelso.tech', // ENG1-A
  alunoNoite: 'pedro.almeida@aluno.sucelso.tech', // ENG3-N
};

async function prepararBanco() {
  const log = console.log;
  console.log = () => {};
  try {
    await setup({ reset: true, local: true });
    await seed();
  } finally {
    console.log = log;
  }
}

async function tokenDe(chave, senha = SENHA_PADRAO) {
  const res = await request(app).post('/api/auth/dev-login').send({ email: EMAILS[chave] || chave, senha });
  if (res.status !== 200) throw new Error(`login falhou para ${chave}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.access_token;
}

// Tokens de todos os perfis usados nos testes.
async function tokens() {
  const t = {};
  for (const chave of Object.keys(EMAILS)) t[chave] = await tokenDe(chave);
  return t;
}

const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { api, auth, tokens, tokenDe, prepararBanco, pool, query, EMAILS };
