# Protótipos de baixa fidelidade

## Login
```
┌───────────────────────────────┐
│        SUCELSO TECH           │
│  E-mail  [__________________] │
│  Senha   [__________________] │
│          [     Entrar     ]   │
└───────────────────────────────┘
```

## Layout comum (após login)
```
┌──────────────────────────────────────────────────────────────┐
│ SUCELSO TECH   Grade | Consultas | ...        Nome (perfil) ⏻│
├──────────────────────────────────────────────────────────────┤
│                         conteúdo                             │
└──────────────────────────────────────────────────────────────┘
```
O menu muda conforme o perfil; itens de coordenador não aparecem para os demais (e a API recusa de qualquer forma).

## Aluno — Minha turma
```
Turma 1º Ano A (Manhã) — versão publicada nº 2           [Imprimir/PDF]
┌───────┬──────────────┬──────────────┬─────┬─────┬─────┐
│Horário│ Seg          │ Ter          │ Qua │ Qui │ Sex │
├───────┼──────────────┼──────────────┼─────┼─────┼─────┤
│08:00  │Banco de Dados│JavaScript    │ ... │ ... │ ... │
│       │Prof. Ana     │Prof. Bruno   │     │     │     │
│       │Sala 101 •Gerada│Lab 1 •Ajustada│   │     │     │
│10:00  │──────────── Intervalo ────────────────────────│
└───────┴──────────────┴──────────────┴─────┴─────┴─────┘
No celular: abas Seg | Ter | Qua | Qui | Sex com cartões por aula.
```

## Professor — Disponibilidade
```
Período 2026.2 — coleta ABERTA
┌─────────┬────────┬────────┬───────────┬─────────┐
│ Dia     │ Início │ Fim    │ Situação  │ Ações   │
│ Segunda │ 08:00  │ 12:20  │ Vigente   │ ✎  🗑   │
│ Quarta  │ 08:00  │ 12:20  │ Pendente  │         │
└─────────┴────────┴────────┴───────────┴─────────┘
[Dia ▼] [Início] [Fim] [Adicionar]
```

## Coordenador — Geração e publicação
```
Período [2026.2 ▼]  [Gerar nova proposta]
Versões: #3 rascunho | #2 publicada | #1 arquivada
Versão #3 (rascunho)   [Enviar p/ revisão] [Publicar] [Duplicar]
Ver por: (•) Turma [1º Ano A ▼]  ( ) Professor  ( ) Sala
┌─ grade (clique na aula para editar) ─┐  ┌─ Conflitos e pendências ─────┐
│                                      │  │ ⚠ Redes / 1º Ano A: 2 aulas  │
│                                      │  │   não alocadas (professor    │
│                                      │  │   sem disponibilidade)       │
└──────────────────────────────────────┘  └──────────────────────────────┘
Modal de edição: Dia [▼] Horário [▼] Sala [▼] Professor [▼] [Salvar]
```

## Coordenador — Cadastros
Abas: Usuários | Disciplinas | Turmas | Salas | Vínculos | Turnos | Períodos — tabela + formulário de inclusão/edição.
