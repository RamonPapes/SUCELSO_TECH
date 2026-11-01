# API REST

Base: `https://<api>.onrender.com` (local: `http://localhost:3001`). JSON em todas as rotas.
Autenticação: `Authorization: Bearer <access_token do Supabase Auth>`.
Erros: `{ "erro": "mensagem", "detalhes": [...] }` com 400 (validação), 401 (sem token / token inválido),
403 (perfil sem permissão), 404 (inexistente), 409 (conflito ou estado inválido), 422 (regra de negócio).

Legenda de perfis: **A** aluno · **P** professor · **C** coordenador.

## Endpoints obrigatórios do enunciado

| Método | Endpoint | Perfis | Descrição |
|---|---|---|---|
| GET | `/api/horarios/minha-turma` | A | Grade **publicada** da turma do aluno, com faixas (inclui intervalos). |
| GET | `/api/horarios/professor` | P, C | Grade publicada do professor + turmas atribuídas. C pode passar `?professor_id=`. |
| GET | `/api/disciplinas` | A, P, C | Lista disciplinas. |
| GET | `/api/salas` | A, P, C | Lista salas. |
| POST | `/api/disponibilidades` | P, C | `{dia, inicio, fim}` → 201 *vigente* (coleta aberta) ou 202 *pendente* (após publicação). |
| PUT | `/api/disponibilidades/:id` | P, C (própria) | Altera; após publicação cria solicitação de alteração (202). |
| POST | `/api/horarios/gerar` | C | `{periodo_letivo_id?, minimizar_janelas?=true}` → nova versão *rascunho* + estatísticas + pendências. |
| PUT | `/api/horarios/:id` | C | `{dia?, inicio?, sala_id?, professor_id?, forcar?}`. Choque → 409; fora da disponibilidade/capacidade → 422 (salvo `forcar: true`); versão publicada → 409. |
| POST | `/api/horarios/versoes/:id/publicar` | C | Publica versão *em revisão*; arquiva a anterior; notifica todos. Conflito grave → 422. |
| GET | `/api/horarios/conflitos?versao_id=` | C | Relatório: choques, fora da disponibilidade/faixa, capacidade, carga incompleta/excedente (com motivo). |

## Demais endpoints

### Autenticação
| Método | Endpoint | Perfis | Descrição |
|---|---|---|---|
| GET | `/api/health` | público | Verifica API e banco. |
| GET | `/api/auth/me` | todos | Usuário, perfil, `professor_id`, `turma_id`. |
| POST | `/api/auth/dev-login` | — | **Somente local** (`DEV_LOGIN=true` e `NODE_ENV≠production`). |

### Cadastros (leitura: todos · escrita: C)
| Recurso | Rotas | Campos |
|---|---|---|
| Disciplinas | `GET/POST /api/disciplinas`, `GET/PUT/DELETE /api/disciplinas/:id` | nome, codigo, carga_horaria |
| Salas | `/api/salas` | identificacao, capacidade |
| Turmas | `/api/turmas` | nome, turno_id, periodo_letivo_id, qtd_alunos |
| Períodos | `/api/periodos` | nome, inicio, fim, status_coleta (`aberta`/`fechada`) |
| Turnos | `/api/turnos` (inclui `faixas`) | nome, inicio, fim (sem sobreposição entre turnos) |
| Faixas | `POST /api/turnos/:id/faixas`, `PUT/DELETE /api/faixas/:id` | ordem, inicio, fim, tipo (`aula`/`intervalo`) |
| Vínculos | `/api/turma-disciplinas` (`?turma_id=&professor_id=`) | turma_id, disciplina_id, professor_id, carga_semanal. A vê os da turma; P vê os próprios. |
| Professores | `GET /api/professores` (C) | — |
| Usuários (C) | `GET /api/usuarios?perfil=`, `POST`, `PUT/DELETE /api/usuarios/:uuid` | nome, email, senha, perfil, matricula, turma_id, docente / nome, ativo, matricula, turma_id |

### Disponibilidade
| Método | Endpoint | Perfis | Descrição |
|---|---|---|---|
| GET | `/api/disponibilidades?status=&professor_id=&periodo_letivo_id=` | P (próprias), C (todas) | |
| DELETE | `/api/disponibilidades/:id` | P, C (própria) | Remove (coleta) / solicita remoção (após publicação) / cancela solicitação pendente. |
| POST | `/api/disponibilidades/:id/aprovar` · `/rejeitar` | C | Avalia solicitação. **Não altera a grade publicada.** |

### Grade e versões (C, exceto onde indicado)
| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/horarios?versao_id=&turma_id=&professor_id=&sala_id=` | Aulas de qualquer versão. |
| GET | `/api/horarios/publicados?turma_id=\|professor_id=\|sala_id=` | **Todos os perfis**: somente a versão publicada. |
| POST | `/api/horarios` | Inclui aula manual em rascunho/em revisão (mesmas validações do PUT). |
| DELETE | `/api/horarios/:id` | Remove aula de versão editável. |
| GET | `/api/horarios/versoes?periodo_letivo_id=` | Versões com totais e pendências. |
| GET | `/api/horarios/versoes/:id` | Versão + pendências da geração. |
| POST | `/api/horarios/versoes/:id/revisao` | rascunho → em revisão. |
| POST | `/api/horarios/versoes/:id/devolver` | em revisão → rascunho. |
| POST | `/api/horarios/versoes/:id/duplicar` | Cria rascunho a partir de qualquer versão (forma de alterar a publicada). |
| DELETE | `/api/horarios/versoes/:id` | Exclui rascunho. |

### Relatórios, histórico e notificações
| Método | Endpoint | Perfis | Descrição |
|---|---|---|---|
| GET | `/api/relatorios/resumo` | C | Contagens, solicitações pendentes, versão publicada. |
| GET | `/api/relatorios/ocupacao-salas?versao_id=` | C | Aulas/semana, taxa de ocupação geral e por turno, aproveitamento (alunos ÷ capacidade). |
| GET | `/api/historico?entidade=&limite=` | C | Usuário, data, operação e valores antes/depois. |
| GET | `/api/notificacoes` | todos | Notificações do próprio usuário. |
| POST | `/api/notificacoes/:id/lida` · `/api/notificacoes/lidas` | todos | Marca como lida(s). |

## Exemplos

```bash
# Gerar proposta
curl -X POST $API/api/horarios/gerar -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
# → 201 {"versao":{"id":1,"numero":1,"status":"rascunho",...},
#        "estatisticas":{"aulas_demandadas":78,"aulas_alocadas":76,"aulas_nao_alocadas":2,...},
#        "pendencias":[{"turma_disciplina_id":20,"aulas_faltantes":2,"motivo":"Redes de Computadores (ENG2-A): ..."}]}

# Mover aula para horário ocupado pela mesma turma
curl -X PUT $API/api/horarios/10 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"dia":1,"inicio":"08:00"}'
# → 409 {"erro":"A alteração gera conflito de horário",
#        "detalhes":[{"tipo":"choque_turma","gravidade":"erro","mensagem":"ENG1-A já tem JavaScript em segunda 08:00–09:00"}]}
```
