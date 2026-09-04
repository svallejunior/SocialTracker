'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  X, ExternalLink, Calendar, Heart, MessageSquare, Eye,
  TrendingUp, Award, Clock, Image as ImageIcon, Film as VideoIcon,
  Layers as LayersIcon, ChevronRight, Activity, Zap, BarChart2
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';

interface Snapshot {
  id: number;
  post_id: string;
  username: string;
  likes: number;
  comentarios: number;
  views: number;
  reach: number;
  saved: number;
  shares: number;
  total_interactions: number;
  data_carga: string;
}

interface BenchmarkPoint {
  minutesBucket: number;
  avgViews: number;
  avgLikes: number;
  avgComentarios: number;
  sampleCount: number;
}

interface ModalEvolucaoPostProps {
  post: any;
  onClose: () => void;
  getInstagramPostUrl: (p: any) => string;
}

/** Interpolação linear entre buckets do benchmark */
function interpolateBenchmark(
  bm: BenchmarkPoint[],
  minutes: number,
  key: 'avgViews' | 'avgLikes' | 'avgComentarios'
): number | null {
  if (!bm || bm.length === 0 || minutes < 0) return null;
  if (minutes === 0) return 0;

  let lower: BenchmarkPoint | null = null;
  let upper: BenchmarkPoint | null = null;

  for (const p of bm) {
    if (p.minutesBucket <= minutes) lower = p;
    if (p.minutesBucket >= minutes && upper === null) upper = p;
  }

  if (!lower && upper) return upper[key];
  if (lower && !upper) return null; // além do último bucket — não extrapola
  if (!lower || !upper) return null;
  if (lower.minutesBucket === upper.minutesBucket) return lower[key];

  const t = (minutes - lower.minutesBucket) / (upper.minutesBucket - lower.minutesBucket);
  return Math.round(lower[key] + t * (upper[key] - lower[key]));
}

