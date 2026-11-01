# SUCELSO TECH: Sistema Inteligente de Horários Escolares

Aplicação full stack que centraliza cadastros acadêmicos, recebe a disponibilidade dos professores,
**gera automaticamente propostas de grade horária** sem conflitos e publica a grade oficial para
alunos e professores. Somente coordenadores alteram e publicam a grade.

> Situação de Aprendizagem: Desenvolvimento Full Stack, Engenharia de Computação, SENAI CIMATEC.

| | URL |
|---|---|
| Frontend (Vercel) | _preencher após o deploy_ |
| API (Render) | _preencher após o deploy_ (`/api/health`) |

## Arquitetura

```
┌──────────────┐  HTTPS  ┌────────────────────┐  REST/JSON + Bearer JWT  ┌─────────────────────┐   SQL (pooler)   ┌───────────────────┐
│  Navegador   │ ──────▶ │ Frontend React     │ ───────────────────────▶ │ API Node.js/Express │ ───────────────▶ │ PostgreSQL        │
│              │         │ (Vite) — Vercel    │                          │ — Render            │                  │ — Supabase        │
└──────────────┘         └────────┬───────────┘                          └─────────┬───────────┘                  └───────────────────┘
                                  │ login (chave anon)                             │ valida JWT / cria contas (service_role)
                                  └──────────────────────▶ Supabase Auth ◀─────────┘
```

- O frontend usa o Supabase **somente para login**. Todos os dados passam pela API, que valida o
  token, carrega o perfil do banco e aplica as permissões em **todas** as rotas.
- A `service_role` key existe só no Render. O RLS habilitado sem policies bloqueia o acesso direto pela Data API.

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, React Router 7, Vite, CSS próprio (responsivo, tema claro/escuro, impressão) |
| Backend | Node.js 22+, Express 5, `pg`, zod, helmet, cors, jsonwebtoken, `@supabase/supabase-js` |
| Banco / Auth | PostgreSQL + Supabase Auth |
| Testes | Jest + Supertest (102 testes), Playwright (E2E com 15 passos) |

## Funcionalidades por perfil

| Funcionalidade | Aluno | Professor | Coordenador |
|---|:-:|:-:|:-:|
| Login e consulta da grade publicada (turma, sala, professor) | ✔ | ✔ | ✔ |
| Consulta de salas, disciplinas e turmas | ✔ | ✔ | ✔ |
| Registrar/alterar a própria disponibilidade | | ✔ | ✔ |
| Aprovar/rejeitar solicitações de disponibilidade | | | ✔ |
| Gerar proposta, ver conflitos, ajustar, revisar e publicar | | | ✔ |
| Cadastros (usuários, disciplinas, turmas, salas, turnos/faixas, períodos, vínculos) | | | ✔ |
| Relatórios (ocupação de salas, resumo) e histórico de alterações | | | ✔ |
| Notificações e exportação em PDF | ✔ | ✔ | ✔ |

**Fluxo da grade:** gerar (*rascunho*) → ajustar → *em revisão* → *publicada* (a anterior vira *arquivada*).
Versões publicadas são imutáveis; para alterar, o coordenador duplica uma versão em um novo rascunho. Depois
da publicação, mudanças de disponibilidade viram **solicitações** e **nunca** alteram a grade oficial automaticamente.

## Usuários de teste

Senha de todos: **`Sucelso@2026`**

| Perfil | E-mail | Observação |
|---|---|---|
| Coordenadora | `coordenacao@sucelso.tech` | também docente |
| Professores | `ana.souza`, `bruno.lima`, `carla.mendes`, `diego.rocha`, `eduarda.alves`, `fabio.nunes`, `gabriela.torres` `@sucelso.tech` | Carla: só seg/qua (cenário 2) |
| Alunos | `lucas.pereira`, `mariana.costa` (ENG1-A), `rafael.gomes`, `beatriz.silva` (ENG1-B), `thiago.martins`, `juliana.ramos` (ENG2-A), `pedro.almeida`, `larissa.freitas` (ENG3-N) `@aluno.sucelso.tech` | |

