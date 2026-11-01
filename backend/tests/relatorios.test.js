const { api, auth, tokens, prepararBanco, pool } = require('./helpers');

let t;
let versaoId;
beforeAll(async () => {
  await prepararBanco();
  t = await tokens();
  const c = auth(t.coordenador);
  versaoId = (await api().post('/api/horarios/gerar').set(c).send({})).body.versao.id;
  await api().post(`/api/horarios/versoes/${versaoId}/revisao`).set(c);
  await api().post(`/api/horarios/versoes/${versaoId}/publicar`).set(c);
});
afterAll(() => pool.end());

describe('Relatórios, histórico e notificações', () => {
  test('relatórios e histórico são exclusivos do coordenador', async () => {
    for (const rota of ['/api/relatorios/resumo', '/api/relatorios/ocupacao-salas', '/api/historico']) {
      expect((await api().get(rota).set(auth(t.ana))).status).toBe(403);
      expect((await api().get(rota).set(auth(t.aluno))).status).toBe(403);
      expect((await api().get(rota).set(auth(t.coordenador))).status).toBe(200);
    }
  });

  test('ocupação de salas soma as aulas da versão publicada', async () => {
    const res = await api().get('/api/relatorios/ocupacao-salas').set(auth(t.coordenador));
    const total = res.body.salas.reduce((s, x) => s + x.aulas, 0);
    expect(total).toBe(res.body.versao.total_aulas);
    for (const s of res.body.salas) {
      expect(s.taxa_ocupacao).toBeGreaterThanOrEqual(0);
      expect(s.taxa_ocupacao).toBeLessThanOrEqual(1);
      expect(s.por_turno).toHaveLength(3);
    }
  });

  test('resumo traz contagens e a versão publicada', async () => {
    const res = await api().get('/api/relatorios/resumo').set(auth(t.coordenador));
    expect(res.body).toMatchObject({ turmas: 4, professores: 8, salas: 6, disciplinas: 10 });
    expect(res.body.versao_publicada.id).toBe(versaoId);
  });

  test('histórico registra geração e publicação com o usuário responsável', async () => {
    const res = await api().get('/api/historico?entidade=versoes_horario').set(auth(t.coordenador));
    const ops = res.body.map((h) => h.operacao);
    expect(ops).toEqual(expect.arrayContaining(['gerar', 'enviar_revisao', 'publicar']));
    expect(res.body[0].usuario).toBe('Helena Duarte');
  });

  test('cada usuário vê e marca apenas as próprias notificações', async () => {
    const aluno = auth(t.aluno);
    const lista = (await api().get('/api/notificacoes').set(aluno)).body;
    expect(lista[0].mensagem).toMatch(/Nova grade oficial publicada/);
    expect((await api().post(`/api/notificacoes/${lista[0].id}/lida`).set(aluno)).status).toBe(204);
    // Notificação de outro usuário: 404 (não revela existência)
    const daAna = (await api().get('/api/notificacoes').set(auth(t.ana))).body[0];
    expect((await api().post(`/api/notificacoes/${daAna.id}/lida`).set(aluno)).status).toBe(404);
    expect((await api().post('/api/notificacoes/lidas').set(aluno)).status).toBe(204);
    expect((await api().get('/api/notificacoes').set(aluno)).body.every((n) => n.lida)).toBe(true);
  });

  test('grade publicada pode ser consultada por sala/turma por qualquer perfil, nunca rascunhos', async () => {
    const res = await api().get('/api/horarios/publicados?sala_id=1').set(auth(t.aluno));
    expect(res.status).toBe(200);
    expect(res.body.versao.status).toBe('publicada');
    expect(new Set(res.body.aulas.map((a) => a.sala_id))).toEqual(new Set([1]));
    expect((await api().get('/api/horarios/publicados').set(auth(t.aluno))).status).toBe(400);
  });
});
