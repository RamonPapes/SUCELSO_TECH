// Ambiente isolado de testes: banco sucelso_test, JWT local e login de desenvolvimento.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:54329/sucelso_test';
process.env.SUPABASE_JWT_SECRET = 'segredo-de-teste-com-pelo-menos-32-caracteres';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.DEV_LOGIN = 'true';
process.env.CORS_ORIGIN = 'http://localhost:5173';
