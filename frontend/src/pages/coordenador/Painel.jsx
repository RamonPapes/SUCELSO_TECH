import { Link } from 'react-router-dom';
import { Carregando, ErroApi, Selo, Vazio } from '../../components/ui';
import { formatarData, useApi } from '../../lib/util';

const pct = (x) => `${Math.round(x * 100)}%`;

export default function Painel() {
  const resumo = useApi('/api/relatorios/resumo');
  const ocupacao = useApi('/api/relatorios/ocupacao-salas');

  if (resumo.carregando) return <Carregando />;
  if (resumo.erro) return <ErroApi erro={resumo.erro} />;
  const r = resumo.dados;

  const indicadores = [
    ['Turmas', r.turmas],
    ['Professores', r.professores],
    ['Alunos', r.alunos],
    ['Disciplinas', r.disciplinas],
    ['Salas', r.salas],
    ['Versões', r.versoes],
  ];

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Painel da coordenação</h1>
          <p className="subtitulo">Período {r.periodo.nome} · coleta de disponibilidade <Selo valor={r.periodo.status_coleta} /></p>
        </div>
      </div>

      <div className="indicadores">
        {indicadores.map(([rotulo, valor]) => (
          <div key={rotulo} className="indicador"><span>{rotulo}</span><strong>{valor}</strong></div>
        ))}
      </div>

      <div className="duas-colunas">
        <div className="cartao">
          <h2>Grade oficial</h2>
          {r.versao_publicada ? (
            <p>
              Versão <b>{r.versao_publicada.numero}</b> publicada em {formatarData(r.versao_publicada.publicada_em)} ·{' '}
              {r.versao_publicada.total_aulas} aulas · {r.versao_publicada.aulas_pendentes} pendente(s)
            </p>
          ) : (
            <p>Nenhuma versão publicada neste período.</p>
          )}
          <Link className="btn btn-primario" to="/grade">Abrir grade</Link>
        </div>
        <div className="cartao">
          <h2>Solicitações de disponibilidade</h2>
          <p>
            {r.solicitacoes_pendentes
              ? <><b>{r.solicitacoes_pendentes}</b> solicitação(ões) aguardando avaliação.</>
              : 'Nenhuma solicitação pendente.'}
          </p>
          <Link className="btn btn-secundario" to="/solicitacoes">Avaliar solicitações</Link>
        </div>
      </div>

      <div className="cartao bloco">
        <h2>Ocupação das salas {ocupacao.dados?.versao && <small className="nota">— versão {ocupacao.dados.versao.numero} ({ocupacao.dados.versao.status})</small>}</h2>
        {ocupacao.carregando && <Carregando />}
        <ErroApi erro={ocupacao.erro} />
        {ocupacao.dados && !ocupacao.dados.versao && <Vazio>Publique uma grade para ver a ocupação das salas.</Vazio>}
        {ocupacao.dados?.versao && (
          <div className="tabela-rolavel">
            <table className="tabela">
              <thead>
                <tr><th>Sala</th><th>Capacidade</th><th>Aulas/semana</th><th>Ocupação geral</th><th>Manhã / Tarde / Noite</th><th>Aproveitamento</th></tr>
              </thead>
              <tbody>
                {ocupacao.dados.salas.map((s) => (
                  <tr key={s.id}>
                    <td>{s.identificacao}</td>
                    <td>{s.capacidade}</td>
                    <td>{s.aulas} / {s.horarios_semana}</td>
                    <td>
                      <div className="barra" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.taxa_ocupacao * 100)} aria-label={`Ocupação de ${s.identificacao}`}>
                        <span style={{ width: pct(s.taxa_ocupacao) }} />
                      </div>
                      <small>{pct(s.taxa_ocupacao)}</small>
                    </td>
                    <td>{s.por_turno.map((t) => pct(t.taxa)).join(' / ')}</td>
                    <td title="Alunos da turma ÷ capacidade da sala, nas aulas alocadas">{s.aulas ? pct(s.aproveitamento_medio) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
