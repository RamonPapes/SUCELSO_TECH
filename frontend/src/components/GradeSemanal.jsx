import { useMemo, useState } from 'react';
import { DIAS } from '../lib/util';
import { Selo } from './ui';

const minutos = (h) => {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
};

// Remove blocos de faixas (turnos) sem nenhuma aula — útil para grades de professor/sala.
function compactarFaixas(faixas, aulas) {
  const blocos = [];
  for (const f of faixas) {
    const ultimo = blocos.at(-1);
    if (ultimo && minutos(f.inicio) - minutos(ultimo.at(-1).fim) <= 30) ultimo.push(f);
    else blocos.push([f]);
  }
  return blocos
    .filter((b) => aulas.some((a) => minutos(a.inicio) >= minutos(b[0].inicio) && minutos(a.inicio) < minutos(b.at(-1).fim)))
    .flat();
}

/**
 * Grade semanal. `mostrar` define o que aparece em cada aula: turma, professor, sala.
 * `aoClicarAula(aula)` e `aoClicarVazio({dia, inicio})` habilitam edição (coordenador).
 */
export default function GradeSemanal({
  faixas,
  aulas,
  mostrar = { turma: false, professor: true, sala: true },
  compactar = false,
  destaques = new Set(),
  aoClicarAula,
  aoClicarVazio,
}) {
  const linhas = useMemo(() => (compactar ? compactarFaixas(faixas, aulas) : faixas), [faixas, aulas, compactar]);
  const mapa = useMemo(() => {
    const m = new Map();
    for (const a of aulas) {
      const k = `${a.dia}|${a.inicio}`;
      m.set(k, [...(m.get(k) || []), a]);
    }
    return m;
  }, [aulas]);
  const hoje = new Date().getDay();
  const [diaMovel, setDiaMovel] = useState(hoje >= 1 && hoje <= 5 ? hoje : 1);

  if (!linhas.length) return <p className="vazio">Nenhuma aula alocada.</p>;

  const celula = (dia, f) => {
    const lista = mapa.get(`${dia}|${f.inicio}`) || [];
    if (!lista.length) {
      return aoClicarVazio ? (
        <button className="aula-vazia" onClick={() => aoClicarVazio({ dia, inicio: f.inicio })} aria-label="Incluir aula neste horário">
          +
        </button>
      ) : null;
    }
    return lista.map((a) => <CartaoAula key={a.id} aula={a} mostrar={mostrar} destaque={destaques.has(a.id)} aoClicar={aoClicarAula} />);
  };

  return (
    <div className="grade">
      {/* Desktop/tablet: tabela semanal */}
      <table className="grade-tabela">
        <thead>
          <tr>
            <th scope="col">Horário</th>
            {DIAS.map((d) => (
              <th scope="col" key={d.id}>{d.nome}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((f) =>
            f.tipo === 'intervalo' ? (
              <tr key={f.inicio} className="linha-intervalo">
                <th scope="row">{f.inicio}</th>
                <td colSpan={5}>Intervalo · {f.inicio}–{f.fim}</td>
              </tr>
            ) : (
              <tr key={f.inicio}>
                <th scope="row">
                  {f.inicio}
                  <small>{f.fim}</small>
                </th>
                {DIAS.map((d) => (
                  <td key={d.id}>{celula(d.id, f)}</td>
                ))}
              </tr>
            )
          )}
        </tbody>
      </table>

      {/* Celular: abas por dia */}
      <div className="grade-movel">
        <div className="abas-dias" role="tablist">
          {DIAS.map((d) => (
            <button key={d.id} role="tab" aria-selected={diaMovel === d.id} className={diaMovel === d.id ? 'ativa' : ''} onClick={() => setDiaMovel(d.id)}>
              {d.curto}
            </button>
          ))}
        </div>
        <ol className="lista-dia">
          {linhas.map((f) =>
            f.tipo === 'intervalo' ? (
              <li key={f.inicio} className="item-intervalo">Intervalo · {f.inicio}–{f.fim}</li>
            ) : (
              <li key={f.inicio}>
                <span className="hora">{f.inicio}<small>{f.fim}</small></span>
                <div className="conteudo">{celula(diaMovel, f) || <span className="livre">Livre</span>}</div>
              </li>
            )
          )}
        </ol>
      </div>
    </div>
  );
}

function CartaoAula({ aula, mostrar, destaque, aoClicar }) {
  const conteudo = (
    <>
      <strong>{aula.disciplina}</strong>
      {mostrar.turma && <span>{aula.turma}</span>}
      {mostrar.professor && <span>{aula.professor}</span>}
      {mostrar.sala && <span className="sala">{aula.sala}</span>}
      <Selo valor={aula.situacao} />
    </>
  );
  const classe = `aula ${destaque ? 'aula-conflito' : ''} cor-${(aula.disciplina_id || 0) % 10}`;
  return aoClicar ? (
    <button className={classe} onClick={() => aoClicar(aula)} title="Editar alocação">
      {conteudo}
    </button>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}
