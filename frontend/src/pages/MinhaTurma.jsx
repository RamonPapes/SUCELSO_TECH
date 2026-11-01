import GradeSemanal from '../components/GradeSemanal';
import { Carregando, ErroApi, Vazio } from '../components/ui';
import { formatarData, useApi } from '../lib/util';

export default function MinhaTurma() {
  const { dados, erro, carregando } = useApi('/api/horarios/minha-turma');
  if (carregando) return <Carregando />;
  if (erro) return <ErroApi erro={erro} />;
  const { turma, versao, faixas, aulas } = dados;

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Turma {turma.nome}</h1>
          <p className="subtitulo">
            {turma.turno} · período {turma.periodo}
            {versao && <> · grade oficial versão {versao.numero}, publicada em {formatarData(versao.publicada_em)}</>}
          </p>
        </div>
        {versao && <button className="btn btn-secundario nao-imprimir" onClick={() => window.print()}>Exportar PDF</button>}
      </div>
      {versao ? (
        <GradeSemanal faixas={faixas} aulas={aulas} mostrar={{ professor: true, sala: true }} />
      ) : (
        <Vazio>A grade oficial ainda não foi publicada pela coordenação.</Vazio>
      )}
    </section>
  );
}
