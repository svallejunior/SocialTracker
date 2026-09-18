'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp, Users, Calendar, Eye, Target, Percent,
  Activity, MessageSquare, Check, Trash2, Edit, RefreshCw,
  Hash, ChevronLeft, ChevronRight
} from 'lucide-react';
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
  conteudo_principal: number | string;
  impressoes?: number;
  visitas_perfil?: number;
  engajamento?: number;
  criado_em?: string;
  atualizado_em?: string;
}

// Helper para calcular período semanal de Sábado a Sexta-feira
function getPeriodoSabSex(offsetSemanas: number = 0) {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0 = Domingo, 1 = Seg, ..., 5 = Sex, 6 = Sáb
  // Última sexta-feira (ou hoje se for sexta)
  const diasAteSexta = (diaSemana + 7 - 5) % 7;
  const fim = new Date(hoje);
  fim.setDate(hoje.getDate() - diasAteSexta - (offsetSemanas * 7));

  const ini = new Date(fim);
  ini.setDate(fim.getDate() - 6); // Sábado (6 dias antes da sexta)

  return {
    data_inicio: ini.toISOString().substring(0, 10),
    data_fim: fim.toISOString().substring(0, 10)
  };
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

  // Estado do formulário na exata ordem solicitada:
  // 1. Período (Sáb a Sex)
  // 2. Visualizações
  // 3. Seguidores (manual - não preenche automaticamente)
  // 4. Interações
  // 5. Não seguidores (%)
  // 6. Visualizadores (antigo contas alcançadas)
  // 7. Conteúdo principal (número)
  const [form, setForm] = useState({
    id: null as number | null,
    data_inicio: getPeriodoSabSex(0).data_inicio,
    data_fim: getPeriodoSabSex(0).data_fim,
    visualizacoes: '',
    seguidores: '',
    interacoes: '',
    nao_seguidores_pct: '',
    contas_alcancadas: '', // Visualizadores
    conteudo_principal: ''  // Número
  });

  // Atualiza período ao mudar offset de semana
  const mudarSemana = (novoOffset: number) => {
    setOffsetSemana(novoOffset);
    const p = getPeriodoSabSex(novoOffset);
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
        setRegistros(json.data || []);
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
        conteudoPrincipal: 0
      };
    }

    const totalViews = registros.reduce((acc, r) => acc + (Number(r.visualizacoes) || 0), 0);
    // Último valor de seguidores registrado ou média
    const ultimosSeguidores = registros[0]?.seguidores ? Number(registros[0].seguidores) : 0;
    const totalInteracoes = registros.reduce((acc, r) => acc + (Number(r.interacoes) || 0), 0);
    const mediaNaoSeg = registros.reduce((acc, r) => acc + (Number(r.nao_seguidores_pct) || 0), 0) / totalSemanas;
    const totalVisualizadores = registros.reduce((acc, r) => acc + (Number(r.contas_alcancadas) || 0), 0);
    const totalConteudo = registros.reduce((acc, r) => acc + (Number(r.conteudo_principal) || 0), 0);

    return {
      totalSemanas,
      visualizacoes: totalViews,
      seguidores: ultimosSeguidores,
      interacoes: totalInteracoes,
      mediaNaoSeguidores: mediaNaoSeg,
      visualizadores: totalVisualizadores,
      conteudoPrincipal: totalConteudo
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
        conteudo_principal: Number(form.conteudo_principal) || 0,
        impressoes: 0,
        visitas_perfil: 0,
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
        // Limpa para novo período mantendo o período padrão
        const p = getPeriodoSabSex(offsetSemana);
        setForm({
          id: null,
          data_inicio: p.data_inicio,
          data_fim: p.data_fim,
          visualizacoes: '',
          seguidores: '', // Usuário informa manualmente
          interacoes: '',
          nao_seguidores_pct: '',
          contas_alcancadas: '',
          conteudo_principal: ''
        });
        carregarRegistros(selectedUsername);
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
      conteudo_principal: String(r.conteudo_principal || '')
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
                      // Se estava editando, limpa formulário ao trocar
                      if (form.id) {
                        const p = getPeriodoSabSex(offsetSemana);
                        setForm({
                          id: null,
                          data_inicio: p.data_inicio,
                          data_fim: p.data_fim,
                          visualizacoes: '',
                          seguidores: '',
                          interacoes: '',
                          nao_seguidores_pct: '',
                          contas_alcancadas: '',
                          conteudo_principal: ''
                        });
                      }
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

        {/* ─── 3. SOMATÓRIO SEMANAL (CARDS DE SCORE NA NOVA ORDEM) ─── */}
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

            {/* 6. Conteúdo Principal (Número) */}
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
                <Hash size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
                  Conteúdo Total
                </span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#F59E0B', lineHeight: 1.1, marginTop: '2px' }}>
                  {fmtNum(somatorioSemanal.conteudoPrincipal)}
                </div>
                <span style={{ fontSize: '10px', color: '#586069' }}>Qtd. conteúdos somados</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── 4. FORMULÁRIO E CAMPOS DE ENTRADA NA ORDEM EXATA SOLICITADA ─── */}
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
                    const p = getPeriodoSabSex(offsetSemana);
                    setForm({
                      id: null,
                      data_inicio: p.data_inicio,
                      data_fim: p.data_fim,
                      visualizacoes: '',
                      seguidores: '',
                      interacoes: '',
                      nao_seguidores_pct: '',
                      contas_alcancadas: '',
                      conteudo_principal: ''
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
                  onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
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
                  onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))}
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
                  placeholder="Ex: 150000"
                  value={form.visualizacoes}
                  onChange={e => setForm(f => ({ ...f, visualizacoes: e.target.value }))}
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

              {/* 3. SEGUIDORES (MANUAL - NÃO AUTOMÁTICO) */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  3. Seguidores
                </label>
                <input
                  type="number"
                  placeholder="Digite os seguidores..."
                  value={form.seguidores}
                  onChange={e => setForm(f => ({ ...f, seguidores: e.target.value }))}
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

              {/* 4. INTERAÇÕES */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  4. Interações
                </label>
                <input
                  type="number"
                  placeholder="Ex: 3200"
                  value={form.interacoes}
                  onChange={e => setForm(f => ({ ...f, interacoes: e.target.value }))}
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

              {/* 5. NÃO SEGUIDORES (%) */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  5. Não Seguidores (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 82.5"
                  value={form.nao_seguidores_pct}
                  onChange={e => setForm(f => ({ ...f, nao_seguidores_pct: e.target.value }))}
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

              {/* 6. VISUALIZADORES (ANTES CONTAS ALCANÇADAS) */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  6. Visualizadores
                </label>
                <input
                  type="number"
                  placeholder="Ex: 89000"
                  value={form.contas_alcancadas}
                  onChange={e => setForm(f => ({ ...f, contas_alcancadas: e.target.value }))}
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

              {/* 7. CONTEÚDO PRINCIPAL (EM NÚMERO) */}
              <div>
                <label style={{ fontSize: '11px', color: '#8B949E', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  7. Conteúdo Principal (Número)
                </label>
                <input
                  type="number"
                  placeholder="Ex: 12"
                  value={form.conteudo_principal}
                  onChange={e => setForm(f => ({ ...f, conteudo_principal: e.target.value }))}
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
            </div>

            {/* Ações do formulário */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="submit"
                disabled={salvando}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: salvando ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                  transition: 'all 0.2s'
                }}
              >
                <Check size={16} />
                <span>{salvando ? 'Salvando...' : form.id ? 'Salvar Alterações' : 'Salvar Dados da Semana'}</span>
              </button>
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
                  <th style={{ padding: '10px 12px' }}>1. Período (Sáb a Sex)</th>
                  <th style={{ padding: '10px 12px' }}>2. Visualizações</th>
                  <th style={{ padding: '10px 12px' }}>3. Seguidores</th>
                  <th style={{ padding: '10px 12px' }}>4. Interações</th>
                  <th style={{ padding: '10px 12px' }}>5. Não Seg. (%)</th>
                  <th style={{ padding: '10px 12px' }}>6. Visualizadores</th>
                  <th style={{ padding: '10px 12px' }}>7. Conteúdo Principal</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r, idx) => (
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
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#00F0FF' }}>
                      {r.visualizacoes > 0 ? fmtNum(r.visualizacoes) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#10B981', fontWeight: 600 }}>
                      {r.seguidores > 0 ? r.seguidores.toLocaleString('pt-BR') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#FF007A' }}>
                      {r.interacoes > 0 ? fmtNum(r.interacoes) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#3B82F6' }}>
                      {r.nao_seguidores_pct > 0 ? `${r.nao_seguidores_pct}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#A855F7' }}>
                      {r.contas_alcancadas > 0 ? fmtNum(r.contas_alcancadas) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#F59E0B', fontWeight: 700 }}>
                      {r.conteudo_principal ? String(r.conteudo_principal) : '—'}
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
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
