const jwt = require('jsonwebtoken');
const { api, auth, tokens, prepararBanco, pool } = require('./helpers');

let t;
beforeAll(async () => {
  await prepararBanco();
  t = await tokens();
});
afterAll(() => pool.end());

describe('Autenticação (RF01, RF02)', () => {
  test('health check responde e consulta o banco', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('login com senha errada retorna 401', async () => {
    const res = await api().post('/api/auth/dev-login').send({ email: 'ana.souza@sucelso.tech', senha: 'errada' });
    expect(res.status).toBe(401);
  });

  test('login com e-mail inválido retorna 400', async () => {
    const res = await api().post('/api/auth/dev-login').send({ email: 'nao-e-email', senha: 'x' });
    expect(res.status).toBe(400);
  });

  test('/api/me sem token retorna 401', async () => {
    const res = await api().get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('token adulterado retorna 401', async () => {
    const [h, p, s] = t.aluno.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    // tentativa de escalar privilégio alterando o payload sem re-assinar
    const falso = Buffer.from(JSON.stringify({ ...payload, role: 'service_role' })).toString('base64url');
    const res = await api().get('/api/auth/me').set(auth(`${h}.${falso}.${s}`));
    expect(res.status).toBe(401);
  });

  test('token assinado com outro segredo retorna 401', async () => {
    const token = jwt.sign({ sub: '00000000-0000-0000-0000-000000000000' }, 'outro-segredo', { audience: 'authenticated' });
    const res = await api().get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(401);
  });

  test('token expirado retorna 401', async () => {
    const token = jwt.sign({ sub: '00000000-0000-0000-0000-000000000000', exp: 1 }, process.env.SUPABASE_JWT_SECRET, { audience: 'authenticated' });
    const res = await api().get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(401);
  });

  test('token válido de usuário sem cadastro em usuarios retorna 403', async () => {
    const token = jwt.sign({ sub: '00000000-0000-0000-0000-000000000000' }, process.env.SUPABASE_JWT_SECRET, { audience: 'authenticated' });
    const res = await api().get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(403);
  });

  test.each([
    ['coordenador', 'coordenador'],
    ['ana', 'professor'],
    ['aluno', 'aluno'],
  ])('/api/auth/me identifica o perfil de %s', async (chave, perfil) => {
    const res = await api().get('/api/auth/me').set(auth(t[chave]));
    expect(res.status).toBe(200);
    expect(res.body.perfil).toBe(perfil);
  });

  test('aluno traz a turma; professor traz professor_id', async () => {
    const aluno = await api().get('/api/auth/me').set(auth(t.aluno));
    expect(aluno.body.turma_id).toEqual(expect.any(Number));
    const prof = await api().get('/api/auth/me').set(auth(t.ana));
    expect(prof.body.professor_id).toEqual(expect.any(Number));
  });

  test('rota inexistente retorna 404 e JSON malformado retorna 400', async () => {
    expect((await api().get('/api/nao-existe')).status).toBe(404);
    const res = await api().post('/api/auth/dev-login').set('Content-Type', 'application/json').send('{"x":');
    expect(res.status).toBe(400);
  });

  test('CORS só libera a origem configurada', async () => {
    const ok = await api().get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bloqueado = await api().get('/api/health').set('Origin', 'https://malicioso.example');
    expect(bloqueado.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('login de desenvolvimento não existe com NODE_ENV=production', async () => {
    const request = require('supertest');
    let appProd;
    let poolProd;
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.isolateModules(() => {
      appProd = require('../src/app');
      poolProd = require('../src/db/pool').pool;
    });
    process.env.NODE_ENV = anterior;
    const res = await request(appProd).post('/api/auth/dev-login').send({ email: 'coordenacao@sucelso.tech', senha: 'Sucelso@2026' });
    expect(res.status).toBe(404);
    await poolProd.end();
  });
});
