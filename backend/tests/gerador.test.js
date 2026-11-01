// Testes unitários do algoritmo (função pura, sem banco).
const { gerarGrade, minutos } = require('../src/services/gerador');

const FAIXAS_MANHA = [
  { inicio: '08:00', fim: '09:00' }, { inicio: '09:00', fim: '10:00' },
  { inicio: '10:20', fim: '11:20' }, { inicio: '11:20', fim: '12:20' },
];
const SEMANA = (dias = [1, 2, 3, 4, 5]) => dias.map((dia) => ({ dia, inicio: '08:00', fim: '12:20' }));

let seq = 1;
const demanda = (turma, prof, carga, extra = {}) => ({
  id: seq++, turma_id: turma, disciplina_id: seq, professor_id: prof, carga_semanal: carga, turno_id: 1,
  qtd_alunos: 30, turma: `T${turma}`, disciplina: `D${seq}`, professor: `P${prof}`, ...extra,
});

// Verifica TODAS as restrições obrigatórias sobre o resultado.
function verificarRestricoes(entrada, r) {
  const faixas = entrada.faixasPorTurno[1];
  const salas = new Map(entrada.salas.map((s) => [s.id, s]));
  const porDemanda = new Map(entrada.demandas.map((d) => [d.id, d]));
  const vistos = { prof: new Set(), sala: new Set(), turma: new Set() };
  for (const a of r.aulas) {
    const k = `${a.dia}|${a.inicio}`;
    for (const [tipo, idAtor] of [['prof', a.professor_id], ['sala', a.sala_id], ['turma', a.turma_id]]) {
      expect(vistos[tipo].has(`${idAtor}|${k}`)).toBe(false); // RN10, RN11, RN12
      vistos[tipo].add(`${idAtor}|${k}`);
    }
    expect(faixas.some((f) => f.inicio === a.inicio && f.fim === a.fim)).toBe(true); // RN15
    const disp = entrada.disponibilidades[a.professor_id] || [];
    expect(disp.some((d) => d.dia === a.dia && minutos(d.inicio) <= minutos(a.inicio) && minutos(d.fim) >= minutos(a.fim))).toBe(true); // RN13
    expect(salas.get(a.sala_id).capacidade).toBeGreaterThanOrEqual(porDemanda.get(a.turma_disciplina_id).qtd_alunos); // RN16
  }
  // RN14: alocadas + pendentes = carga de cada demanda
  for (const d of entrada.demandas) {
    const alocadas = r.aulas.filter((a) => a.turma_disciplina_id === d.id).length;
    const pend = r.pendencias.find((p) => p.turma_disciplina_id === d.id)?.aulas_faltantes || 0;
    expect(alocadas + pend).toBe(d.carga_semanal);
  }
}

