-- SUCELSO TECH — Sistema Inteligente de Horários Escolares
-- Schema PostgreSQL (Supabase). Executar no SQL Editor do Supabase ou via `npm run db:setup` no backend.
-- Pré-requisito: schema `auth` com a tabela `auth.users` (nativo no Supabase).

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type perfil_usuario as enum ('aluno', 'professor', 'coordenador');
create type status_coleta as enum ('aberta', 'fechada');
create type tipo_faixa as enum ('aula', 'intervalo');
create type status_disponibilidade as enum ('vigente', 'pendente', 'rejeitada', 'inativa');
create type tipo_solicitacao as enum ('inclusao', 'alteracao', 'remocao');
create type status_versao as enum ('rascunho', 'em_revisao', 'publicada', 'arquivada');
create type situacao_aula as enum ('gerada', 'ajustada');

-- ---------------------------------------------------------------------------
-- Estrutura acadêmica
-- ---------------------------------------------------------------------------
create table periodos_letivos (
  id            bigint generated always as identity primary key,
  nome          text not null unique,
  inicio        date not null,
  fim           date not null,
  status_coleta status_coleta not null default 'aberta',
  check (inicio < fim)
);

create table turnos (
  id     bigint generated always as identity primary key,
  nome   text not null unique,
  inicio time not null,
  fim    time not null,
  check (inicio < fim)
);

-- Faixas de horário de cada turno (aulas e intervalos), ex.: 08:00–09:00 aula, 10:00–10:20 intervalo.
create table faixas_horario (
  id       bigint generated always as identity primary key,
  turno_id bigint not null references turnos (id) on delete cascade,
  ordem    smallint not null,
  inicio   time not null,
  fim      time not null,
  tipo     tipo_faixa not null default 'aula',
  check (inicio < fim),
  unique (turno_id, ordem),
  unique (turno_id, inicio)
);

create table salas (
  id            bigint generated always as identity primary key,
  identificacao text not null unique,
  capacidade    integer not null check (capacidade > 0)
);

create table disciplinas (
  id            bigint generated always as identity primary key,
  nome          text not null,
  codigo        text not null unique,
  carga_horaria integer not null check (carga_horaria > 0) -- carga total no período, em horas
);

create table turmas (
  id                bigint generated always as identity primary key,
  nome              text not null,
  turno_id          bigint not null references turnos (id) on delete restrict,
  periodo_letivo_id bigint not null references periodos_letivos (id) on delete restrict,
  qtd_alunos        integer not null default 0 check (qtd_alunos >= 0),
  unique (nome, periodo_letivo_id)
);

