# SUCELSO TECH — Requisitos, casos de uso e regras de negócio

## 1. Perfis

| Perfil | Descrição |
|---|---|
| **Aluno** | Somente leitura: consulta a grade publicada da própria turma e os cadastros públicos (salas, disciplinas, turmas). |
| **Professor** | Consulta a própria grade e turmas; registra e altera **apenas a própria disponibilidade**. |
| **Coordenador** | Administra cadastros, aprova disponibilidades, gera, edita, revisa e publica grades, consulta relatórios e histórico. Pode ter vínculo docente (registro em `professores`) para informar a própria disponibilidade. |

## 2. Requisitos funcionais

| ID | Módulo | Requisito |
|---|---|---|
| RF01 | Autenticação | Login por e-mail e senha via Supabase Auth. |
| RF02 | Autenticação | A API identifica o perfil do usuário a partir do token e valida a permissão em **toda** rota (inclusive chamadas diretas à API). |
| RF03 | Cadastro | Coordenador administra alunos, professores, disciplinas, turmas, salas, turnos, faixas de horário e períodos letivos. |
| RF04 | Cadastro | Coordenador vincula disciplina a turma e docente com carga semanal (`turma_disciplinas`). |
| RF05 | Disponibilidade | Professor registra dias e intervalos em que pode lecionar. |
| RF06 | Disponibilidade | Durante a coleta (aberta e sem grade publicada) a edição é imediata; depois, vira **solicitação pendente** que o coordenador aprova ou rejeita. |
| RF07 | Geração | Coordenador aciona o algoritmo que cria uma versão **rascunho** da grade respeitando as restrições RN10–RN16. |
| RF08 | Geração | Aulas não alocadas e seus motivos são registrados e exibidos ao coordenador. |
| RF09 | Conflitos | Relatório de conflitos de uma versão: choques de professor/sala/turma, aulas fora da disponibilidade vigente, carga não atendida e sala sem capacidade. |
| RF10 | Visualização | Aluno vê a grade publicada da turma; professor vê a própria grade publicada; coordenador vê qualquer versão filtrando por turma, professor ou sala. |
| RF11 | Administração | Coordenador edita uma alocação (dia, horário, sala, professor) de versão não publicada. |
| RF12 | Administração | Fluxo de estados: rascunho → em revisão → publicada (a anterior vira arquivada). |
| RF13 | Administração | Histórico registra usuário, data, operação e valores antes/depois de cada alteração. |
| RF14 | Relatórios | Indicadores de ocupação de salas e resumo de versões (diferencial). |
| RF15 | Diferencial | Exportação/impressão da grade em PDF, notificações de publicação e minimização de janelas. |

## 3. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF01 | Frontend React (Vite) na Vercel; API Node.js/Express no Render; PostgreSQL no Supabase. |
| RNF02 | Comunicação REST/JSON sobre HTTPS; CORS restrito ao domínio do frontend. |
| RNF03 | Credenciais apenas em variáveis de ambiente; a `service_role` key do Supabase **nunca** vai para o frontend. |
| RNF04 | RLS habilitado em todas as tabelas do schema `public` sem policies para `anon`/`authenticated`: o banco só é acessível pela API. |
| RNF05 | Interface responsiva (grade em tabela no desktop e lista por dia no celular). |
| RNF06 | A API no plano gratuito do Render hiberna; o frontend exibe aviso de "servidor iniciando". |
| RNF07 | Códigos HTTP padronizados: 400 validação, 401 não autenticado, 403 sem permissão, 404 inexistente, 409 conflito/estado inválido, 422 regra de negócio. |

## 4. Casos de uso

```
            ┌──────────────────────────────────────────────────────────┐
 Aluno ─────┤ UC01 Fazer login                                         │
   │        │ UC02 Consultar grade da turma                            │
   │        │ UC03 Consultar salas, disciplinas e turmas               │
 Professor ─┤ UC01, UC03                                               │
   │        │ UC04 Consultar a própria grade e turmas                  │
   │        │ UC05 Registrar/alterar a própria disponibilidade         │
 Coordenador┤ UC01, UC03, UC05                                         │
            │ UC06 Manter cadastros acadêmicos                         │
            │ UC07 Aprovar/rejeitar solicitações de disponibilidade    │
            │ UC08 Gerar proposta de grade                             │
            │ UC09 Consultar conflitos e pendências                    │
            │ UC10 Ajustar alocação                                    │
            │ UC11 Enviar para revisão / publicar versão               │
            │ UC12 Consultar histórico e relatórios                    │
            └──────────────────────────────────────────────────────────┘
```