describe('gerarGrade', () => {
  test('aloca toda a carga quando há folga e respeita as restrições', () => {
    const entrada = {
      demandas: [demanda(1, 1, 4), demanda(1, 2, 4), demanda(2, 1, 4), demanda(2, 2, 4)],
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: SEMANA(), 2: SEMANA() },
      salas: [{ id: 1, capacidade: 40 }, { id: 2, capacidade: 40 }],
    };
    const r = gerarGrade(entrada);
    expect(r.pendencias).toEqual([]);
    expect(r.aulas).toHaveLength(16);
    verificarRestricoes(entrada, r);
  });

  test('respeita disponibilidade restrita (somente segundas e quartas)', () => {
    const entrada = {
      demandas: [demanda(1, 1, 6)],
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: SEMANA([1, 3]) },
      salas: [{ id: 1, capacidade: 40 }],
    };
    const r = gerarGrade(entrada);
    expect(new Set(r.aulas.map((a) => a.dia))).toEqual(new Set([1, 3]));
    verificarRestricoes(entrada, r);
  });

  test('no máximo 2 aulas da mesma disciplina por dia, geminadas, quando possível', () => {
    const entrada = {
      demandas: [demanda(1, 1, 4)],
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: SEMANA() },
      salas: [{ id: 1, capacidade: 40 }],
    };
    const r = gerarGrade(entrada);
    const porDia = {};
    for (const a of r.aulas) (porDia[a.dia] ||= []).push(a.inicio);
    for (const horarios of Object.values(porDia)) expect(horarios.length).toBeLessThanOrEqual(2);
    expect(Object.keys(porDia)).toHaveLength(2);
  });

  test('professor sem disponibilidade no turno gera pendência com motivo', () => {
    const entrada = {
      demandas: [demanda(1, 1, 2, { turno: 'Manhã' })],
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: [{ dia: 1, inicio: '13:00', fim: '17:00' }] },
      salas: [{ id: 1, capacidade: 40 }],
    };
    const r = gerarGrade(entrada);
    expect(r.aulas).toHaveLength(0);
    expect(r.pendencias[0].aulas_faltantes).toBe(2);
    expect(r.pendencias[0].motivo).toMatch(/não coincide/);
  });

  test('professor sem nenhuma disponibilidade e sala insuficiente geram motivos específicos', () => {
    const semDisp = gerarGrade({
      demandas: [demanda(1, 9, 1)], faixasPorTurno: { 1: FAIXAS_MANHA }, disponibilidades: {}, salas: [{ id: 1, capacidade: 40 }],
    });
    expect(semDisp.pendencias[0].motivo).toMatch(/não possui disponibilidade/);
    const semSala = gerarGrade({
      demandas: [demanda(1, 1, 1, { qtd_alunos: 100 })], faixasPorTurno: { 1: FAIXAS_MANHA }, disponibilidades: { 1: SEMANA() }, salas: [{ id: 1, capacidade: 40 }],
    });
    expect(semSala.pendencias[0].motivo).toMatch(/Nenhuma sala comporta/);
  });

  test('demanda maior que a disponibilidade: aloca o possível e informa o resto', () => {
    const entrada = {
      demandas: [demanda(1, 1, 6)],
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: [{ dia: 2, inicio: '08:00', fim: '12:20' }] },
      salas: [{ id: 1, capacidade: 40 }],
    };
    const r = gerarGrade(entrada);
    expect(r.aulas).toHaveLength(4);
    expect(r.pendencias[0]).toMatchObject({ aulas_faltantes: 2 });
    expect(r.pendencias[0].motivo).toMatch(/apenas 4 horário/);
    verificarRestricoes(entrada, r);
  });

  test('salas: uma única sala compartilhada impede duas turmas simultâneas', () => {
    const entrada = {
      demandas: [demanda(1, 1, 4), demanda(2, 2, 4)],
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: SEMANA([1]), 2: SEMANA([1]) },
      salas: [{ id: 1, capacidade: 40 }],
    };
    const r = gerarGrade(entrada);
    expect(r.aulas).toHaveLength(4);
    expect(r.pendencias[0].motivo).toMatch(/sem sala livre|ocupad/);
    verificarRestricoes(entrada, r);
  });

  test('reparo por cadeia de ejeção resolve caso que o guloso puro não resolveria', () => {
    // T1 tem grade cheia: 16 aulas de P2 (qualquer dia) + 4 de P1. P1 só pode seg/ter e ainda dá 4 aulas na T2.
    // P2 (maior carga) é alocado primeiro e ocupa seg/ter da T1; o reparo precisa remanejá-lo.
    seq = 50;
    const entrada = {
      demandas: [demanda(1, 2, 16), demanda(1, 1, 4), demanda(2, 1, 4)],
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: SEMANA([1, 2]), 2: SEMANA() },
      salas: [{ id: 1, capacidade: 40 }, { id: 2, capacidade: 40 }],
    };
    const r = gerarGrade(entrada);
    expect(r.estatisticas.tentativas_reparo).toBeGreaterThan(0);
    expect(r.pendencias).toEqual([]);
    expect(r.aulas).toHaveLength(24);
    verificarRestricoes(entrada, r);
  });

  test('cenário apertado com várias turmas e professores compartilhados é viável', () => {
    // 3 turmas × 20 aulas, 5 professores dividindo turmas, disponibilidades parciais.
    seq = 100;
    const d = [];
    for (const turma of [1, 2, 3]) {
      d.push(demanda(turma, 1, 4), demanda(turma, 2, 4), demanda(turma, 3, 4), demanda(turma, 4, 4), demanda(turma, 5, 4));
    }
    const entrada = {
      demandas: d,
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: SEMANA(), 2: SEMANA(), 3: SEMANA(), 4: SEMANA(), 5: SEMANA() },
      salas: [{ id: 1, capacidade: 40 }, { id: 2, capacidade: 40 }, { id: 3, capacidade: 40 }],
    };
    const r = gerarGrade(entrada);
    verificarRestricoes(entrada, r);
    expect(r.estatisticas.aulas_alocadas).toBe(60);
  });

  test('minimização de janelas não piora o resultado e mantém as restrições', () => {
    seq = 200;
    const entrada = {
      demandas: [demanda(1, 1, 3), demanda(1, 2, 3), demanda(1, 3, 2)],
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: SEMANA([1, 2]), 2: SEMANA([2, 3]), 3: [{ dia: 1, inicio: '11:20', fim: '12:20' }, { dia: 3, inicio: '08:00', fim: '09:00' }] },
      salas: [{ id: 1, capacidade: 40 }],
    };
    const sem = gerarGrade({ ...entrada, minimizarJanelas: false });
    const com = gerarGrade(entrada);
    verificarRestricoes(entrada, com);
    expect(com.estatisticas.janelas_turmas_depois).toBeLessThanOrEqual(sem.estatisticas.janelas_turmas_depois);
    expect(com.aulas.length).toBe(sem.aulas.length);
  });

  test('é determinístico', () => {
    seq = 300;
    const entrada = {
      demandas: [demanda(1, 1, 4), demanda(1, 2, 4), demanda(2, 1, 4)],
      faixasPorTurno: { 1: FAIXAS_MANHA },
      disponibilidades: { 1: SEMANA(), 2: SEMANA([2, 4]) },
      salas: [{ id: 1, capacidade: 40 }, { id: 2, capacidade: 40 }],
    };
    expect(gerarGrade(entrada).aulas).toEqual(gerarGrade(entrada).aulas);
  });
});
