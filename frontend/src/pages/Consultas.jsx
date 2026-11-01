import { useState } from 'react';
import GradeSemanal from '../components/GradeSemanal';
import { Carregando, ErroApi, Vazio } from '../components/ui';
import { useApi } from '../lib/util';

const ABAS = [
  ['turmas', 'Turmas'],
  ['salas', 'Salas'],
  ['disciplinas', 'Disciplinas'],
];

export default function Consultas() {
  const [aba, setAba] = useState('turmas');
  const [selecao, setSelecao] = useState(null); // { tipo: 'turma'|'sala', id, nome }
  const turmas = useApi('/api/turmas');
  const salas = useApi('/api/salas');
  const disciplinas = useApi('/api/disciplinas');
  const grade = useApi(selecao ? `/api/horarios/publicados?${selecao.tipo}_id=${selecao.id}` : null);

  const atual = { turmas, salas, disciplinas }[aba];

  return (
    <section>
      <div className="cabecalho-pagina">
        <h1>Consultas</h1>
      </div>
      <div className="abas" role="tablist">
        {ABAS.map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'ativa' : ''} onClick={() => { setAba(id); setSelecao(null); }}>
            {rotulo}
          </button>
        ))}
      </div>

      {atual.carregando && <Carregando />}
      <ErroApi erro={atual.erro} />
      {atual.dados && (
        <div className="tabela-rolavel">
          <table className="tabela">
            {aba === 'turmas' && (
              <>
                <thead><tr><th>Turma</th><th>Turno</th><th>Período</th><th>Alunos</th><th aria-label="Ações" /></tr></thead>
                <tbody>
                  {turmas.dados.map((t) => (
                    <tr key={t.id}>
                      <td>{t.nome}</td><td>{t.turno}</td><td>{t.periodo}</td><td>{t.qtd_alunos}</td>
                      <td className="acoes-tabela"><button className="btn-link" onClick={() => setSelecao({ tipo: 'turma', id: t.id, nome: `Turma ${t.nome}` })}>Ver grade</button></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
            {aba === 'salas' && (
              <>
                <thead><tr><th>Sala</th><th>Capacidade</th><th aria-label="Ações" /></tr></thead>
                <tbody>
                  {salas.dados.map((s) => (
                    <tr key={s.id}>
                      <td>{s.identificacao}</td><td>{s.capacidade}</td>
                      <td className="acoes-tabela"><button className="btn-link" onClick={() => setSelecao({ tipo: 'sala', id: s.id, nome: s.identificacao })}>Ver ocupação</button></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
            {aba === 'disciplinas' && (
              <>
                <thead><tr><th>Código</th><th>Disciplina</th><th>Carga horária</th></tr></thead>
                <tbody>
                  {disciplinas.dados.map((d) => (
                    <tr key={d.id}><td>{d.codigo}</td><td>{d.nome}</td><td>{d.carga_horaria} h</td></tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}

      {selecao && (
        <div className="bloco">
          <h2>{selecao.nome} — grade oficial</h2>
          {grade.carregando && <Carregando />}
          <ErroApi erro={grade.erro} />
          {grade.dados && (grade.dados.versao ? (
            <GradeSemanal
              faixas={grade.dados.faixas}
              aulas={grade.dados.aulas}
              mostrar={{ turma: selecao.tipo === 'sala', professor: true, sala: selecao.tipo === 'turma' }}
              compactar={selecao.tipo === 'sala'}
            />
          ) : <Vazio>Nenhuma grade publicada no período.</Vazio>)}
        </div>
      )}
    </section>
  );
}