export default function ModalEvolucaoPost({
  post,
  onClose,
  getInstagramPostUrl
}: ModalEvolucaoPostProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [metricFoco, setMetricFoco] = useState<'todas' | 'likes' | 'views' | 'comentarios'>('todas');
  const [benchmark, setBenchmark] = useState<BenchmarkPoint[]>([]);
  const [benchmarkSampleSize, setBenchmarkSampleSize] = useState(0);

  // Trata tecla Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Carrega snapshots do post
  useEffect(() => {
    let isMounted = true;
    async function loadSnapshots() {
      if (!post?.post_id) return;
      try {
        setLoading(true);
        const res = await fetch(`/api/posts/${post.post_id}/snapshots`);
        const json = await res.json();
        if (isMounted && json.success) {
          setSnapshots(json.snapshots || []);
        }
      } catch (err) {
        console.error('Erro ao carregar snapshots do post:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadSnapshots();
    return () => {
      isMounted = false;
    };
  }, [post?.post_id]);

  // Carrega benchmark histórico (comportamento esperado) do mesmo username + formato
  useEffect(() => {
    if (!post?.post_id) return;
    fetch(`/api/posts/${post.post_id}/benchmark`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setBenchmark(data.benchmark || []);
          setBenchmarkSampleSize(data.sampleSize || 0);
        }
      })
      .catch(() => {});
  }, [post?.post_id]);

  // Formatação de data e hora completa
  const formatDateTimeFull = (dtStr: string) => {
    if (!dtStr) return '—';
    try {
      const parts = dtStr.trim().split(' ');
      const datePart = parts[0];
      const timePart = parts[1] || '';
      const [ano, mes, dia] = datePart.split('-');
      if (dia && mes && ano) {
        const horaMin = timePart ? timePart.substring(0, 5) : '';
        return horaMin ? `${dia}/${mes}/${ano} às ${horaMin}` : `${dia}/${mes}/${ano}`;
      }
      return dtStr;
    } catch {
      return dtStr;
    }
  };

  // Formata hora curta para o eixo X do gráfico
  const formatTimeLabel = (dtStr: string) => {
    if (!dtStr) return '';
    try {
      const parts = dtStr.trim().split(' ');
      const [ano, mes, dia] = parts[0].split('-');
      const horaMin = parts[1] ? parts[1].substring(0, 5) : '';
      return horaMin ? `${dia}/${mes} ${horaMin}` : `${dia}/${mes}`;
    } catch {
      return dtStr;
    }
  };

  const formatNumber = (num: number | string) => {
    const val = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(val)) return '0';
    return new Intl.NumberFormat('pt-BR').format(val);
  };

  // Dados formatados para o gráfico (com ponto zero na hora de publicação e campos de benchmark)
  const chartData = useMemo(() => {
    // Parse da hora de publicação para calcular minutos relativos
    let postTimeMs: number | null = null;
    try {
      if (post?.data_postagem) {
        const t = new Date(post.data_postagem.replace(' ', 'T')).getTime();
        if (!isNaN(t)) postTimeMs = t;
      }
    } catch { /* ignora */ }

    // Calcula minutos desde a publicação para um dado timestamp
    const minsFrom = (dtStr: string): number | null => {
      if (!postTimeMs || !dtStr) return null;
      try {
        const t = new Date(dtStr.replace(' ', 'T')).getTime();
        return isNaN(t) ? null : (t - postTimeMs) / 60000;
      } catch { return null; }
    };

    // Adiciona campos expected* a um ponto de dados
    const withExpected = (p: any, minutes: number | null) => {
      if (benchmark.length < 2 || minutes === null || minutes < 0) return p;
      return {
        ...p,
        expectedViews: interpolateBenchmark(benchmark, minutes, 'avgViews'),
        expectedLikes: interpolateBenchmark(benchmark, minutes, 'avgLikes'),
        expectedComentarios: interpolateBenchmark(benchmark, minutes, 'avgComentarios'),
      };
    };

    let points: any[];

    if (!snapshots || snapshots.length === 0) {
      // Sem histórico: usa métricas atuais como único ponto
      const baseViews = Number(post?.views) || (post?.formato === 'Reels' ? Number(post?.viewsEfetivas) : 0);
      const min = postTimeMs ? (Date.now() - postTimeMs) / 60000 : null;
      points = [withExpected({
        dataHora: formatTimeLabel(post?.data_postagem || new Date().toISOString()),
        timestamp: post?.data_postagem || '',
        likes: Number(post?.likes) || 0,
        comentarios: Number(post?.comentarios) || 0,
        views: baseViews,
        reach: Number(post?.reach) || 0,
      }, min)];
    } else {
      points = snapshots.map((s, idx) => {
        const min = minsFrom(s.data_carga) ?? (idx + 1) * 15;
        const prev = idx > 0 ? snapshots[idx - 1] : null;

        const currentLikes = Number(s.likes) || 0;
        const currentComentarios = Number(s.comentarios) || 0;
        const currentViews = Number(s.views) || 0;

        let diffLikes: number | null = null;
        let diffComentarios: number | null = null;
        let diffViews: number | null = null;
        let pctCurvaViews: number | null = null;

        if (prev) {
          const prevLikes = Number(prev.likes) || 0;
          const prevComentarios = Number(prev.comentarios) || 0;
          const prevViews = Number(prev.views) || 0;

          diffLikes = currentLikes - prevLikes;
          diffComentarios = currentComentarios - prevComentarios;
          diffViews = currentViews - prevViews;

          if (prevViews > 0) {
            pctCurvaViews = ((currentViews - prevViews) / prevViews) * 100;
          } else if (currentViews > 0) {
            pctCurvaViews = 100.0;
          } else {
            pctCurvaViews = 0.0;
          }
        }

        return withExpected({
          index: idx + 1,
          dataHora: formatTimeLabel(s.data_carga),
          timestamp: s.data_carga,
          likes: currentLikes,
          comentarios: currentComentarios,
          views: currentViews,
          reach: Number(s.reach) || 0,
          interacoes: Number(s.total_interactions) || (currentLikes + currentComentarios),
          diffLikes,
          diffComentarios,
          diffViews,
          pctCurvaViews
        }, min);
      });
    }

    // Ponto zero: hora da publicação com valores 0 (início da linha do tempo)
    if (postTimeMs) {
      const zeroPoint = withExpected({
        dataHora: '★ ' + formatTimeLabel(post.data_postagem),
        timestamp: post.data_postagem,
        isZero: true,
        likes: 0,
        comentarios: 0,
        views: 0,
        reach: 0,
        diffLikes: null,
        diffComentarios: null,
        diffViews: null,
        pctCurvaViews: null
      }, 0);
      return [zeroPoint, ...points];
    }

    return points;
  }, [snapshots, post, benchmark]);

  // Variação calculada entre o primeiro e o último snapshot (acumulado do monitoramento)
  const variacoes = useMemo(() => {
    if (snapshots.length < 2) return null;
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    return {
      diffLikes: last.likes - first.likes,
      diffViews: last.views - first.views,
      diffComentarios: last.comentarios - first.comentarios
    };
  }, [snapshots]);

  // Variação pontual entre a penúltima amostra e a última amostra coletada
  const ultimasVariacoes = useMemo(() => {
    if (snapshots.length < 2) return null;
    const penultimo = snapshots[snapshots.length - 2];
    const ultimo = snapshots[snapshots.length - 1];
    const diffLikes = ultimo.likes - penultimo.likes;
    const diffViews = ultimo.views - penultimo.views;
    const diffComentarios = ultimo.comentarios - penultimo.comentarios;

    // Crescimento percentual de views entre a penúltima e última amostra
    let pctCurvaViews: number | null = null;
    if (penultimo.views > 0) {
      pctCurvaViews = ((ultimo.views - penultimo.views) / penultimo.views) * 100;
    } else if (ultimo.views > 0) {
      pctCurvaViews = 100.0;
    } else {
      pctCurvaViews = 0.0;
    }

    return {
      diffLikes,
      diffViews,
      diffComentarios,
      pctCurvaViews
    };
  }, [snapshots]);

  const pMult = typeof post?.performanceMultiplier === 'number' && !isNaN(post.performanceMultiplier)
    ? post.performanceMultiplier
    : 1.0;

  // Os cards do topo devem refletir o mesmo dado mais recente que o gráfico
  // (snapshots), não o `post` vindo da lista da aba — que pode estar
  // desatualizado em relação à última coleta, causando números divergentes
  // entre o card e a curva.
  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const displayLikes = latestSnapshot ? latestSnapshot.likes : Number(post?.likes) || 0;
  const displayComentarios = latestSnapshot ? latestSnapshot.comentarios : Number(post?.comentarios) || 0;
  const displayViews = latestSnapshot
    ? latestSnapshot.views
    : (Number(post?.views) || (post?.formato === 'Reels' ? Number(post?.viewsEfetivas) : 0));

  const temViews = displayViews > 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 12, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0D1117',
          border: '1px solid #30363D',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 25px rgba(113, 0, 226, 0.25)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid #21262D',
            background: 'linear-gradient(180deg, rgba(22, 27, 34, 0.8) 0%, rgba(13, 17, 23, 0.95) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Ícone de Formato / Badge */}
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: post?.formato === 'Reels'
                  ? 'rgba(0, 240, 255, 0.12)'
                  : post?.formato === 'Carrossel'
                    ? 'rgba(168, 85, 247, 0.12)'
                    : 'rgba(255, 0, 122, 0.12)',
                border: `1px solid ${
                  post?.formato === 'Reels'
                    ? 'rgba(0, 240, 255, 0.3)'
                    : post?.formato === 'Carrossel'
                      ? 'rgba(168, 85, 247, 0.3)'
                      : 'rgba(255, 0, 122, 0.3)'
                }`
              }}
            >
              {post?.formato === 'Reels' ? (
                <VideoIcon size={20} style={{ color: 'var(--color-cyan)' }} />
              ) : post?.formato === 'Carrossel' ? (
                <LayersIcon size={20} style={{ color: 'var(--color-purple)' }} />
              ) : (
                <ImageIcon size={20} style={{ color: '#FF007A' }} />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'white', margin: 0 }}>
                  @{post?.username}
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#161B22',
                    border: '1px solid #30363D',
                    color: '#8B949E'
                  }}
                >
                  {post?.formato}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: pMult >= 1.8 ? 'rgba(0, 255, 200, 0.15)' : 'rgba(0, 240, 255, 0.1)',
                    border: `1px solid ${pMult >= 1.8 ? 'rgba(0, 255, 200, 0.3)' : 'rgba(0, 240, 255, 0.3)'}`,
                    color: pMult >= 1.8 ? 'var(--color-green)' : 'var(--color-cyan)'
                  }}
                >
                  {pMult >= 1.8 ? '🔥 ' : ''}{pMult.toFixed(1).replace('.', ',')}x Desempenho
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#8B949E', margin: '3px 0 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={12} /> Publicado em {formatDateTimeFull(post?.data_postagem)}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <a
              href={getInstagramPostUrl(post)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: '#161B22',
                border: '1px solid #30363D',
                color: 'var(--color-cyan)',
                fontSize: '12px',
                fontWeight: '600',
                textDecoration: 'none',
                transition: 'all 0.2s'
              }}
            >
              Ver no Instagram <ExternalLink size={13} />
            </a>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#8B949E',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s'
              }}
              title="Fechar (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Corpo do Modal */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
          className="custom-scrollbar"
        >
          {/* Top Cards de Métricas Consolidadas */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '12px'
            }}
          >
            {/* Card Curtidas */}
            <div
              style={{
                background: '#161B22',
                border: '1px solid #30363D',
                borderRadius: '12px',
                padding: '14px 16px',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8B949E' }}>
                  Curtidas
                </span>
                <span style={{ fontSize: '16px' }}>❤️</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                <span>{formatNumber(displayLikes)}</span>
                {ultimasVariacoes !== null && (
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '700',
                    color: ultimasVariacoes.diffLikes > 0 ? 'var(--color-green)' : ultimasVariacoes.diffLikes < 0 ? '#FF007A' : '#8B949E'
                  }}>
                    ({ultimasVariacoes.diffLikes > 0 ? `+${formatNumber(ultimasVariacoes.diffLikes)}` : formatNumber(ultimasVariacoes.diffLikes)})
                  </span>
                )}
              </div>
              {variacoes && variacoes.diffLikes > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--color-green)', fontWeight: '600', marginTop: '4px' }}>
                  +{formatNumber(variacoes.diffLikes)} durante monitoramento
                </div>
              )}
            </div>

            {/* Card Comentários */}
            <div
              style={{
                background: '#161B22',
                border: '1px solid #30363D',
                borderRadius: '12px',
                padding: '14px 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8B949E' }}>
                  Comentários
                </span>
                <span style={{ fontSize: '16px' }}>💬</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                <span>{formatNumber(displayComentarios)}</span>
                {ultimasVariacoes !== null && (
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '700',
                    color: ultimasVariacoes.diffComentarios > 0 ? 'var(--color-green)' : ultimasVariacoes.diffComentarios < 0 ? '#FF007A' : '#8B949E'
                  }}>
                    ({ultimasVariacoes.diffComentarios > 0 ? `+${formatNumber(ultimasVariacoes.diffComentarios)}` : formatNumber(ultimasVariacoes.diffComentarios)})
                  </span>
                )}
              </div>
              {variacoes && variacoes.diffComentarios > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--color-green)', fontWeight: '600', marginTop: '4px' }}>
                  +{formatNumber(variacoes.diffComentarios)} durante monitoramento
                </div>
              )}
            </div>

            {/* Card Visualizações */}
            <div
              style={{
                background: '#161B22',
                border: '1px solid #30363D',
                borderRadius: '12px',
                padding: '14px 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8B949E' }}>
                  Visualizações / Plays
                </span>
                <span style={{ fontSize: '16px' }}>👁️</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                <span>{temViews ? formatNumber(displayViews) : '—'}</span>
                {temViews && ultimasVariacoes !== null && (
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '700',
                    color: ultimasVariacoes.diffViews > 0 ? 'var(--color-cyan)' : ultimasVariacoes.diffViews < 0 ? '#FF007A' : '#8B949E'
                  }}>
                    ({ultimasVariacoes.diffViews > 0 ? `+${formatNumber(ultimasVariacoes.diffViews)}` : formatNumber(ultimasVariacoes.diffViews)})
                  </span>
                )}
              </div>
              {variacoes && variacoes.diffViews > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--color-cyan)', fontWeight: '600', marginTop: '4px' }}>
                  +{formatNumber(variacoes.diffViews)} novas views
                </div>
              )}
            </div>

            {/* Card Curva (% crescimento de views da última amostra em relação à penúltima) */}
            <div
              style={{
                background: '#161B22',
                border: '1px solid #30363D',
                borderRadius: '12px',
                padding: '14px 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8B949E' }}>
                  Curva
                </span>
                <TrendingUp size={16} style={{ color: 'var(--color-purple)' }} />
              </div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginTop: '6px' }}>
                {ultimasVariacoes?.pctCurvaViews !== null && ultimasVariacoes?.pctCurvaViews !== undefined
                  ? `${(ultimasVariacoes.pctCurvaViews > 0 ? '+' : '')}${ultimasVariacoes.pctCurvaViews.toFixed(4).replace('.', ',')}%`
                  : '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#8B949E', marginTop: '4px' }}>
                {ultimasVariacoes?.pctCurvaViews !== null && ultimasVariacoes?.pctCurvaViews !== undefined
                  ? 'Crescimento na última leitura'
                  : 'Aguardando próxima amostra'}
              </div>
            </div>

            {/* Card Taxa Engajamento */}
            <div
              style={{
                background: '#161B22',
                border: '1px solid #30363D',
                borderRadius: '12px',
                padding: '14px 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8B949E' }}>
                  Taxa Engajamento
                </span>
                <Activity size={16} style={{ color: 'var(--color-cyan)' }} />
              </div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginTop: '6px' }}>
                {temViews && post?.taxa_engajamento != null
                  ? `${Number(post.taxa_engajamento).toFixed(2)}%`
                  : '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#8B949E', marginTop: '4px' }}>
                {temViews ? 'Interações sobre views' : 'Sem base de views'}
              </div>
            </div>
          </div>

          {/* Se houver imagem ou legenda, mostra banner compacto com preview */}
          {((post?.thumbnail_url || post?.media_url) || post?.legenda) && (
            <div
              style={{
                background: 'rgba(22, 27, 34, 0.6)',
                border: '1px solid #21262D',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                gap: '16px',
                alignItems: 'flex-start'
              }}
            >
              {(post?.thumbnail_url || post?.media_url) && (
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '1px solid #30363D',
                    backgroundColor: '#090A0F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <img
                    src={post.thumbnail_url || post.media_url}
                    alt="Preview da Mídia"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      // Se a URL for um vídeo/inválida, esconde a imagem e mostra ícone
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = `<span style="font-size:24px;opacity:0.4">${
                          post?.formato === 'Reels' ? '🎬' : post?.formato === 'Carrossel' ? '🖼️' : '📷'
                        }</span>`;
                      }
                    }}
                  />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8B949E', display: 'block', marginBottom: '4px' }}>
                  Legenda da Publicação
                </span>
                <p
                  style={{
                    fontSize: '13px',
                    color: '#C9D1D9',
                    lineHeight: '1.45',
                    margin: 0,
                    maxHeight: '75px',
                    overflowY: 'auto'
                  }}
                >
                  {post?.legenda || <span style={{ color: '#6E7681', fontStyle: 'italic' }}>Sem texto de legenda</span>}
                </p>
              </div>
            </div>
          )}

          {/* Gráfico de Evolução Temporal */}
          <div
            style={{
              background: '#161B22',
              border: '1px solid #21262D',
              borderRadius: '14px',
              padding: '18px 20px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '16px'
              }}
            >
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={16} style={{ color: 'var(--color-cyan)' }} />
                  Curva de Evolução da Publicação
                </h3>
                <span style={{ fontSize: '12px', color: '#8B949E', marginTop: '2px', display: 'block' }}>
                  {snapshots.length > 1
                    ? `${snapshots.length} coletas registradas ao longo do tempo`
                    : 'Acompanhamento inicial da publicação'}
                </span>
              </div>

              {/* Filtros de Métricas */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => setMetricFoco('todas')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: metricFoco === 'todas' ? 'var(--color-purple)' : '#0D1117',
                    border: '1px solid #30363D',
                    color: metricFoco === 'todas' ? 'white' : '#8B949E'
                  }}
                >
                  Todas
                </button>
                <button
                  onClick={() => setMetricFoco('likes')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: metricFoco === 'likes' ? 'rgba(255, 0, 122, 0.2)' : '#0D1117',
                    border: `1px solid ${metricFoco === 'likes' ? '#FF007A' : '#30363D'}`,
                    color: metricFoco === 'likes' ? '#FF007A' : '#8B949E'
                  }}
                >
                  ❤️ Curtidas
                </button>
                <button
                  onClick={() => setMetricFoco('views')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: metricFoco === 'views' ? 'rgba(0, 240, 255, 0.2)' : '#0D1117',
                    border: `1px solid ${metricFoco === 'views' ? '#00F0FF' : '#30363D'}`,
                    color: metricFoco === 'views' ? '#00F0FF' : '#8B949E'
                  }}
                >
                  👁️ Views
                </button>
                <button
                  onClick={() => setMetricFoco('comentarios')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: metricFoco === 'comentarios' ? 'rgba(0, 255, 200, 0.2)' : '#0D1117',
                    border: `1px solid ${metricFoco === 'comentarios' ? '#00FFC8' : '#30363D'}`,
                    color: metricFoco === 'comentarios' ? '#00FFC8' : '#8B949E'
                  }}
                >
                  💬 Comentários
                </button>
              </div>
            </div>

            {/* Container do Gráfico */}
            <div style={{ width: '100%', height: '280px' }}>
              {loading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                  Carregando histórico do post...
                </div>
              ) : chartData.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                  Nenhum dado temporal encontrado para este post.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF007A" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#FF007A" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#00F0FF" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorComentarios" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00FFC8" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#00FFC8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
                    <XAxis
                      dataKey="dataHora"
                      stroke="#484F58"
                      tick={{ fill: '#8B949E', fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#484F58"
                      tick={{ fill: '#8B949E', fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v) => formatNumber(v)}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const dataPoint = payload[0]?.payload;
                        const timeStr = dataPoint?.timestamp ? formatDateTimeFull(dataPoint.timestamp) : label;

                        // Se for ponto zero (início)
                        if (dataPoint?.isZero) {
                          return (
                            <div style={{
                              backgroundColor: '#0D1117',
                              border: '1px solid #30363D',
                              borderRadius: '10px',
                              padding: '10px 14px',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                              fontSize: '12px',
                              color: 'white'
                            }}>
                              <div style={{ fontWeight: '700', marginBottom: 4 }}>
                                {timeStr} — Publicação
                              </div>
                              <div style={{ color: '#8B949E', fontSize: '11px' }}>
                                Ponto de partida (0 interações)
                              </div>
                            </div>
                          );
                        }

                        const diffComentarios = dataPoint?.diffComentarios;
                        const diffLikes = dataPoint?.diffLikes;
                        const diffViews = dataPoint?.diffViews;
                        const pctCurvaViews = dataPoint?.pctCurvaViews;
                        const expectedVal = dataPoint?.expectedViews ?? dataPoint?.expectedLikes ?? dataPoint?.expectedComentarios;

                        const formatDelta = (val: number | null | undefined, plusColor = '#00FFC8') => {
                          if (val === null || val === undefined) return null;
                          const sign = val > 0 ? '+' : '';
                          const color = val > 0 ? plusColor : val < 0 ? '#FF007A' : '#8B949E';
                          return (
                            <span style={{ color, fontWeight: '700', marginLeft: '6px' }}>
                              ({sign}{formatNumber(val)})
                            </span>
                          );
                        };

                        return (
                          <div style={{
                            backgroundColor: '#0D1117',
                            border: '1px solid #30363D',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                            fontSize: '12px',
                            minWidth: '220px',
                            color: 'white',
                            lineHeight: '1.6'
                          }}>
                            <div style={{ fontWeight: '800', marginBottom: '8px', color: 'white', borderBottom: '1px solid #21262D', paddingBottom: '6px' }}>
                              {timeStr}
                            </div>

                            {expectedVal !== undefined && expectedVal !== null && (
                              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', marginBottom: '4px' }}>
                                – – Esperado (média histórica) : <strong style={{ color: 'white' }}>{formatNumber(expectedVal)}</strong>
                              </div>
                            )}

                            {(metricFoco === 'todas' || metricFoco === 'comentarios') && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ color: '#00FFC8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  💬 Comentários :
                                </span>
                                <div>
                                  <strong style={{ color: 'white' }}>{formatNumber(dataPoint?.comentarios ?? 0)}</strong>
                                  {formatDelta(diffComentarios, '#00FFC8')}
                                </div>
                              </div>
                            )}

                            {(metricFoco === 'todas' || metricFoco === 'likes') && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ color: '#FF007A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  ❤️ Curtidas :
                                </span>
                                <div>
                                  <strong style={{ color: 'white' }}>{formatNumber(dataPoint?.likes ?? 0)}</strong>
                                  {formatDelta(diffLikes, '#FF007A')}
                                </div>
                              </div>
                            )}

                            {(metricFoco === 'todas' || metricFoco === 'views') && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ color: '#00F0FF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  👁️ Views :
                                </span>
                                <div>
                                  <strong style={{ color: 'white' }}>{formatNumber(dataPoint?.views ?? 0)}</strong>
                                  {formatDelta(diffViews, '#00F0FF')}
                                </div>
                              </div>
                            )}

                            {/* Informação Dinâmica de Curva (% de views em relação à amostra anterior) */}
                            {pctCurvaViews !== null && pctCurvaViews !== undefined && (
                              <div style={{
                                marginTop: '8px',
                                paddingTop: '6px',
                                borderTop: '1px dashed #21262D',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '11px'
                              }}>
                                <span style={{ color: '#C084FC', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  📈 Curva :
                                </span>
                                <span style={{
                                  fontWeight: '800',
                                  fontFamily: 'monospace',
                                  color: pctCurvaViews > 0 ? '#39FF14' : pctCurvaViews < 0 ? '#FF007A' : '#8B949E'
                                }}>
                                  {pctCurvaViews > 0 ? '+' : ''}{pctCurvaViews.toFixed(4).replace('.', ',')}%
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(val) => (
                        <span style={{
                          color: val === 'Esperado' ? 'rgba(255,255,255,0.65)' : '#C9D1D9',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {val === 'likes' ? '❤️ Curtidas'
                            : val === 'views' ? '👁️ Views'
                            : val === 'comentarios' ? '💬 Comentários'
                            : val === 'Esperado' ? '– – Esperado'
                            : val}
                        </span>
                      )}
                    />

                    {(metricFoco === 'todas' || metricFoco === 'views') && (
                      <Area
                        type="monotone"
                        dataKey="views"
                        name="views"
                        stroke="#00F0FF"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorViews)"
                      />
                    )}

                    {(metricFoco === 'todas' || metricFoco === 'likes') && (
                      <Area
                        type="monotone"
                        dataKey="likes"
                        name="likes"
                        stroke="#FF007A"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorLikes)"
                      />
                    )}

                    {(metricFoco === 'todas' || metricFoco === 'comentarios') && (
                      <Area
                        type="monotone"
                        dataKey="comentarios"
                        name="comentarios"
                        stroke="#00FFC8"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorComentarios)"
                      />
                    )}

                    {/* Linha tracejada branca: comportamento esperado baseado no histórico da conta */}
                    {benchmark.length >= 2 && (
                      <Line
                        key={`expected-${metricFoco}`}
                        type="monotone"
                        dataKey={
                          metricFoco === 'likes' ? 'expectedLikes'
                          : metricFoco === 'comentarios' ? 'expectedComentarios'
                          : 'expectedViews'
                        }
                        name="Esperado"
                        stroke="rgba(255,255,255,0.65)"
                        strokeWidth={1.5}
                        strokeDasharray="6 4"
                        dot={false}
                        connectNulls
                        legendType="plainline"
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {snapshots.length <= 1 && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid #30363D',
                  fontSize: '11px',
                  color: '#8B949E',
                  textAlign: 'center'
                }}
              >
                ℹ️ Esta publicação ainda possui 1 único registro coletado. À medida que as coletas do SocialTracker rodarem, a curva de evolução acumulará novos pontos no gráfico.
              </div>
            )}

            {/* Nota sobre o benchmark */}
            {benchmark.length >= 2 && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  color: '#8B949E',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', letterSpacing: '2px', flexShrink: 0 }}>– – –</span>
                <span>
                  Linha esperada calculada a partir de{' '}
                  <strong style={{ color: '#C9D1D9' }}>{benchmarkSampleSize}</strong>{' '}
                  {post?.formato === 'Reels' ? 'Reels' : post?.formato === 'Carrossel' ? 'Carrosséis' : 'Imagens'} anteriores de{' '}
                  <strong style={{ color: 'var(--color-cyan)' }}>@{post?.username}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '14px 24px',
            borderTop: '1px solid #21262D',
            background: '#161B22'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              backgroundColor: '#30363D',
              border: 'none',
              color: 'white',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