| UC | Ator | Fluxo principal | Exceções |
|---|---|---|---|
| UC05 | Professor | Informa dia, início e fim → API valida → grava como *vigente* (coleta aberta) ou *pendente* (após publicação). | Intervalo inválido (400); sobreposição (422); disponibilidade de outro professor (403). |
| UC08 | Coordenador | Escolhe o período → API executa o algoritmo em transação → cria versão *rascunho* com aulas e pendências. | Período sem demandas (422). |
| UC10 | Coordenador | Seleciona a aula → informa novo dia/horário/sala → API revalida restrições → grava como *ajustada* e registra histórico. | Choque com outra aula (409); versão publicada/arquivada (409); horário fora das faixas do turno (422). |
| UC11 | Coordenador | Envia rascunho para revisão → publica → versão anterior vira *arquivada*. | Transição inválida (409). |

## 5. Regras de negócio

| ID | Regra |
|---|---|
| RN01 | Aluno possui somente permissão de leitura. |
| RN02 | Professor altera exclusivamente a **própria** disponibilidade; nunca a grade. |
| RN03 | Somente coordenadores criam, ajustam, aprovam e publicam horários e mantêm cadastros. |
| RN04 | Disponibilidade só em dias úteis (1 = segunda … 5 = sexta) e com `inicio < fim`; não pode sobrepor outra disponibilidade vigente/pendente do mesmo professor no mesmo dia. |
| RN05 | Com a coleta **aberta** e sem versão publicada no período, a disponibilidade é gravada como *vigente*. Caso contrário, vira solicitação *pendente* (inclusão, alteração ou remoção). |
| RN06 | Aprovar/rejeitar solicitações é exclusivo do coordenador. Aprovar **não altera** a grade publicada; eventuais aulas fora da nova disponibilidade passam a aparecer no relatório de conflitos. |
| RN07 | Cada período letivo possui no máximo **uma** versão publicada; publicar uma nova arquiva a anterior. |
| RN08 | Versões publicadas ou arquivadas são imutáveis; para alterá-las, o coordenador duplica a versão em um novo rascunho. |
| RN09 | Alunos e professores só enxergam a versão **publicada**. |
| RN10 | Professor não pode ministrar duas aulas simultâneas. |
| RN11 | Sala não pode receber duas turmas no mesmo intervalo. |
| RN12 | Turma não pode cursar duas disciplinas ao mesmo tempo. |
| RN13 | A aula deve caber integralmente em uma disponibilidade vigente do professor. |
| RN14 | A carga semanal (em aulas) de cada vínculo turma–disciplina deve ser atendida; o que faltar vira pendência. |
| RN15 | Aulas só ocorrem nas faixas do tipo *aula* do turno da turma (intervalos e outros turnos são proibidos). |
| RN16 | A sala deve ter capacidade maior ou igual ao número de alunos da turma. |
| RN17 | Toda operação de escrita registra usuário, data, operação e valores alterados em `historico_alteracoes`. |

## 6. Grade de horários da escola

Aulas de 60 min com intervalo de 20 min, conforme a grade de exemplo do enunciado:

| Turno | 1ª aula | 2ª aula | Intervalo | 3ª aula | 4ª aula |
|---|---|---|---|---|---|
| Manhã | 08:00–09:00 | 09:00–10:00 | 10:00–10:20 | 10:20–11:20 | 11:20–12:20 |
| Tarde | 13:00–14:00 | 14:00–15:00 | 15:00–15:20 | 15:20–16:20 | 16:20–17:20 |
| Noite | 18:30–19:30 | 19:30–20:30 | 20:30–20:50 | 20:50–21:50 | 21:50–22:50 |

Cada turma tem, portanto, 20 aulas semanais possíveis (4 por dia × 5 dias).

## 7. Divisão de tarefas sugerida

| Integrante | Responsabilidades |
|---|---|
| A | Banco (DDL, seed), autenticação/RBAC, algoritmo de geração e conflitos, testes da API. |
| B | Frontend (login, painéis, grade), deploy Vercel, evidências visuais. |
| Ambos | Documentação, cenário de validação, apresentação. |
