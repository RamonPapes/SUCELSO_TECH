// Criação/remoção de contas de login.
// Produção: Supabase Auth Admin API (service_role, somente no backend).
// Desenvolvimento/testes: tabela auth.users simulada (database/local/auth-stub.sql).
const config = require('../config');

let supabaseAdmin = null;
function supabase() {
  if (!supabaseAdmin) {
    const { createClient } = require('@supabase/supabase-js');
    supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

const usaSupabase = () => Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);

async function criarConta(client, email, senha) {
  if (usaSupabase()) {
    const { data, error } = await supabase().auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error) {
      const err = new Error(`Falha ao criar conta no Supabase Auth: ${error.message}`);
      err.status = /already|registered|exists/i.test(error.message) ? 409 : 400;
      throw err;
    }
    return data.user.id;
  }
  const { rows } = await client.query(
    `insert into auth.users (email, encrypted_password) values ($1, crypt($2, gen_salt('bf'))) returning id`,
    [email, senha]
  );
  return rows[0].id;
}

async function removerConta(client, id) {
  if (usaSupabase()) {
    const { error } = await supabase().auth.admin.deleteUser(id);
    if (error) throw new Error(`Falha ao remover conta no Supabase Auth: ${error.message}`);
    return;
  }
  await client.query('delete from auth.users where id = $1', [id]);
}

// Usado pelo seed: devolve o id da conta existente (por e-mail) ou cria uma nova.
async function obterOuCriarConta(client, email, senha) {
  if (usaSupabase()) {
    for (let page = 1; ; page++) {
      const { data, error } = await supabase().auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const user = data.users.find((u) => u.email === email);
      if (user) return user.id;
      if (data.users.length < 1000) break;
    }
    return criarConta(client, email, senha);
  }
  const { rows } = await client.query('select id from auth.users where email = $1', [email]);
  return rows[0] ? rows[0].id : criarConta(client, email, senha);
}

// Valida o token junto ao Supabase Auth (quando não há SUPABASE_JWT_SECRET para validar localmente).
async function usuarioDoToken(token) {
  const { data, error } = await supabase().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

module.exports = { criarConta, removerConta, obterOuCriarConta, usuarioDoToken, usaSupabase };
