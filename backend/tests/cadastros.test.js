const { api, auth, tokens, tokenDe, prepararBanco, pool, query } = require('./helpers');

let t;
beforeAll(async () => {
  await prepararBanco();
  t = await tokens();
});
afterAll(() => pool.end());

describe('Consultas liberadas a todos os perfis (UC03)', () => {
  test.each(['/api/disciplinas', '/api/salas', '/api/turmas', '/api/turnos', '/api/periodos'])(
    'GET %s funciona para aluno, professor e coordenador; exige login',
    async (rota) => {
      for (const quem of ['aluno', 'ana', 'coordenador']) {
        const res = await api().get(rota).set(auth(t[quem]));
        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
      }
      expect((await api().get(rota)).status).toBe(401);
    }
  );

  test('seed atende ao cenário mínimo (3 turmas, 6 professores, 8 disciplinas, 5 salas)', async () => {
    const c = auth(t.coordenador);
    expect((await api().get('/api/turmas').set(c)).body.length).toBeGreaterThanOrEqual(3);
    expect((await api().get('/api/professores').set(c)).body.length).toBeGreaterThanOrEqual(6);
    expect((await api().get('/api/disciplinas').set(c)).body.length).toBeGreaterThanOrEqual(8);
    expect((await api().get('/api/salas').set(c)).body.length).toBeGreaterThanOrEqual(5);
  });

  test('turnos trazem as faixas com o intervalo da grade de exemplo', async () => {
    const res = await api().get('/api/turnos').set(auth(t.aluno));
    const manha = res.body.find((x) => x.nome === 'Manhã');
    expect(manha.faixas.map((f) => `${f.inicio}-${f.tipo}`)).toEqual([
      '08:00-aula', '09:00-aula', '10:00-intervalo', '10:20-aula', '11:20-aula',
    ]);
  });
});

describe('Cadastros exclusivos do coordenador (RN03)', () => {
  test.each([
    ['post', '/api/disciplinas', { nome: 'X', codigo: 'X1', carga_horaria: 10 }],
    ['post', '/api/salas', { identificacao: 'X', capacidade: 10 }],
    ['put', '/api/salas/1', { capacidade: 999 }],
    ['delete', '/api/salas/1', {}],
    ['post', '/api/turmas', { nome: 'X', turno_id: 1, periodo_letivo_id: 1, qtd_alunos: 1 }],
    ['post', '/api/turma-disciplinas', { turma_id: 1, disciplina_id: 10, professor_id: 2, carga_semanal: 2 }],
    ['post', '/api/usuarios', { nome: 'X', email: 'x@x.com', senha: '12345678', perfil: 'coordenador' }],
    ['get', '/api/usuarios', {}],
    ['get', '/api/professores', {}],
  ])('%s %s é negado (403) a aluno e professor', async (metodo, rota, corpo) => {
    for (const quem of ['aluno', 'ana']) {
      const res = await api()[metodo](rota).set(auth(t[quem])).send(corpo);
      expect(res.status).toBe(403);
    }
  });

  test('negativa não altera dados', async () => {
    const { rows } = await query("select capacidade from salas where id = 1");
    expect(rows[0].capacidade).toBe(45);
  });
});

describe('CRUD pelo coordenador', () => {
  let salaId;

  test('cria, consulta, altera e exclui sala registrando histórico (RN17)', async () => {
    const c = auth(t.coordenador);
    const criada = await api().post('/api/salas').set(c).send({ identificacao: 'Sala 201', capacidade: 35 });
    expect(criada.status).toBe(201);
    salaId = criada.body.id;

    const alterada = await api().put(`/api/salas/${salaId}`).set(c).send({ capacidade: 50 });
    expect(alterada.status).toBe(200);
    expect(alterada.body.capacidade).toBe(50);

    expect((await api().delete(`/api/salas/${salaId}`).set(c)).status).toBe(204);
    expect((await api().get(`/api/salas/${salaId}`).set(c)).status).toBe(404);

    const { rows } = await query(
      "select operacao, valores_alterados from historico_alteracoes where entidade = 'salas' and entidade_id = $1 order by id",
      [String(salaId)]
    );
    expect(rows.map((r) => r.operacao)).toEqual(['criar', 'alterar', 'excluir']);
    expect(rows[1].valores_alterados.antes.capacidade).toBe(35);
    expect(rows[1].valores_alterados.depois.capacidade).toBe(50);
  });

  test('validação de entrada retorna 400 com detalhes', async () => {
    const res = await api().post('/api/salas').set(auth(t.coordenador)).send({ identificacao: '', capacidade: -1 });
    expect(res.status).toBe(400);
    expect(res.body.detalhes.map((d) => d.campo).sort()).toEqual(['capacidade', 'identificacao']);
  });

  test('id inválido retorna 400; inexistente retorna 404', async () => {
    expect((await api().get('/api/salas/abc').set(auth(t.coordenador))).status).toBe(400);
    expect((await api().put('/api/salas/9999').set(auth(t.coordenador)).send({ capacidade: 1 })).status).toBe(404);
  });

  test('código de disciplina duplicado retorna 409', async () => {
    const res = await api().post('/api/disciplinas').set(auth(t.coordenador)).send({ nome: 'BD', codigo: 'bd101', carga_horaria: 10 });
    expect(res.status).toBe(409);
  });

  test('excluir turma com alunos retorna 409 (integridade referencial)', async () => {
    expect((await api().delete('/api/turmas/1').set(auth(t.coordenador))).status).toBe(409);
  });

  test('turno sobreposto a outro retorna 422', async () => {
    const res = await api().post('/api/turnos').set(auth(t.coordenador)).send({ nome: 'Integral', inicio: '11:00', fim: '14:00' });
    expect(res.status).toBe(422);
  });

  test('faixa fora do turno ou sobreposta retorna 422; válida é criada', async () => {
    const c = auth(t.coordenador);
    const turno = await api().post('/api/turnos').set(c).send({ nome: 'Sábado', inicio: '06:00', fim: '07:50' });
    expect(turno.status).toBe(201);
    const id = turno.body.id;
    expect((await api().post(`/api/turnos/${id}/faixas`).set(c).send({ ordem: 1, inicio: '05:00', fim: '06:00', tipo: 'aula' })).status).toBe(422);
    expect((await api().post(`/api/turnos/${id}/faixas`).set(c).send({ ordem: 1, inicio: '06:00', fim: '07:00', tipo: 'aula' })).status).toBe(201);
    expect((await api().post(`/api/turnos/${id}/faixas`).set(c).send({ ordem: 2, inicio: '06:30', fim: '07:30', tipo: 'aula' })).status).toBe(422);
  });

  test('período com início depois do fim retorna 422', async () => {
    const res = await api().post('/api/periodos').set(auth(t.coordenador)).send({ nome: '2027.1', inicio: '2027-06-01', fim: '2027-02-01', status_coleta: 'aberta' });
    expect(res.status).toBe(422);
  });

  test('vínculo turma-disciplina: cria, rejeita duplicado (409) e disciplina inexistente (409)', async () => {
    const c = auth(t.coordenador);
    const ok = await api().post('/api/turma-disciplinas').set(c).send({ turma_id: 4, disciplina_id: 9, professor_id: 6, carga_semanal: 2 });
    expect(ok.status).toBe(201);
    const dup = await api().post('/api/turma-disciplinas').set(c).send({ turma_id: 4, disciplina_id: 9, professor_id: 6, carga_semanal: 2 });
    expect(dup.status).toBe(409);
    const fk = await api().post('/api/turma-disciplinas').set(c).send({ turma_id: 4, disciplina_id: 999, professor_id: 6, carga_semanal: 2 });
    expect(fk.status).toBe(409);
    await api().delete(`/api/turma-disciplinas/${ok.body.id}`).set(c);
  });

  test('professor vê apenas os próprios vínculos; aluno apenas os da turma', async () => {
    const prof = await api().get('/api/turma-disciplinas').set(auth(t.ana));
    expect(prof.status).toBe(200);
    expect(new Set(prof.body.map((v) => v.professor))).toEqual(new Set(['Ana Souza']));
    // tenta burlar o filtro via query string
    const burla = await api().get('/api/turma-disciplinas?professor_id=3').set(auth(t.ana));
    expect(new Set(burla.body.map((v) => v.professor))).toEqual(new Set(['Ana Souza']));
    const aluno = await api().get('/api/turma-disciplinas').set(auth(t.aluno));
    expect(new Set(aluno.body.map((v) => v.turma))).toEqual(new Set(['ENG1-A']));
  });
});

describe('Usuários', () => {
  test('coordenador cria aluno, que consegue logar e tem perfil aluno', async () => {
    const res = await api().post('/api/usuarios').set(auth(t.coordenador)).send({
      nome: 'Novo Aluno', email: 'novo.aluno@aluno.sucelso.tech', senha: 'SenhaForte1', perfil: 'aluno', matricula: 'A2026999', turma_id: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.turma).toBe('ENG1-B');
    const token = await tokenDe('novo.aluno@aluno.sucelso.tech', 'SenhaForte1');
    const me = await api().get('/api/auth/me').set(auth(token));
    expect(me.body.perfil).toBe('aluno');
  });

  test('aluno sem turma é rejeitado (400); e-mail repetido 409; sem conta órfã', async () => {
    const c = auth(t.coordenador);
    const semTurma = await api().post('/api/usuarios').set(c).send({ nome: 'X Y', email: 'x@y.com', senha: '12345678', perfil: 'aluno', matricula: 'Z' });
    expect(semTurma.status).toBe(400);
    const repetido = await api().post('/api/usuarios').set(c).send({ nome: 'X Y', email: 'ana.souza@sucelso.tech', senha: '12345678', perfil: 'coordenador' });
    expect(repetido.status).toBe(409);
    // matrícula de professor duplicada: a conta criada no Auth deve ser desfeita
    const dupMatricula = await api().post('/api/usuarios').set(c).send({ nome: 'Prof X', email: 'prof.x@sucelso.tech', senha: '12345678', perfil: 'professor', matricula: 'P001' });
    expect(dupMatricula.status).toBe(409);
    const { rows } = await query("select 1 from auth.users where email = 'prof.x@sucelso.tech'");
    expect(rows).toHaveLength(0);
  });

  test('usuário desativado perde acesso (403)', async () => {
    const c = auth(t.coordenador);
    const lista = await api().get('/api/usuarios?perfil=aluno').set(c);
    const alvo = lista.body.find((u) => u.email === 'larissa.freitas@aluno.sucelso.tech');
    const token = await tokenDe(alvo.email);
    expect((await api().put(`/api/usuarios/${alvo.id}`).set(c).send({ ativo: false })).status).toBe(200);
    expect((await api().get('/api/disciplinas').set(auth(token))).status).toBe(403);
  });

  test('coordenador não pode excluir a si mesmo', async () => {
    const me = await api().get('/api/auth/me').set(auth(t.coordenador));
    expect((await api().delete(`/api/usuarios/${me.body.id}`).set(auth(t.coordenador))).status).toBe(422);
  });
});