Dados: 4 turmas (manhã, manhã, tarde, noite), 8 docentes, 10 disciplinas, 6 salas, 27 vínculos e 78 aulas semanais.

## Estrutura do repositório

```
backend/            API Express
  src/routes/       auth, cadastros (CRUD genérico), usuarios, disponibilidades, horarios, relatorios
  src/services/     gerador.js (algoritmo), grade.js (versões e conflitos), authAdmin.js, historico.js
  src/middlewares/  autenticação, autorização por perfil, validação (zod), erros
  scripts/          db-setup.js, seed.js
  tests/            Jest + Supertest
frontend/           React + Vite (páginas por perfil, componente de grade semanal)
database/           schema.sql, seed.sql, reset.sql, local/auth-stub.sql
e2e/                teste ponta a ponta (Playwright)
docs/               requisitos, DER, algoritmo, API, testes, deploy, apresentação, evidências
render.yaml         blueprint do Render
```

## Rodando localmente

Pré-requisitos: Node.js 20.19+ e Docker (ou um PostgreSQL local).

```bash
# 1. Banco
docker run -d --name sucelso-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sucelso -p 54329:5432 postgres:16-alpine

# 2. API (http://localhost:3001)
cd backend
cp .env.example .env            # ajuste: SUPABASE_JWT_SECRET=<32+ caracteres> e DEV_LOGIN=true
npm install
npm run db:setup -- --local --reset   # --local cria um auth.users simulado (sem Supabase)
npm run db:seed
npm run dev

# 3. Frontend (http://localhost:5173)
cd ../frontend
cp .env.example .env            # VITE_SUPABASE_URL vazio = login local de desenvolvimento
npm install
npm run dev
```

Para usar o Supabase Auth localmente, preencha `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no backend e
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no frontend.

## Testes

```bash
docker exec sucelso-pg psql -U postgres -c "create database sucelso_test"   # uma vez
cd backend && npm test                                                       # 102 testes

# E2E (com API e frontend rodando sobre um banco recém-semeado)
cd e2e && npm install && npx playwright install chromium && npm test
```

## Publicação

Passo a passo em [`docs/deploy.md`](docs/deploy.md): Supabase (schema + Auth + seed) → Render (`render.yaml`) → Vercel (`frontend/`).

## Documentação

| Documento | Conteúdo |
|---|---|
| [Requisitos e regras de negócio](docs/requisitos.md) | RF, RNF, casos de uso, RN01–RN17, grade de horários da escola |
| [Protótipos](docs/prototipos.md) | Wireframes de baixa fidelidade |
| [DER](docs/der.md) | Diagrama entidade-relacionamento e integridade |
| [Algoritmo](docs/algoritmo.md) | Geração, reparo, minimização de janelas e conflitos |
| [API](docs/api.md) | Todos os endpoints, perfis e códigos HTTP |
| [Testes](docs/testes.md) | Evidências funcionais e de segurança, capturas de tela |
| [Deploy](docs/deploy.md) | Supabase, Render e Vercel |
| [Apresentação](docs/apresentacao.md) | Roteiro da demonstração |

## Critérios de avaliação → onde encontrar

| Critério | Pontos | Evidência |
|---|:-:|---|
| Requisitos e documentação | 10 | `docs/requisitos.md`, `docs/prototipos.md`, este README |
| Modelagem e banco Supabase | 15 | `database/schema.sql`, `docs/der.md`, `database/seed.sql` |
| Backend Node.js e API REST | 15 | `backend/`, `docs/api.md`, 102 testes |
| Frontend, responsividade e usabilidade | 15 | `frontend/`, capturas 04, 09 e 11 (celular) |
| Autenticação e permissões | 10 | `backend/src/middlewares/auth.js`, testes de segurança em `docs/testes.md` |
| Geração automática e conflitos | 20 | `backend/src/services/gerador.js`, `docs/algoritmo.md`, `GET /api/horarios/conflitos` |
| Deploy e integração | 10 | `render.yaml`, `frontend/vercel.json`, `docs/deploy.md` |
| Apresentação | 5 | `docs/apresentacao.md` |
| **Diferenciais** | | Exportação PDF, notificações, ocupação das salas, minimização de janelas |
