# Algoritmo de geração de horários

Implementação: [`backend/src/services/gerador.js`](../backend/src/services/gerador.js), uma função pura,
sem acesso ao banco e determinística. A persistência e o relatório de conflitos ficam em
[`grade.js`](../backend/src/services/grade.js).

## Modelo

- **Slot** = dia (1–5) × faixa do tipo *aula* do turno da turma. Intervalos e faixas de outros turnos
  nunca são candidatos (RN15).
- **Demanda** = vínculo `turma_disciplinas` com `carga_semanal` aulas a alocar.
- **Candidatos** de uma demanda = slots do turno da turma que cabem **inteiramente** em uma
  disponibilidade *vigente* do professor (RN13).
- Ocupação mantida em três mapas `professor|slot`, `turma|slot` e `sala|slot`, o que torna impossível
  alocar dois itens no mesmo lugar (RN10–RN12). A sala precisa comportar a turma (RN16).

## Etapas

1. **Ordenação MRV (*most constrained first*).** As demandas são ordenadas pela folga
   `candidatos − carga` e, em empate, pela carga total do professor. As mais difíceis são alocadas primeiro.
2. **Alocação gulosa com custo.** Cada aula vai para o candidato viável de menor custo:
   - **−10** se fica geminada com outra aula da mesma disciplina no dia, **+20** se fica separada dela
     e **+100** para uma 3ª aula da disciplina no mesmo dia;
   - **−3** por vizinho ocupado pela mesma turma, o que evita janelas;
   - **+0,1 × posição**, preferindo o início do turno.

   A sala escolhida é a mais usada pela turma (a turma tende a ficar na mesma sala); em empate, a menor sala que comporta a turma.
3. **Reparo por cadeia de ejeção.** Se não houver candidato livre, o algoritmo tenta cada candidato:
   remove as aulas que o bloqueiam (mesma turma, mesmo professor ou, se faltar sala, um ocupante de
   sala adequada), aloca a aula e tenta realocar recursivamente as removidas (profundidade 2, depois 3
   para as que sobraram). Tudo é registrado num *log* e desfeito se a cadeia falhar. Um limite de
   tentativas garante que o tempo de execução seja previsível.
4. **Minimização de janelas (diferencial).** Busca local com dois movimentos: mover uma aula para outro
   candidato livre e trocar duas aulas da mesma turma. Só aceita mudanças viáveis que reduzem o custo
   `3 × janelas das turmas + janelas dos professores + penalidade de distribuição`. As restrições
   obrigatórias nunca são violadas.
5. **Diagnóstico das pendências.** Para cada demanda incompleta, o motivo é identificado:
   - professor sem disponibilidade vigente;
   - disponibilidade que não coincide com o turno da turma;
   - nenhuma sala comporta a turma;
   - menos horários disponíveis que a carga;
   - ou, com contagem por tipo e exemplos: *professor ocupado em X*, *turma ocupada em Y*, *sem sala livre em Z*.

## Resultado com o seed (4 turmas, 27 vínculos, 78 aulas)

```
aulas_demandadas: 78   aulas_alocadas: 76   aulas_nao_alocadas: 2
janelas das turmas: 0   janelas dos professores: 0   tempo: ~5–35 ms
pendência: Redes de Computadores (ENG2-A): 2 de 2 aula(s) não alocada(s). A disponibilidade de
           Carla Mendes não coincide com nenhum horário de aula do turno da turma (Tarde).
```

A pendência é proposital: a Prof.ª Carla (cenário 2) só tem disponibilidade às segundas e quartas
pela manhã, e a ENG2-A estuda à tarde. A ENG1-A sai com a mesma composição da grade de exemplo do
enunciado (aulas geminadas, 20 aulas, sem janelas).

## Relatório de conflitos (`GET /api/horarios/conflitos`)

Revalida qualquer versão a qualquer momento, inclusive depois de edições manuais e de mudanças de disponibilidade:

| Tipo | Gravidade | Bloqueia publicação? |
|---|---|---|
| `choque_professor`, `choque_sala`, `choque_turma` | erro | sim |
| `fora_da_faixa` | erro | sim |
| `fora_da_disponibilidade` | alerta | não (o coordenador decide) |
| `capacidade` | alerta | não |
| `carga_incompleta` (com o motivo da geração), `carga_excedente` | alerta | não |

Além disso, o banco impede choques com índices únicos por versão (veja o [DER](der.md)).
