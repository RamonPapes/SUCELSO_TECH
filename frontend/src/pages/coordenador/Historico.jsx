import { useState } from 'react';
import { Carregando, ErroApi } from '../../components/ui';
import { formatarData, useApi } from '../../lib/util';

const ENTIDADES = ['', 'versoes_horario', 'horarios', 'disponibilidades', 'usuarios', 'turmas', 'disciplinas', 'salas', 'turma_disciplinas', 'turnos', 'faixas_horario', 'periodos_letivos'];

export default function Historico() {
  const [entidade, setEntidade] = useState('');
  const { dados, erro, carregando } = useApi(`/api/historico?limite=200${entidade ? `&entidade=${entidade}` : ''}`);

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Histórico de alterações</h1>
          <p className="subtitulo">Usuário, data, operação e valores alterados de cada modificação.</p>
        </div>
        <label className="inline">
          Entidade
          <select value={entidade} onChange={(e) => setEntidade(e.target.value)}>
            {ENTIDADES.map((e) => <option key={e} value={e}>{e || 'Todas'}</option>)}
          </select>
        </label>
      </div>
      {carregando && <Carregando />}
      <ErroApi erro={erro} />
      {dados && (
        <div className="tabela-rolavel">
          <table className="tabela tabela-historico">
            <thead><tr><th>Data</th><th>Usuário</th><th>Entidade</th><th>Operação</th><th>Valores</th></tr></thead>
            <tbody>
              {dados.map((h) => (
                <tr key={h.id}>
                  <td>{formatarData(h.data)}</td>
                  <td>{h.usuario || '—'}</td>
                  <td>{h.entidade}{h.entidade_id ? ` #${h.entidade_id}` : ''}</td>
                  <td><code>{h.operacao}</code></td>
                  <td>
                    {h.valores_alterados && (
                      <details>
                        <summary>ver</summary>
                        <pre>{JSON.stringify(h.valores_alterados, null, 2)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
