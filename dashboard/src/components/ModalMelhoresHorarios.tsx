'use client';
import React, { useEffect, useState } from 'react';
import { AvatarModelo } from './AvatarModelo';
import {
  X, Users, Eye, TrendingUp, Calendar, Clock,
  Sparkles, Flame, CheckCircle2, RefreshCw,
  AlertCircle, ChevronRight, BarChart3, HelpCircle, Info
} from 'lucide-react';

interface FaixaSeguidor {
  faixa: string;
  horaInicio: number;
  ganhoTotal: number;
  ganhoMedio: number;
  amostras: number;
  percentual: number;
  isMelhor: boolean;
}

interface FaixaView {
  faixa: string;
  horaInicio: number;
  viewsMedia: number;
  viewsMediana: number;
  viewsTotal: number;
  postsCount: number;
  percentual: number;
  isMelhor: boolean;
}

interface DiaSemanaView {
  dia: string;
  diaCurto: string;
  diaIndex: number;
  viewsMedia?: number;
  viewsMediana?: number;
  viewsTotal?: number;
  seguidoresTotal?: number;
  seguidoresMedia?: number;
  postsCount?: number;
  amostras?: number;
  percentual: number;
  destaque: boolean;
}

interface GrupoDiaSemana {
  dias: DiaSemanaView[];
  diasIndicados: string[];
  houveDiscrepancia: boolean;
  totalViews?: number;
  totalSeguidores?: number;
  totalPosts?: number;
}

interface FaixaPostagem {
  faixa: string;
  horaInicio: number;
  mediana: number;
  media: number;
  amostras: number;
  percentual: number;
  isMelhor: boolean;
}

interface DiaPostagem {
  dia: string;
  diaCurto: string;
  diaIndex: number;
  mediana: number;
  media: number;
  amostras: number;
  percentual: number;
  destaque: boolean;
}

interface PostagemData {
  metrica: 'views' | 'likes';
  metricaLabel: string;
  postsConsiderados: number;
  temDados: boolean;
  amostraBaixa: boolean;
  melhorFaixa?: string;
  melhorFaixaInicio: number;
  melhorFaixaFim: number;
  melhorFaixaValor: number;
  faixas: FaixaPostagem[];
  melhorDia?: string;
  dias: DiaPostagem[];
  qualidadeDados: {
    postsDesatualizados: number;
    percentualDesatualizado: number;
    observacao?: string;
  };
  observacao?: string;
}

interface HorariosData {
  success: boolean;
  username: string;
  nome: string;
  foto_url: string | null;
  postagem?: PostagemData;
  seguidores: {
    melhorFaixa: string;
    melhorFaixaInicio: number;
    melhorFaixaFim: number;
    ganhoTotalFaixa: number;
    ganhoMedioFaixa: number;
    totalGanhosAnalisados: number;
    faixas: FaixaSeguidor[];
    temDados: boolean;
    observacao?: string;
    observacaoFiltro?: string;
    diasValidosCount?: number;
    diasDescartadosCount?: number;
  };
  visualizacoes: {
    melhorFaixa: string;
    melhorFaixaInicio: number;
    melhorFaixaFim: number;
    viewsTotalFaixa?: number;
    viewsMediaFaixa: number;
    viewsMedianaFaixa?: number;
    totalViewsGanhas?: number;
    totalPostsAnalisados: number;
    faixas: FaixaView[];
    diasSemana: DiaSemanaView[];
    diasAudiencia?: GrupoDiaSemana;
    diasSeguidores?: GrupoDiaSemana;
    diasPostagem?: GrupoDiaSemana;
    houveDiscrepancia: boolean;
    diasIndicados: string[];
    temDados: boolean;
    observacao?: string;
  };
}

interface ModalMelhoresHorariosProps {
  modelo: {
    username: string;
    nome?: string;
    foto_url?: string;
    foto_perfil?: string;
    [key: string]: any;
  } | null;
  onClose: () => void;
}

function formatNumber(num: number): string {
  if (num === undefined || num === null) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'k';
  return num.toLocaleString('pt-BR');
}