-- ---------------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------------
create table usuarios (
  id        uuid primary key references auth.users (id) on delete cascade,
  nome      text not null,
  email     text not null unique,
  perfil    perfil_usuario not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table professores (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null unique references usuarios (id) on delete cascade,
  matricula  text not null unique
);

create table alunos (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null unique references usuarios (id) on delete cascade,
  matricula  text not null unique,
  turma_id   bigint not null references turmas (id) on delete restrict
);

-- Vínculo disciplina × turma × docente com a carga semanal (em aulas).
create table turma_disciplinas (
  id            bigint generated always as identity primary key,
  turma_id      bigint not null references turmas (id) on delete cascade,
  disciplina_id bigint not null references disciplinas (id) on delete restrict,
  professor_id  bigint not null references professores (id) on delete restrict,
  carga_semanal smallint not null check (carga_semanal between 1 and 30),
  unique (turma_id, disciplina_id)
);

-- ---------------------------------------------------------------------------
-- Disponibilidade docente
-- vigente  = considerada pelo algoritmo
-- pendente = solicitação aguardando o coordenador (tipo_solicitacao + substitui_id)
-- ---------------------------------------------------------------------------
create table disponibilidades (
  id                bigint generated always as identity primary key,
  professor_id      bigint not null references professores (id) on delete cascade,
  periodo_letivo_id bigint not null references periodos_letivos (id) on delete cascade,
  dia               smallint not null check (dia between 1 and 5), -- 1 = segunda … 5 = sexta
  inicio            time not null,
  fim               time not null,
  status            status_disponibilidade not null default 'vigente',
  tipo_solicitacao  tipo_solicitacao,
  substitui_id      bigint references disponibilidades (id) on delete set null,
  avaliado_por      uuid references usuarios (id) on delete set null,
  avaliado_em       timestamptz,
  criado_em         timestamptz not null default now(),
  check (inicio < fim),
  check (status <> 'pendente' or tipo_solicitacao is not null)
);
create index disponibilidades_professor_idx on disponibilidades (professor_id, periodo_letivo_id, status);

-- ---------------------------------------------------------------------------
-- Versões da grade e alocações
-- ---------------------------------------------------------------------------
create table versoes_horario (
  id                bigint generated always as identity primary key,
  periodo_letivo_id bigint not null references periodos_letivos (id) on delete restrict,
  numero            integer not null,
  status            status_versao not null default 'rascunho',
  data              timestamptz not null default now(),
  responsavel_id    uuid references usuarios (id) on delete set null,
  publicada_em      timestamptz,
  origem_id         bigint references versoes_horario (id) on delete set null,
  observacao        text,
  unique (periodo_letivo_id, numero)
);
-- RN07: no máximo uma versão publicada por período letivo.
create unique index versoes_uma_publicada_por_periodo
  on versoes_horario (periodo_letivo_id) where status = 'publicada';

create table horarios (
  id            bigint generated always as identity primary key,
  versao_id     bigint not null references versoes_horario (id) on delete cascade,
  turma_id      bigint not null references turmas (id) on delete restrict,
  disciplina_id bigint not null references disciplinas (id) on delete restrict,
  professor_id  bigint not null references professores (id) on delete restrict,
  sala_id       bigint not null references salas (id) on delete restrict,
  dia           smallint not null check (dia between 1 and 5),
  inicio        time not null,
  fim           time not null,
  situacao      situacao_aula not null default 'gerada',
  check (inicio < fim),
  foreign key (turma_id, disciplina_id) references turma_disciplinas (turma_id, disciplina_id) on delete restrict,
  -- RN10, RN11, RN12: dentro de uma versão, professor, sala e turma ocupam um único lugar por horário.
  unique (versao_id, professor_id, dia, inicio),
  unique (versao_id, sala_id, dia, inicio),
  unique (versao_id, turma_id, dia, inicio)
);
create index horarios_versao_idx on horarios (versao_id);

-- Aulas que o algoritmo não conseguiu alocar (RN14), com o motivo.
create table pendencias_geracao (
  id                  bigint generated always as identity primary key,
  versao_id           bigint not null references versoes_horario (id) on delete cascade,
  turma_disciplina_id bigint not null references turma_disciplinas (id) on delete cascade,
  aulas_faltantes     integer not null check (aulas_faltantes > 0),
  motivo              text not null
);

-- ---------------------------------------------------------------------------
-- Auditoria e notificações
-- ---------------------------------------------------------------------------
create table historico_alteracoes (
  id                bigint generated always as identity primary key,
  usuario_id        uuid references usuarios (id) on delete set null,
  entidade          text not null,
  entidade_id       text,
  operacao          text not null,
  data              timestamptz not null default now(),
  valores_alterados jsonb
);
create index historico_data_idx on historico_alteracoes (data desc);

create table notificacoes (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  mensagem   text not null,
  lida       boolean not null default false,
  criado_em  timestamptz not null default now()
);
create index notificacoes_usuario_idx on notificacoes (usuario_id, lida);

-- ---------------------------------------------------------------------------
-- Segurança (RNF04): o banco só é acessado pela API (conexão direta do backend).
-- RLS habilitado sem policies => as roles anon/authenticated da Data API do Supabase não leem nada.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'periodos_letivos', 'turnos', 'faixas_horario', 'salas', 'disciplinas', 'turmas', 'usuarios',
    'professores', 'alunos', 'turma_disciplinas', 'disponibilidades', 'versoes_horario', 'horarios',
    'pendencias_geracao', 'historico_alteracoes', 'notificacoes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
