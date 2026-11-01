import { Navigate, Route, Routes } from 'react-router-dom';
import Layout, { AvisoServidor } from './components/Layout';
import { Carregando } from './components/ui';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import MinhaTurma from './pages/MinhaTurma';
import MinhaGrade from './pages/MinhaGrade';
import Disponibilidade from './pages/Disponibilidade';
import Consultas from './pages/Consultas';
import Painel from './pages/coordenador/Painel';
import Grade from './pages/coordenador/Grade';
import Solicitacoes from './pages/coordenador/Solicitacoes';
import Cadastros from './pages/coordenador/Cadastros';
import Historico from './pages/coordenador/Historico';

const INICIO = { aluno: '/minha-turma', professor: '/minha-grade', coordenador: '/painel' };

// Esconde rotas de outros perfis na interface; a autorização real é feita pela API.
function Exigir({ perfis, children }) {
  const { usuario } = useAuth();
  return perfis.includes(usuario.perfil) ? children : <Navigate to={INICIO[usuario.perfil]} replace />;
}

export default function App() {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return (
      <>
        <AvisoServidor />
        <div className="tela-cheia"><Carregando /></div>
      </>
    );
  }
  if (!usuario) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/minha-turma" element={<Exigir perfis={['aluno']}><MinhaTurma /></Exigir>} />
        <Route path="/minha-grade" element={<Exigir perfis={['professor']}><MinhaGrade /></Exigir>} />
        <Route path="/disponibilidade" element={<Exigir perfis={['professor', 'coordenador']}><Disponibilidade /></Exigir>} />
        <Route path="/consultas" element={<Consultas />} />
        <Route path="/painel" element={<Exigir perfis={['coordenador']}><Painel /></Exigir>} />
        <Route path="/grade" element={<Exigir perfis={['coordenador']}><Grade /></Exigir>} />
        <Route path="/solicitacoes" element={<Exigir perfis={['coordenador']}><Solicitacoes /></Exigir>} />
        <Route path="/cadastros" element={<Exigir perfis={['coordenador']}><Cadastros /></Exigir>} />
        <Route path="/historico" element={<Exigir perfis={['coordenador']}><Historico /></Exigir>} />
        <Route path="*" element={<Navigate to={INICIO[usuario.perfil]} replace />} />
      </Route>
    </Routes>
  );
}
