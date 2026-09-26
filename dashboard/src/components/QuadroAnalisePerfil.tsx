'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp, Users, Calendar, Eye, Target, Percent,
  Activity, MessageSquare, Check, Trash2, Edit, RefreshCw,
  Film, Image as ImageIcon, Aperture, ChevronLeft, ChevronRight, MousePointerClick, Lock,
  ArrowUp, ArrowDown, Minus
} from 'lucide-react';
import { EVENTO_ANALISE_SEMANAL } from './GraficoSemanasRegistradas';
import AvatarModelo from './AvatarModelo';

interface QuadroAnalisePerfilProps {
  profiles?: any[];
  controleData?: any[];
}

export interface RegistroAnalise {
  id: number;
  username: string;
  data_inicio: string;
  data_fim: string;
  visualizacoes: number;
  seguidores: number;
  interacoes: number;
  nao_seguidores_pct: number;
  contas_alcancadas: number; // Visualizadores
  visitas_perfil: number;
  // Calculados pela API a partir das publicações do período
  reels?: number;
  posts?: number;
  stories?: number;
  impressoes?: number;
  engajamento?: number;
  criado_em?: string;
  atualizado_em?: string;
}

// Helper para formatar Date em YYYY-MM-DD local (evitando shift UTC)
function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper para parsear YYYY-MM-DD em Date local
function parseDateLocal(str: string): Date {
  if (!str) return new Date();
  const parts = str.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// Retorna a data de hoje no formato YYYY-MM-DD local
function getHojeLocalStr(): string {
  return formatDateLocal(new Date());
}

// Helper para sugerir o próximo período semanal (sempre iniciando em Sábado e terminando em Sexta)
function getProximoPeriodo(ultimoRegistro?: RegistroAnalise | null, offsetSemanas: number = 0) {
  let ini: Date;

  if (ultimoRegistro && ultimoRegistro.data_fim) {
    // Começa no dia seguinte ao término do último registro
    const fimAnterior = parseDateLocal(ultimoRegistro.data_fim);
    ini = new Date(fimAnterior);
    ini.setDate(fimAnterior.getDate() + 1);

    // Garante que é um sábado
    const dia = ini.getDay(); // 0 = Dom, 6 = Sáb
    if (dia !== 6) {
      const diasAteSabado = (6 - dia + 7) % 7;
      ini.setDate(ini.getDate() + diasAteSabado);
    }
  } else {
    // Se não há registros, pega o sábado do ciclo semanal atual
    const hoje = new Date();
    const diaSemana = hoje.getDay(); // 0 = Domingo, 1 = Seg, ..., 6 = Sáb
    const diasDesdeSabado = (diaSemana + 1) % 7;
    ini = new Date(hoje);
    ini.setDate(hoje.getDate() - diasDesdeSabado);
  }

  // Aplica o deslocamento semanal (0 = próximo sugerido, 1 = 1 semana anterior, etc.)
  if (offsetSemanas !== 0) {
    ini.setDate(ini.getDate() - (offsetSemanas * 7));
  }

  const fim = new Date(ini);
  fim.setDate(ini.getDate() + 6); // Sexta-feira (+6 dias)

  return {
    data_inicio: formatDateLocal(ini),
    data_fim: formatDateLocal(fim)
  };
}

// Indicador visual de tendência comparando a métrica com a semana imediatamente anterior
function IndicadorTendencia({
  atual,
  anterior,
  formatar,
  sufixo = ''
}: {
  atual?: number | null;
  anterior?: number | null;
  formatar?: (val: number) => string;
  sufixo?: string;
}) {
  if (
    atual === null ||
    atual === undefined ||
    isNaN(Number(atual)) ||
    anterior === null ||
    anterior === undefined ||
    isNaN(Number(anterior))
  ) {
    return null;
  }

  const vAtual = Number(atual);
  const vAnterior = Number(anterior);
  const textoAnterior = formatar ? `${formatar(vAnterior)}${sufixo}` : `${vAnterior.toLocaleString('pt-BR')}${sufixo}`;

  if (vAtual > vAnterior) {
    return (
      <span
        title={`Acima do período anterior (${textoAnterior})`}
        style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
      >
        <ArrowUp size={12} strokeWidth={3} color="#00FF66" />
      </span>
    );
  }
  if (vAtual < vAnterior) {
    return (
      <span
        title={`Abaixo do período anterior (${textoAnterior})`}
        style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
      >
        <ArrowDown size={12} strokeWidth={3} color="#FF4444" />
      </span>
    );
  }
  return (
    <span
      title={`Igual ao período anterior (${textoAnterior})`}
      style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
    >
      <Minus size={12} strokeWidth={3} color="#FFD700" />
    </span>
  );
}

export default function QuadroAnalisePerfil({ profiles = [], controleData = [] }: QuadroAnalisePerfilProps) {
  // Lista unificada das "Minhas Modelos"
  const modelos = useMemo(() => {
    const mapaCtrl = new Map((controleData || []).map((c: any) => [(c.username || '').toLowerCase(), c]));
    const base = profiles && profiles.length > 0 ? profiles : controleData;

    const list = base
      .filter((p: any) => {
        const u = (p.username || '').toLowerCase();
        const isMinha = Number(p.meu_perfil) === 1 || mapaCtrl.has(u);
        const st = (p.status || '').toUpperCase();
        const stCtrl = (p.status_controle || '').toUpperCase();
        return isMinha && !st.includes('MORREU') && !stCtrl.includes('MORREU');
      })
      .map((p: any) => {
        const u = (p.username || '').toLowerCase();
        const c = mapaCtrl.get(u) || {};
        return {
          username: p.username || c.username,
          nome: c.nome || p.nome_controle || p.nome || p.username,
          foto_url: p.foto_url || c.foto_url || p.foto_perfil_meta || null,
          seguidores: Number(p.seguidores || c.seguidores || 0),
          meu_perfil: 1
        };
      })
      .sort((a, b) => b.seguidores - a.seguidores);

    return list;
  }, [profiles, controleData]);

  // Modelo selecionada
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [searchModel, setSearchModel] = useState<string>('');
  const [offsetSemana, setOffsetSemana] = useState<number>(0);

  // Seleciona automaticamente a primeira modelo ao carregar
  useEffect(() => {
    if (!selectedUsername && modelos.length > 0) {
      setSelectedUsername(modelos[0].username);
    }
  }, [modelos, selectedUsername]);

  // Registros de análise
  const [registros, setRegistros] = useState<RegistroAnalise[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msgFeedback, setMsgFeedback] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Perfil ativo atual
  const activeModelo = useMemo(() => {
    return modelos.find(m => m.username.toLowerCase() === selectedUsername.toLowerCase()) || null;
  }, [modelos, selectedUsername]);

  // Estado do formulário:
  // 1. Período (Sáb a Sex)
  // 2. Visualizações
  // 3. Seguidores (manual - não preenche automaticamente)
  // 4. Interações
  // 5. Não seguidores (%)
  // 6. Visualizadores (antigo contas alcançadas)
  // 7. Visitas ao Perfil
  // Reels/Posts/Stories do período são carregados automaticamente do banco
  const [form, setForm] = useState({
    id: null as number | null,
    data_inicio: getProximoPeriodo(null, 0).data_inicio,
    data_fim: getProximoPeriodo(null, 0).data_fim,
    visualizacoes: '',
    seguidores: '',
    interacoes: '',
    nao_seguidores_pct: '',
    contas_alcancadas: '', // Visualizadores
    visitas_perfil: ''
  });

  const hojeStr = useMemo(() => getHojeLocalStr(), []);

  // Se a data final do período ainda não chegou (período em andamento ou futuro)
  // Caso esteja editando um registro existente (form.id), permite editar
  const periodoNaoChegou = Boolean(!form.id && form.data_fim && form.data_fim > hojeStr);

  // Manipulação manual das datas mantendo o ciclo Sábado a Sexta
  const handleDataInicioChange = (val: string) => {
    if (!val) {
      setForm(f => ({ ...f, data_inicio: '' }));
      return;
    }
    const d = parseDateLocal(val);
    const fim = new Date(d);
    fim.setDate(d.getDate() + 6);
    setForm(f => ({
      ...f,
      data_inicio: val,
      data_fim: formatDateLocal(fim)
    }));
  };

  const handleDataFimChange = (val: string) => {
    if (!val) {
      setForm(f => ({ ...f, data_fim: '' }));
      return;
    }
    const d = parseDateLocal(val);
    const ini = new Date(d);
    ini.setDate(d.getDate() - 6);
    setForm(f => ({
      ...f,
      data_inicio: formatDateLocal(ini),
      data_fim: val
    }));
  };

  // Atualiza período ao mudar offset de semana
  const mudarSemana = (novoOffset: number) => {
    setOffsetSemana(novoOffset);
    const p = getProximoPeriodo(registros[0], novoOffset);
    setForm(f => ({
      ...f,
      data_inicio: p.data_inicio,
      data_fim: p.data_fim
    }));
  };

  // Busca registros da API
  const carregarRegistros = useCallback(async (username?: string) => {
    const uname = username || selectedUsername;
    if (!uname) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/analise?username=${encodeURIComponent(uname)}`);
      const json = await res.json();
      if (json.success) {
        const novosRegistros: RegistroAnalise[] = json.data || [];
        setRegistros(novosRegistros);

        // Se não estiver editando, já sugere automaticamente o próximo período para esta modelo
        setForm(prevForm => {
          if (prevForm.id) return prevForm;
          const p = getProximoPeriodo(novosRegistros[0], 0);
          return {
            id: null,
            data_inicio: p.data_inicio,
            data_fim: p.data_fim,
            visualizacoes: '',
            seguidores: '',
            interacoes: '',
            nao_seguidores_pct: '',
            contas_alcancadas: '',
            visitas_perfil: ''
          };
        });
        setOffsetSemana(0);
      }
    } catch (e) {
      console.error('Erro ao carregar análises:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedUsername]);

  useEffect(() => {
    if (selectedUsername) {
      carregarRegistros(selectedUsername);
    }
  }, [selectedUsername, carregarRegistros]);

  // Reels / Posts / Stories publicados no período do formulário — carregados do banco ao informar o período.
  // Guardamos a chave (modelo|início|fim) da resposta para ignorar resultados de um período que já mudou.
  const [conteudoCarregado, setConteudoCarregado] = useState<{ chave: string; dados: { reels: number; posts: number; stories: number } | null } | null>(null);
  const chaveConteudo = /^\d{4}-\d{2}-\d{2}$/.test(form.data_inicio) && /^\d{4}-\d{2}-\d{2}$/.test(form.data_fim) && selectedUsername
    ? `${selectedUsername}|${form.data_inicio}|${form.data_fim}`
    : null;
  const conteudoPeriodo = conteudoCarregado && conteudoCarregado.chave === chaveConteudo ? conteudoCarregado.dados : null;
  const carregandoConteudo = Boolean(chaveConteudo && conteudoCarregado?.chave !== chaveConteudo);

  useEffect(() => {
    if (!chaveConteudo) return;
    const [username, data_inicio, data_fim] = chaveConteudo.split('|');
    let cancelado = false;
    fetch(`/api/analise/conteudo?${new URLSearchParams({ username, data_inicio, data_fim })}`)
      .then(res => res.json())
      .then(json => { if (!cancelado) setConteudoCarregado({ chave: chaveConteudo, dados: json.success ? json.data : null }); })
      .catch(e => {
        console.error('Erro ao carregar conteúdo do período:', e);
        if (!cancelado) setConteudoCarregado({ chave: chaveConteudo, dados: null });
      });
    return () => { cancelado = true; };
  }, [chaveConteudo]);

  // Somatório consolidado semanal dos registros da modelo
  const somatorioSemanal = useMemo(() => {
    const totalSemanas = registros.length;
    if (totalSemanas === 0) {
      return {
        totalSemanas: 0,
        visualizacoes: 0,
        seguidores: 0,
        interacoes: 0,
        mediaNaoSeguidores: 0,
        visualizadores: 0,
        visitas_perfil: 0
      };
    }

    const totalViews = registros.reduce((acc, r) => acc + (Number(r.visualizacoes) || 0), 0);
    const ultimosSeguidores = registros[0]?.seguidores ? Number(registros[0].seguidores) : 0;
    const totalInteracoes = registros.reduce((acc, r) => acc + (Number(r.interacoes) || 0), 0);
    const mediaNaoSeg = registros.reduce((acc, r) => acc + (Number(r.nao_seguidores_pct) || 0), 0) / totalSemanas;
    const totalVisualizadores = registros.reduce((acc, r) => acc + (Number(r.contas_alcancadas) || 0), 0);
    const totalVisitas = registros.reduce((acc, r) => acc + (Number(r.visitas_perfil) || 0), 0);

    return {
      totalSemanas,
      visualizacoes: totalViews,
      seguidores: ultimosSeguidores,
      interacoes: totalInteracoes,
      mediaNaoSeguidores: mediaNaoSeg,
      visualizadores: totalVisualizadores,
      visitas_perfil: totalVisitas
    };
  }, [registros]);

  // Formatação de números
  const fmtNum = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString('pt-BR');
  };

  const fmtDataBr = (dStr: string) => {
    if (!dStr) return '';
    const [y, m, d] = dStr.split('-');
    if (!y || !m || !d) return dStr;
    return `${d}/${m}/${y}`;
  };

  // Salvar registro (POST ou PUT)
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUsername) {
      alert('Por favor, selecione uma modelo.');
      return;
    }
    if (!form.data_inicio || !form.data_fim) {
      alert('Por favor, informe o período (de sábado a sexta).');
      return;
    }

    if (periodoNaoChegou) {
      alert(`A data final deste período (${fmtDataBr(form.data_fim)}) ainda não chegou. O preenchimento só é permitido após o término da semana.`);
      return;
    }

    setSalvando(true);
    setMsgFeedback(null);
    try {
      const payload = {
        id: form.id,
        username: selectedUsername,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        visualizacoes: Number(form.visualizacoes) || 0,
        seguidores: Number(form.seguidores) || 0,
        interacoes: Number(form.interacoes) || 0,
        nao_seguidores_pct: Number(form.nao_seguidores_pct) || 0,
        contas_alcancadas: Number(form.contas_alcancadas) || 0, // Visualizadores
        visitas_perfil: Number(form.visitas_perfil) || 0,
        impressoes: 0,
        engajamento: 0
      };

      const metodo = form.id ? 'PUT' : 'POST';
      const res = await fetch('/api/analise', {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        setMsgFeedback({
          tipo: 'ok',
          texto: form.id ? 'Análise atualizada com sucesso!' : 'Novo período registrado com sucesso!'
        });
        // Limpa estado de edição e recarrega registros (o que sugere o próximo período consecutivo)
        setForm(f => ({
          ...f,
          id: null
        }));
        carregarRegistros(selectedUsername);
        window.dispatchEvent(new Event(EVENTO_ANALISE_SEMANAL));
        setTimeout(() => setMsgFeedback(null), 4000);
      } else {
        setMsgFeedback({ tipo: 'erro', texto: `Erro ao salvar: ${json.error || 'Desconhecido'}` });
      }
    } catch (err: any) {
      setMsgFeedback({ tipo: 'erro', texto: `Erro de conexão: ${err.message}` });
    } finally {
      setSalvando(false);
    }
  };

  // Carregar dados na edição
  const handleEditar = (r: RegistroAnalise) => {
    setForm({
      id: r.id,
      data_inicio: r.data_inicio,
      data_fim: r.data_fim,
      visualizacoes: String(r.visualizacoes || ''),
      seguidores: String(r.seguidores || ''),
      interacoes: String(r.interacoes || ''),
      nao_seguidores_pct: String(r.nao_seguidores_pct || ''),
      contas_alcancadas: String(r.contas_alcancadas || ''),
      visitas_perfil: String(r.visitas_perfil || ''),
    });
    // Rola suavemente até o formulário
    const el = document.getElementById('quadro-analise-form');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // Excluir registro
  const handleExcluir = async (id: number) => {
    if (!confirm('Deseja realmente excluir este registro de análise?')) return;
    try {
      const res = await fetch(`/api/analise?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        carregarRegistros(selectedUsername);
        window.dispatchEvent(new Event(EVENTO_ANALISE_SEMANAL));
      } else {
        alert(`Erro ao excluir: ${json.error}`);
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  // Modelos filtradas pela busca
  const modelosFiltradas = useMemo(() => {
    if (!searchModel.trim()) return modelos;
    const term = searchModel.toLowerCase();
    return modelos.filter(m => m.username.toLowerCase().includes(term) || (m.nome && m.nome.toLowerCase().includes(term)));
  }, [modelos, searchModel]);

  return (
    <div style={{
      background: '#0B0E14',
      border: '1px solid #21262D',
      borderRadius: '16px',
      overflow: 'hidden',
      marginBottom: '32px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.45)'
    }}>
      {/* ─── 1. CABEÇALHO DO QUADRO ─── */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(13, 17, 23, 0.95) 100%)',
        borderBottom: '1px solid #21262D',
        padding: '22px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1.5px solid #10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10B981',
            boxShadow: '0 0 16px rgba(16, 185, 129, 0.3)',
            flexShrink: 0
          }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#10B981', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Relatório Operacional & Inteligência
              </span>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'white', margin: '2px 0 0 0' }}>
              Análise do Perfil
            </h2>
            <p style={{ color: '#8B949E', fontSize: '13px', margin: '3px 0 0 0' }}>
              Acompanhamento semanal de métricas (Sábado a Sexta) e histórico consolidado das modelos.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => carregarRegistros(selectedUsername)}
            title="Atualizar dados de análise"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#161B22',
              border: '1px solid #30363D',
              borderRadius: '8px',
              padding: '8px 14px',
              color: '#8B949E',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.borderColor = '#8B949E';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#8B949E';
              e.currentTarget.style.borderColor = '#30363D';
            }}
          >
            <RefreshCw size={14} className={loading ? 'anomalias-spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* ─── 2. SELETOR DE MODELOS ("MINHAS MODELOS") ─── */}
        <div style={{
          background: '#0D1117',
          border: '1px solid #21262D',
          borderRadius: '14px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                TRATAMENTO POR CONTA
              </span>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'white', margin: '2px 0 0 0' }}>
                Minhas Modelos
              </h3>
            </div>

            {/* Busca rápida */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#161B22',
              border: '1px solid #30363D',
              borderRadius: '8px',
              padding: '6px 12px',
              minWidth: '220px'
            }}>
              <Users size={14} color="#8B949E" />
              <input
                type="text"
                placeholder="Buscar modelo..."
                value={searchModel}
                onChange={e => setSearchModel(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '12px',
                  outline: 'none',
                  width: '100%'
                }}
              />
              {searchModel && (
                <button
                  onClick={() => setSearchModel('')}
                  style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', fontSize: '12px' }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Chips horizontais com rolagem suave */}
          <div style={{
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            paddingBottom: '8px',
            scrollBehavior: 'smooth'
          }}>
            {modelosFiltradas.length === 0 ? (
              <div style={{ color: '#8B949E', fontSize: '12px', padding: '10px 0' }}>
                Nenhuma modelo encontrada.
              </div>
            ) : (
              modelosFiltradas.map(m => {
                const isSelected = m.username.toLowerCase() === selectedUsername.toLowerCase();
                return (
                  <button
                    key={m.username}
                    onClick={() => {
                      setSelectedUsername(m.username);
                      setOffsetSemana(0);
                      setForm({
                        id: null,
                        data_inicio: '',
                        data_fim: '',
                        visualizacoes: '',
                        seguidores: '',
                        interacoes: '',
                        nao_seguidores_pct: '',
                        contas_alcancadas: '',
                        visitas_perfil: ''
                      });
                    }}
                    style={{
                      background: isSelected ? 'rgba(16, 185, 129, 0.12)' : '#161B22',
                      border: isSelected ? '1.5px solid #10B981' : '1.5px solid #21262D',
                      borderRadius: '10px',
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                      minWidth: '180px',
                      textAlign: 'left',
                      boxShadow: isSelected ? '0 0 14px rgba(16, 185, 129, 0.3)' : 'none'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = '#30363D';
                        e.currentTarget.style.background = '#1C2128';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = '#21262D';
                        e.currentTarget.style.background = '#161B22';
                      }
                    }}
                  >
                    <AvatarModelo
                      src={m.foto_url}
                      username={m.username}
                      size={34}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: isSelected ? '#34D399' : 'white',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          @{m.username}
                        </span>
                        <span style={{ fontSize: '11px' }}>⭐</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#8B949E', marginTop: '2px' }}>
                        {m.seguidores > 0 ? `${m.seguidores.toLocaleString('pt-BR')} segs` : m.nome}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ─── 3. SOMATÓRIO SEMANAL (CARDS DE SCORE) ─── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Somatório do Período Semanal {activeModelo ? `— @${activeModelo.username}` : ''} ({somatorioSemanal.totalSemanas} {somatorioSemanal.totalSemanas === 1 ? 'semana registrada' : 'semanas registradas'})
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px'
          }}>
            {/* 1. Visualizações */}
            <div style={{
              background: '#0D1117',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(0, 240, 255, 0.12)',
                color: '#00F0FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Eye size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
                  Visualizações
                </span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#00F0FF', lineHeight: 1.1, marginTop: '2px' }}>
                  {fmtNum(somatorioSemanal.visualizacoes)}
                </div>
                <span style={{ fontSize: '10px', color: '#586069' }}>Total acumulado</span>
              </div>
            </div>

            {/* 2. Seguidores */}
            <div style={{
              background: '#0D1117',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10B981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Users size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
                  Seguidores
                </span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981', lineHeight: 1.1, marginTop: '2px' }}>
                  {somatorioSemanal.seguidores > 0 ? fmtNum(somatorioSemanal.seguidores) : '—'}
                </div>
                <span style={{ fontSize: '10px', color: '#586069' }}>Último informado</span>
              </div>
            </div>

            {/* 3. Interações */}
            <div style={{
              background: '#0D1117',
              border: '1px solid rgba(255, 0, 122, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(255, 0, 122, 0.12)',
                color: '#FF007A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <MessageSquare size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
                  Interações
                </span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#FF007A', lineHeight: 1.1, marginTop: '2px' }}>
                  {fmtNum(somatorioSemanal.interacoes)}
                </div>
                <span style={{ fontSize: '10px', color: '#586069' }}>Total de interações</span>
              </div>
            </div>

            {/* 4. Não Seguidores % Médio */}
            <div style={{
              background: '#0D1117',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.12)',
                color: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Percent size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
                  Não Seg. Médio
                </span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#3B82F6', lineHeight: 1.1, marginTop: '2px' }}>
                  {somatorioSemanal.mediaNaoSeguidores.toFixed(1)}%
                </div>
                <span style={{ fontSize: '10px', color: '#586069' }}>Média de novos públicos</span>
              </div>
            </div>

            {/* 5. Visualizadores (antigo contas alcançadas) */}
            <div style={{
              background: '#0D1117',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(168, 85, 247, 0.12)',
                color: '#A855F7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Target size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
                  Visualizadores
                </span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#A855F7', lineHeight: 1.1, marginTop: '2px' }}>
                  {fmtNum(somatorioSemanal.visualizadores)}
                </div>
                <span style={{ fontSize: '10px', color: '#586069' }}>Total de visualizadores</span>
              </div>
            </div>

            {/* 6. Visitas ao Perfil */}
            <div style={{
              background: '#0D1117',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#F59E0B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <MousePointerClick size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
                  Visitas Perfil
                </span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#F59E0B', lineHeight: 1.1, marginTop: '2px' }}>
                  {fmtNum(somatorioSemanal.visitas_perfil)}
                </div>
                <span style={{ fontSize: '10px', color: '#586069' }}>Total de visitas</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── 4. FORMULÁRIO E CAMPOS DE ENTRADA NA ORDEM EXATA ─── */}
        <div id="quadro-analise-form" style={{
          background: '#0D1117',
          border: '1px solid #21262D',
          borderRadius: '14px',
          padding: '24px',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#00F0FF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {form.id ? 'EDITANDO PERÍODO' : 'ENTRADA DE DADOS SEMANAIS'}
              </span>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'white', margin: '2px 0 0 0' }}>
                {form.id ? `Editar Análise Semanal #${form.id}` : `Registrar Análise Semanal de @${selectedUsername}`}
              </h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Botões de navegação rápida de semana de Sáb a Sex */}
              <div style={{ display: 'flex', alignItems: 'center', background: '#161B22', borderRadius: '8px', border: '1px solid #30363D', padding: '2px' }}>
                <button
                  type="button"
                  onClick={() => mudarSemana(offsetSemana + 1)}
                  title="Semana anterior (Sáb a Sex)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#8B949E',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  <ChevronLeft size={14} /> Ant.
                </button>
                <button
                  type="button"
                  onClick={() => mudarSemana(0)}
                  title="Semana mais recente (Sáb a Sex)"
                  style={{
                    background: offsetSemana === 0 ? '#21262D' : 'transparent',
                    border: 'none',
                    color: offsetSemana === 0 ? '#00F0FF' : '#8B949E',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '6px'
                  }}
                >
                  Atual
                </button>
                <button
                  type="button"
                  onClick={() => mudarSemana(Math.max(0, offsetSemana - 1))}
                  title="Próxima semana (Sáb a Sex)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#8B949E',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  Próx. <ChevronRight size={14} />
                </button>
              </div>

              {form.id && (
                <button
                  type="button"
                  onClick={() => {
                    const p = getProximoPeriodo(registros[0], 0);
                    setOffsetSemana(0);
                    setForm({
                      id: null,
                      data_inicio: p.data_inicio,
                      data_fim: p.data_fim,
                      visualizacoes: '',
                      seguidores: '',
                      interacoes: '',
                      nao_seguidores_pct: '',
                      contas_alcancadas: '',
                      visitas_perfil: ''
                    });
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid #30363D',
                    color: '#8B949E',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar Edição
                </button>
              )}
            </div>
          </div>

          {/* Feedback message */}
          {msgFeedback && (
            <div style={{
              background: msgFeedback.tipo === 'ok' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${msgFeedback.tipo === 'ok' ? '#10B981' : '#EF4444'}`,
              borderRadius: '8px',
              padding: '10px 16px',
              color: msgFeedback.tipo === 'ok' ? '#34D399' : '#F87171',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {msgFeedback.tipo === 'ok' ? <Check size={16} /> : <span>⚠️</span>}
              <span>{msgFeedback.texto}</span>
            </div>
          )}

          {/* Banner informativo quando o período ainda está em andamento */}
          {periodoNaoChegou && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(234, 179, 8, 0.08)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '18px',
              color: '#FBBF24',
              fontSize: '13px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(234, 179, 8, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Lock size={18} color="#FBBF24" />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#FCD34D' }}>
                  Período em andamento: {fmtDataBr(form.data_inicio)} a {fmtDataBr(form.data_fim)}
                </div>
                <div style={{ fontSize: '12px', color: '#D1D5DB', marginTop: '2px' }}>
                  A data final deste período ainda não chegou. O preenchimento das métricas só é permitido após o encerramento da semana ({fmtDataBr(form.data_fim)}).
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSalvar}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '16px',
              marginBottom: '20px'
            }}>
              {/* 1. PERÍODO (DE SÁB A SEX) */}
              <div>
                <label style={{ fontSize: '11px', color: '#00F0FF', fontWeight: 800, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1. Período Início (Sábado)
                </label>
                <input
                  type="date"
                  required
                  value={form.data_inicio}
                  onChange={e => handleDataInicioChange(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#00F0FF', fontWeight: 800, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1. Período Fim (Sexta)
                </label>
                <input
                  type="date"
                  required
                  value={form.data_fim}
                  onChange={e => handleDataFimChange(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* 2. VISUALIZAÇÕES */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  2. Visualizações
                </label>
                <input
                  type="number"
                  placeholder={periodoNaoChegou ? 'Bloqueado...' : 'Ex: 150000'}
                  disabled={periodoNaoChegou}
                  value={form.visualizacoes}
                  onChange={e => setForm(f => ({ ...f, visualizacoes: e.target.value }))}
                  style={{
                    width: '100%',
                    background: periodoNaoChegou ? '#0D1117' : '#161B22',
                    border: periodoNaoChegou ? '1px solid #21262D' : '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    opacity: periodoNaoChegou ? 0.45 : 1,
                    cursor: periodoNaoChegou ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              {/* 3. SEGUIDORES (MANUAL - NÃO AUTOMÁTICO) */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  3. Seguidores
                </label>
                <input
                  type="number"
                  placeholder={periodoNaoChegou ? 'Bloqueado...' : 'Digite os seguidores...'}
                  disabled={periodoNaoChegou}
                  value={form.seguidores}
                  onChange={e => setForm(f => ({ ...f, seguidores: e.target.value }))}
                  style={{
                    width: '100%',
                    background: periodoNaoChegou ? '#0D1117' : '#161B22',
                    border: periodoNaoChegou ? '1px solid #21262D' : '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    opacity: periodoNaoChegou ? 0.45 : 1,
                    cursor: periodoNaoChegou ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              {/* 4. INTERAÇÕES */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  4. Interações
                </label>
                <input
                  type="number"
                  placeholder={periodoNaoChegou ? 'Bloqueado...' : 'Ex: 3200'}
                  disabled={periodoNaoChegou}
                  value={form.interacoes}
                  onChange={e => setForm(f => ({ ...f, interacoes: e.target.value }))}
                  style={{
                    width: '100%',
                    background: periodoNaoChegou ? '#0D1117' : '#161B22',
                    border: periodoNaoChegou ? '1px solid #21262D' : '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    opacity: periodoNaoChegou ? 0.45 : 1,
                    cursor: periodoNaoChegou ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              {/* 5. NÃO SEGUIDORES (%) */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  5. Não Seguidores (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder={periodoNaoChegou ? 'Bloqueado...' : 'Ex: 82.5'}
                  disabled={periodoNaoChegou}
                  value={form.nao_seguidores_pct}
                  onChange={e => setForm(f => ({ ...f, nao_seguidores_pct: e.target.value }))}
                  style={{
                    width: '100%',
                    background: periodoNaoChegou ? '#0D1117' : '#161B22',
                    border: periodoNaoChegou ? '1px solid #21262D' : '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    opacity: periodoNaoChegou ? 0.45 : 1,
                    cursor: periodoNaoChegou ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              {/* 6. VISUALIZADORES (ANTES CONTAS ALCANÇADAS) */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  6. Visualizadores
                </label>
                <input
                  type="number"
                  placeholder={periodoNaoChegou ? 'Bloqueado...' : 'Ex: 89000'}
                  disabled={periodoNaoChegou}
                  value={form.contas_alcancadas}
                  onChange={e => setForm(f => ({ ...f, contas_alcancadas: e.target.value }))}
                  style={{
                    width: '100%',
                    background: periodoNaoChegou ? '#0D1117' : '#161B22',
                    border: periodoNaoChegou ? '1px solid #21262D' : '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    opacity: periodoNaoChegou ? 0.45 : 1,
                    cursor: periodoNaoChegou ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              {/* 7. VISITAS AO PERFIL */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  7. Visitas ao Perfil
                </label>
                <input
                  type="number"
                  placeholder={periodoNaoChegou ? 'Bloqueado...' : 'Ex: 1420'}
                  disabled={periodoNaoChegou}
                  value={form.visitas_perfil}
                  onChange={e => setForm(f => ({ ...f, visitas_perfil: e.target.value }))}
                  style={{
                    width: '100%',
                    background: periodoNaoChegou ? '#0D1117' : '#161B22',
                    border: periodoNaoChegou ? '1px solid #21262D' : '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    opacity: periodoNaoChegou ? 0.45 : 1,
                    cursor: periodoNaoChegou ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              {/* Ações do formulário — na mesma linha dos campos 6 e 7, ocupando as últimas colunas */}
              <div style={{ gridColumn: '-3 / -1', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={periodoNaoChegou || salvando}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: periodoNaoChegou
                      ? '#161B22'
                      : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    border: periodoNaoChegou ? '1px solid #30363D' : 'none',
                    color: periodoNaoChegou ? '#8B949E' : 'white',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: (periodoNaoChegou || salvando) ? 'not-allowed' : 'pointer',
                    boxShadow: periodoNaoChegou ? 'none' : '0 4px 14px rgba(16, 185, 129, 0.3)',
                    transition: 'all 0.2s',
                    opacity: periodoNaoChegou ? 0.7 : 1
                  }}
                >
                  {periodoNaoChegou ? (
                    <>
                      <Lock size={16} />
                      <span>Período em Andamento (Liberado em {fmtDataBr(form.data_fim)})</span>
                    </>
                  ) : salvando ? (
                    <span>Salvando...</span>
                  ) : form.id ? (
                    <>
                      <Check size={16} />
                      <span>Salvar Alterações</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>Salvar Dados da Semana</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 8. CONTEÚDO PUBLICADO NO PERÍODO (automático, vindo do banco) */}
            <div>
              <div style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase' }}>
                8. Conteúdo publicado no período {carregandoConteudo && <span style={{ color: '#586069', fontWeight: 600, textTransform: 'none' }}>— carregando...</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                {([
                  { chave: 'reels', rotulo: 'Reels', cor: '#10B981', Icone: Film },
                  { chave: 'posts', rotulo: 'Posts', cor: '#38BDF8', Icone: ImageIcon },
                  { chave: 'stories', rotulo: 'Stories', cor: '#F472B6', Icone: Aperture }
                ] as const).map(({ chave, rotulo, cor, Icone }) => (
                  <div key={chave} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '10px 12px'
                  }}>
                    <Icone size={16} color={cor} />
                    <span style={{ fontSize: '12px', color: '#8B949E', fontWeight: 600 }}>{rotulo}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '16px', fontWeight: 800, color: cor }}>
                      {conteudoPeriodo ? conteudoPeriodo[chave] : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>

        {/* ─── 5. HISTÓRICO DAS SEMANAS REGISTRADAS NA NOVA ORDEM ─── */}
        <div style={{
          background: '#0D1117',
          border: '1px solid #21262D',
          borderRadius: '14px',
          padding: '20px',
          overflowX: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'white', margin: 0 }}>
              Histórico de Semanas Registradas ({registros.length})
            </h4>
            {loading && <span style={{ fontSize: '12px', color: '#8B949E' }}>Carregando histórico...</span>}
          </div>

          {registros.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              textAlign: 'center',
              border: '1px dashed #30363D',
              borderRadius: '10px'
            }}>
              <Calendar size={32} color="#586069" style={{ marginBottom: '10px' }} />
              <h5 style={{ fontSize: '14px', fontWeight: 700, color: '#C9D1D9', margin: '0 0 4px 0' }}>
                Nenhum período semanal registrado ainda para @{selectedUsername}
              </h5>
              <p style={{ fontSize: '12px', color: '#8B949E', margin: 0, maxWidth: '400px' }}>
                Preencha os campos acima com os dados de insights da semana para compor o histórico e o somatório analítico.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363D', color: '#8B949E', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '10px 12px' }}>Período (Sáb a Sex)</th>
                  <th style={{ padding: '10px 12px' }}>Visualizações</th>
                  <th style={{ padding: '10px 12px' }}>Seguidores</th>
                  <th style={{ padding: '10px 12px' }}>Interações</th>
                  <th style={{ padding: '10px 12px' }}>Não Seg. (%)</th>
                  <th style={{ padding: '10px 12px' }}>Visualizadores</th>
                  <th style={{ padding: '10px 12px' }}>Visitas Perfil</th>
                  <th style={{ padding: '10px 12px' }}>Reels</th>
                  <th style={{ padding: '10px 12px' }}>Posts</th>
                  <th style={{ padding: '10px 12px' }}>Stories</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r, idx) => {
                  const prev = registros[idx + 1];
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: idx < registros.length - 1 ? '1px solid #21262D' : 'none',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#161B22'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#E6EDF3', whiteSpace: 'nowrap' }}>
                        📅 {fmtDataBr(r.data_inicio)} a {fmtDataBr(r.data_fim)}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#00F0FF', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{r.visualizacoes > 0 ? fmtNum(r.visualizacoes) : '—'}</span>
                          {r.visualizacoes > 0 && prev && prev.visualizacoes > 0 && (
                            <IndicadorTendencia atual={r.visualizacoes} anterior={prev.visualizacoes} formatar={fmtNum} />
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: Number(r.seguidores) < 0 ? '#F87171' : '#10B981', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>
                            {Number(r.seguidores) > 0
                              ? `+${Number(r.seguidores).toLocaleString('pt-BR')}`
                              : Number(r.seguidores) < 0
                                ? Number(r.seguidores).toLocaleString('pt-BR')
                                : '—'}
                          </span>
                          {Number(r.seguidores) !== 0 && prev && Number(prev.seguidores) !== 0 && (
                            <IndicadorTendencia atual={Number(r.seguidores)} anterior={Number(prev.seguidores)} />
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#FF007A', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{r.interacoes > 0 ? fmtNum(r.interacoes) : '—'}</span>
                          {r.interacoes > 0 && prev && prev.interacoes > 0 && (
                            <IndicadorTendencia atual={r.interacoes} anterior={prev.interacoes} formatar={fmtNum} />
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#3B82F6', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{r.nao_seguidores_pct > 0 ? `${r.nao_seguidores_pct}%` : '—'}</span>
                          {r.nao_seguidores_pct > 0 && prev && prev.nao_seguidores_pct > 0 && (
                            <IndicadorTendencia atual={r.nao_seguidores_pct} anterior={prev.nao_seguidores_pct} sufixo="%" />
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#A855F7', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{r.contas_alcancadas > 0 ? fmtNum(r.contas_alcancadas) : '—'}</span>
                          {r.contas_alcancadas > 0 && prev && prev.contas_alcancadas > 0 && (
                            <IndicadorTendencia atual={r.contas_alcancadas} anterior={prev.contas_alcancadas} formatar={fmtNum} />
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#F59E0B', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{r.visitas_perfil > 0 ? fmtNum(r.visitas_perfil) : '—'}</span>
                          {r.visitas_perfil > 0 && prev && prev.visitas_perfil > 0 && (
                            <IndicadorTendencia atual={r.visitas_perfil} anterior={prev.visitas_perfil} formatar={fmtNum} />
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#10B981', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{r.reels ?? '—'}</span>
                          {r.reels !== null && r.reels !== undefined && prev && prev.reels !== null && prev.reels !== undefined && (
                            <IndicadorTendencia atual={Number(r.reels)} anterior={Number(prev.reels)} />
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#38BDF8', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{r.posts ?? '—'}</span>
                          {r.posts !== null && r.posts !== undefined && prev && prev.posts !== null && prev.posts !== undefined && (
                            <IndicadorTendencia atual={Number(r.posts)} anterior={Number(prev.posts)} />
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#F472B6', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{r.stories ?? '—'}</span>
                          {r.stories !== null && r.stories !== undefined && prev && prev.stories !== null && prev.stories !== undefined && (
                            <IndicadorTendencia atual={Number(r.stories)} anterior={Number(prev.stories)} />
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => handleEditar(r)}
                          title="Editar esta semana"
                          style={{
                            background: 'rgba(59, 130, 246, 0.12)',
                            border: '1px solid #3B82F6',
                            color: '#60A5FA',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            marginRight: '6px'
                          }}
                        >
                          <Edit size={12} />
                        </button>
                        <button
                          onClick={() => handleExcluir(r.id)}
                          title="Excluir esta semana"
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid #EF4444',
                            color: '#F87171',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
