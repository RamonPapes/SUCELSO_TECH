require('dotenv').config({ quiet: true });

const env = process.env;

const config = {
  port: Number(env.PORT) || 3001,
  nodeEnv: env.NODE_ENV || 'development',
  databaseUrl: env.DATABASE_URL,
  // Supabase exige SSL; o certificado do pooler é assinado pela CA própria do Supabase.
  databaseSsl: env.DATABASE_SSL ? env.DATABASE_SSL === 'true' : !/localhost|127\.0\.0\.1/.test(env.DATABASE_URL || ''),
  corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean),
  supabaseUrl: env.SUPABASE_URL,
  supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  // Se definido, o JWT é validado localmente (HS256). Caso contrário, a API consulta o Supabase Auth.
  supabaseJwtSecret: env.SUPABASE_JWT_SECRET,
  // Login local sem Supabase — apenas desenvolvimento/testes, nunca em produção.
  devLogin: env.DEV_LOGIN === 'true' && env.NODE_ENV !== 'production',
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL não definida');
}
if (!config.supabaseJwtSecret && !(config.supabaseUrl && config.supabaseServiceRoleKey)) {
  throw new Error('Defina SUPABASE_JWT_SECRET ou SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
}

module.exports = config;
