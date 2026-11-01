const { api, auth, tokens, prepararBanco, pool, query } = require('./helpers');

let t;
beforeAll(async () => {
  await prepararBanco();
  t = await tokens();
});
afterAll(() => pool.end());

const minhas = async (quem) => (await api().get('/api/disponibilidades').set(auth(t[quem]))).body;

describe('Disponibilidade durante a coleta (RF05, RN05)', () => {
  test('cenário 2: Carla tem disponibilidade somente às segundas e quartas', async () => {
    const lista = await minhas('carla');
    expect(new Set(lista.filter((d) => d.status === 'vigente').map((d) => d.dia))).toEqual(new Set([1, 3]));
  });

  test('aluno não acessa disponibilidades (403)', async () => {
    expect((await api().get('/api/disponibilidades').set(auth(t.aluno))).status).toBe(403);
    expect((await api().post('/api/disponibilidades').set(auth(t.aluno)).send({ dia: 1, inicio: '08:00', fim: '09:00' })).status).toBe(403);
  });

  test('professor vê apenas as próprias, mesmo filtrando por outro professor', async () => {
    const res = await api().get('/api/disponibilidades?professor_id=2').set(auth(t.carla));
    expect(new Set(res.body.map((d) => d.professor))).toEqual(new Set(['Carla Mendes']));
  });

  let novaId;
  test('com a coleta aberta a inclusão é imediata (vigente, 201)', async () => {
    const res = await api().post('/api/disponibilidades').set(auth(t.carla)).send({ dia: 3, inicio: '13:00', fim: '15:00' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('vigente');
    novaId = res.body.id;
  });

  test('alteração durante a coleta também é imediata (200)', async () => {
    const res = await api().put(`/api/disponibilidades/${novaId}`).set(auth(t.carla)).send({ dia: 3, inicio: '13:00', fim: '17:20' });
    expect(res.status).toBe(200);
    expect(res.body.fim).toBe('17:20');
  });

  test('validações: dia inválido e início >= fim (400); sobreposição (422)', async () => {
    const c = auth(t.carla);
    expect((await api().post('/api/disponibilidades').set(c).send({ dia: 6, inicio: '08:00', fim: '09:00' })).status).toBe(400);
    expect((await api().post('/api/disponibilidades').set(c).send({ dia: 2, inicio: '10:00', fim: '09:00' })).status).toBe(400);
    expect((await api().post('/api/disponibilidades').set(c).send({ dia: 2, inicio: '8h', fim: '09:00' })).status).toBe(400);
    const sobre = await api().post('/api/disponibilidades').set(c).send({ dia: 1, inicio: '11:00', fim: '13:00' });
    expect(sobre.status).toBe(422);
  });

  test('RN02: professor não altera nem exclui disponibilidade de outro professor (403)', async () => {
    const daAna = (await minhas('ana'))[0];
    expect((await api().put(`/api/disponibilidades/${daAna.id}`).set(auth(t.carla)).send({ dia: 1, inicio: '08:00', fim: '09:00' })).status).toBe(403);
    expect((await api().delete(`/api/disponibilidades/${daAna.id}`).set(auth(t.carla))).status).toBe(403);
    const { rows } = await query('select inicio, status from disponibilidades where id = $1', [daAna.id]);
    expect(rows[0]).toEqual({ inicio: daAna.inicio, status: 'vigente' });
  });

  test('exclusão durante a coleta inativa a disponibilidade', async () => {
    expect((await api().delete(`/api/disponibilidades/${novaId}`).set(auth(t.carla))).status).toBe(204);
    const { rows } = await query('select status from disponibilidades where id = $1', [novaId]);
    expect(rows[0].status).toBe('inativa');
  });
});

describe('Disponibilidade com a coleta encerrada (RN05, RN06)', () => {
  beforeAll(async () => {
    const res = await api().put('/api/periodos/1').set(auth(t.coordenador)).send({ status_coleta: 'fechada' });
    expect(res.status).toBe(200);
  });

  let inclusaoId, alteracaoId, remocaoId, originalId;

  test('inclusão vira solicitação pendente (202) e notifica a coordenação', async () => {
    const res = await api().post('/api/disponibilidades').set(auth(t.carla)).send({ dia: 5, inicio: '08:00', fim: '12:20' });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'pendente', tipo_solicitacao: 'inclusao' });
    inclusaoId = res.body.id;
    const { rows } = await query(
      `select n.mensagem from notificacoes n join usuarios u on u.id = n.usuario_id where u.perfil = 'coordenador'`
    );
    expect(rows.some((r) => r.mensagem.includes('Carla Mendes'))).toBe(true);
  });

  test('alteração vira solicitação; a disponibilidade vigente permanece intacta', async () => {
    const original = (await minhas('carla')).find((d) => d.status === 'vigente' && d.dia === 3);
    originalId = original.id;
    const res = await api().put(`/api/disponibilidades/${original.id}`).set(auth(t.carla)).send({ dia: 3, inicio: '08:00', fim: '10:00' });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ tipo_solicitacao: 'alteracao', substitui_id: original.id });
    alteracaoId = res.body.id;
    const { rows } = await query('select status, to_char(fim, \'HH24:MI\') fim from disponibilidades where id = $1', [original.id]);
    expect(rows[0]).toEqual({ status: 'vigente', fim: '12:20' });
  });

  test('segunda solicitação para a mesma disponibilidade retorna 409', async () => {
    const res = await api().put(`/api/disponibilidades/${originalId}`).set(auth(t.carla)).send({ dia: 3, inicio: '09:00', fim: '10:00' });
    expect(res.status).toBe(409);
  });

  test('remoção vira solicitação', async () => {
    const seg = (await minhas('carla')).find((d) => d.status === 'vigente' && d.dia === 1);
    const res = await api().delete(`/api/disponibilidades/${seg.id}`).set(auth(t.carla));
    expect(res.status).toBe(202);
    expect(res.body.tipo_solicitacao).toBe('remocao');
    remocaoId = res.body.id;
  });

  test('professor não aprova a própria solicitação (403)', async () => {
    expect((await api().post(`/api/disponibilidades/${inclusaoId}/aprovar`).set(auth(t.carla))).status).toBe(403);
  });

  test('coordenador aprova inclusão e alteração; a original vira inativa', async () => {
    const c = auth(t.coordenador);
    expect((await api().post(`/api/disponibilidades/${inclusaoId}/aprovar`).set(c)).body.status).toBe('vigente');
    expect((await api().post(`/api/disponibilidades/${alteracaoId}/aprovar`).set(c)).body.status).toBe('vigente');
    const { rows } = await query('select status from disponibilidades where id = $1', [originalId]);
    expect(rows[0].status).toBe('inativa');
    const { rows: notif } = await query(
      `select mensagem from notificacoes n join usuarios u on u.id = n.usuario_id where u.email = 'carla.mendes@sucelso.tech'`
    );
    expect(notif.some((n) => n.mensagem.includes('aprovada'))).toBe(true);
  });

  test('coordenador rejeita a remoção; avaliar de novo retorna 409', async () => {
    const c = auth(t.coordenador);
    expect((await api().post(`/api/disponibilidades/${remocaoId}/rejeitar`).set(c)).body.status).toBe('rejeitada');
    expect((await api().post(`/api/disponibilidades/${remocaoId}/aprovar`).set(c)).status).toBe(409);
  });

  test('professor pode cancelar uma solicitação pendente', async () => {
    const res = await api().post('/api/disponibilidades').set(auth(t.carla)).send({ dia: 2, inicio: '08:00', fim: '09:00' });
    expect(res.status).toBe(202);
    expect((await api().delete(`/api/disponibilidades/${res.body.id}`).set(auth(t.carla))).status).toBe(204);
  });

  test('coordenador-docente altera a própria disponibilidade diretamente', async () => {
    const res = await api().post('/api/disponibilidades').set(auth(t.coordenador)).send({ dia: 4, inicio: '08:00', fim: '10:00' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('vigente');
  });

  test('histórico registra solicitações e avaliações (RN17)', async () => {
    const { rows } = await query(`select distinct operacao from historico_alteracoes where entidade = 'disponibilidades'`);
    const ops = rows.map((r) => r.operacao);
    expect(ops).toEqual(expect.arrayContaining(['solicitar_inclusao', 'solicitar_alteracao', 'solicitar_remocao', 'aprovar', 'rejeitar']));
  });
});
