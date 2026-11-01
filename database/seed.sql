-- SUCELSO TECH — dados fictícios de teste.
-- Executado por `npm run db:seed` (backend), que antes cria os usuários no Supabase Auth e em `usuarios`.
-- Cenário: 4 turmas, 8 docentes (7 professores + coordenadora), 10 disciplinas, 6 salas.

truncate notificacoes, historico_alteracoes, pendencias_geracao, horarios, versoes_horario, disponibilidades,
  turma_disciplinas, alunos, professores, turmas, disciplinas, salas, faixas_horario, turnos, periodos_letivos
  restart identity cascade;

insert into periodos_letivos (nome, inicio, fim, status_coleta) values
  ('2026.2', '2026-08-03', '2026-12-18', 'aberta');

-- Turnos e faixas conforme a grade de exemplo (aulas de 60 min, intervalo de 20 min).
insert into turnos (nome, inicio, fim) values
  ('Manhã', '08:00', '12:20'),
  ('Tarde', '13:00', '17:20'),
  ('Noite', '18:30', '22:50');

insert into faixas_horario (turno_id, ordem, inicio, fim, tipo)
select t.id, f.ordem, f.inicio::time, f.fim::time, f.tipo::tipo_faixa
from turnos t
join (values
  ('Manhã', 1, '08:00', '09:00', 'aula'), ('Manhã', 2, '09:00', '10:00', 'aula'),
  ('Manhã', 3, '10:00', '10:20', 'intervalo'),
  ('Manhã', 4, '10:20', '11:20', 'aula'), ('Manhã', 5, '11:20', '12:20', 'aula'),
  ('Tarde', 1, '13:00', '14:00', 'aula'), ('Tarde', 2, '14:00', '15:00', 'aula'),
  ('Tarde', 3, '15:00', '15:20', 'intervalo'),
  ('Tarde', 4, '15:20', '16:20', 'aula'), ('Tarde', 5, '16:20', '17:20', 'aula'),
  ('Noite', 1, '18:30', '19:30', 'aula'), ('Noite', 2, '19:30', '20:30', 'aula'),
  ('Noite', 3, '20:30', '20:50', 'intervalo'),
  ('Noite', 4, '20:50', '21:50', 'aula'), ('Noite', 5, '21:50', '22:50', 'aula')
) as f (turno, ordem, inicio, fim, tipo) on f.turno = t.nome
order by t.id, f.ordem;

insert into salas (identificacao, capacidade) values
  ('Sala 101', 45), ('Sala 102', 40), ('Sala 103', 30),
  ('Laboratório 1', 30), ('Laboratório 2', 25), ('Auditório', 80);

insert into disciplinas (nome, codigo, carga_horaria) values
  ('Banco de Dados', 'BD101', 80),
  ('JavaScript', 'JS101', 80),
  ('Redes de Computadores', 'RED201', 60),
  ('Node.js', 'NODE201', 60),
  ('Projeto Integrador', 'PROJ301', 80),
  ('Matemática', 'MAT101', 80),
  ('Supabase e Cloud', 'SUPA201', 40),
  ('UML', 'UML201', 40),
  ('API REST', 'API301', 40),
  ('Algoritmos', 'ALG101', 80);

insert into turmas (nome, turno_id, periodo_letivo_id, qtd_alunos)
select v.nome, t.id, p.id, v.qtd
from (values
  ('ENG1-A', 'Manhã', 40), ('ENG1-B', 'Manhã', 35), ('ENG2-A', 'Tarde', 30), ('ENG3-N', 'Noite', 25)
) as v (nome, turno, qtd)
join turnos t on t.nome = v.turno
cross join periodos_letivos p where p.nome = '2026.2'
order by v.nome;

