// RN17: toda escrita registra usuário, data, operação e valores alterados.
async function registrar(client, usuarioId, entidade, entidadeId, operacao, valores = null) {
  await client.query(
    `insert into historico_alteracoes (usuario_id, entidade, entidade_id, operacao, valores_alterados)
     values ($1, $2, $3, $4, $5)`,
    [usuarioId, entidade, entidadeId == null ? null : String(entidadeId), operacao, valores && JSON.stringify(valores)]
  );
}

async function notificar(client, usuarioIds, mensagem) {
  if (!usuarioIds.length) return;
  await client.query(
    `insert into notificacoes (usuario_id, mensagem) select unnest($1::uuid[]), $2`,
    [usuarioIds, mensagem]
  );
}

async function notificarPerfis(client, perfis, mensagem) {
  await client.query(
    `insert into notificacoes (usuario_id, mensagem)
     select id, $2 from usuarios where ativo and perfil = any($1::perfil_usuario[])`,
    [perfis, mensagem]
  );
}

module.exports = { registrar, notificar, notificarPerfis };
