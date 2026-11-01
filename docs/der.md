# DER — Modelo de dados

Fonte: [`database/schema.sql`](../database/schema.sql). O diagrama abaixo é renderizado pelo GitHub (Mermaid).

```mermaid
erDiagram
    AUTH_USERS ||--|| USUARIOS : "id"
    USUARIOS ||--o| PROFESSORES : "usuario_id"
    USUARIOS ||--o| ALUNOS : "usuario_id"
    TURMAS ||--o{ ALUNOS : "turma_id"
    TURNOS ||--o{ FAIXAS_HORARIO : "turno_id"
    TURNOS ||--o{ TURMAS : "turno_id"
    PERIODOS_LETIVOS ||--o{ TURMAS : "periodo_letivo_id"
    TURMAS ||--o{ TURMA_DISCIPLINAS : "turma_id"
    DISCIPLINAS ||--o{ TURMA_DISCIPLINAS : "disciplina_id"
    PROFESSORES ||--o{ TURMA_DISCIPLINAS : "professor_id"
    PROFESSORES ||--o{ DISPONIBILIDADES : "professor_id"
    PERIODOS_LETIVOS ||--o{ DISPONIBILIDADES : "periodo_letivo_id"
    DISPONIBILIDADES |o--o{ DISPONIBILIDADES : "substitui_id"
    PERIODOS_LETIVOS ||--o{ VERSOES_HORARIO : "periodo_letivo_id"
    USUARIOS ||--o{ VERSOES_HORARIO : "responsavel_id"
    VERSOES_HORARIO ||--o{ HORARIOS : "versao_id"
    TURMA_DISCIPLINAS ||--o{ HORARIOS : "(turma_id, disciplina_id)"
    PROFESSORES ||--o{ HORARIOS : "professor_id"
    SALAS ||--o{ HORARIOS : "sala_id"
    VERSOES_HORARIO ||--o{ PENDENCIAS_GERACAO : "versao_id"
    TURMA_DISCIPLINAS ||--o{ PENDENCIAS_GERACAO : "turma_disciplina_id"
    USUARIOS ||--o{ HISTORICO_ALTERACOES : "usuario_id"
    USUARIOS ||--o{ NOTIFICACOES : "usuario_id"

    USUARIOS {
        uuid id PK "= auth.users.id"
        text nome
        text email UK
        perfil_usuario perfil "aluno | professor | coordenador"
        boolean ativo
    }
    PROFESSORES {
        bigint id PK
        uuid usuario_id FK,UK
        text matricula UK
    }
    ALUNOS {
        bigint id PK
        uuid usuario_id FK,UK
        text matricula UK
        bigint turma_id FK
    }
    PERIODOS_LETIVOS {
        bigint id PK
        text nome UK
        date inicio
        date fim
        status_coleta status_coleta "aberta | fechada"
    }
    TURNOS {
        bigint id PK
        text nome UK
        time inicio
        time fim
    }
    FAIXAS_HORARIO {
        bigint id PK
        bigint turno_id FK
        smallint ordem
        time inicio
        time fim
        tipo_faixa tipo "aula | intervalo"
    }
    DISCIPLINAS {
        bigint id PK
        text nome
        text codigo UK
        int carga_horaria
    }
    TURMAS {
        bigint id PK
        text nome
        bigint turno_id FK
        bigint periodo_letivo_id FK
        int qtd_alunos
    }
    SALAS {
        bigint id PK
        text identificacao UK
        int capacidade
    }
    TURMA_DISCIPLINAS {
        bigint id PK
        bigint turma_id FK
        bigint disciplina_id FK
        bigint professor_id FK
        smallint carga_semanal
    }
    DISPONIBILIDADES {
        bigint id PK
        bigint professor_id FK
        bigint periodo_letivo_id FK
        smallint dia "1..5"
        time inicio
        time fim
        status_disponibilidade status "vigente | pendente | rejeitada | inativa"
        tipo_solicitacao tipo_solicitacao "inclusao | alteracao | remocao"
        bigint substitui_id FK
    }
    VERSOES_HORARIO {
        bigint id PK
        bigint periodo_letivo_id FK
        int numero
        status_versao status "rascunho | em_revisao | publicada | arquivada"
        timestamptz data
        uuid responsavel_id FK
        timestamptz publicada_em
        bigint origem_id FK
    }
    HORARIOS {
        bigint id PK
        bigint versao_id FK
        bigint turma_id FK
        bigint disciplina_id FK
        bigint professor_id FK
        bigint sala_id FK
        smallint dia
        time inicio
        time fim
        situacao_aula situacao "gerada | ajustada"
    }
    PENDENCIAS_GERACAO {
        bigint id PK
        bigint versao_id FK
        bigint turma_disciplina_id FK
        int aulas_faltantes
        text motivo
    }
    HISTORICO_ALTERACOES {
        bigint id PK
        uuid usuario_id FK
        text entidade
        text entidade_id
        text operacao
        timestamptz data
        jsonb valores_alterados
    }
    NOTIFICACOES {
        bigint id PK
        uuid usuario_id FK
        text mensagem
        boolean lida
        timestamptz criado_em
    }
```

## Integridade garantida pelo banco

| Regra | Mecanismo |
|---|---|
| RN07 — uma versão publicada por período | índice único parcial `versoes_uma_publicada_por_periodo` |
| RN10 — professor sem aulas simultâneas | `unique (versao_id, professor_id, dia, inicio)` |
| RN11 — sala sem duas turmas no mesmo horário | `unique (versao_id, sala_id, dia, inicio)` |
| RN12 — turma sem duas disciplinas ao mesmo tempo | `unique (versao_id, turma_id, dia, inicio)` |
| Aula só de disciplina vinculada à turma | FK composta `horarios (turma_id, disciplina_id) → turma_disciplinas` |
| RN04 — dia útil e intervalo válido | `check (dia between 1 and 5)`, `check (inicio < fim)` |
| Solicitação pendente tipada | `check (status <> 'pendente' or tipo_solicitacao is not null)` |
| Banco inacessível pela Data API | RLS habilitado em todas as tabelas, sem policies; `revoke` para `anon`/`authenticated` |

Os índices únicos funcionam porque as aulas sempre ocupam faixas discretas do turno (validado na API), então dois choques no mesmo dia necessariamente têm o mesmo `inicio`.