-- Docentes (a coordenadora também leciona e pode informar disponibilidade).
insert into professores (usuario_id, matricula)
select u.id, v.matricula
from (values
  ('ana.souza@sucelso.tech', 'P001'), ('bruno.lima@sucelso.tech', 'P002'),
  ('carla.mendes@sucelso.tech', 'P003'), ('diego.rocha@sucelso.tech', 'P004'),
  ('eduarda.alves@sucelso.tech', 'P005'), ('fabio.nunes@sucelso.tech', 'P006'),
  ('gabriela.torres@sucelso.tech', 'P007'), ('coordenacao@sucelso.tech', 'C001')
) as v (email, matricula)
join usuarios u on u.email = v.email
order by v.matricula;

insert into alunos (usuario_id, matricula, turma_id)
select u.id, v.matricula, t.id
from (values
  ('lucas.pereira@aluno.sucelso.tech', 'A2026001', 'ENG1-A'),
  ('mariana.costa@aluno.sucelso.tech', 'A2026002', 'ENG1-A'),
  ('rafael.gomes@aluno.sucelso.tech', 'A2026003', 'ENG1-B'),
  ('beatriz.silva@aluno.sucelso.tech', 'A2026004', 'ENG1-B'),
  ('thiago.martins@aluno.sucelso.tech', 'A2026005', 'ENG2-A'),
  ('juliana.ramos@aluno.sucelso.tech', 'A2026006', 'ENG2-A'),
  ('pedro.almeida@aluno.sucelso.tech', 'A2026007', 'ENG3-N'),
  ('larissa.freitas@aluno.sucelso.tech', 'A2026008', 'ENG3-N')
) as v (email, matricula, turma)
join usuarios u on u.email = v.email
join turmas t on t.nome = v.turma
order by v.matricula;

-- Vínculos turma × disciplina × professor (carga semanal em aulas; cada turma tem 20 aulas possíveis).
insert into turma_disciplinas (turma_id, disciplina_id, professor_id, carga_semanal)
select t.id, d.id, p.id, v.carga
from (values
  -- ENG1-A (manhã) — mesma composição da grade de exemplo do enunciado (20 aulas)
  ('ENG1-A', 'BD101', 'P001', 2), ('ENG1-A', 'JS101', 'P002', 2), ('ENG1-A', 'RED201', 'P003', 2),
  ('ENG1-A', 'NODE201', 'P002', 2), ('ENG1-A', 'PROJ301', 'P006', 4), ('ENG1-A', 'MAT101', 'P004', 2),
  ('ENG1-A', 'SUPA201', 'P001', 2), ('ENG1-A', 'UML201', 'P005', 2), ('ENG1-A', 'API301', 'P005', 2),
  -- ENG1-B (manhã) — 20 aulas
  ('ENG1-B', 'BD101', 'P001', 2), ('ENG1-B', 'JS101', 'P002', 2), ('ENG1-B', 'RED201', 'P003', 4),
  ('ENG1-B', 'MAT101', 'P004', 4), ('ENG1-B', 'ALG101', 'P004', 4), ('ENG1-B', 'PROJ301', 'P006', 2),
  ('ENG1-B', 'UML201', 'P005', 2),
  -- ENG2-A (tarde) — 20 aulas; Redes com a Prof.ª Carla gera pendência (ela só tem manhãs livres)
  ('ENG2-A', 'RED201', 'P003', 2), ('ENG2-A', 'NODE201', 'P002', 4), ('ENG2-A', 'API301', 'P005', 4),
  ('ENG2-A', 'SUPA201', 'P001', 2), ('ENG2-A', 'ALG101', 'P007', 4), ('ENG2-A', 'PROJ301', 'P006', 4),
  -- ENG3-N (noite) — 18 aulas
  ('ENG3-N', 'MAT101', 'P007', 4), ('ENG3-N', 'BD101', 'P001', 4), ('ENG3-N', 'JS101', 'P002', 4),
  ('ENG3-N', 'PROJ301', 'P006', 4), ('ENG3-N', 'UML201', 'P005', 2)
) as v (turma, codigo, matricula, carga)
join turmas t on t.nome = v.turma
join disciplinas d on d.codigo = v.codigo
join professores p on p.matricula = v.matricula;

