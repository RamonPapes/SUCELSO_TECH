# Evidências de testes funcionais e de segurança

| Camada | Ferramenta | Como rodar | Resultado |
|---|---|---|---|
| API (integração) + algoritmo (unitário) | Jest + Supertest, banco PostgreSQL real | `cd backend && npm test` | **102/102** — [`evidencias/resultado-testes-api.txt`](evidencias/resultado-testes-api.txt) |
| Interface (ponta a ponta) | Playwright (Chromium) | `cd e2e && npm test` | **15/15**, sem erros de console — [`evidencias/resultado-e2e.txt`](evidencias/resultado-e2e.txt) + capturas de tela |

Os testes de API usam um banco separado (`sucelso_test`), recriado e semeado a cada suíte. O teste
E2E exige o banco recém-semeado, a API em `http://localhost:3001` e o frontend em `http://localhost:5173`
(veja o [README](../README.md#rodando-localmente)).

## Cenário obrigatório de validação (seção 10 do enunciado)

| # | Requisito | Teste de API ([`cenario.test.js`](../backend/tests/cenario.test.js)) | Evidência visual |
|---|---|---|---|
| 1 | ≥ 3 turmas, 6 professores, 8 disciplinas, 5 salas | `1. dados fictícios…` (4 / 8 / 10 / 6) | [17](evidencias/17-coordenador-cadastros-vinculos.png) |
| 2 | Professor com disponibilidade só seg/qua | `2. professor registra disponibilidade…` | [02](evidencias/02-professor-disponibilidade-seg-qua.png) |
| 3 | Coordenador solicita a geração | `3. somente o coordenador solicita…` (403 para professor/aluno, 401 sem token) | [04](evidencias/04-coordenador-grade-gerada.png) |
| 4 | Respeita disponibilidades e identifica conflitos | `4a`–`4d` (Carla só seg/qua; 0 choques; pendência com motivo; choque → 409) | [05](evidencias/05-coordenador-grade-por-professor.png), [07](evidencias/07-coordenador-edicao-com-choque.png) |
| 5 | Coordenador ajusta e publica | `5a`–`5f` (ajuste com histórico; 422 sem confirmação; fluxo de estados; versão publicada imutável) | [06](evidencias/06-coordenador-modal-ajuste.png), [08](evidencias/08-coordenador-publicada.png) |
| 6 | Aluno visualiza sem alterar | `6`, `6b`, `6c` | [09](evidencias/09-aluno-minha-turma.png), [11](evidencias/11-aluno-celular.png) |
| 7 | Nova disponibilidade não altera a grade publicada | `7. professor registra nova disponibilidade…` (grade idêntica antes/depois, mesmo após aprovação) | [13](evidencias/13-professor-solicitacao-apos-publicacao.png), [14](evidencias/14-coordenador-solicitacoes.png) |

## Testes de segurança

| Ataque / verificação | Esperado | Onde |
|---|---|---|
| Requisição sem token | 401 | `auth.test.js`, `cenario.test.js` (3), smoke de produção |
| Token com payload adulterado (`role: service_role`) sem reassinar | 401 | `auth.test.js` |
| Token assinado com outro segredo / expirado | 401 | `auth.test.js` |
| Token válido de conta sem cadastro em `usuarios` (ex.: auto-cadastro no Supabase) | 403 | `auth.test.js` |
| Usuário desativado | 403 em todas as rotas | `cadastros.test.js` |
| Aluno/professor chamando rotas de coordenador (POST/PUT/DELETE de cadastros, gerar, publicar, editar aula, conflitos, versões, relatórios, histórico) | 403 e **nenhum dado alterado** | `cadastros.test.js`, `cenario.test.js`, `relatorios.test.js` |
| Aluno chamando `PUT /api/horarios/:id` direto do navegador com o próprio token | 403 | E2E passo 10 |
| Professor alterando/excluindo disponibilidade de outro professor | 403 e registro intacto | `disponibilidades.test.js` |
| Professor burlando filtro (`?professor_id=` de outro) | ignorado: só os próprios dados | `cadastros.test.js`, `disponibilidades.test.js` |
| Professor aprovando a própria solicitação | 403 | `disponibilidades.test.js` |
| Marcar notificação de outro usuário | 404 | `relatorios.test.js` |
| Aluno lendo rascunho de grade | 403 (só a publicada é visível) | `cenario.test.js` (6b) |
| Login de desenvolvimento em produção | rota inexistente (404) | `auth.test.js`, smoke de produção |
| CORS de origem não autorizada | sem `Access-Control-Allow-Origin` | `auth.test.js`, smoke de produção |
| Entradas inválidas (tipos, formatos, dia 6, `inicio >= fim`, JSON malformado, id não numérico) | 400 com detalhes | vários |
| Violações de integridade (duplicados, FK, excluir turma com alunos) | 409 | `cadastros.test.js` |
| Rota desconhecida (`/api/nao-existe`) | 404 | `auth.test.js` |
| Chave `service_role` no bundle do frontend | ausente | `grep -r service_role frontend/dist` → 0 |
| Acesso direto ao banco pela Data API do Supabase | bloqueado (RLS sem policies + `revoke`) | `schema.sql` |
| Cabeçalhos de segurança (CSP, HSTS, nosniff, X-Frame-Options) | presentes (Helmet) | smoke de produção |

Smoke test do backend com `NODE_ENV=production` (simulando o Render):

```
health: {"status":"ok",...}
dev-login em produção: 404
PUT sem token: 401
Content-Security-Policy: default-src 'self';...
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
CORS origem permitida: Access-Control-Allow-Origin: https://sucelso-tech.vercel.app
CORS origem estranha: 0
bundle contém 'service_role'? 0 arquivo(s)
```

## Algoritmo de geração ([`gerador.test.js`](../backend/tests/gerador.test.js))

Todo teste valida **todas** as restrições obrigatórias sobre o resultado (função `verificarRestricoes`):
sem choque de professor/sala/turma, aula dentro da disponibilidade e das faixas do turno, sala com
capacidade suficiente e `alocadas + pendentes = carga semanal`.

| Caso | Verifica |
|---|---|
| Folga suficiente | 100% alocado |
| Disponibilidade só seg/qua | aulas apenas nesses dias |
| Distribuição | ≤ 2 aulas da mesma disciplina por dia |
| Sem disponibilidade no turno / sem disponibilidade / sem sala / carga > disponibilidade | pendência com o motivo correto |
| Sala única disputada | nunca duas turmas na mesma sala |
| Caso que o guloso não resolve | o reparo por cadeia de ejeção é acionado e aloca 100% |
| 3 turmas × 20 aulas com professores compartilhados | 60/60 alocadas |
| Minimização de janelas | não piora e mantém restrições |
| Determinismo | mesma entrada → mesma grade |

## Capturas de tela

| | |
|---|---|
| [01 login inválido](evidencias/01-login-invalido.png) | [10 notificação de publicação](evidencias/10-aluno-notificacao.png) |
| [02 disponibilidade seg/qua](evidencias/02-professor-disponibilidade-seg-qua.png) | [11 aluno no celular](evidencias/11-aluno-celular.png) |
| [03 painel inicial](evidencias/03-coordenador-painel-inicial.png) | [12 grade do professor](evidencias/12-professor-minha-grade.png) |
| [04 grade gerada + conflitos](evidencias/04-coordenador-grade-gerada.png) | [13 solicitação após publicação](evidencias/13-professor-solicitacao-apos-publicacao.png) |
| [05 visão por professor](evidencias/05-coordenador-grade-por-professor.png) | [14 solicitações (coordenação)](evidencias/14-coordenador-solicitacoes.png) |
| [06 ajuste de alocação](evidencias/06-coordenador-modal-ajuste.png) | [15 ocupação das salas](evidencias/15-coordenador-painel-ocupacao.png) |
| [07 choque bloqueado](evidencias/07-coordenador-edicao-com-choque.png) | [16 histórico](evidencias/16-coordenador-historico.png) |
| [08 versão publicada](evidencias/08-coordenador-publicada.png) | [17 cadastros / vínculos](evidencias/17-coordenador-cadastros-vinculos.png) |
| [09 aluno — minha turma](evidencias/09-aluno-minha-turma.png) | [PDF exportado](evidencias/grade-ENG1-A.pdf) |
