const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { query } = require('./db/pool');
const { naoEncontrado, tratarErros } = require('./middlewares/erros');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // Sem Origin = chamadas server-to-server/curl; o controle de acesso é feito pelo token.
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
  })
);
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (req, res) => {
  await query('select 1');
  res.json({ status: 'ok', horario: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));

const cadastros = require('./routes/cadastros');
app.use('/api/disciplinas', cadastros.disciplinas);
app.use('/api/salas', cadastros.salas);
app.use('/api/periodos', cadastros.periodos);
app.use('/api/turmas', cadastros.turmas);
app.use('/api/turnos', cadastros.turnos);
app.use('/api', cadastros.faixas);
app.use('/api/turma-disciplinas', cadastros.vinculos);
app.use('/api/professores', cadastros.professores);
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/disponibilidades', require('./routes/disponibilidades'));
app.use('/api/horarios', require('./routes/horarios'));

const relatorios = require('./routes/relatorios');
app.use('/api/historico', relatorios.historico);
app.use('/api/notificacoes', relatorios.notificacoes);
app.use('/api/relatorios', relatorios.relatorios);

app.use(naoEncontrado);
app.use(tratarErros);

module.exports = app;
