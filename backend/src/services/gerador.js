// Algoritmo de geração da grade (RF07, RF08) — função pura, sem acesso ao banco.
//
// Restrições obrigatórias (nunca violadas):
//   RN10 professor sem aulas simultâneas      RN11 sala com uma turma por horário
//   RN12 turma com uma disciplina por horário RN13 aula dentro da disponibilidade vigente
//   RN15 apenas faixas de aula do turno       RN16 sala comporta a turma
// Objetivos (heurísticos): atender a carga semanal (RN14); no máximo 2 aulas da mesma disciplina
// por dia, de preferência geminadas; poucas janelas para turmas e professores; turma na mesma sala.
//
// Estratégia:
//   1. Para cada vínculo (demanda), calcula os horários candidatos: faixas de aula do turno da turma
//      que cabem numa disponibilidade do professor.
//   2. Ordena as demandas pela folga (candidatos − carga): as mais restritas primeiro (MRV).
//   3. Aloca cada aula no candidato viável de menor custo.
//   4. Sem candidato viável, tenta um reparo por cadeia de ejeção: remove as aulas que bloqueiam um
//      candidato (mesma turma, mesmo professor ou sala), aloca a aula e realoca as removidas,
//      recursivamente até `profundidade`, desfazendo tudo se a cadeia falhar.
//   5. Busca local (movimentos e trocas) para reduzir janelas sem violar restrições.
//   6. O que não coube vira pendência com o motivo diagnosticado.

const DIAS = [1, 2, 3, 4, 5];
const NOME_DIA = { 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta' };
const minutos = (h) => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};

/**
 * @param {object} entrada
 * @param {Array<{id, turma_id, disciplina_id, professor_id, carga_semanal, turno_id, qtd_alunos, turma, disciplina, professor, turno}>} entrada.demandas
 * @param {Object<string, Array<{inicio, fim}>>} entrada.faixasPorTurno  faixas do tipo aula, por turno_id
 * @param {Object<string, Array<{dia, inicio, fim}>>} entrada.disponibilidades  vigentes, por professor_id
 * @param {Array<{id, capacidade}>} entrada.salas
 */
