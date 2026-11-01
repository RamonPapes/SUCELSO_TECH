// Cria as contas de teste (Supabase Auth ou auth.users local) e carrega database/seed.sql.
//   npm run db:seed
const fs = require('fs');
const path = require('path');

const SENHA_PADRAO = process.env.SEED_PASSWORD || 'Sucelso@2026';

const USUARIOS = [
  { nome: 'Helena Duarte', email: 'coordenacao@sucelso.tech', perfil: 'coordenador' },
  { nome: 'Ana Souza', email: 'ana.souza@sucelso.tech', perfil: 'professor' },
  { nome: 'Bruno Lima', email: 'bruno.lima@sucelso.tech', perfil: 'professor' },
  { nome: 'Carla Mendes', email: 'carla.mendes@sucelso.tech', perfil: 'professor' },
  { nome: 'Diego Rocha', email: 'diego.rocha@sucelso.tech', perfil: 'professor' },
  { nome: 'Eduarda Alves', email: 'eduarda.alves@sucelso.tech', perfil: 'professor' },
  { nome: 'Fábio Nunes', email: 'fabio.nunes@sucelso.tech', perfil: 'professor' },
  { nome: 'Gabriela Torres', email: 'gabriela.torres@sucelso.tech', perfil: 'professor' },
  { nome: 'Lucas Pereira', email: 'lucas.pereira@aluno.sucelso.tech', perfil: 'aluno' },
  { nome: 'Mariana Costa', email: 'mariana.costa@aluno.sucelso.tech', perfil: 'aluno' },
  { nome: 'Rafael Gomes', email: 'rafael.gomes@aluno.sucelso.tech', perfil: 'aluno' },
  { nome: 'Beatriz Silva', email: 'beatriz.silva@aluno.sucelso.tech', perfil: 'aluno' },
  { nome: 'Thiago Martins', email: 'thiago.martins@aluno.sucelso.tech', perfil: 'aluno' },
  { nome: 'Juliana Ramos', email: 'juliana.ramos@aluno.sucelso.tech', perfil: 'aluno' },
  { nome: 'Pedro Almeida', email: 'pedro.almeida@aluno.sucelso.tech', perfil: 'aluno' },
  { nome: 'Larissa Freitas', email: 'larissa.freitas@aluno.sucelso.tech', perfil: 'aluno' },
];

async function seed() {
  const { pool, transaction } = require('../src/db/pool');
  const authAdmin = require('../src/services/authAdmin');

  // Contas de login ficam fora da transação: no Supabase são criadas via HTTP.
  const ids = [];
  for (const u of USUARIOS) {
    ids.push(await authAdmin.obterOuCriarConta(pool, u.email, SENHA_PADRAO));
  }

  await transaction(async (client) => {
    for (const [i, u] of USUARIOS.entries()) {
      await client.query(
        `insert into usuarios (id, nome, email, perfil) values ($1, $2, $3, $4)
         on conflict (id) do update set nome = excluded.nome, email = excluded.email, perfil = excluded.perfil, ativo = true`,
        [ids[i], u.nome, u.email, u.perfil]
      );
    }
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'seed.sql'), 'utf8');
    await client.query(sql);
  });
  console.log(`✔ seed concluído — ${USUARIOS.length} usuários (senha: ${SENHA_PADRAO})`);
}

module.exports = { seed, USUARIOS, SENHA_PADRAO };

if (require.main === module) {
  seed()
    .then(() => require('../src/db/pool').pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
