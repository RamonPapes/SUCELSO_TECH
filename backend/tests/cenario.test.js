// Cenário obrigatório de validação (seção 10 do enunciado), executado ponta a ponta pela API.
const { api, auth, tokens, prepararBanco, pool, query } = require('./helpers');

let t;
let versaoId;
let versao2Id;
beforeAll(async () => {
  await prepararBanco();
  t = await tokens();
});
afterAll(() => pool.end());

const c = () => auth(t.coordenador);

describe('Cenário obrigatório de validação', () => {
  test('1. dados fictícios: ≥ 3 turmas, 6 professores, 8 disciplinas e 5 salas', async () => {
    const [turmas, profs, discs, salas] = await Promise.all(
      ['/api/turmas', '/api/professores', '/api/disciplinas', '/api/salas'].map((r) => api().get(r).set(c()))
    );
    expect(turmas.body.length).toBeGreaterThanOrEqual(3);
    expect(profs.body.length).toBeGreaterThanOrEqual(6);
    expect(discs.body.length).toBeGreaterThanOrEqual(8);
    expect(salas.body.length).toBeGreaterThanOrEqual(5);
  });

  test('2. professor registra disponibilidade apenas às segundas e quartas', async () => {
    const carla = auth(t.carla);
    // Recomeça do zero para demonstrar o registro.
    for (const d of (await api().get('/api/disponibilidades').set(carla)).body) {
      await api().delete(`/api/disponibilidades/${d.id}`).set(carla);
    }
    for (const dia of [1, 3]) {
      const res = await api().post('/api/disponibilidades').set(carla).send({ dia, inicio: '08:00', fim: '12:20' });
      expect(res.status).toBe(201);
    }
    const vigentes = (await api().get('/api/disponibilidades?status=vigente').set(carla)).body;
    expect(vigentes.map((d) => d.dia).sort()).toEqual([1, 3]);
  });

  test('3. somente o coordenador solicita a geração automática', async () => {
    expect((await api().post('/api/horarios/gerar').set(auth(t.ana)).send({})).status).toBe(403);
    expect((await api().post('/api/horarios/gerar').set(auth(t.aluno)).send({})).status).toBe(403);
    expect((await api().post('/api/horarios/gerar').send({})).status).toBe(401);

    const res = await api().post('/api/horarios/gerar').set(c()).send({});
    expect(res.status).toBe(201);
    expect(res.body.versao).toMatchObject({ status: 'rascunho', numero: 1 });
    expect(res.body.estatisticas.aulas_alocadas).toBeGreaterThan(70);
    versaoId = res.body.versao.id;
  });

  test('4a. algoritmo respeita disponibilidades (Carla só às segundas e quartas)', async () => {
    const { rows } = await query(
      `select distinct h.dia from horarios h join professores p on p.id = h.professor_id where h.versao_id = $1 and p.matricula = 'P003'`,
      [versaoId]
    );
    expect(rows.map((r) => r.dia).sort()).toEqual([1, 3]);
  });

  test('4b. não há choques de sala, professor ou turma; pendências são informadas', async () => {
    const res = await api().get(`/api/horarios/conflitos?versao_id=${versaoId}`).set(c());
    expect(res.status).toBe(200);
    expect(res.body.erros).toBe(0);
    for (const tipo of ['choque_professor', 'choque_sala', 'choque_turma', 'fora_da_disponibilidade', 'fora_da_faixa', 'capacidade']) {
      expect(res.body.resumo[tipo]).toBeUndefined();
    }
    // Redes na ENG2-A (tarde) com a Carla, que só tem manhãs livres:
    const carga = res.body.conflitos.find((x) => x.tipo === 'carga_incompleta');
    expect(carga.mensagem).toMatch(/Redes de Computadores \(ENG2-A\)/);
    expect(carga.motivo).toMatch(/Carla Mendes/);
  });

  test('4c. conflitos são exclusivos do coordenador', async () => {
    expect((await api().get(`/api/horarios/conflitos?versao_id=${versaoId}`).set(auth(t.ana))).status).toBe(403);
    expect((await api().get('/api/horarios/conflitos').set(c())).status).toBe(400);
    expect((await api().get('/api/horarios/conflitos?versao_id=999').set(c())).status).toBe(404);
  });

  test('4d. edição que causa choque é recusada (409) com a identificação do conflito', async () => {
    const aulas = (await api().get(`/api/horarios?versao_id=${versaoId}&turma_id=1`).set(c())).body.aulas;
    const [a, b] = aulas.filter((x) => x.dia !== aulas[0].dia || x.id === aulas[0].id).slice(0, 2);
    // Move a para o horário de b (mesma turma): choque de turma.
    const res = await api().put(`/api/horarios/${a.id}`).set(c()).send({ dia: b.dia, inicio: b.inicio });
    expect(res.status).toBe(409);
    expect(res.body.detalhes.map((d) => d.tipo)).toContain('choque_turma');
  });

  test('5a. coordenador ajusta uma alocação (sala) e o histórico registra antes/depois', async () => {
    const aulas = (await api().get(`/api/horarios?versao_id=${versaoId}&turma_id=1`).set(c())).body.aulas;
    const aula = aulas[0];
    const ocupadas = (await api().get(`/api/horarios?versao_id=${versaoId}`).set(c())).body.aulas
      .filter((x) => x.dia === aula.dia && x.inicio === aula.inicio).map((x) => x.sala_id);
    const salas = (await api().get('/api/salas').set(c())).body;
    const livre = salas.find((s) => s.capacidade >= 40 && !ocupadas.includes(s.id));

    const res = await api().put(`/api/horarios/${aula.id}`).set(c()).send({ sala_id: livre.id });
    expect(res.status).toBe(200);
    expect(res.body.aula).toMatchObject({ sala_id: livre.id, situacao: 'ajustada' });

    const { rows } = await query(
      `select usuario_id, valores_alterados from historico_alteracoes where entidade = 'horarios' and entidade_id = $1`,
      [String(aula.id)]
    );
    expect(rows[0].usuario_id).toBeTruthy();
    expect(rows[0].valores_alterados.antes.sala_id).toBe(aula.sala_id);
    expect(rows[0].valores_alterados.depois.sala_id).toBe(livre.id);
  });

  test('5b. regras flexíveis exigem confirmação: mover para fora da disponibilidade → 422', async () => {
    // ENG3-N (noite) tem 18 aulas, então há horários livres.
    const todas = (await api().get(`/api/horarios?versao_id=${versaoId}`).set(c())).body.aulas;
    const daTurma = todas.filter((x) => x.turma === 'ENG3-N');
    const faixas = ['18:30', '19:30', '20:50', '21:50'];
    const livres = [1, 2, 3, 4, 5].flatMap((dia) => faixas.filter((h) => !daTurma.some((x) => x.dia === dia && x.inicio === h)).map((inicio) => ({ dia, inicio })));
    expect(livres.length).toBeGreaterThan(0);
    const disp = (await api().get('/api/disponibilidades?status=vigente').set(c())).body;
    const cabe = (profId, { dia, inicio }) => disp.some((d) => d.professor_id === profId && d.dia === dia && d.inicio <= inicio && d.fim >= '22:50');
    let alvo;
    for (const aula of daTurma) {
      const slot = livres.find((l) => !cabe(aula.professor_id, l) && !todas.some((x) => x.dia === l.dia && x.inicio === l.inicio && (x.professor_id === aula.professor_id || x.sala_id === aula.sala_id)));
      if (slot) { alvo = { aula, slot }; break; }
    }
    expect(alvo).toBeDefined();
    const res = await api().put(`/api/horarios/${alvo.aula.id}`).set(c()).send(alvo.slot);
    expect(res.status).toBe(422);
    expect(res.body.detalhes.map((d) => d.tipo)).toContain('fora_da_disponibilidade');
    const { rows } = await query('select dia from horarios where id = $1', [alvo.aula.id]);
    expect(rows[0].dia).toBe(alvo.aula.dia);
  });

  test('5c. horário que não é faixa de aula do turno (ex.: intervalo) → 422', async () => {
    const aula = (await api().get(`/api/horarios?versao_id=${versaoId}`).set(c())).body.aulas[0];
    const res = await api().put(`/api/horarios/${aula.id}`).set(c()).send({ inicio: '10:00' });
    expect(res.status).toBe(422);
  });

  test('5d. professor e aluno não alteram alocações (403) e nada muda', async () => {
    const aula = (await api().get(`/api/horarios?versao_id=${versaoId}`).set(c())).body.aulas[0];
    for (const quem of ['ana', 'aluno']) {
      expect((await api().put(`/api/horarios/${aula.id}`).set(auth(t[quem])).send({ dia: 5 })).status).toBe(403);
      expect((await api().delete(`/api/horarios/${aula.id}`).set(auth(t[quem]))).status).toBe(403);
    }
    const { rows } = await query('select dia from horarios where id = $1', [aula.id]);
    expect(rows[0].dia).toBe(aula.dia);
  });

  test('5e. fluxo de estados: rascunho não publica direto; revisão → publicada', async () => {
    expect((await api().post(`/api/horarios/versoes/${versaoId}/publicar`).set(c())).status).toBe(409);
    expect((await api().post(`/api/horarios/versoes/${versaoId}/publicar`).set(auth(t.ana))).status).toBe(403);
    const rev = await api().post(`/api/horarios/versoes/${versaoId}/revisao`).set(c());
    expect(rev.body.status).toBe('em_revisao');
    const pub = await api().post(`/api/horarios/versoes/${versaoId}/publicar`).set(c());
    expect(pub.status).toBe(200);
    expect(pub.body.versao.status).toBe('publicada');
    expect(pub.body.alertas.some((a) => a.tipo === 'carga_incompleta')).toBe(true);
  });

  test('5f. versão publicada é imutável (409); alteração exige duplicar', async () => {
    const aula = (await api().get(`/api/horarios?versao_id=${versaoId}`).set(c())).body.aulas[0];
    expect((await api().put(`/api/horarios/${aula.id}`).set(c()).send({ sala_id: 6 })).status).toBe(409);
    expect((await api().delete(`/api/horarios/${aula.id}`).set(c())).status).toBe(409);
    const dup = await api().post(`/api/horarios/versoes/${versaoId}/duplicar`).set(c());
    expect(dup.status).toBe(201);
    expect(dup.body).toMatchObject({ status: 'rascunho', numero: 2, origem_id: versaoId });
    const { rows } = await query('select count(*)::int as n from horarios where versao_id = $1', [versaoId]);
    expect(dup.body.total_aulas).toBe(rows[0].n);
    versao2Id = dup.body.id;
  });

  test('6. aluno visualiza a grade publicada da turma, com sala, docente e situação', async () => {
    const res = await api().get('/api/horarios/minha-turma').set(auth(t.aluno));
    expect(res.status).toBe(200);
    expect(res.body.turma.nome).toBe('ENG1-A');
    expect(res.body.versao.id).toBe(versaoId);
    expect(res.body.aulas).toHaveLength(20);
    expect(res.body.aulas[0]).toEqual(expect.objectContaining({ disciplina: expect.any(String), professor: expect.any(String), sala: expect.any(String), situacao: expect.any(String) }));
    expect(res.body.faixas.some((f) => f.tipo === 'intervalo')).toBe(true);
  });

  test('6b. aluno não consegue alterar nem ver rascunhos', async () => {
    const a = auth(t.aluno);
    expect((await api().get(`/api/horarios?versao_id=${versao2Id}`).set(a)).status).toBe(403);
    expect((await api().post('/api/horarios').set(a).send({})).status).toBe(403);
    expect((await api().post(`/api/horarios/versoes/${versao2Id}/publicar`).set(a)).status).toBe(403);
    expect((await api().get('/api/horarios/versoes').set(a)).status).toBe(403);
    expect((await api().get('/api/horarios/professor').set(a)).status).toBe(403);
  });

  test('6c. professor vê a própria grade publicada e as turmas atribuídas', async () => {
    const res = await api().get('/api/horarios/professor').set(auth(t.ana));
    expect(res.status).toBe(200);
    expect(new Set(res.body.aulas.map((x) => x.professor))).toEqual(new Set(['Ana Souza']));
    expect(res.body.turmas.map((x) => x.nome)).toEqual(['ENG1-A', 'ENG1-B', 'ENG2-A', 'ENG3-N']);
    expect((await api().get('/api/horarios/minha-turma').set(auth(t.ana))).status).toBe(403);
  });

  test('7. professor registra nova disponibilidade sem modificar a grade publicada', async () => {
    const antes = (await query('select id, dia, inicio, sala_id from horarios where versao_id = $1 order by id', [versaoId])).rows;
    const carla = auth(t.carla);

    const nova = await api().post('/api/disponibilidades').set(carla).send({ dia: 2, inicio: '13:00', fim: '17:20' });
    expect(nova.status).toBe(202); // vira solicitação: já existe grade publicada
    expect(nova.body.status).toBe('pendente');

    const segunda = (await api().get('/api/disponibilidades?status=vigente').set(carla)).body.find((d) => d.dia === 1);
    const remocao = await api().delete(`/api/disponibilidades/${segunda.id}`).set(carla);
    expect(remocao.status).toBe(202);

    // Mesmo após o coordenador aprovar, a grade oficial não muda automaticamente.
    expect((await api().post(`/api/disponibilidades/${nova.body.id}/aprovar`).set(c())).status).toBe(200);
    expect((await api().post(`/api/disponibilidades/${remocao.body.id}/aprovar`).set(c())).status).toBe(200);
    const depois = (await query('select id, dia, inicio, sala_id from horarios where versao_id = $1 order by id', [versaoId])).rows;
    expect(depois).toEqual(antes);
    expect((await api().get('/api/horarios/minha-turma').set(auth(t.aluno))).body.versao.id).toBe(versaoId);

    // O relatório de conflitos passa a apontar as aulas da segunda fora da nova disponibilidade.
    const rel = await api().get(`/api/horarios/conflitos?versao_id=${versaoId}`).set(c());
    expect(rel.body.resumo.fora_da_disponibilidade).toBeGreaterThan(0);
  });
});