function gerarGrade({ demandas, faixasPorTurno, disponibilidades, salas, minimizarJanelas = true, limiteTentativas = 50000 }) {
  const inicioMs = Date.now();

  // Horários (slots) de cada turno: dia × faixa, com a posição da faixa no dia para medir janelas.
  const slotsPorTurno = new Map();
  for (const [turnoId, faixas] of Object.entries(faixasPorTurno)) {
    const ordenadas = [...faixas].sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
    slotsPorTurno.set(
      String(turnoId),
      DIAS.flatMap((dia) => ordenadas.map((f, pos) => ({ dia, inicio: f.inicio, fim: f.fim, pos, chave: `${dia}|${f.inicio}` })))
    );
  }

  const disponivel = (profId, slot) =>
    (disponibilidades[profId] || []).some(
      (d) => d.dia === slot.dia && minutos(d.inicio) <= minutos(slot.inicio) && minutos(d.fim) >= minutos(slot.fim)
    );

  const candidatos = new Map(
    demandas.map((d) => [d.id, (slotsPorTurno.get(String(d.turno_id)) || []).filter((s) => disponivel(d.professor_id, s))])
  );
  const salasOrdenadas = [...salas].sort((a, b) => a.capacidade - b.capacidade || a.id - b.id);

  // ---------------------------------------------------------------------------------------------
  // Estado da alocação, com log para desfazer (rollback) tentativas do reparo.
  // ---------------------------------------------------------------------------------------------
  const porProf = new Map(); // `${prof}|${chave}` -> aula
  const porTurma = new Map(); // `${turma}|${chave}` -> aula
  const porSala = new Map(); // `${sala}|${chave}` -> aula
  const posicao = new Map(); // aula -> { slot, salaId }
  const posicoesDoDia = new Map(); // `${demanda}|${dia}` -> posições ocupadas
  const salasDaTurma = new Map(); // `${turma}|${sala}` -> quantidade de aulas
  const log = [];

  function aplicar(aula, slot, salaId) {
    const d = aula.d;
    porProf.set(`${d.professor_id}|${slot.chave}`, aula);
    porTurma.set(`${d.turma_id}|${slot.chave}`, aula);
    porSala.set(`${salaId}|${slot.chave}`, aula);
    posicao.set(aula, { slot, salaId });
    const k = `${d.id}|${slot.dia}`;
    posicoesDoDia.set(k, [...(posicoesDoDia.get(k) || []), slot.pos]);
    const ks = `${d.turma_id}|${salaId}`;
    salasDaTurma.set(ks, (salasDaTurma.get(ks) || 0) + 1);
  }

  function remover(aula) {
    const { slot, salaId } = posicao.get(aula);
    const d = aula.d;
    porProf.delete(`${d.professor_id}|${slot.chave}`);
    porTurma.delete(`${d.turma_id}|${slot.chave}`);
    porSala.delete(`${salaId}|${slot.chave}`);
    posicao.delete(aula);
    const k = `${d.id}|${slot.dia}`;
    const lista = [...posicoesDoDia.get(k)];
    lista.splice(lista.indexOf(slot.pos), 1);
    posicoesDoDia.set(k, lista);
    const ks = `${d.turma_id}|${salaId}`;
    salasDaTurma.set(ks, salasDaTurma.get(ks) - 1);
    return { slot, salaId };
  }

  function colocar(aula, slot, salaId) {
    aplicar(aula, slot, salaId);
    log.push({ op: 'colocar', aula });
  }

  function retirar(aula) {
    const anterior = remover(aula);
    log.push({ op: 'retirar', aula, ...anterior });
  }

  function desfazerAte(marca) {
    while (log.length > marca) {
      const e = log.pop();
      if (e.op === 'colocar') remover(e.aula);
      else aplicar(e.aula, e.slot, e.salaId);
    }
  }

  // Sala livre que comporta a turma: prefere a sala mais usada pela turma, depois a menor que serve.
  function salaPara(aula, slot) {
    let melhor = null;
    let melhorUso = -1;
    for (const s of salasOrdenadas) {
      if (s.capacidade < aula.d.qtd_alunos || porSala.has(`${s.id}|${slot.chave}`)) continue;
      const uso = salasDaTurma.get(`${aula.d.turma_id}|${s.id}`) || 0;
      if (uso > melhorUso) {
        melhor = s.id;
        melhorUso = uso;
      }
    }
    return melhor;
  }

  const livre = (aula, slot) =>
    !porProf.has(`${aula.d.professor_id}|${slot.chave}`) && !porTurma.has(`${aula.d.turma_id}|${slot.chave}`);

  // Custo de colocar a aula no slot (menor é melhor).
  function custo(aula, slot) {
    const d = aula.d;
    const doDia = posicoesDoDia.get(`${d.id}|${slot.dia}`) || [];
    let c = slot.pos * 0.1;
    if (doDia.length >= 2) c += 100; // evita 3+ aulas da mesma disciplina no dia
    else if (doDia.length === 1) c += Math.abs(doDia[0] - slot.pos) === 1 ? -10 : 20; // geminada é boa; separada é ruim
    for (const viz of [slot.pos - 1, slot.pos + 1]) {
      const vizinho = (slotsPorTurno.get(String(d.turno_id)) || []).find((s) => s.dia === slot.dia && s.pos === viz);
      if (vizinho && porTurma.has(`${d.turma_id}|${vizinho.chave}`)) c -= 3; // colado em outra aula da turma
    }
    return c;
  }

  function melhorSlotLivre(aula) {
    let melhor = null;
    for (const slot of candidatos.get(aula.d.id)) {
      if (!livre(aula, slot)) continue;
      const salaId = salaPara(aula, slot);
      if (!salaId) continue;
      const c = custo(aula, slot);
      if (!melhor || c < melhor.c) melhor = { slot, salaId, c };
    }
    return melhor;
  }

  let tentativas = 0;

  function inserir(aula, profundidade, emCadeia) {
    const melhor = melhorSlotLivre(aula);
    if (melhor) {
      colocar(aula, melhor.slot, melhor.salaId);
      return true;
    }
    if (profundidade === 0) return false;

    const opcoes = candidatos
      .get(aula.d.id)
      .map((slot) => ({ slot, c: custo(aula, slot) }))
      .sort((a, b) => a.c - b.c);

    for (const { slot } of opcoes) {
      if (++tentativas > limiteTentativas) return false;
      const bloqueios = new Set(
        [porTurma.get(`${aula.d.turma_id}|${slot.chave}`), porProf.get(`${aula.d.professor_id}|${slot.chave}`)].filter(Boolean)
      );
      if ([...bloqueios].some((b) => emCadeia.has(b))) continue;

      const marca = log.length;
      for (const b of bloqueios) retirar(b);
      let salaId = salaPara(aula, slot);
      if (!salaId) {
        // Todas as salas adequadas ocupadas: tenta liberar uma delas.
        const ocupante = salasOrdenadas
          .filter((s) => s.capacidade >= aula.d.qtd_alunos)
          .map((s) => porSala.get(`${s.id}|${slot.chave}`))
          .find((o) => o && !emCadeia.has(o));
        if (ocupante) {
          retirar(ocupante);
          bloqueios.add(ocupante);
          salaId = salaPara(aula, slot);
        }
      }
      if (!salaId) {
        desfazerAte(marca);
        continue;
      }
      colocar(aula, slot, salaId);

      const cadeia = new Set([...emCadeia, aula]);
      if ([...bloqueios].every((b) => inserir(b, profundidade - 1, cadeia))) return true;
      desfazerAte(marca);
    }
    return false;
  }

  // ---------------------------------------------------------------------------------------------
  // Alocação principal
  // ---------------------------------------------------------------------------------------------
  const cargaProf = new Map();
  for (const d of demandas) cargaProf.set(d.professor_id, (cargaProf.get(d.professor_id) || 0) + d.carga_semanal);

  const ordenadas = [...demandas].sort(
    (a, b) =>
      candidatos.get(a.id).length - a.carga_semanal - (candidatos.get(b.id).length - b.carga_semanal) ||
      cargaProf.get(b.professor_id) - cargaProf.get(a.professor_id) ||
      a.id - b.id
  );

  let seq = 0;
  const todas = [];
  let naoAlocadas = [];
  for (const d of ordenadas) {
    for (let i = 0; i < d.carga_semanal; i++) {
      const aula = { n: seq++, d };
      todas.push(aula);
      if (!inserir(aula, 2, new Set())) naoAlocadas.push(aula);
    }
  }
  // Segunda chance, com cadeia mais profunda, para o que sobrou.
  naoAlocadas = naoAlocadas.filter((aula) => !inserir(aula, 3, new Set()));

  // ---------------------------------------------------------------------------------------------
  // Minimização de janelas (diferencial): busca local que só aceita movimentos viáveis que melhoram.
  // ---------------------------------------------------------------------------------------------
  function medir() {
    const turmaDia = new Map();
    const profDia = new Map();
    const discDia = new Map();
    for (const [aula, { slot }] of posicao) {
      const d = aula.d;
      const push = (m, k, v) => m.set(k, [...(m.get(k) || []), v]);
      push(turmaDia, `${d.turma_id}|${slot.dia}`, slot.pos);
      push(profDia, `${d.professor_id}|${d.turno_id}|${slot.dia}`, slot.pos);
      push(discDia, `${d.id}|${slot.dia}`, slot.pos);
    }
    const janelas = (m) => {
      let total = 0;
      for (const ps of m.values()) total += Math.max(...ps) - Math.min(...ps) + 1 - ps.length;
      return total;
    };
    let distribuicao = 0;
    for (const ps of discDia.values()) {
      if (ps.length > 2) distribuicao += (ps.length - 2) * 10;
      else if (ps.length === 2 && Math.abs(ps[0] - ps[1]) !== 1) distribuicao += 1;
    }
    const janelasTurma = janelas(turmaDia);
    const janelasProfessor = janelas(profDia);
    return { janelasTurma, janelasProfessor, custo: janelasTurma * 3 + janelasProfessor + distribuicao };
  }

  const antes = medir();
  if (minimizarJanelas) {
    let custoAtual = antes.custo;
    for (let rodada = 0, melhorou = true; melhorou && rodada < 20; rodada++) {
      melhorou = false;
      const alocadas = [...posicao.keys()];

      // Movimento: leva uma aula para outro candidato livre.
      for (const aula of alocadas) {
        for (const slot of candidatos.get(aula.d.id)) {
          const marca = log.length;
          retirar(aula);
          const salaId = livre(aula, slot) ? salaPara(aula, slot) : null;
          if (salaId) {
            colocar(aula, slot, salaId);
            const novo = medir().custo;
            if (novo < custoAtual) {
              custoAtual = novo;
              melhorou = true;
              break;
            }
          }
          desfazerAte(marca);
        }
      }

      // Troca: duas aulas da mesma turma trocam de horário.
      for (let i = 0; i < alocadas.length; i++) {
        for (let j = i + 1; j < alocadas.length; j++) {
          const a = alocadas[i];
          const b = alocadas[j];
          if (a.d.turma_id !== b.d.turma_id || a.d.id === b.d.id) continue;
          const marca = log.length;
          const pa = posicao.get(a).slot;
          const pb = posicao.get(b).slot;
          retirar(a);
          retirar(b);
          const ok =
            disponivel(a.d.professor_id, pb) && disponivel(b.d.professor_id, pa) && livre(a, pb) && salaPara(a, pb);
          if (ok) {
            colocar(a, pb, salaPara(a, pb));
            if (livre(b, pa) && salaPara(b, pa)) {
              colocar(b, pa, salaPara(b, pa));
              const novo = medir().custo;
              if (novo < custoAtual) {
                custoAtual = novo;
                melhorou = true;
                continue;
              }
            }
          }
          desfazerAte(marca);
        }
      }
    }
  }
  const depois = medir();

  // ---------------------------------------------------------------------------------------------
  // Resultado e diagnóstico das pendências
  // ---------------------------------------------------------------------------------------------
  const aulas = [...posicao.entries()]
    .map(([aula, { slot, salaId }]) => ({
      turma_disciplina_id: aula.d.id,
      turma_id: aula.d.turma_id,
      disciplina_id: aula.d.disciplina_id,
      professor_id: aula.d.professor_id,
      sala_id: salaId,
      dia: slot.dia,
      inicio: slot.inicio,
      fim: slot.fim,
    }))
    .sort((a, b) => a.turma_id - b.turma_id || a.dia - b.dia || minutos(a.inicio) - minutos(b.inicio));

  const faltantes = new Map();
  for (const aula of naoAlocadas) faltantes.set(aula.d, (faltantes.get(aula.d) || 0) + 1);

  const pendencias = [...faltantes.entries()].map(([d, qtd]) => ({
    turma_disciplina_id: d.id,
    aulas_faltantes: qtd,
    motivo: diagnosticar(d, qtd),
  }));

  function diagnosticar(d, qtd) {
    const cands = candidatos.get(d.id);
    const prefixo = `${d.disciplina} (${d.turma}): ${qtd} de ${d.carga_semanal} aula(s) não alocada(s).`;
    if (!(disponibilidades[d.professor_id] || []).length) {
      return `${prefixo} ${d.professor} não possui disponibilidade vigente no período.`;
    }
    if (!cands.length) {
      return `${prefixo} A disponibilidade de ${d.professor} não coincide com nenhum horário de aula do turno da turma${d.turno ? ` (${d.turno})` : ''}.`;
    }
    if (!salas.some((s) => s.capacidade >= d.qtd_alunos)) {
      return `${prefixo} Nenhuma sala comporta os ${d.qtd_alunos} alunos da turma.`;
    }
    if (cands.length < d.carga_semanal) {
      return `${prefixo} ${d.professor} tem apenas ${cands.length} horário(s) disponível(is) no turno da turma para ${d.carga_semanal} aulas semanais.`;
    }
    let prof = 0;
    let turma = 0;
    let sala = 0;
    const exemplos = [];
    for (const s of cands) {
      const aulaProf = porProf.get(`${d.professor_id}|${s.chave}`);
      const aulaTurma = porTurma.get(`${d.turma_id}|${s.chave}`);
      if (aulaProf && aulaProf.d.id === d.id) continue; // já ocupado por esta mesma disciplina
      if (aulaProf) prof++;
      if (aulaTurma) turma++;
      if (!aulaProf && !aulaTurma && !salaPara({ d }, s)) sala++;
      if (exemplos.length < 2 && (aulaProf || aulaTurma)) {
        const outro = aulaProf || aulaTurma;
        exemplos.push(`${NOME_DIA[s.dia]} ${s.inicio} com ${outro.d.disciplina} (${outro.d.turma})`);
      }
    }
    const partes = [];
    if (prof) partes.push(`professor ocupado em ${prof}`);
    if (turma) partes.push(`turma ocupada em ${turma}`);
    if (sala) partes.push(`sem sala livre em ${sala}`);
    return `${prefixo} Conflitos nos ${cands.length} horários disponíveis de ${d.professor}: ${partes.join(', ')}` +
      (exemplos.length ? ` (ex.: ${exemplos.join('; ')}).` : '.');
  }

  const demandadas = demandas.reduce((s, d) => s + d.carga_semanal, 0);
  return {
    aulas,
    pendencias,
    estatisticas: {
      aulas_demandadas: demandadas,
      aulas_alocadas: aulas.length,
      aulas_nao_alocadas: demandadas - aulas.length,
      janelas_turmas_antes: antes.janelasTurma,
      janelas_turmas_depois: depois.janelasTurma,
      janelas_professores_antes: antes.janelasProfessor,
      janelas_professores_depois: depois.janelasProfessor,
      tentativas_reparo: tentativas,
      tempo_ms: Date.now() - inicioMs,
    },
  };
}

module.exports = { gerarGrade, minutos, NOME_DIA };
