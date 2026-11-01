import GradeSemanal from '../components/GradeSemanal';
import { Carregando, ErroApi, Vazio } from '../components/ui';
import { useApi } from '../lib/util';

export default function MinhaGrade() {
  const { dados, erro, carregando } = useApi('/api/horarios/professor');
  if (carregando) return <Carregando />;
  if (erro) return <ErroApi erro={erro} />;
  const { periodo, versao, turmas, faixas, aulas } = dados;

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Minha grade</h1>
          <p className="subtitulo">
            Período {periodo.nome}
            {versao ? ` · versão oficial ${versao.numero}` : ''} · {aulas.length} aula(s) semanais
          </p>
        </div>
        {versao && <button className="btn btn-secundario nao-imprimir" onClick={() => window.print()}>Exportar PDF</button>}
      </div>

      <div className="chips">
        <span className="rotulo">Turmas atribuídas:</span>
        {turmas.length ? turmas.map((t) => <span key={t.id} className="chip">{t.nome} · {t.turno}</span>) : <span>nenhuma</span>}
      </div>

      {versao ? (
        <GradeSemanal faixas={faixas} aulas={aulas} mostrar={{ turma: true, sala: true }} compactar />
      ) : (
        <Vazio>A grade oficial ainda não foi publicada pela coordenação.</Vazio>
      )}
    </section>
  );
}
