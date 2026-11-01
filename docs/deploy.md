# Publicação (Supabase + Render + Vercel)

Arquitetura: **navegador → frontend (Vercel) → API Node.js (Render) → PostgreSQL (Supabase)**.
O frontend usa o Supabase **apenas para login** (chave pública `anon`); todos os dados passam pela API.

## 1. Supabase (banco + autenticação)

1. Crie um projeto em <https://supabase.com> e guarde a senha do banco.
2. **SQL Editor** → cole e execute [`database/schema.sql`](../database/schema.sql).
   - Não execute `database/local/auth-stub.sql` (é só para testes locais; o Supabase já tem `auth.users`).
3. **Authentication → Sign In / Providers**:
   - Desative **Allow new users to sign up** (as contas são criadas pela coordenação via API).
   - Em **Email**, desative **Confirm email** (opcional; as contas criadas pela API já são confirmadas).
4. Anote, em **Project Settings**:

   | Onde | Valor | Usado em |
   |---|---|---|
   | API → Project URL | `https://<ref>.supabase.co` | Render `SUPABASE_URL` e Vercel `VITE_SUPABASE_URL` |
   | API Keys → `anon` / publishable | chave pública | **somente** Vercel `VITE_SUPABASE_ANON_KEY` |
   | API Keys → `service_role` / secret | chave secreta | **somente** Render `SUPABASE_SERVICE_ROLE_KEY` |
   | Database → Connect → **Session pooler** | `postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:5432/postgres` | Render `DATABASE_URL` |
   | JWT Keys → Legacy JWT secret (opcional) | segredo HS256 | Render `SUPABASE_JWT_SECRET` |

   > Use o **Session pooler** (IPv4). A conexão direta do Supabase é IPv6 e o Render não a alcança.
   > Se `SUPABASE_JWT_SECRET` ficar vazio, a API valida cada token consultando o Supabase Auth
   > (funciona com as novas chaves assimétricas; um pouco mais lento).

5. **Dados de teste**: na sua máquina, dentro de `backend/`, rode o seed apontando para o Supabase:

   ```bash
   DATABASE_URL='<session pooler>' SUPABASE_URL='https://<ref>.supabase.co' \
   SUPABASE_SERVICE_ROLE_KEY='<service_role>' npm run db:seed
   ```

   Isso cria as 16 contas no Supabase Auth (senha `Sucelso@2026`) e carrega `database/seed.sql`.

## 2. Render (API)

1. Suba o repositório para o GitHub.
2. Render → **New → Blueprint** → selecione o repositório (usa [`render.yaml`](../render.yaml)),
   ou **New → Web Service** com: root `backend`, build `npm ci --omit=dev`, start `npm start`, health check `/api/health`.
3. Preencha as variáveis: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (opcional)
   e `CORS_ORIGIN` (URL da Vercel, ex.: `https://sucelso-tech.vercel.app`; várias separadas por vírgula).
   **Não** defina `DEV_LOGIN` (e `NODE_ENV=production` o desativa de qualquer forma).
4. Teste: `https://<servico>.onrender.com/api/health` → `{"status":"ok"}`.

> Plano gratuito: a API hiberna após ~15 min sem uso; a primeira requisição pode levar até ~1 min.
> O frontend mostra o aviso “Servidor iniciando…”. Projetos gratuitos do Supabase pausam após 7 dias sem uso.

## 3. Vercel (frontend)

1. Vercel → **Add New → Project** → importe o repositório.
2. **Root Directory**: `frontend` (framework detectado: Vite; build `npm run build`; output `dist`).
3. Variáveis de ambiente:
   - `VITE_API_URL` = URL do Render (sem barra no final)
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = chave **anon/publishable** (nunca a service_role)
4. Deploy. O [`vercel.json`](../frontend/vercel.json) redireciona todas as rotas para o SPA.
5. Volte ao Render e confira se `CORS_ORIGIN` contém exatamente a URL final da Vercel.

## 4. Verificação pós-deploy

- [ ] `GET /api/health` responde no Render.
- [ ] Login com `coordenacao@sucelso.tech` na URL da Vercel.
- [ ] Executar o roteiro de [`apresentacao.md`](apresentacao.md) (cenário obrigatório 1–7).
- [ ] No navegador (DevTools → Sources), buscar `service_role` no bundle: não deve existir.
- [ ] `curl -X PUT https://<api>/api/horarios/1` sem token → `401`; com token de aluno → `403`.