describe('Versões', () => {
  test('publicar uma nova versão arquiva a anterior e notifica os usuários', async () => {
    await api().post(`/api/horarios/versoes/${versao2Id}/revisao`).set(c());
    // A versão 2 foi duplicada antes da mudança de disponibilidade, então tem alertas mas não erros.
    const pub = await api().post(`/api/horarios/versoes/${versao2Id}/publicar`).set(c());
    expect(pub.status).toBe(200);
    const lista = (await api().get('/api/horarios/versoes').set(c())).body;
    expect(lista.find((v) => v.id === versaoId).status).toBe('arquivada');
    expect(lista.find((v) => v.id === versao2Id).status).toBe('publicada');
    const { rows } = await query(
      `select count(distinct usuario_id)::int as n from notificacoes where mensagem like 'Nova grade oficial%versão 2.'`
    );
    expect(rows[0].n).toBe(16);
  });

  test('somente rascunhos podem ser excluídos; devolver só de em_revisao', async () => {
    expect((await api().delete(`/api/horarios/versoes/${versao2Id}`).set(c())).status).toBe(409);
    expect((await api().post(`/api/horarios/versoes/${versao2Id}/devolver`).set(c())).status).toBe(409);
    const nova = await api().post('/api/horarios/gerar').set(c()).send({});
    expect((await api().delete(`/api/horarios/versoes/${nova.body.versao.id}`).set(c())).status).toBe(204);
  });

  test('coordenador inclui aula manualmente em rascunho, respeitando conflitos', async () => {
    const dup = await api().post(`/api/horarios/versoes/${versao2Id}/duplicar`).set(c());
    const vId = dup.body.id;
    // ENG2-A (turma 3) / Redes (disciplina 3) estava pendente; inclui com outro professor numa faixa livre.
    const aulas = (await api().get(`/api/horarios?versao_id=${vId}&turma_id=3`).set(c())).body.aulas;
    const faixas = ['13:00', '14:00', '15:20', '16:20'];
    let livre;
    for (const dia of [1, 2, 3, 4, 5]) {
      const h = faixas.find((f) => !aulas.some((a) => a.dia === dia && a.inicio === f));
      if (h) { livre = { dia, inicio: h }; break; }
    }
    expect(livre).toBeDefined(); // ENG2-A: 18 aulas alocadas, sobram as 2 vagas da pendência de Redes

    const nova = { versao_id: vId, turma_id: 3, disciplina_id: 3, professor_id: 4, sala_id: 3, ...livre };
    // Carla não tem disponibilidade à tarde: exige confirmação.
    const semForcar = await api().post('/api/horarios').set(c()).send(nova);
    expect(semForcar.status).toBe(422);
    expect(semForcar.body.detalhes[0].tipo).toBe('fora_da_disponibilidade');
    const comForcar = await api().post('/api/horarios').set(c()).send({ ...nova, forcar: true });
    expect(comForcar.status).toBe(201);
    expect(comForcar.body.aula.situacao).toBe('ajustada');
    // Mesmo horário de novo: choque de turma, professor e sala.
    const repetida = await api().post('/api/horarios').set(c()).send({ ...nova, forcar: true });
    expect(repetida.status).toBe(409);
    expect(repetida.body.detalhes.map((d) => d.tipo).sort()).toEqual(['choque_professor', 'choque_sala', 'choque_turma']);
    // Disciplina não vinculada à turma: integridade referencial.
    const semVinculo = await api().post('/api/horarios').set(c()).send({ ...nova, disciplina_id: 6, dia: livre.dia === 5 ? 4 : 5, forcar: true });
    expect([409, 422]).toContain(semVinculo.status);
  });

  test('validações de entrada da edição', async () => {
    const aula = (await api().get(`/api/horarios?versao_id=${versao2Id}`).set(c())).body.aulas[0];
    expect((await api().put(`/api/horarios/${aula.id}`).set(c()).send({})).status).toBe(400);
    expect((await api().put(`/api/horarios/${aula.id}`).set(c()).send({ dia: 7 })).status).toBe(400);
    expect((await api().put('/api/horarios/99999').set(c()).send({ dia: 1 })).status).toBe(404);
  });
});
