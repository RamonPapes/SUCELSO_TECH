# Roteiro de apresentação e demonstração (≈ 15 min)

Pré-requisito: banco recém-semeado (`npm run db:seed`). Antes de começar, abra a URL da API (`/api/health`)
para acordar o Render. Use três abas anônimas, uma por perfil. A senha de todos é `Sucelso@2026`.

| Perfil | E-mail |
|---|---|
| Coordenadora | `coordenacao@sucelso.tech` |
| Professora (só seg/qua) | `carla.mendes@sucelso.tech` |
| Aluno (ENG1-A) | `lucas.pereira@aluno.sucelso.tech` |

## Parte 1: Integrante A (arquitetura, banco e segurança), ~5 min

1. **Problema e solução** (30 s): conflitos de planilhas → sistema web com perfis e geração automática.
2. **Arquitetura**: Vercel (React) → Render (Express) → Supabase (PostgreSQL + Auth). Mostre o
   diagrama do README e explique que a `service_role` fica só no Render e que o frontend usa apenas a chave anon para login.
3. **Banco** ([DER](der.md)): versões × horários. Os índices únicos impedem choques no próprio banco,
   a FK composta impede aula de disciplina não vinculada, o índice parcial garante uma versão publicada por
   período, e o RLS sem policies bloqueia a Data API.
4. **Autorização no backend**: abra o DevTools logado como aluno e rode
   `fetch(API + '/api/horarios/1', {method:'PUT', headers:{Authorization:'Bearer ' + token}})` → **403**.
   Mencione a suíte de 102 testes ([testes.md](testes.md)).

## Parte 2: Integrante B (cenário obrigatório na interface), ~8 min

| Passo | Quem | Ação | O que mostrar |
|---|---|---|---|
| 1 | Coordenadora | Painel → Cadastros | 4 turmas, 8 docentes, 10 disciplinas, 6 salas (cenário 1). |
| 2 | Carla | Disponibilidade | Só segunda e quarta (cenário 2). Coleta aberta → edição direta. |
| 3 | Coordenadora | Grade → **Gerar nova proposta** | 76/78 aulas em poucos ms (cenário 3). |
| 4 | Coordenadora | Ver por **Professor → Carla Mendes**; painel de conflitos | Aulas só seg/qua; pendência de Redes/ENG2-A com motivo (cenário 4). |
| 5 | Coordenadora | Clique numa aula → mude para um horário já ocupado | **409** explicado no modal (choque de turma/sala). |
| 6 | Coordenadora | Clique numa aula → troque a sala → Salvar | Selo **AJUSTADA**; histórico registra antes/depois (cenário 5). |
| 7 | Coordenadora | Enviar para revisão → **Publicar** | Estados rascunho → em revisão → publicada. |
| 8 | Aluno | Minha turma; sino de notificações; celular (DevTools) | Grade com sala, docente e situação; nenhum botão de edição; abas por dia (cenário 6). |
| 9 | Aluno | Digite `/grade` na URL | Redirecionado (e a API recusaria de qualquer forma). |
| 10 | Carla | Disponibilidade → incluir terça 13:00–17:20 | Vira **solicitação pendente** (cenário 7). |
| 11 | Coordenadora | Solicitações → Aprovar; abrir Grade | A versão publicada continua igual; para mudar é preciso **Duplicar para editar**. |
| 12 | Aluno | Exportar PDF | Grade em A4 paisagem. |

## Parte 3: Ambos (algoritmo e diferenciais), ~2 min

- **Algoritmo** ([algoritmo.md](algoritmo.md)): MRV, custo, cadeia de ejeção, busca local para janelas e diagnóstico das pendências.
- **Diferenciais**: PDF, notificações, ocupação das salas (Painel) e minimização de janelas.
- **Perguntas**.

## Plano B

Se o Render demorar, rode localmente (README → *Rodando localmente*) ou mostre as
[capturas de tela](testes.md#capturas-de-tela) e o teste E2E (`cd e2e && npm test`).
