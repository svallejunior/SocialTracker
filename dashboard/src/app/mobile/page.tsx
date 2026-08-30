"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock, RefreshCw, Calendar, CheckCircle2, TrendingUp,
  TrendingDown, Users, Layers, Monitor, ChevronRight,
  AlertCircle, Sparkles, Image as ImageIcon, Film, PlayCircle
} from 'lucide-react';

interface PerfilMobile {
  username: string;
  nome: string;
  foto_url: string | null;
  seguidores: number;
  total_posts: number;
  variacao_ultima: number;
  variacao_dia: number;
  posts_dia: number;
  ultima_coleta: string | null;
}

interface ResumoData {
  ultima_atualizacao: string | null;
  perfis: PerfilMobile[];
  agendamentos: {
    a_fazer: any[];
    concluidos: any[];
  };
}

export default function MobileDashboard() {
  const [data, setData] = useState<ResumoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTabAgendamento, setActiveTabAgendamento] = useState<'fazer' | 'feitos'>('fazer');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/mobile/resumo');
      const json = await res.json();
      if (json.success && json.perfis && json.perfis.length > 0) {
        setData(json);
      } else {
        // Fallback: busca via /api/data
        const resData = await fetch('/api/data');
        const jsonData = await resData.json();

        const resAg = await fetch('/api/automacao/agendamentos');
        const jsonAg = await resAg.json();

        if (jsonData.success && jsonData.profiles) {
          const perfisAtivosComMeta = jsonData.profiles.filter((p: any) => p.tem_meta_id && (p.status === 'ATIVO' || !p.status));
          const list = perfisAtivosComMeta.length > 0 ? perfisAtivosComMeta : jsonData.profiles;

          const perfisM: PerfilMobile[] = list.map((p: any) => ({
            username: p.username,
            nome: p.nome_controle || p.username,
            foto_url: p.foto_url || p.foto_perfil || null,
            seguidores: Number(p.seguidores || 0),
            total_posts: Number(p.total_posts || 0),
            variacao_ultima: 0,
            variacao_dia: Number(p.novosSeguidores24h || 0),
            posts_dia: 0,
            ultima_coleta: p.data_coleta || null
          }));

          setData({
            ultima_atualizacao: jsonData.profiles[0]?.data_coleta || new Date().toISOString(),
            perfis: perfisM,
            agendamentos: {
              a_fazer: (jsonAg?.agendamentos || []).filter((a: any) => a.status === 'AGENDADO' || a.status === 'PUBLICANDO'),
              concluidos: jsonAg?.publicacoes || []
            }
          });
        }
      }
    } catch (e) {
      console.error('Erro ao carregar dados mobile:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Atualização automática a cada 60s
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const formatHora = (dateStr: string | null) => {
    if (!dateStr) return '--:--';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const formatDataCompleta = (dateStr: string | null) => {
    if (!dateStr) return 'Sem registro';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      
      const hoje = new Date();
      const isHoje = d.toDateString() === hoje.toDateString();
      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      if (isHoje) return `Hoje às ${hora}`;
      return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
    } catch {
      return dateStr;
    }
  };

  const formatNumero = (num: number) => {
    return new Intl.NumberFormat('pt-BR').format(num);
  };

  const renderBadgeVariacao = (val: number, labelPrefix = '') => {
    if (val > 0) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          color: '#10B981',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          padding: '2px 6px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 700
        }}>
          <TrendingUp size={12} />
          {labelPrefix}+{formatNumero(val)}
        </span>
      );
    }
    if (val < 0) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          color: '#EF4444',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          padding: '2px 6px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 700
        }}>
          <TrendingDown size={12} />
          {labelPrefix}{formatNumero(val)}
        </span>
      );
    }
    return (
      <span style={{
        color: '#6B7280',
        background: 'rgba(107, 114, 128, 0.1)',
        padding: '2px 6px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 600
      }}>
        {labelPrefix}0
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#090A0F',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        color: '#8B949E',
        fontFamily: 'var(--font-plus-jakarta, sans-serif)'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(113, 0, 226, 0.2)',
          borderTopColor: '#00F0FF',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <p style={{ fontSize: '13px', fontWeight: 600 }}>Carregando dados mobile...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const perfis = data?.perfis || [];
  const aFazer = data?.agendamentos.a_fazer || [];
  const concluidos = data?.agendamentos.concluidos || [];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#090A0F',
      color: '#FFFFFF',
      fontFamily: 'var(--font-plus-jakarta, sans-serif)',
      paddingBottom: '40px'
    }}>
      {/* ── HEADER MOBILE COMPACTO ── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(13, 17, 23, 0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(240, 246, 252, 0.08)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #7100E2 0%, #00F0FF 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 800
          }}>
            S
          </div>
          <div>
            <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.02em' }}>SocialTracker</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '6px 12px',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </header>

      <main style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* ── CARD: HORA DA ÚLTIMA ATUALIZAÇÃO ── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(22, 27, 34, 0.8) 0%, rgba(13, 17, 23, 0.95) 100%)',
          border: '1px solid rgba(240, 246, 252, 0.1)',
          borderRadius: '14px',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(0, 240, 255, 0.1)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00F0FF'
            }}>
              <Clock size={18} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#8B949E', fontWeight: 600, textTransform: 'uppercase' }}>
                Última Atualização
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
                {formatDataCompleta(data?.ultima_atualizacao || null)}
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            padding: '4px 8px',
            borderRadius: '20px',
            fontSize: '11px',
            color: '#10B981',
            fontWeight: 700
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
            Online
          </div>
        </div>

        {/* ── SEÇÃO: TABELA / CARDS DE ATUALIZAÇÃO DOS PERFIS ── */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <h2 style={{
              fontSize: '14px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#8B949E',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Users size={15} color="#00F0FF" />
              Perfis & Evolução ({perfis.length})
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {perfis.map((p) => (
              <div
                key={p.username}
                style={{
                  background: 'rgba(22, 27, 34, 0.75)',
                  border: '1px solid rgba(240, 246, 252, 0.08)',
                  borderRadius: '14px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {/* Linha Superior: Foto, Nome e Total de Seguidores */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      background: '#161B22',
                      border: '2px solid rgba(240, 246, 252, 0.15)',
                      flexShrink: 0
                    }}>
                      {p.foto_url ? (
                        <img src={p.foto_url} alt={p.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                          👤
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>
                        {p.nome || p.username}
                      </div>
                      <div style={{ fontSize: '11px', color: '#8B949E' }}>
                        @{p.username}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF' }}>
                      {formatNumero(p.seguidores)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#8B949E', textTransform: 'uppercase' }}>
                      Seguidores
                    </div>
                  </div>
                </div>

                {/* Linha Inferior: 3 Colunas de Métricas (Última Coleta, No Dia, Postagens) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '6px',
                  background: 'rgba(13, 17, 23, 0.6)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  border: '1px solid rgba(240, 246, 252, 0.04)'
                }}>
                  {/* 1. Evolução na Última Atualização */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: '#8B949E', textTransform: 'uppercase', marginBottom: '3px', fontWeight: 600 }}>
                      Última Coleta
                    </div>
                    <div>
                      {renderBadgeVariacao(p.variacao_ultima)}
                    </div>
                  </div>

                  {/* 2. Evolução no Dia */}
                  <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '9px', color: '#8B949E', textTransform: 'uppercase', marginBottom: '3px', fontWeight: 600 }}>
                      No Dia
                    </div>
                    <div>
                      {renderBadgeVariacao(p.variacao_dia)}
                    </div>
                  </div>

                  {/* 3. Postagens */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: '#8B949E', textTransform: 'uppercase', marginBottom: '3px', fontWeight: 600 }}>
                      Posts
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                      <Layers size={11} color="#00F0FF" />
                      <span>{p.total_posts}</span>
                      {p.posts_dia > 0 && (
                        <span style={{ fontSize: '10px', color: '#10B981' }}>(+{p.posts_dia})</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SEÇÃO: AGENDAMENTOS (O QUE TEM PRA FAZER & O QUE FOI FEITO) ── */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <h2 style={{
              fontSize: '14px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#8B949E',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Calendar size={15} color="#FF007A" />
              Agendamentos
            </h2>

            {/* Toggle Abas: A Fazer / Feitos */}
            <div style={{
              background: '#161B22',
              borderRadius: '8px',
              padding: '2px',
              display: 'flex',
              border: '1px solid rgba(240, 246, 252, 0.08)'
            }}>
              <button
                onClick={() => setActiveTabAgendamento('fazer')}
                style={{
                  background: activeTabAgendamento === 'fazer' ? '#7100E2' : 'transparent',
                  color: activeTabAgendamento === 'fazer' ? '#FFFFFF' : '#8B949E',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                A Fazer ({aFazer.length})
              </button>
              <button
                onClick={() => setActiveTabAgendamento('feitos')}
                style={{
                  background: activeTabAgendamento === 'feitos' ? '#10B981' : 'transparent',
                  color: activeTabAgendamento === 'feitos' ? '#FFFFFF' : '#8B949E',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Feitos ({concluidos.length})
              </button>
            </div>
          </div>

          {/* LISTA: O QUE TEM PRA FAZER */}
          {activeTabAgendamento === 'fazer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {aFazer.length === 0 ? (
                <div style={{
                  background: 'rgba(22, 27, 34, 0.5)',
                  borderRadius: '12px',
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: '#8B949E',
                  fontSize: '13px'
                }}>
                  ✨ Nenhum agendamento pendente no momento.
                </div>
              ) : (
                aFazer.map((ag) => {
                  const horaStr = ag.modo_hora === 'FIXA' ? ag.hora_fixa : `${ag.hora_janela_inicio} - ${ag.hora_janela_fim}`;
                  const dataStr = ag.tipo_agendamento === 'DATA_ESPECIFICA' ? ag.data_especifica : (ag.dias_selecionados || []).join(', ');

                  return (
                    <div
                      key={ag.id}
                      style={{
                        background: 'rgba(22, 27, 34, 0.75)',
                        border: '1px solid rgba(240, 246, 252, 0.08)',
                        borderRadius: '12px',
                        padding: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: ag.tipo_postagem === 'REELS' ? 'rgba(255, 0, 122, 0.15)' : 'rgba(113, 0, 226, 0.15)',
                          color: ag.tipo_postagem === 'REELS' ? '#FF007A' : '#7100E2',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {ag.tipo_postagem === 'REELS' ? <Film size={18} /> : <ImageIcon size={18} />}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
                              @{ag.username}
                            </span>
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              background: 'rgba(255,255,255,0.08)',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              color: '#00F0FF'
                            }}>
                              {ag.tipo_postagem}
                            </span>
                          </div>

                          <div style={{ fontSize: '11px', color: '#8B949E', marginTop: '2px' }}>
                            📅 {dataStr || 'Recorrente'} • ⏰ {horaStr}
                          </div>
                        </div>
                      </div>

                      <div style={{
                        background: 'rgba(113, 0, 226, 0.15)',
                        color: '#C084FC',
                        border: '1px solid rgba(113, 0, 226, 0.3)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '10px',
                        fontWeight: 700
                      }}>
                        AGENDADO
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* LISTA: O QUE FOI FEITO */}
          {activeTabAgendamento === 'feitos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {concluidos.length === 0 ? (
                <div style={{
                  background: 'rgba(22, 27, 34, 0.5)',
                  borderRadius: '12px',
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: '#8B949E',
                  fontSize: '13px'
                }}>
                  Nenhuma publicação recente registrada no histórico.
                </div>
              ) : (
                concluidos.map((pub) => (
                  <div
                    key={pub.id}
                    style={{
                      background: 'rgba(22, 27, 34, 0.75)',
                      border: '1px solid rgba(240, 246, 252, 0.08)',
                      borderRadius: '12px',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10B981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <CheckCircle2 size={18} />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
                            @{pub.username}
                          </span>
                          <span style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            background: 'rgba(255,255,255,0.08)',
                            padding: '2px 5px',
                            borderRadius: '4px',
                            color: '#10B981'
                          }}>
                            {pub.tipo_postagem}
                          </span>
                        </div>

                        <div style={{ fontSize: '11px', color: '#8B949E', marginTop: '2px' }}>
                          Publicado em {formatDataCompleta(pub.publicado_em || `${pub.data_local} ${pub.hora_local}`)}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10B981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 700
                    }}>
                      PUBLICADO
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