-- Disponibilidades vigentes (dia: 1 = segunda … 5 = sexta).
-- Cenário obrigatório 2: a Prof.ª Carla (P003) só está disponível às segundas e quartas.
insert into disponibilidades (professor_id, periodo_letivo_id, dia, inicio, fim, status)
select p.id, pl.id, v.dia, v.inicio::time, v.fim::time, 'vigente'
from (values
  -- Ana: manhãs seg–sex, tardes ter/qui, noites seg–qua
  ('P001', 1, '08:00', '12:20'), ('P001', 2, '08:00', '12:20'), ('P001', 3, '08:00', '12:20'),
  ('P001', 4, '08:00', '12:20'), ('P001', 5, '08:00', '12:20'),
  ('P001', 2, '13:00', '17:20'), ('P001', 4, '13:00', '17:20'),
  ('P001', 1, '18:30', '22:50'), ('P001', 2, '18:30', '22:50'), ('P001', 3, '18:30', '22:50'),
  -- Bruno: manhãs seg–qui, tardes seg–sex, noites qui/sex
  ('P002', 1, '08:00', '12:20'), ('P002', 2, '08:00', '12:20'), ('P002', 3, '08:00', '12:20'),
  ('P002', 4, '08:00', '12:20'),
  ('P002', 1, '13:00', '17:20'), ('P002', 2, '13:00', '17:20'), ('P002', 3, '13:00', '17:20'),
  ('P002', 4, '13:00', '17:20'), ('P002', 5, '13:00', '17:20'),
  ('P002', 4, '18:30', '22:50'), ('P002', 5, '18:30', '22:50'),
  -- Carla: apenas segundas e quartas pela manhã
  ('P003', 1, '08:00', '12:20'), ('P003', 3, '08:00', '12:20'),
  -- Diego: manhãs seg–sex
  ('P004', 1, '08:00', '12:20'), ('P004', 2, '08:00', '12:20'), ('P004', 3, '08:00', '12:20'),
  ('P004', 4, '08:00', '12:20'), ('P004', 5, '08:00', '12:20'),
  -- Eduarda: manhãs ter–sex, tardes seg–qua, noite qua
  ('P005', 2, '08:00', '12:20'), ('P005', 3, '08:00', '12:20'), ('P005', 4, '08:00', '12:20'),
  ('P005', 5, '08:00', '12:20'),
  ('P005', 1, '13:00', '17:20'), ('P005', 2, '13:00', '17:20'), ('P005', 3, '13:00', '17:20'),
  ('P005', 3, '18:30', '22:50'),
  -- Fábio: manhãs qui/sex, tardes seg/sex, noites seg/ter
  ('P006', 4, '08:00', '12:20'), ('P006', 5, '08:00', '12:20'),
  ('P006', 1, '13:00', '17:20'), ('P006', 5, '13:00', '17:20'),
  ('P006', 1, '18:30', '22:50'), ('P006', 2, '18:30', '22:50'),
  -- Gabriela: tardes seg–qua, noites seg–sex
  ('P007', 1, '13:00', '17:20'), ('P007', 2, '13:00', '17:20'), ('P007', 3, '13:00', '17:20'),
  ('P007', 1, '18:30', '22:50'), ('P007', 2, '18:30', '22:50'), ('P007', 3, '18:30', '22:50'),
  ('P007', 4, '18:30', '22:50'), ('P007', 5, '18:30', '22:50'),
  -- Coordenadora: sexta pela manhã
  ('C001', 5, '08:00', '12:20')
) as v (matricula, dia, inicio, fim)
join professores p on p.matricula = v.matricula
cross join periodos_letivos pl where pl.nome = '2026.2';