export default function ModalMelhoresHorarios({ modelo, onClose }: ModalMelhoresHorariosProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HorariosData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabVisual, setTabVisual] = useState<'geral' | 'faixas_seguidores' | 'faixas_views' | 'faixas_postagem' | 'dias'>('geral');
  const [modoDiaSemana, setModoDiaSemana] = useState<'audiencia' | 'seguidores' | 'postagem'>('audiencia');

  useEffect(() => {
    if (!modelo?.username) return;

    setLoading(true);
    setError(null);

    fetch(`/api/perfis/melhores-horarios?username=${encodeURIComponent(modelo.username)}`)
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setData(json);
        } else {
          setError(json.error || 'Erro ao carregar métricas da modelo');
        }
      })
      .catch(err => {
        setError(err.message || 'Falha na conexão com o servidor');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [modelo?.username]);

  // Fechar ao pressionar ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!modelo) return null;

  const nomeExibicao = data?.nome || modelo.nome || modelo.nome_controle || modelo.username;
  const fotoExibicao = data?.foto_url || modelo.foto_url || modelo.foto_perfil || null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0D1117',
          border: '1px solid #30363D',
          borderRadius: 16,
          width: '100%',
          maxWidth: 780,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 240, 255, 0.08)',
          overflow: 'hidden',
          color: '#E6EDF3'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* --- HEADER DO MODAL --- */}
        <div
          style={{
            padding: '16px 20px',
            background: '#161B22',
            borderBottom: '1px solid #21262D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <AvatarModelo
              src={fotoExibicao}
              username={modelo.username}
              size={48}
              showBadge={false}
              borderColor="#00FF66"
              imageStyle={{ border: '2px solid rgba(0, 255, 102, 0.4)' }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: '#FFFFFF',
                    margin: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {nomeExibicao}
                </h2>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: 'rgba(0, 255, 102, 0.12)',
                    border: '1px solid rgba(0, 255, 102, 0.3)',
                    color: '#00FF66'
                  }}
                >
                  Insights & Melhores Horários
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#8B949E', fontWeight: 600 }}>
                @{modelo.username}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#21262D',
              border: '1px solid #30363D',
              color: '#8B949E',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#FFFFFF';
              e.currentTarget.style.background = '#30363D';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#8B949E';
              e.currentTarget.style.background = '#21262D';
            }}
            title="Fechar (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* --- CORPO COM ROLAGEM --- */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#8B949E' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#00F0FF' }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Calculando séries temporais e engajamento...</div>
            </div>
          ) : error ? (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '20px',
                borderRadius: 12,
                textAlign: 'center',
                color: '#F87171'
              }}
            >
              <AlertCircle size={24} style={{ margin: '0 auto 8px auto' }} />
              <div style={{ fontSize: 14, fontWeight: 700 }}>Erro ao obter métricas</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{error}</div>
            </div>
          ) : data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* ─────────────────────────────────────────────────────────────
                  CARD 0: HORÁRIO REAL DE POSTAGEM (resultado final de cada post)
              ───────────────────────────────────────────────────────────── */}
              {data.postagem && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.10) 0%, #161B22 100%)',
                    border: '1px solid rgba(249, 115, 22, 0.4)',
                    borderRadius: 14,
                    padding: '18px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: 'rgba(249, 115, 22, 0.15)',
                          border: '1px solid rgba(249, 115, 22, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FB923C'
                        }}
                      >
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#FB923C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Horário Real de Postagem
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#8B949E' }}>
                          Recomendação baseada no resultado final de cada post publicado
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: 'rgba(249, 115, 22, 0.15)',
                        color: '#FB923C',
                        border: '1px solid rgba(249, 115, 22, 0.3)'
                      }}
                    >
                      Recomendado
                    </span>
                  </div>

                  {data.postagem.temDados ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
                        <div
                          style={{
                            background: '#0D1117',
                            border: '1px solid #F97316',
                            borderRadius: 12,
                            padding: '12px 16px'
                          }}
                        >
                          <div style={{ fontSize: 11, color: '#8B949E', fontWeight: 600 }}>Melhor faixa pra postar</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#FB923C', letterSpacing: '-0.5px' }}>
                            {data.postagem.melhorFaixa}
                          </div>
                        </div>
                        {data.postagem.melhorDia && (
                          <div
                            style={{
                              background: '#0D1117',
                              border: '1px solid #21262D',
                              borderRadius: 12,
                              padding: '12px 16px'
                            }}
                          >
                            <div style={{ fontSize: 11, color: '#8B949E', fontWeight: 600 }}>Melhor dia da semana</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.5px' }}>
                              {data.postagem.melhorDia}
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11 }}>
                        <div style={{ background: '#0D1117', padding: '8px 10px', borderRadius: 8, border: '1px solid #21262D' }}>
                          <span style={{ color: '#8B949E' }}>Métrica usada: </span>
                          <strong style={{ color: '#FB923C' }}>{data.postagem.metricaLabel}</strong>
                        </div>
                        <div style={{ background: '#0D1117', padding: '8px 10px', borderRadius: 8, border: '1px solid #21262D' }}>
                          <span style={{ color: '#8B949E' }}>Mediana na faixa: </span>
                          <strong style={{ color: '#FFFFFF' }}>{formatNumber(data.postagem.melhorFaixaValor)}</strong>
                        </div>
                      </div>

                      {data.postagem.amostraBaixa && (
                        <div
                          style={{
                            marginTop: 10,
                            background: 'rgba(245, 158, 11, 0.1)',
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                            fontSize: 11,
                            color: '#FBBF24',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <AlertCircle size={13} style={{ flexShrink: 0 }} />
                          <span>Amostra ainda pequena ({data.postagem.postsConsiderados} posts) — confiança vai aumentar conforme mais posts forem publicados.</span>
                        </div>
                      )}

                      {data.postagem.qualidadeDados.postsDesatualizados > 0 && (
                        <div
                          style={{
                            marginTop: 8,
                            background: 'rgba(239, 68, 68, 0.08)',
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            fontSize: 11,
                            color: '#F87171',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <Info size={13} style={{ flexShrink: 0 }} />
                          <span>{data.postagem.qualidadeDados.observacao}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '16px 12px', textAlign: 'center', color: '#8B949E', fontSize: 12 }}>
                      <Clock size={20} style={{ margin: '0 auto 6px auto', opacity: 0.5 }} />
                      <div>{data.postagem.observacao || 'Sem posts suficientes ainda.'}</div>
                    </div>
                  )}
                </div>
              )}

              {/* GRID PRINCIPAL: 2 CARDS GRANDES DE DESTAQUE */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

                {/* ─────────────────────────────────────────────────────────────
                    CARD 1: MELHOR HORÁRIO EM SEGUIDORES (FAIXA DE 2H)
                ───────────────────────────────────────────────────────────── */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, #161B22 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    borderRadius: 14,
                    padding: '18px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#10B981'
                        }}
                      >
                        <Users size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          1. Crescimento de Seguidores
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#8B949E' }}>
                          Melhor faixa de 2 horas
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34D399',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      Pico de Conversão
                    </span>
                  </div>

                  {data.seguidores.temDados ? (
                    <div>
                      {/* Bloco de Horário Gigante */}
                      <div
                        style={{
                          background: '#0D1117',
                          border: '1px solid #238636',
                          borderRadius: 12,
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 12
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 11, color: '#8B949E', fontWeight: 600 }}>Horário de Maior Ganho</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#00FF66', letterSpacing: '-0.5px' }}>
                            {data.seguidores.melhorFaixa}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: '#8B949E', fontWeight: 600 }}>Total no Período</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF' }}>
                            +{formatNumber(data.seguidores.ganhoTotalFaixa)} seg
                          </div>
                        </div>
                      </div>

                      {/* Mini Indicadores */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                        <div style={{ background: '#0D1117', padding: '8px 10px', borderRadius: 8, border: '1px solid #21262D' }}>
                          <span style={{ color: '#8B949E' }}>Média por ciclo: </span>
                          <strong style={{ color: '#34D399' }}>+{data.seguidores.ganhoMedioFaixa} seg</strong>
                        </div>
                        <div style={{ background: '#0D1117', padding: '8px 10px', borderRadius: 8, border: '1px solid #21262D' }}>
                          <span style={{ color: '#8B949E' }}>Leituras válidas: </span>
                          <strong style={{ color: '#FFFFFF' }}>{data.seguidores.totalGanhosAnalisados} ciclos</strong>
                        </div>
                      </div>

                      {data.seguidores.observacaoFiltro && (
                        <div
                          style={{
                            marginTop: 10,
                            background: '#0D1117',
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                            fontSize: 11,
                            color: '#8B949E',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <Info size={13} style={{ color: '#10B981', flexShrink: 0 }} />
                          <span>{data.seguidores.observacaoFiltro}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: '#8B949E', fontSize: 12 }}>
                      <Clock size={20} style={{ margin: '0 auto 6px auto', opacity: 0.5 }} />
                      <div>{data.seguidores.observacao || 'Pouco histórico temporal registrado.'}</div>
                    </div>
                  )}
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    CARD 2: MELHOR FAIXA DE VISUALIZAÇÕES (VIEWS - 2H)
                ───────────────────────────────────────────────────────────── */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(56, 139, 253, 0.08) 0%, #161B22 100%)',
                    border: '1px solid rgba(56, 139, 253, 0.35)',
                    borderRadius: 14,
                    padding: '18px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: 'rgba(56, 139, 253, 0.15)',
                          border: '1px solid rgba(56, 139, 253, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#58A6FF'
                        }}
                      >
                        <Eye size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#58A6FF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          2. Faixa de Visualizações
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#8B949E' }}>
                          Melhor horário de postagem
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: 'rgba(56, 139, 253, 0.15)',
                        color: '#58A6FF',
                        border: '1px solid rgba(56, 139, 253, 0.3)'
                      }}
                    >
                      Pico de Alcance
                    </span>
                  </div>

                  {data.visualizacoes.temDados ? (
                    <div>
                      {/* Bloco de Horário Gigante */}
                      <div
                        style={{
                          background: '#0D1117',
                          border: '1px solid #1F6FEB',
                          borderRadius: 12,
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 12
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 11, color: '#8B949E', fontWeight: 600 }}>Horário de Maior Audiência</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#58A6FF', letterSpacing: '-0.5px' }}>
                            {data.visualizacoes.melhorFaixa}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: '#8B949E', fontWeight: 600 }}>Total na Faixa</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF' }}>
                            {formatNumber(data.visualizacoes.viewsTotalFaixa ?? data.visualizacoes.viewsMediaFaixa)} views
                          </div>
                        </div>
                      </div>

                      {/* Mini Indicadores */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                        <div style={{ background: '#0D1117', padding: '8px 10px', borderRadius: 8, border: '1px solid #21262D' }}>
                          <span style={{ color: '#8B949E' }}>Média por ciclo: </span>
                          <strong style={{ color: '#58A6FF' }}>+{formatNumber(data.visualizacoes.viewsMediaFaixa)} views</strong>
                        </div>
                        <div style={{ background: '#0D1117', padding: '8px 10px', borderRadius: 8, border: '1px solid #21262D' }}>
                          <span style={{ color: '#8B949E' }}>Volume medido: </span>
                          <strong style={{ color: '#FFFFFF' }}>{formatNumber(data.visualizacoes.totalViewsGanhas || data.visualizacoes.viewsTotalFaixa || 0)} views</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: '#8B949E', fontSize: 12 }}>
                      <Eye size={20} style={{ margin: '0 auto 6px auto', opacity: 0.5 }} />
                      <div>{data.visualizacoes.observacao || 'Nenhum post com visualizações registrado.'}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────────────
                  CARD 3: DESEMPENHO POR DIA DA SEMANA COM SELETOR
              ───────────────────────────────────────────────────────────── */}
              {(() => {
                const dadosModo = (() => {
                  if (modoDiaSemana === 'seguidores') {
                    const grupo = data.visualizacoes.diasSeguidores;
                    return {
                      dias: grupo?.dias || [],
                      houveDiscrepancia: grupo?.houveDiscrepancia ?? false,
                      diasIndicados: grupo?.diasIndicados || [],
                      tituloDiscrepancia: 'Dias com maior ganho de novos seguidores:',
                      corTema: '#10B981',
                      corTemaBg: 'rgba(16, 185, 129, 0.15)',
                      corDestaque: '#34D399',
                      unidade: 'seguidores',
                      tipoValor: 'seguidores' as const
                    };
                  }
                  if (modoDiaSemana === 'postagem') {
                    // Preferimos o bloco novo (data.postagem.dias), baseado em MEDIANA por post
                    // e já livre de posts deletados/stubs corrompidos. Cai pro grupo antigo
                    // (média, via crescimento de snapshots) só se o novo ainda não tiver dado.
                    if (data.postagem && data.postagem.dias.length > 0) {
                      const diasMapeados: DiaSemanaView[] = data.postagem.dias.map(d => ({
                        dia: d.dia,
                        diaCurto: d.diaCurto,
                        diaIndex: d.diaIndex,
                        viewsMedia: d.mediana,
                        postsCount: d.amostras,
                        percentual: d.percentual,
                        destaque: d.destaque
                      }));
                      const diasIndicados = data.postagem.melhorDia ? [data.postagem.melhorDia] : [];
                      return {
                        dias: diasMapeados,
                        houveDiscrepancia: diasIndicados.length > 0,
                        diasIndicados,
                        tituloDiscrepancia: `Melhor dia pra postar (mediana de ${data.postagem.metrica === 'views' ? 'views' : 'curtidas'} por post):`,
                        corTema: '#A855F7',
                        corTemaBg: 'rgba(168, 85, 247, 0.15)',
                        corDestaque: '#C084FC',
                        unidade: data.postagem.metrica === 'views' ? 'views/post (mediana)' : 'curtidas/post (mediana)',
                        tipoValor: 'postagem' as const
                      };
                    }
                    const grupo = data.visualizacoes.diasPostagem;
                    return {
                      dias: grupo?.dias || [],
                      houveDiscrepancia: grupo?.houveDiscrepancia ?? false,
                      diasIndicados: grupo?.diasIndicados || [],
                      tituloDiscrepancia: 'Dias de postagem com maior média de visualizações por post:',
                      corTema: '#A855F7',
                      corTemaBg: 'rgba(168, 85, 247, 0.15)',
                      corDestaque: '#C084FC',
                      unidade: 'views/post',
                      tipoValor: 'postagem' as const
                    };
                  }
                  // Default: Audiência (Views)
                  const grupo = data.visualizacoes.diasAudiencia;
                  return {
                    dias: grupo?.dias || data.visualizacoes.diasSemana || [],
                    houveDiscrepancia: grupo?.houveDiscrepancia ?? data.visualizacoes.houveDiscrepancia,
                    diasIndicados: grupo?.diasIndicados || data.visualizacoes.diasIndicados || [],
                    tituloDiscrepancia: 'Dias com maior audiência (visualizações assistidas):',
                    corTema: '#F59E0B',
                    corTemaBg: 'rgba(245, 158, 11, 0.15)',
                    corDestaque: '#FBBF24',
                    unidade: 'views',
                    tipoValor: 'audiencia' as const
                  };
                })();

                return (
                  <div
                    style={{
                      background: '#161B22',
                      border: dadosModo.houveDiscrepancia ? `1px solid ${dadosModo.corTema}` : '1px solid #30363D',
                      borderRadius: 14,
                      padding: '16px 18px',
                      boxShadow: dadosModo.houveDiscrepancia ? `0 4px 20px ${dadosModo.corTemaBg}` : 'none'
                    }}
                  >
                    {/* Header do Card com Título e Chave Seletora */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={16} color={dadosModo.houveDiscrepancia ? dadosModo.corDestaque : '#58A6FF'} />
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF' }}>
                            Desempenho por Dia da Semana
                          </span>
                          <span style={{ marginLeft: 8, fontSize: 11, color: '#8B949E' }}>
                            {modoDiaSemana === 'audiencia' && '(Audiência de visualizações)'}
                            {modoDiaSemana === 'seguidores' && '(Ganhos de novos seguidores)'}
                            {modoDiaSemana === 'postagem' && '(Performance por data publicada)'}
                          </span>
                        </div>
                      </div>

                      {/* Chave Seletora de Modo (Audiência vs Seguidores vs Dia da Postagem) */}
                      <div style={{ display: 'flex', background: '#0D1117', padding: 2, borderRadius: 8, border: '1px solid #30363D', gap: 2 }}>
                        <button
                          type="button"
                          onClick={() => setModoDiaSemana('audiencia')}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: modoDiaSemana === 'audiencia' ? '1px solid #F59E0B' : '1px solid transparent',
                            background: modoDiaSemana === 'audiencia' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                            color: modoDiaSemana === 'audiencia' ? '#FBBF24' : '#8B949E',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Eye size={12} />
                          Audiência (Views)
                        </button>
                        <button
                          type="button"
                          onClick={() => setModoDiaSemana('seguidores')}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: modoDiaSemana === 'seguidores' ? '1px solid #10B981' : '1px solid transparent',
                            background: modoDiaSemana === 'seguidores' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                            color: modoDiaSemana === 'seguidores' ? '#34D399' : '#8B949E',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Users size={12} />
                          Seguidores
                        </button>
                        <button
                          type="button"
                          onClick={() => setModoDiaSemana('postagem')}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: modoDiaSemana === 'postagem' ? '1px solid #A855F7' : '1px solid transparent',
                            background: modoDiaSemana === 'postagem' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                            color: modoDiaSemana === 'postagem' ? '#C084FC' : '#8B949E',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Calendar size={12} />
                          Dia da Postagem
                        </button>
                      </div>
                    </div>

                    {/* Status de Discrepância */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      {dadosModo.houveDiscrepancia ? (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            padding: '3px 10px',
                            borderRadius: 12,
                            background: dadosModo.corTemaBg,
                            color: dadosModo.corDestaque,
                            border: `1px solid ${dadosModo.corTema}66`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          <Sparkles size={12} />
                          Discrepância Detectada
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#8B949E' }}>
                          Distribuição relativamente homogênea entre os dias
                        </span>
                      )}
                    </div>

                    {/* Banner de Dias Indicados caso haja discrepância */}
                    {dadosModo.houveDiscrepancia && dadosModo.diasIndicados.length > 0 && (
                      <div
                        style={{
                          background: dadosModo.corTemaBg,
                          border: `1px solid ${dadosModo.corTema}44`,
                          borderRadius: 10,
                          padding: '10px 14px',
                          marginBottom: 14,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 8
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: dadosModo.corDestaque }}>
                          <Flame size={16} color={dadosModo.corTema} />
                          <span><strong>{dadosModo.tituloDiscrepancia}</strong></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {dadosModo.diasIndicados.map(d => (
                            <span
                              key={d}
                              style={{
                                background: dadosModo.corTema,
                                color: '#0B0E14',
                                fontWeight: 800,
                                fontSize: 11,
                                padding: '3px 9px',
                                borderRadius: 6
                              }}
                            >
                              ⭐ {d}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 7 Colunas dos Dias da Semana (Seg a Dom) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                        gap: 8
                      }}
                    >
                      {dadosModo.dias.map(d => {
                        let valorPrincipalStr = '-';
                        let subtexto = '';
                        let temValor = false;

                        if (dadosModo.tipoValor === 'seguidores') {
                          const seg = d.seguidoresTotal ?? 0;
                          temValor = seg > 0;
                          valorPrincipalStr = temValor ? `+${formatNumber(seg)}` : '-';
                          subtexto = d.amostras ? `${d.amostras} medições` : 'seguidores';
                        } else if (dadosModo.tipoValor === 'postagem') {
                          const vMed = d.viewsMedia ?? 0;
                          temValor = (d.postsCount ?? 0) > 0;
                          valorPrincipalStr = temValor ? (vMed > 0 ? formatNumber(vMed) : '0') : '-';
                          subtexto = `${d.postsCount ?? 0} ${(d.postsCount === 1) ? 'post' : 'posts'}`;
                        } else {
                          const vTot = d.viewsTotal ?? d.viewsMedia ?? 0;
                          temValor = vTot > 0;
                          valorPrincipalStr = temValor ? formatNumber(vTot) : '-';
                          subtexto = 'views';
                        }

                        return (
                          <div
                            key={d.dia}
                            style={{
                              background: d.destaque ? dadosModo.corTemaBg : '#0D1117',
                              border: d.destaque ? `1px solid ${dadosModo.corTema}` : '1px solid #21262D',
                              borderRadius: 8,
                              padding: '8px 6px',
                              textAlign: 'center',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                color: d.destaque ? dadosModo.corDestaque : '#8B949E',
                                marginBottom: 4,
                                textTransform: 'uppercase'
                              }}
                            >
                              {d.diaCurto}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 800,
                                color: temValor ? '#FFFFFF' : '#6E7681'
                              }}
                            >
                              {valorPrincipalStr}
                            </div>
                            <div style={{ fontSize: 9.5, color: '#8B949E', marginTop: 2 }}>
                              {subtexto}
                            </div>
                            {d.destaque && (
                              <div style={{ marginTop: 4 }}>
                                <span
                                  style={{
                                    fontSize: 8.5,
                                    fontWeight: 900,
                                    color: '#0B0E14',
                                    background: dadosModo.corTema,
                                    padding: '1px 4px',
                                    borderRadius: 4
                                  }}
                                >
                                  TOP
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ─────────────────────────────────────────────────────────────
                  SELETOR DE DETALHAMENTO DAS FAIXAS DE 2H (DISTRIBUIÇÃO COMPLETA)
              ───────────────────────────────────────────────────────────── */}
              <div
                style={{
                  background: '#161B22',
                  border: '1px solid #21262D',
                  borderRadius: 14,
                  padding: '16px 18px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarChart3 size={15} color="#58A6FF" />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF' }}>
                      Distribuição Horária (Todas as 12 Faixas de 2h)
                    </span>
                  </div>

                  {/* Toggle para ver Seguidores vs Visualizações */}
                  <div style={{ display: 'flex', background: '#0D1117', padding: 2, borderRadius: 8, border: '1px solid #30363D', gap: 2 }}>
                    <button
                      type="button"
                      onClick={() => setTabVisual('faixas_seguidores')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: tabVisual === 'faixas_seguidores' ? '1px solid #10B981' : '1px solid transparent',
                        background: tabVisual === 'faixas_seguidores' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                        color: tabVisual === 'faixas_seguidores' ? '#34D399' : '#8B949E',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Seguidores
                    </button>
                    <button
                      type="button"
                      onClick={() => setTabVisual('faixas_views')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: tabVisual === 'faixas_views' ? '1px solid #388BFD' : '1px solid transparent',
                        background: tabVisual === 'faixas_views' ? 'rgba(56, 139, 253, 0.2)' : 'transparent',
                        color: tabVisual === 'faixas_views' ? '#58A6FF' : '#8B949E',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Visualizações
                    </button>
                    {data.postagem && (
                      <button
                        type="button"
                        onClick={() => setTabVisual('faixas_postagem')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: tabVisual === 'faixas_postagem' ? '1px solid #F97316' : '1px solid transparent',
                          background: tabVisual === 'faixas_postagem' ? 'rgba(249, 115, 22, 0.2)' : 'transparent',
                          color: tabVisual === 'faixas_postagem' ? '#FB923C' : '#8B949E',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Postagem
                      </button>
                    )}
                  </div>
                </div>

                {/* Tabela / Grid de Barras Horárias */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 8 }}>
                  {(tabVisual === 'faixas_postagem'
                    ? (data.postagem?.faixas || [])
                    : tabVisual === 'faixas_views' ? data.visualizacoes.faixas : data.seguidores.faixas
                  ).map((item: any) => {
                    const isMelhor = item.isMelhor;
                    const valPrincipal = tabVisual === 'faixas_postagem'
                      ? item.mediana
                      : tabVisual === 'faixas_views' ? (item.viewsTotal ?? item.viewsMedia) : item.ganhoTotal;
                    const valFormatado = (tabVisual === 'faixas_views' || tabVisual === 'faixas_postagem')
                      ? (valPrincipal > 0 ? `${formatNumber(valPrincipal)}` : '-')
                      : (valPrincipal > 0 ? `+${formatNumber(valPrincipal)}` : '-');

                    const corTema = tabVisual === 'faixas_postagem' ? '#F97316' : tabVisual === 'faixas_views' ? '#58A6FF' : '#10B981';
                    const corTemaBg = tabVisual === 'faixas_postagem' ? 'rgba(249, 115, 22, 0.15)' : tabVisual === 'faixas_views' ? 'rgba(56, 139, 253, 0.15)' : 'rgba(16, 185, 129, 0.15)';

                    return (
                      <div
                        key={item.faixa}
                        style={{
                          background: isMelhor ? corTemaBg : '#0D1117',
                          border: isMelhor ? `1px solid ${corTema}` : '1px solid #21262D',
                          borderRadius: 8,
                          padding: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative'
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, color: isMelhor ? corTema : '#8B949E', marginBottom: 4 }}>
                          {item.faixa}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: valPrincipal > 0 ? '#FFFFFF' : '#484F58' }}>
                          {valFormatado}
                        </div>
                        <div style={{ marginTop: 6, width: '100%', height: 4, background: '#21262D', borderRadius: 2, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.max(4, item.percentual)}%`,
                              height: '100%',
                              background: isMelhor ? corTema : '#30363D',
                              borderRadius: 2
                            }}
                          />
                        </div>
                        {isMelhor && (
                          <div style={{ position: 'absolute', top: 4, right: 6, fontSize: 8.5, fontWeight: 900, color: corTema }}>
                            ★ TOP
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          ) : null}
        </div>

        {/* --- FOOTER DO MODAL --- */}
        <div
          style={{
            padding: '12px 20px',
            background: '#161B22',
            borderTop: '1px solid #21262D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#8B949E'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <HelpCircle size={13} />
            <span>Dados compilados a partir de coletas a cada 15 min e histórico de postagens do Instagram.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#21262D',
              border: '1px solid #30363D',
              color: '#C9D1D9',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
