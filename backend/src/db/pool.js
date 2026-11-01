const { Pool, types } = require('pg');
const config = require('../config');

// bigint (int8) e numeric como number: os ids cabem com folga em Number.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));
// time sem segundos ("08:00:00" -> "08:00").
types.setTypeParser(1083, (v) => v.slice(0, 5));

// sslmode na URL sobrescreveria o objeto ssl abaixo, então é removido.
const connectionString = config.databaseUrl.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');

const pool = new Pool({
  connectionString,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction };
