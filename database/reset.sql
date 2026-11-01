-- Remove todas as tabelas e tipos do SUCELSO TECH (use apenas para reinstalar do zero).
drop table if exists notificacoes, historico_alteracoes, pendencias_geracao, horarios, versoes_horario,
  disponibilidades, turma_disciplinas, alunos, professores, usuarios, turmas, disciplinas, salas,
  faixas_horario, turnos, periodos_letivos cascade;
drop type if exists situacao_aula, status_versao, tipo_solicitacao, status_disponibilidade, tipo_faixa,
  status_coleta, perfil_usuario cascade;
