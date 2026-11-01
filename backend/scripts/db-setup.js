// Aplica o schema no banco de DATABASE_URL.
//   npm run db:setup                 -> schema.sql
//   npm run db:setup -- --reset      -> reset.sql + schema.sql (APAGA os dados)
//   npm run db:setup -- --local      -> também cria o auth.users simulado (Postgres sem Supabase)
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', '..', 'database');

async function setup({ reset = false, local = false } = {}) {
  const { pool } = require('../src/db/pool');
  const arquivos = [
    ...(local ? ['local/auth-stub.sql'] : []),
    ...(reset ? ['reset.sql'] : []),
    'schema.sql',
  ];
  for (const arquivo of arquivos) {
    await pool.query(fs.readFileSync(path.join(DB_DIR, arquivo), 'utf8'));
    console.log(`✔ ${arquivo}`);
    if (local && reset && arquivo === 'reset.sql') {
      await pool.query('truncate auth.users');
      console.log('✔ auth.users (local) limpo');
    }
  }
}

module.exports = { setup };

if (require.main === module) {
  const args = process.argv.slice(2);
  setup({ reset: args.includes('--reset'), local: args.includes('--local') })
    .then(() => require('../src/db/pool').pool.end())
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
