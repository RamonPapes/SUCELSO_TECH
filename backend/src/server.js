const config = require('./config');
const app = require('./app');

app.listen(config.port, () => {
  console.log(`SUCELSO TECH API ouvindo na porta ${config.port}`);
});
