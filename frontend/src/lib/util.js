import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export const DIAS = [
  { id: 1, curto: 'Seg', nome: 'Segunda' },
  { id: 2, curto: 'Ter', nome: 'Terça' },
  { id: 3, curto: 'Qua', nome: 'Quarta' },
  { id: 4, curto: 'Qui', nome: 'Quinta' },
  { id: 5, curto: 'Sex', nome: 'Sexta' },
];
export const nomeDia = (id) => DIAS.find((d) => d.id === Number(id))?.nome ?? id;

export const ROTULO_STATUS = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  publicada: 'Publicada',
  arquivada: 'Arquivada',
  vigente: 'Vigente',
  pendente: 'Pendente',
  rejeitada: 'Rejeitada',
  inativa: 'Inativa',
  gerada: 'Gerada',
  ajustada: 'Ajustada',
  aberta: 'Aberta',
  fechada: 'Fechada',
};
export const ROTULO_PERFIL = { aluno: 'Aluno', professor: 'Professor', coordenador: 'Coordenador' };

export const formatarData = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// Carrega um recurso da API e expõe { dados, erro, carregando, recarregar }.
export function useApi(caminho) {
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: Boolean(caminho) });
  const recarregar = useCallback(async () => {
    if (!caminho) return setEstado({ dados: null, erro: null, carregando: false });
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    try {
      setEstado({ dados: await api(caminho), erro: null, carregando: false });
    } catch (erro) {
      setEstado({ dados: null, erro, carregando: false });
    }
  }, [caminho]);
  useEffect(() => {
    recarregar();
  }, [recarregar]);
  return { ...estado, recarregar };
}
