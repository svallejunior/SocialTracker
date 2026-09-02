"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock, RefreshCw, Calendar, CheckCircle2, TrendingUp,
  TrendingDown, Users, Layers, ExternalLink,
  AlertCircle, Sparkles, Image as ImageIcon, Film, PlayCircle
} from 'lucide-react';

interface PostMobile {
  post_id: string;
  formato: string;
  visualizacoes: number;
  multiplicador: number;
  multiplicador_str: string;
  destaque: boolean;
  data_postagem: string;
  hora: string;
  url: string;
}

interface PerfilMobile {
  username: string;
  nome: string;
  foto_url: string | null;
  seguidores: number;
  total_posts: number;
  variacao_ultima: number;
  variacao_dia: number;
  posts_dia: number;
  ultimas_publicacoes?: PostMobile[];
  posts_hoje?: PostMobile[];
  meu_perfil?: boolean;
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
            ultimas_publicacoes: [],
            posts_hoje: [],
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
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);

      const isHoje = d.toDateString() === hoje.toDateString();
      const isOntem = d.toDateString() === ontem.toDateString();
      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      if (isHoje) return `Hoje às ${hora}`;
      if (isOntem) return `Ontem às ${hora}`;
      return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
    } catch {
      return dateStr;
    }
  };

  const formatDataPostagem = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      
      const hoje = new Date();
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);

      const isHoje = d.toDateString() === hoje.toDateString();
      const isOntem = d.toDateString() === ontem.toDateString();
      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      if (isHoje) return `Hoje às ${hora}`;
      if (isOntem) return `Ontem às ${hora}`;
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
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
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
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
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
        color: '#8B949E',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
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
        background: '#0D0F12',
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
          border: '3px solid rgba(148, 148, 148, 0.25)',
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
      background: '#0E1015',
      color: '#FFFFFF',
      fontFamily: 'var(--font-plus-jakarta, sans-serif)',
      paddingBottom: '40px'
    }}>
      {/* ── HEADER MOBILE COMPACTO ── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(18, 20, 26, 0.95)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
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
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
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

      <main style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

        {/* ── CARD: HORA DA ÚLTIMA ATUALIZAÇÃO (#949494) ── */}
        <div style={{
          background: '#949494',
          borderRadius: '18px',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 8px 24px -2px rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(0, 0, 0, 0.12)',
              border: '1px solid rgba(0, 0, 0, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0F172A'
            }}>
              <Clock size={18} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#2D3748', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Última Atualização
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                {formatDataCompleta(data?.ultima_atualizacao || null)}
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#0F172A',
            border: '1px solid rgba(0, 0, 0, 0.3)',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '11px',
            color: '#10B981',
            fontWeight: 700
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
            Online
          </div>
        </div>

        {/* ── SEÇÃO: CARDS DOS PERFIS E SUAS PUBLICAÇÕES ── */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <h2 style={{
              fontSize: '13px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#9CA3AF',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Users size={15} color="#00F0FF" />
              Minhas Modelos ({perfis.length})
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {perfis.map((p) => {
              const postsList = p.ultimas_publicacoes || p.posts_hoje || [];

              return (
                <div
                  key={p.username}
                  style={{
                    background: '#949494',
                    borderRadius: '18px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: '0 10px 30px -4px rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.25)'
                  }}
                >
                  {/* Linha Superior: Foto, Nome e Total de Seguidores (Tipografia Escura de Alto Contraste no #949494) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: '#16191E',
                        border: '2px solid #0F172A',
                        flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
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
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                          {p.nome || p.username}
                        </div>
                        <div style={{ fontSize: '12px', color: '#2D3748', fontWeight: 600, marginTop: '2px' }}>
                          @{p.username}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
                        {formatNumero(p.seguidores)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#2D3748', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                        Seguidores
                      </div>
                    </div>
                  </div>

                  {/* Linha do Meio: 3 Colunas de Métricas (Última Coleta, No Dia, Postagens) */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '6px',
                    background: '#16181D',
                    borderRadius: '12px',
                    padding: '10px',
                    border: '1px solid rgba(0, 0, 0, 0.25)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }}>
                    {/* 1. Evolução na Última Atualização */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 700 }}>
                        Última Coleta
                      </div>
                      <div>
                        {renderBadgeVariacao(p.variacao_ultima)}
                      </div>
                    </div>

                    {/* 2. Evolução no Dia */}
                    <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 700 }}>
                        No Dia
                      </div>
                      <div>
                        {renderBadgeVariacao(p.variacao_dia)}
                      </div>
                    </div>

                    {/* 3. Postagens */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 700 }}>
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

                  {/* ── Linha Inferior: Últimas 5 Publicações da Modelo ── */}
                  <div style={{
                    marginTop: '2px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(0, 0, 0, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{
                      fontSize: '11px',
                      color: '#0F172A',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Film size={13} color="#0F172A" />
                        Últimas Publicações ({postsList.length})
                      </div>
                      <span style={{ fontSize: '10px', color: '#2D3748', fontWeight: 600, textTransform: 'none' }}>
                        Até 5 mais recentes
                      </span>
                    </div>

                    {postsList.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {postsList.slice(0, 5).map((post) => (
                          <a
                            key={post.post_id}
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: '#16181D',
                              border: '1px solid rgba(0, 0, 0, 0.25)',
                              borderRadius: '10px',
                              padding: '8px 10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              textDecoration: 'none',
                              transition: 'all 0.15s ease',
                              gap: '8px',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                                <span style={{
                                  fontWeight: 800,
                                  color: post.formato === 'Reels' ? '#FF007A' : (post.formato === 'Carrossel' ? '#00F0FF' : '#C084FC')
                                }}>
                                  {post.formato}
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
                                <span style={{ color: '#F3F4F6', fontWeight: 600 }}>
                                  {formatNumero(post.visualizacoes)} {post.visualizacoes === 1 ? 'view' : 'views'}
                                </span>
                              </div>
                              {post.data_postagem && (
                                <div style={{ fontSize: '10px', color: '#8B949E' }}>
                                  {formatDataPostagem(post.data_postagem)}
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontWeight: 800,
                                fontSize: '11px',
                                color: post.destaque ? '#F59E0B' : (post.multiplicador >= 1.0 ? '#10B981' : '#8B949E'),
                                background: post.destaque ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                                border: post.destaque ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                                padding: '2px 6px',
                                borderRadius: '6px'
                              }}>
                                {post.destaque ? `🔥 ${post.multiplicador_str}` : post.multiplicador_str}
                              </span>
                              <ExternalLink size={12} color="#8B949E" />
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div style={{
                        background: '#16181D',
                        borderRadius: '10px',
                        padding: '10px',
                        fontSize: '11px',
                        color: '#8B949E',
                        fontStyle: 'italic',
                        textAlign: 'center',
                        border: '1px solid rgba(0, 0, 0, 0.2)'
                      }}>
                        Nenhuma publicação recente encontrada
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
              fontSize: '13px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#9CA3AF',
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
              border: '1px solid rgba(255, 255, 255, 0.1)'
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {aFazer.length === 0 ? (
                <div style={{
                  background: '#949494',
                  borderRadius: '16px',
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: '#0F172A',
                  fontWeight: 600,
                  fontSize: '13px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
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
                        background: '#949494',
                        borderRadius: '16px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.2)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: '#0F172A',
                          color: ag.tipo_postagem === 'REELS' ? '#FF007A' : '#00F0FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {ag.tipo_postagem === 'REELS' ? <Film size={18} /> : <ImageIcon size={18} />}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                              @{ag.username}
                            </span>
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              background: '#0F172A',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              color: '#00F0FF'
                            }}>
                              {ag.tipo_postagem}
                            </span>
                          </div>

                          <div style={{ fontSize: '11px', color: '#2D3748', fontWeight: 600, marginTop: '2px' }}>
                            📅 {dataStr || 'Recorrente'} • ⏰ {horaStr}
                          </div>
                        </div>
                      </div>

                      <div style={{
                        background: '#0F172A',
                        color: '#C084FC',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {concluidos.length === 0 ? (
                <div style={{
                  background: '#949494',
                  borderRadius: '16px',
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: '#0F172A',
                  fontWeight: 600,
                  fontSize: '13px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
                }}>
                  Nenhuma publicação recente registrada no histórico.
                </div>
              ) : (
                concluidos.map((pub) => (
                  <div
                    key={pub.id}
                    style={{
                      background: '#949494',
                      borderRadius: '16px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: '#0F172A',
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
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                            @{pub.username}
                          </span>
                          <span style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            background: '#0F172A',
                            padding: '2px 5px',
                            borderRadius: '4px',
                            color: '#10B981'
                          }}>
                            {pub.tipo_postagem}
                          </span>
                        </div>

                        <div style={{ fontSize: '11px', color: '#2D3748', fontWeight: 600, marginTop: '2px' }}>
                          Publicado em {formatDataCompleta(pub.publicado_em || `${pub.data_local} ${pub.hora_local}`)}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      background: '#0F172A',
                      color: '#10B981',
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
