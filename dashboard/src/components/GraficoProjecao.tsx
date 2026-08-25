'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  Brush
} from 'recharts';
import {
  TrendingUp, RefreshCw, Percent, Hash, Award, CheckCircle2, AlertTriangle,
  BarChart3, Search, Filter, Eye, EyeOff, ZoomIn, RotateCcw, SlidersHorizontal, Check
} from 'lucide-react';

interface Profile {
  username: string;
  meu_perfil?: number;
  tipo_trafego?: string;
  status?: string;
  is_morreu?: boolean;
}

interface PerfilItem {
  username: string;
  meu_perfil: number;
  status?: string;
  is_morreu?: boolean;
  max_dia?: number;
}

interface GraficoProjecaoProps {
  meusPerfis: Profile[];
  todosPerfis?: Profile[];
}

const PALETA_CORES_MEUS_PERFIS = [
  '#FF007A', '#39FF14', '#FFD700', '#FF4500', '#A855F7',
  '#00FFC8', '#EC4899', '#F59E0B', '#3B82F6', '#14B8A6'
];

export default function GraficoProjecao({ meusPerfis, todosPerfis = [] }: GraficoProjecaoProps) {
  const [tipoTrafego, setTipoTrafego] = useState<'GERAL' | 'ORGANICO' | 'ADS' | 'NA'>('GERAL');
  const [modoMedida, setModoMedida] = useState<'GANHO_ABSOLUTO' | 'TOTAL_ABSOLUTO' | 'PERCENTUAL'>('GANHO_ABSOLUTO');
  const [selectedUsername, setSelectedUsername] = useState<string>('TODOS');
  const [data, setData] = useState<any[]>([]);
  const [meusPerfisRetornados, setMeusPerfisRetornados] = useState<string[]>([]);
  const [listaTodosPerfis, setListaTodosPerfis] = useState<PerfilItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Visibilidade das Linhas (Perfis e Benchmark)
  const [perfisOcultos, setPerfisOcultos] = useState<string[]>([]);
  const [ocultarFaixaBenchmark, setOcultarFaixaBenchmark] = useState<boolean>(false);
  const [ocultarMedianaBenchmark, setOcultarMedianaBenchmark] = useState<boolean>(false);

  // Estados de Zoom / Recorte Temporal
  const [zoomIndices, setZoomIndices] = useState<{ start: number; end: number } | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
  const [isSelectingZoom, setIsSelectingZoom] = useState<boolean>(false);
  const [showBrush, setShowBrush] = useState<boolean>(false);

  // Dados fatiados pelo Zoom atual (para o gráfico e o eixo Y auto-escalarem dinamicamente)
  const visibleData = useMemo(() => {
    if (!data || data.length === 0) return [];
    if (!zoomIndices) return data;
    const start = Math.max(0, Math.min(zoomIndices.start, data.length - 1));
    const end = Math.max(0, Math.min(zoomIndices.end, data.length - 1));
    const minI = Math.min(start, end);
    const maxI = Math.max(start, end);
    return data.slice(minI, maxI + 1);
  }, [data, zoomIndices]);

  // Ações de Zoom
  const aplicarZoomDias = (maxDias: number | 'TODOS') => {
    if (maxDias === 'TODOS') {
      setZoomIndices(null);
      return;
    }
    if (!data || data.length === 0) return;
    const endIdx = data.findIndex(d => d.dia_num > maxDias);
    if (endIdx === -1) {
      setZoomIndices(null);
    } else {
      setZoomIndices({ start: 0, end: Math.max(1, endIdx - 1) });
    }
  };

  const resetarZoom = () => {
    setZoomIndices(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setIsSelectingZoom(false);
  };

  // Ações de Visibilidade
  const togglePerfilVisibilidade = (uname: string) => {
    setPerfisOcultos(prev =>
      prev.includes(uname) ? prev.filter(u => u !== uname) : [...prev, uname]
    );
  };

  const isolarPerfil = (uname: string) => {
    const outros = meusPerfisRetornados.filter(u => u !== uname);
    const todosOutrosOcultos = outros.every(u => perfisOcultos.includes(u));
    if (todosOutrosOcultos && !perfisOcultos.includes(uname)) {
      setPerfisOcultos([]);
    } else {
      setPerfisOcultos(outros);
    }
  };

  const mostrarTodosPerfis = () => {
    setPerfisOcultos([]);
    setOcultarFaixaBenchmark(false);
    setOcultarMedianaBenchmark(false);
  };

  const ocultarTodosPerfis = () => {
    setPerfisOcultos([...meusPerfisRetornados]);
  };

  const perfisParaDropdown = (todosPerfis && todosPerfis.length > 0 ? todosPerfis : meusPerfis)
    .slice()
    .sort((a, b) => (b.meu_perfil || 0) - (a.meu_perfil || 0) || a.username.localeCompare(b.username));

  const meusPerfisUsernames = meusPerfis.map(p => p.username).join(',');

  const fetchProjecaoData = async () => {
    setLoading(true);
    setError(null);
    try {
      const usernameParam = selectedUsername === 'TODOS' ? '' : selectedUsername;
      const url = `/api/projecao?tipo_trafego=${tipoTrafego}&username=${encodeURIComponent(usernameParam)}&meus_perfis=${encodeURIComponent(meusPerfisUsernames)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const formatted = json.data.map((item: any) => ({
          ...item,
          faixa_expectativa: [item.p25_min, item.p75_max],
          total_faixa_expectativa: [item.total_p25_min, item.total_p75_max],
          pct_faixa_expectativa: [item.pct_p25_min, item.pct_p75_max]
        }));
        setData(formatted);
        setMeusPerfisRetornados(json.meus_perfis || []);
        if (json.todos_perfis) {
          setListaTodosPerfis(json.todos_perfis);
        }
      } else {
        setError(json.error || 'Falha ao carregar projeção');
      }
    } catch (e: any) {
      setError(e.message || 'Erro na requisição');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjecaoData();
  }, [tipoTrafego, selectedUsername, meusPerfisUsernames]);

  const formatValue = (num: number | null | undefined, modo: 'GANHO_ABSOLUTO' | 'TOTAL_ABSOLUTO' | 'PERCENTUAL') => {
    if (num === null || num === undefined) return '-';
    if (modo === 'PERCENTUAL') {
      if (num === 0) return '0.0%';
      const sign = num > 0 ? '+' : '';
      return `${sign}${num.toFixed(1)}%`;
    }
    if (modo === 'GANHO_ABSOLUTO') {
      if (num === 0) return '0 seg.';
      const sign = num > 0 ? '+' : '';
      return `${sign}${num.toLocaleString('pt-BR')} seg.`;
    }
    return `${num.toLocaleString('pt-BR')} seg.`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;

    const detalhesMeusPerfis = d.meus_perfis_detalhes || {};

    let titleBenchmark = '📊 Ganho Absoluto Esperado (Benchmark):';
    let p50Val = d.p50_mediana;
    let p25Val = d.p25_min;
    let p75Val = d.p75_max;

    if (modoMedida === 'TOTAL_ABSOLUTO') {
      titleBenchmark = '🔢 Total Acumulado Esperado (Benchmark):';
      p50Val = d.total_p50_mediana;
      p25Val = d.total_p25_min;
      p75Val = d.total_p75_max;
    } else if (modoMedida === 'PERCENTUAL') {
      titleBenchmark = '📈 Crescimento Percentual Esperado (Benchmark):';
      p50Val = d.pct_p50_mediana;
      p25Val = d.pct_p25_min;
      p75Val = d.pct_p75_max;
    }

    return (
      <div style={{
        backgroundColor: '#161B22',
        border: '1px solid #30363D',
        borderRadius: '12px',
        padding: '14px 18px',
        color: 'white',
        boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
        fontSize: '13px',
        minWidth: '290px',
        maxWidth: '380px'
      }}>
        <div style={{ fontWeight: 800, color: '#00F0FF', marginBottom: 10, fontSize: 14, borderBottom: '1px solid #30363D', paddingBottom: 6 }}>
          🗓️ {d.dia_relativo} (a partir da 1ª postagem)
        </div>

        {/* Expectativa do Mercado (Benchmark) */}
        {(!ocultarFaixaBenchmark || !ocultarMedianaBenchmark) && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#8B949E', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
              {titleBenchmark}
            </div>
            {!ocultarMedianaBenchmark && (
              <div style={{ marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#00F0FF', fontWeight: 600 }}>P50 Mediana Esperada:</span>
                <span style={{ fontWeight: 800, color: '#00F0FF' }}>
                  {formatValue(p50Val, modoMedida)}
                </span>
              </div>
            )}
            {!ocultarFaixaBenchmark && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#7100E2', fontWeight: 600 }}>Faixa [P25 Conservador, P75 Otimista]:</span>
                <span style={{ fontWeight: 700, color: '#B0B0C0' }}>
                  [{formatValue(p25Val, modoMedida)}, {formatValue(p75Val, modoMedida)}]
                </span>
              </div>
            )}
          </div>
        )}

        {/* Performance dos Perfis Exibidos */}
        {Object.keys(detalhesMeusPerfis).length > 0 && (
          <div style={{ borderTop: '1px solid #30363D', paddingTop: 8, marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#FF007A', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
              ⭐ Perfis em Destaque ({
                modoMedida === 'TOTAL_ABSOLUTO' ? 'Total Acumulado Real' :
                modoMedida === 'PERCENTUAL' ? 'Crescimento % Real' : 'Ganho Absoluto Real'
              }):
            </div>
            {meusPerfisRetornados
              .filter(uname => (selectedUsername === 'TODOS' || selectedUsername === uname) && !perfisOcultos.includes(uname))
              .map((uname, idx) => {
                const info = detalhesMeusPerfis[uname];
                if (!info) return null;
                const cor = PALETA_CORES_MEUS_PERFIS[idx % PALETA_CORES_MEUS_PERFIS.length];
                const val = modoMedida === 'TOTAL_ABSOLUTO' ? info.total : (modoMedida === 'PERCENTUAL' ? info.pct_ganho : info.ganho);
                return (
                  <div key={uname} style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: cor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cor, display: 'inline-block' }} />
                      @{uname}:
                    </span>
                    <span style={{ fontWeight: 800, color: cor }}>
                      {formatValue(val, modoMedida)}
                      {modoMedida === 'TOTAL_ABSOLUTO' && info.base !== undefined && (
                        <span style={{ fontSize: 10, color: '#8B949E', marginLeft: 4, fontWeight: 500 }}>
                          (Base D0: {info.base.toLocaleString('pt-BR')})
                        </span>
                      )}
                      {info.imputado && (
                        <span style={{
                          fontSize: 9,
                          color: '#F59E0B',
                          background: 'rgba(245, 158, 11, 0.15)',
                          border: '1px solid #F59E0B',
                          borderRadius: 4,
                          padding: '1px 4px',
                          marginLeft: 5,
                          fontWeight: 600
                        }}>
                          Mantido
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        )}

        {d.amostra_count !== undefined && (
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #30363D', fontSize: 11, color: '#8B949E' }}>
            Base de cálculo: {d.amostra_count} conta(s) no dia (inclui todos os perfis)
            {d.amostra_insuficiente && (
              <span style={{ color: '#F59E0B', marginLeft: 4 }}>
                (Amostra &lt; 3 - Faixa Congelada)
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const isPctMode = modoMedida === 'PERCENTUAL';

  // Estados para a Contabilização dos Perfis nos Percentis (P25, P50, P75)
  const [marcoRelativo, setMarcoRelativo] = useState<number | 'ATUAL'>('ATUAL');
  const [tableSortField, setTableSortField] = useState<string>('desvio');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchTableQuery, setSearchTableQuery] = useState<string>('');

  // Cálculo memoizado da Contabilização e Enquadramento dos Perfis
  const contabilizacaoPerfis = React.useMemo(() => {
    if (!data || data.length === 0 || meusPerfisRetornados.length === 0) return [];

    const result: any[] = [];

    const perfisAnalisar = meusPerfisRetornados.filter(
      uname => selectedUsername === 'TODOS' || selectedUsername === uname
    );

    perfisAnalisar.forEach(uname => {
      let targetDayData: any = null;

      if (marcoRelativo === 'ATUAL') {
        // Busca o último dia real (não imputado) com coleta do perfil
        for (let i = data.length - 1; i >= 0; i--) {
          const item = data[i];
          const info = item.meus_perfis_detalhes?.[uname];
          if (info && !info.imputado) {
            targetDayData = item;
            break;
          }
        }
        if (!targetDayData) {
          for (let i = data.length - 1; i >= 0; i--) {
            const item = data[i];
            if (item.meus_perfis_detalhes?.[uname]) {
              targetDayData = item;
              break;
            }
          }
        }
      } else {
        // Marco fixo (ex: Dia 7, 14, 30, 60, 90)
        targetDayData = data.find(item => item.dia_num === marcoRelativo);
      }

      if (!targetDayData) return;

      const details = targetDayData.meus_perfis_detalhes?.[uname];
      if (!details) return;

      let realVal = details.ganho;
      let p25Val = targetDayData.p25_min;
      let p50Val = targetDayData.p50_mediana;
      let p75Val = targetDayData.p75_max;

      if (modoMedida === 'TOTAL_ABSOLUTO') {
        realVal = details.total;
        p25Val = targetDayData.total_p25_min;
        p50Val = targetDayData.total_p50_mediana;
        p75Val = targetDayData.total_p75_max;
      } else if (modoMedida === 'PERCENTUAL') {
        realVal = details.pct_ganho;
        p25Val = targetDayData.pct_p25_min;
        p50Val = targetDayData.pct_p50_mediana;
        p75Val = targetDayData.pct_p75_max;
      }

      const desvioP50 = realVal - p50Val;
      const pctDesvioP50 = p50Val !== 0 ? ((realVal - p50Val) / Math.abs(p50Val)) * 100 : 0;

      let categoryKey = 'BELOW_P25';
      let categoryLabel = '⚠️ Abaixo de P25 (Abaixo do Esperado)';
      let categoryShort = '< P25';
      let color = '#FF007A';
      let bg = 'rgba(255, 0, 122, 0.12)';
      let border = '#FF007A';

      if (realVal >= p75Val) {
        categoryKey = 'ABOVE_P75';
        categoryLabel = '🚀 Acima de P75 (Otimista / Excepcional)';
        categoryShort = '> P75';
        color = '#39FF14';
        bg = 'rgba(57, 255, 20, 0.12)';
        border = '#39FF14';
      } else if (realVal >= p50Val) {
        categoryKey = 'BETWEEN_P50_P75';
        categoryLabel = '📈 Entre P50 e P75 (Acima da Mediana)';
        categoryShort = 'P50 – P75';
        color = '#00F0FF';
        bg = 'rgba(0, 240, 255, 0.12)';
        border = '#00F0FF';
      } else if (realVal >= p25Val) {
        categoryKey = 'BETWEEN_P25_P50';
        categoryLabel = '📊 Entre P25 e P50 (Dentro da Faixa Conservadora)';
        categoryShort = 'P25 – P50';
        color = '#F59E0B';
        bg = 'rgba(245, 158, 11, 0.12)';
        border = '#F59E0B';
      }

      const perfilInfo = listaTodosPerfis.find(item => item.username === uname);
      const isMorreu = Boolean(perfilInfo?.is_morreu || (perfilInfo?.status || '').toUpperCase().includes('MORREU'));

      result.push({
        username: uname,
        diaNum: targetDayData.dia_num,
        diaRelativo: targetDayData.dia_relativo,
        realVal,
        p25Val,
        p50Val,
        p75Val,
        desvioP50,
        pctDesvioP50,
        categoryKey,
        categoryLabel,
        categoryShort,
        color,
        bg,
        border,
        imputado: details.imputado,
        isMorreu
      });
    });

    return result;
  }, [data, meusPerfisRetornados, selectedUsername, marcoRelativo, modoMedida, listaTodosPerfis]);

  // Contadores agregados para os 4 Cards
  const resumoContabilizacao = React.useMemo(() => {
    const total = contabilizacaoPerfis.length;
    if (total === 0) {
      return {
        total: 0,
        aboveP75: { count: 0, pct: 0 },
        betweenP50P75: { count: 0, pct: 0 },
        betweenP25P50: { count: 0, pct: 0 },
        belowP25: { count: 0, pct: 0 }
      };
    }

    const aboveP75 = contabilizacaoPerfis.filter(p => p.categoryKey === 'ABOVE_P75').length;
    const betweenP50P75 = contabilizacaoPerfis.filter(p => p.categoryKey === 'BETWEEN_P50_P75').length;
    const betweenP25P50 = contabilizacaoPerfis.filter(p => p.categoryKey === 'BETWEEN_P25_P50').length;
    const belowP25 = contabilizacaoPerfis.filter(p => p.categoryKey === 'BELOW_P25').length;

    return {
      total,
      aboveP75: { count: aboveP75, pct: Math.round((aboveP75 / total) * 100) },
      betweenP50P75: { count: betweenP50P75, pct: Math.round((betweenP50P75 / total) * 100) },
      betweenP25P50: { count: betweenP25P50, pct: Math.round((betweenP25P50 / total) * 100) },
      belowP25: { count: belowP25, pct: Math.round((belowP25 / total) * 100) }
    };
  }, [contabilizacaoPerfis]);

  // Lista filtrada e ordenada para a Tabela de Enquadramento
  const tabelaContabilizacaoFiltrada = React.useMemo(() => {
    let list = [...contabilizacaoPerfis];
    if (searchTableQuery.trim()) {
      const q = searchTableQuery.toLowerCase();
      list = list.filter(item => item.username.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      let valA: any = a[tableSortField];
      let valB: any = b[tableSortField];

      if (tableSortField === 'desvio') {
        valA = a.desvioP50;
        valB = b.desvioP50;
      } else if (tableSortField === 'enquadramento') {
        const orderMap: any = { ABOVE_P75: 4, BETWEEN_P50_P75: 3, BETWEEN_P25_P50: 2, BELOW_P25: 1 };
        valA = orderMap[a.categoryKey] || 0;
        valB = orderMap[b.categoryKey] || 0;
      }

      if (valA < valB) return tableSortDir === 'asc' ? -1 : 1;
      if (valA > valB) return tableSortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [contabilizacaoPerfis, searchTableQuery, tableSortField, tableSortDir]);

  const handleTableSort = (field: string) => {
    if (tableSortField === field) {
      setTableSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setTableSortField(field);
      setTableSortDir('desc');
    }
  };

  return (
    <div style={{
      background: 'rgba(22, 27, 34, 0.7)',
      border: '1px solid var(--border-color)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '24px',
      backdropFilter: 'blur(10px)'
    }}>
      {/* Cabeçalho do Card de Projeção */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '1px solid rgba(240, 246, 252, 0.08)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={22} color="#00F0FF" />
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>
              Projeção de Crescimento Pós-Postagem ({
                modoMedida === 'TOTAL_ABSOLUTO' ? 'Total Acumulado S0 + ΔS' :
                modoMedida === 'PERCENTUAL' ? 'Taxa de Crescimento %' : 'Ganho Líquido Acumulado ΔS'
              })
            </h3>
          </div>
          <p style={{ color: '#8B949E', fontSize: 13, marginTop: 4, margin: 0 }}>
            Evolução {
              modoMedida === 'TOTAL_ABSOLUTO' ? 'de seguidores totais acumulados a partir do patamar inicial de cada perfil ($S_0$)' :
              modoMedida === 'PERCENTUAL' ? 'percentual (% em relação ao $S_0$ inicial)' : 'de seguidores absolutos (ganho líquido)'
            } por dia relativo a partir da 1ª postagem ($D_0$). Estatística inclui todos os perfis da base.
          </p>
        </div>

        {/* Filtros e Controles */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Botão de Alternância: Ganho Líquido vs Total Acumulado vs Porcentagem */}
          <div style={{
            display: 'flex',
            background: '#0D1117',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #7100E2',
            gap: 2
          }}>
            <button
              onClick={() => setModoMedida('GANHO_ABSOLUTO')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                background: modoMedida === 'GANHO_ABSOLUTO' ? '#7100E2' : 'transparent',
                color: modoMedida === 'GANHO_ABSOLUTO' ? 'white' : '#8B949E',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.2s ease'
              }}
            >
              <TrendingUp size={14} />
              <span>Ganho Líquido (ΔS)</span>
            </button>

            <button
              onClick={() => setModoMedida('TOTAL_ABSOLUTO')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                background: modoMedida === 'TOTAL_ABSOLUTO' ? '#7100E2' : 'transparent',
                color: modoMedida === 'TOTAL_ABSOLUTO' ? 'white' : '#8B949E',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.2s ease'
              }}
            >
              <Hash size={14} />
              <span>Total Acumulado (S₀+ΔS)</span>
            </button>

            <button
              onClick={() => setModoMedida('PERCENTUAL')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                background: modoMedida === 'PERCENTUAL' ? '#00F0FF' : 'transparent',
                color: modoMedida === 'PERCENTUAL' ? '#090A0F' : '#8B949E',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.2s ease'
              }}
            >
              <Percent size={14} />
              <span>Porcentagem (%)</span>
            </button>
          </div>

          {/* Seletor de Tipo de Tráfego */}
          <div style={{
            display: 'flex',
            background: '#0D1117',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #30363D',
            gap: 2
          }}>
            {[
              { id: 'GERAL', label: '🌐 Geral (Todos)' },
              { id: 'ORGANICO', label: '🌱 Orgânico' },
              { id: 'ADS', label: '🚀 ADS' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTipoTrafego(tab.id as any)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: tipoTrafego === tab.id ? '#7100E2' : 'transparent',
                  color: tipoTrafego === tab.id ? 'white' : '#8B949E',
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Seletor de Exibição */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#8B949E', fontWeight: 600 }}>Exibir:</span>
            <select
              value={selectedUsername}
              onChange={e => setSelectedUsername(e.target.value)}
              style={{
                background: '#0D1117',
                border: '1px solid #30363D',
                color: 'white',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="TODOS">⭐ Todos os Meus Perfis</option>
              {perfisParaDropdown.map(p => {
                const infoPerfil = listaTodosPerfis.find(item => item.username === p.username);
                const isMorreu = infoPerfil?.is_morreu || (infoPerfil?.status || '').toUpperCase().includes('MORREU');
                return (
                  <option key={p.username} value={p.username}>
                    @{p.username} {p.meu_perfil ? '⭐' : ''} {isMorreu ? '☠️ (Morreu)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <button
            onClick={fetchProjecaoData}
            title="Atualizar dados"
            style={{
              background: '#161B22',
              border: '1px solid #30363D',
              color: '#8B949E',
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Barra de Ferramentas de Zoom & Recorte Temporal */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 12,
        background: 'rgba(13, 17, 23, 0.85)',
        padding: '10px 14px',
        borderRadius: '10px',
        border: '1px solid rgba(48, 54, 61, 0.8)'
      }}>
        {/* Atalhos Rápidos de Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#00F0FF', fontSize: 12, fontWeight: 700, marginRight: 4 }}>
            <ZoomIn size={15} />
            <span>Recorte / Zoom:</span>
          </div>

          {[
            { id: 'TODOS', label: '🌐 Tudo' },
            { id: 7, label: 'D0–D7 (1ª Sem.)' },
            { id: 14, label: 'D0–D14 (2 Sem.)' },
            { id: 30, label: 'D0–D30 (1º Mês)' },
            { id: 60, label: 'D0–D60' },
            { id: 90, label: 'D0–D90' }
          ].map(opt => {
            const isSelected = opt.id === 'TODOS'
              ? zoomIndices === null
              : zoomIndices !== null &&
                visibleData.length > 0 &&
                visibleData[0]?.dia_num === 0 &&
                visibleData[visibleData.length - 1]?.dia_num <= (opt.id as number);

            return (
              <button
                key={opt.id}
                onClick={() => aplicarZoomDias(opt.id as any)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid #00F0FF' : '1px solid #30363D',
                  background: isSelected ? 'rgba(0, 240, 255, 0.15)' : '#161B22',
                  color: isSelected ? '#00F0FF' : '#8B949E',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {opt.label}
              </button>
            );
          })}

          {/* Botão para Ligar/Desligar Slider Brush */}
          <button
            onClick={() => setShowBrush(prev => !prev)}
            title="Exibir slider deslizante no rodapé do gráfico para ajuste fino milimétrico"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: showBrush ? '1px solid #7100E2' : '1px solid #30363D',
              background: showBrush ? 'rgba(113, 0, 226, 0.25)' : '#161B22',
              color: showBrush ? '#A855F7' : '#8B949E',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s ease'
            }}
          >
            <SlidersHorizontal size={12} />
            <span>Slider Fino</span>
          </button>
        </div>

        {/* Status do Zoom e Botão de Reset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {zoomIndices !== null && visibleData.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0, 240, 255, 0.08)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: 11,
              color: '#00F0FF',
              fontWeight: 600
            }}>
              <span>🔍 Janela: <strong>{visibleData[0]?.dia_relativo}</strong> até <strong>{visibleData[visibleData.length - 1]?.dia_relativo}</strong> ({visibleData.length} dias)</span>
              <button
                onClick={resetarZoom}
                title="Resetar Zoom para todos os dias"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FF007A',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0,
                  marginLeft: 4
                }}
              >
                <RotateCcw size={12} />
              </button>
            </div>
          )}

          <span style={{ fontSize: 11, color: '#586069' }}>
            💡 Dica: Arraste com o mouse no gráfico para dar zoom em qualquer área
          </span>
        </div>
      </div>

      {/* Legenda Informativa Interativa (Clique para Ocultar/Exibir Linhas) */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 16,
        fontSize: 12,
        flexWrap: 'wrap',
        background: 'rgba(13, 17, 23, 0.6)',
        padding: '10px 16px',
        borderRadius: '10px',
        border: '1px solid rgba(48, 54, 61, 0.6)',
        alignItems: 'center'
      }}>
        {/* Controle da Faixa do Benchmark */}
        <button
          onClick={() => setOcultarFaixaBenchmark(prev => !prev)}
          title="Clique para ocultar/exibir a faixa de expectativa do benchmark"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: ocultarFaixaBenchmark ? '#161B22' : 'rgba(113, 0, 226, 0.15)',
            border: ocultarFaixaBenchmark ? '1px solid #30363D' : '1px solid #7100E2',
            padding: '4px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            opacity: ocultarFaixaBenchmark ? 0.5 : 1,
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{
            width: 12,
            height: 12,
            background: ocultarFaixaBenchmark ? '#586069' : 'rgba(113, 0, 226, 0.4)',
            borderRadius: 2,
            border: `1px dashed ${ocultarFaixaBenchmark ? '#586069' : '#7100E2'}`
          }} />
          <span style={{
            color: ocultarFaixaBenchmark ? '#8B949E' : '#B0B0C0',
            fontWeight: 600,
            fontSize: 11,
            textDecoration: ocultarFaixaBenchmark ? 'line-through' : 'none'
          }}>
            Faixa Benchmark (P25–P75)
          </span>
          {ocultarFaixaBenchmark ? <EyeOff size={12} color="#8B949E" /> : <Eye size={12} color="#7100E2" />}
        </button>

        {/* Controle da Mediana do Benchmark */}
        <button
          onClick={() => setOcultarMedianaBenchmark(prev => !prev)}
          title="Clique para ocultar/exibir a linha de mediana P50 do benchmark"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: ocultarMedianaBenchmark ? '#161B22' : 'rgba(0, 240, 255, 0.1)',
            border: ocultarMedianaBenchmark ? '1px solid #30363D' : '1px solid #00F0FF',
            padding: '4px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            opacity: ocultarMedianaBenchmark ? 0.5 : 1,
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{
            width: 14,
            height: 2,
            borderTop: `2px dashed ${ocultarMedianaBenchmark ? '#586069' : '#00F0FF'}`
          }} />
          <span style={{
            color: ocultarMedianaBenchmark ? '#8B949E' : '#00F0FF',
            fontWeight: 600,
            fontSize: 11,
            textDecoration: ocultarMedianaBenchmark ? 'line-through' : 'none'
          }}>
            Mediana P50
          </span>
          {ocultarMedianaBenchmark ? <EyeOff size={12} color="#8B949E" /> : <Eye size={12} color="#00F0FF" />}
        </button>

        <div style={{ borderLeft: '1px solid #30363D', height: 16, margin: '0 4px' }} />

        {/* Perfis em Destaque Clicáveis */}
        <span style={{ color: '#8B949E', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
          Perfis:
        </span>

        {meusPerfisRetornados
          .filter(uname => selectedUsername === 'TODOS' || selectedUsername === uname)
          .map((uname, idx) => {
            const cor = PALETA_CORES_MEUS_PERFIS[idx % PALETA_CORES_MEUS_PERFIS.length];
            const isOculto = perfisOcultos.includes(uname);

            return (
              <button
                key={uname}
                onClick={() => togglePerfilVisibilidade(uname)}
                onDoubleClick={() => isolarPerfil(uname)}
                title={`Clique para ${isOculto ? 'exibir' : 'ocultar'} a linha de @${uname} no gráfico (Duplo clique para isolar)`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: isOculto ? '#161B22' : `${cor}18`,
                  border: isOculto ? '1px solid #30363D' : `1px solid ${cor}`,
                  padding: '4px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  opacity: isOculto ? 0.45 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: 10,
                  height: 3,
                  background: isOculto ? '#586069' : cor,
                  borderRadius: 2
                }} />
                <span style={{
                  color: isOculto ? '#8B949E' : cor,
                  fontWeight: 700,
                  fontSize: 12,
                  textDecoration: isOculto ? 'line-through' : 'none'
                }}>
                  @{uname}
                </span>
                {isOculto ? <EyeOff size={12} color="#8B949E" /> : <Eye size={12} color={cor} />}
              </button>
            );
          })}

        {/* Botões Rápidos de Mostrar/Ocultar Todos os Perfis */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button
            onClick={mostrarTodosPerfis}
            title="Exibir todas as linhas"
            style={{
              background: '#161B22',
              border: '1px solid #30363D',
              color: '#8B949E',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            👁️ Mostrar Todos
          </button>
          <button
            onClick={ocultarTodosPerfis}
            title="Ocultar todas as linhas de perfis"
            style={{
              background: '#161B22',
              border: '1px solid #30363D',
              color: '#8B949E',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            🚫 Ocultar Todos
          </button>
        </div>
      </div>

      {/* Gráfico Recharts com Suporte a Drag-to-Zoom e Auto-Escala */}
      <div style={{ width: '100%', height: showBrush ? 450 : 400, userSelect: 'none' }}>
        {loading ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
            Carregando curva de projeção...
          </div>
        ) : error ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#FF007A' }}>
            ⚠️ {error}
          </div>
        ) : data.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
            Nenhum dado encontrado para a projeção.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={visibleData}
              margin={{ top: 10, right: 30, left: 20, bottom: showBrush ? 10 : 10 }}
              onMouseDown={(e: any) => {
                if (e && e.activeLabel) {
                  setRefAreaLeft(e.activeLabel);
                  setIsSelectingZoom(true);
                }
              }}
              onMouseMove={(e: any) => {
                if (isSelectingZoom && e && e.activeLabel) {
                  setRefAreaRight(e.activeLabel);
                }
              }}
              onMouseUp={() => {
                if (refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight) {
                  const idxLeft = data.findIndex(d => d.dia_relativo === refAreaLeft);
                  const idxRight = data.findIndex(d => d.dia_relativo === refAreaRight);
                  if (idxLeft !== -1 && idxRight !== -1) {
                    const start = Math.min(idxLeft, idxRight);
                    const end = Math.max(idxLeft, idxRight);
                    setZoomIndices({ start, end });
                  }
                }
                setRefAreaLeft(null);
                setRefAreaRight(null);
                setIsSelectingZoom(false);
              }}
            >
              <defs>
                <linearGradient id="colorFaixa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7100E2" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#7100E2" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(240, 246, 252, 0.05)" />
              <XAxis
                dataKey="dia_relativo"
                stroke="#586069"
                tickLine={false}
                style={{ fontSize: '11px' }}
              />
              <YAxis
                stroke="#586069"
                tickLine={false}
                style={{ fontSize: '11px' }}
                domain={['auto', 'auto']}
                tickFormatter={v => {
                  if (modoMedida === 'PERCENTUAL') return `${v > 0 ? '+' : ''}${v}%`;
                  if (modoMedida === 'GANHO_ABSOLUTO') return v > 0 ? `+${v.toLocaleString('pt-BR')}` : `${v}`;
                  return v.toLocaleString('pt-BR');
                }}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Banda Sombreada entre P25 e P75 do Benchmark */}
              {!ocultarFaixaBenchmark && (
                <Area
                  type="monotone"
                  dataKey={
                    modoMedida === 'PERCENTUAL' ? 'pct_faixa_expectativa' :
                    modoMedida === 'TOTAL_ABSOLUTO' ? 'total_faixa_expectativa' : 'faixa_expectativa'
                  }
                  stroke="none"
                  fill="url(#colorFaixa)"
                  name="Faixa P25-P75 Benchmark"
                />
              )}

              {/* Linha Tracejada Neutra: Mediana P50 do Benchmark */}
              {!ocultarMedianaBenchmark && (
                <Line
                  type="monotone"
                  dataKey={
                    modoMedida === 'PERCENTUAL' ? 'pct_p50_mediana' :
                    modoMedida === 'TOTAL_ABSOLUTO' ? 'total_p50_mediana' : 'p50_mediana'
                  }
                  stroke="#00F0FF"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Mediana P50 Benchmark"
                />
              )}

              {/* Linhas Sólidas para Perfis em Destaque */}
              {meusPerfisRetornados
                .filter(uname => (selectedUsername === 'TODOS' || selectedUsername === uname) && !perfisOcultos.includes(uname))
                .map((uname, idx) => {
                  const cor = PALETA_CORES_MEUS_PERFIS[idx % PALETA_CORES_MEUS_PERFIS.length];
                  return (
                    <Line
                      key={uname}
                      type="monotone"
                      dataKey={
                        modoMedida === 'PERCENTUAL' ? `pct_real_${uname}` :
                        modoMedida === 'TOTAL_ABSOLUTO' ? `total_real_${uname}` : `real_${uname}`
                      }
                      stroke={cor}
                      strokeWidth={3}
                      dot={{ r: 4, fill: cor, stroke: '#ffffff', strokeWidth: 1.5 }}
                      activeDot={{ r: 7, fill: cor }}
                      connectNulls
                      name={`@${uname}`}
                    />
                  );
                })}

              {/* Retângulo de Seleção Visual de Zoom por Arrasto */}
              {refAreaLeft && refAreaRight && (
                <ReferenceArea
                  x1={refAreaLeft}
                  x2={refAreaRight}
                  stroke="#00F0FF"
                  strokeOpacity={0.8}
                  fill="#00F0FF"
                  fillOpacity={0.18}
                />
              )}

              {/* Navegador Deslizante Brush (Opcional quando Slider Fino ativado) */}
              {showBrush && (
                <Brush
                  dataKey="dia_relativo"
                  height={32}
                  stroke="#7100E2"
                  fill="#0D1117"
                  travellerWidth={12}
                  tickFormatter={(v) => v}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ====================================================
          📊 SEÇÃO DE CONTABILIZAÇÃO DOS PERFIS NOS PERCENTIS (P25, P50, P75)
          ==================================================== */}
      {data.length > 0 && meusPerfisRetornados.length > 0 && (
        <div style={{
          marginTop: 32,
          paddingTop: 24,
          borderTop: '1px solid rgba(240, 246, 252, 0.1)'
        }}>
          {/* Cabeçalho da Contabilização + Seleção de Marco Temporal */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 20
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={20} color="#00F0FF" />
                <h4 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>
                  Contabilização de Desempenho nos Percentis (P25, P50 e P75)
                </h4>
              </div>
              <p style={{ color: '#8B949E', fontSize: 12, marginTop: 4, margin: 0 }}>
                Enquadramento estatístico dos seus perfis comparados aos quartis de crescimento do benchmark.
              </p>
            </div>

            {/* Seletor de Marco Temporal para a Contabilização */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#8B949E', fontWeight: 600 }}>Marco Temporal:</span>
              <div style={{
                display: 'flex',
                background: '#0D1117',
                padding: '3px',
                borderRadius: '8px',
                border: '1px solid #30363D',
                gap: 2
              }}>
                {[
                  { id: 'ATUAL', label: '📍 Dia Atual' },
                  { id: 7, label: 'D7' },
                  { id: 14, label: 'D14' },
                  { id: 30, label: 'D30' },
                  { id: 60, label: 'D60' },
                  { id: 90, label: 'D90' }
                ].map(marco => (
                  <button
                    key={marco.id}
                    onClick={() => setMarcoRelativo(marco.id as any)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: marcoRelativo === marco.id ? '#7100E2' : 'transparent',
                      color: marcoRelativo === marco.id ? 'white' : '#8B949E',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {marco.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cards de Métricas Executivas de Contabilização (Grid 4 colunas) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 14,
            marginBottom: 24
          }}>
            {/* Card 1: Acima de P75 (Otimista) */}
            <div style={{
              background: 'rgba(13, 17, 23, 0.8)',
              border: '1px solid rgba(57, 255, 20, 0.4)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 4px 16px rgba(57, 255, 20, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#39FF14', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🚀 Acima de P75
                </span>
                <span style={{ fontSize: 10, color: '#39FF14', background: 'rgba(57, 255, 20, 0.15)', padding: '2px 6px', borderRadius: 10, fontWeight: 800 }}>
                  Otimista
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'white', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {resumoContabilizacao.aboveP75.count}
                <span style={{ fontSize: 13, color: '#8B949E', fontWeight: 600 }}>
                  perfi(s) ({resumoContabilizacao.aboveP75.pct}%)
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#8B949E', marginTop: 4 }}>
                Desempenho no topo da curva do mercado
              </div>
            </div>

            {/* Card 2: Entre P50 e P75 */}
            <div style={{
              background: 'rgba(13, 17, 23, 0.8)',
              border: '1px solid rgba(0, 240, 255, 0.4)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 4px 16px rgba(0, 240, 255, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#00F0FF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📈 Entre P50 e P75
                </span>
                <span style={{ fontSize: 10, color: '#00F0FF', background: 'rgba(0, 240, 255, 0.15)', padding: '2px 6px', borderRadius: 10, fontWeight: 800 }}>
                  Acima Mediana
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'white', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {resumoContabilizacao.betweenP50P75.count}
                <span style={{ fontSize: 13, color: '#8B949E', fontWeight: 600 }}>
                  perfi(s) ({resumoContabilizacao.betweenP50P75.pct}%)
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#8B949E', marginTop: 4 }}>
                Superou a mediana esperada
              </div>
            </div>

            {/* Card 3: Entre P25 e P50 */}
            <div style={{
              background: 'rgba(13, 17, 23, 0.8)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📊 Entre P25 e P50
                </span>
                <span style={{ fontSize: 10, color: '#F59E0B', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 6px', borderRadius: 10, fontWeight: 800 }}>
                  Conservador
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'white', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {resumoContabilizacao.betweenP25P50.count}
                <span style={{ fontSize: 13, color: '#8B949E', fontWeight: 600 }}>
                  perfi(s) ({resumoContabilizacao.betweenP25P50.pct}%)
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#8B949E', marginTop: 4 }}>
                Dentro da margem de segurança
              </div>
            </div>

            {/* Card 4: Abaixo de P25 */}
            <div style={{
              background: 'rgba(13, 17, 23, 0.8)',
              border: '1px solid rgba(255, 0, 122, 0.4)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 4px 16px rgba(255, 0, 122, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#FF007A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚠️ Abaixo de P25
                </span>
                <span style={{ fontSize: 10, color: '#FF007A', background: 'rgba(255, 0, 122, 0.15)', padding: '2px 6px', borderRadius: 10, fontWeight: 800 }}>
                  Requer Atenção
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'white', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {resumoContabilizacao.belowP25.count}
                <span style={{ fontSize: 13, color: '#8B949E', fontWeight: 600 }}>
                  perfi(s) ({resumoContabilizacao.belowP25.pct}%)
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#8B949E', marginTop: 4 }}>
                Abaixo do patamar mínimo do benchmark
              </div>
            </div>
          </div>

          {/* Tabela de Enquadramento Analítico dos Perfis */}
          <div style={{ background: '#0D1117', border: '1px solid #30363D', borderRadius: 12, overflow: 'hidden' }}>
            {/* Barra Superior da Tabela com Busca e Estatística */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid #30363D',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📋 Enquadramento por Perfil</span>
                <span style={{ fontSize: 11, color: '#8B949E', fontWeight: 500 }}>
                  ({tabelaContabilizacaoFiltrada.length} de {contabilizacaoPerfis.length} exibidos • Marco: {marcoRelativo === 'ATUAL' ? 'Último Dia Real' : `Dia ${marcoRelativo}`})
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} color="#8B949E" style={{ position: 'absolute', left: 10 }} />
                  <input
                    type="text"
                    placeholder="Filtrar perfil..."
                    value={searchTableQuery}
                    onChange={e => setSearchTableQuery(e.target.value)}
                    style={{
                      background: '#161B22',
                      border: '1px solid #30363D',
                      borderRadius: 6,
                      padding: '5px 10px 5px 30px',
                      color: 'white',
                      fontSize: 12,
                      outline: 'none',
                      width: 160
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Conteúdo da Tabela */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#161B22', borderBottom: '1px solid #30363D' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#8B949E', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                      <button
                        onClick={() => handleTableSort('username')}
                        style={{ background: 'none', border: 'none', color: tableSortField === 'username' ? '#00F0FF' : '#8B949E', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}
                      >
                        Perfil {tableSortField === 'username' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </button>
                    </th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', color: '#8B949E', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                      <button
                        onClick={() => handleTableSort('diaNum')}
                        style={{ background: 'none', border: 'none', color: tableSortField === 'diaNum' ? '#00F0FF' : '#8B949E', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}
                      >
                        Dia Relativo {tableSortField === 'diaNum' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </button>
                    </th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#8B949E', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                      <button
                        onClick={() => handleTableSort('realVal')}
                        style={{ background: 'none', border: 'none', color: tableSortField === 'realVal' ? '#00F0FF' : '#8B949E', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}
                      >
                        {isPctMode ? 'Cresc. Real (%)' : 'Ganho Real (Seg.)'} {tableSortField === 'realVal' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </button>
                    </th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#8B949E', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                      P25 Conservador
                    </th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#8B949E', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                      <button
                        onClick={() => handleTableSort('p50Val')}
                        style={{ background: 'none', border: 'none', color: tableSortField === 'p50Val' ? '#00F0FF' : '#8B949E', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}
                      >
                        P50 Mediana {tableSortField === 'p50Val' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </button>
                    </th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#8B949E', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                      P75 Otimista
                    </th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#8B949E', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                      <button
                        onClick={() => handleTableSort('desvio')}
                        style={{ background: 'none', border: 'none', color: tableSortField === 'desvio' ? '#00F0FF' : '#8B949E', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}
                      >
                        Desvio vs P50 {tableSortField === 'desvio' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </button>
                    </th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', color: '#8B949E', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                      <button
                        onClick={() => handleTableSort('enquadramento')}
                        style={{ background: 'none', border: 'none', color: tableSortField === 'enquadramento' ? '#00F0FF' : '#8B949E', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}
                      >
                        Enquadramento {tableSortField === 'enquadramento' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tabelaContabilizacaoFiltrada.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#8B949E' }}>
                        Nenhum perfil encontrado para o marco temporal selecionado.
                      </td>
                    </tr>
                  ) : (
                    tabelaContabilizacaoFiltrada.map((row, idx) => (
                      <tr
                        key={row.username}
                        style={{
                          borderBottom: idx < tabelaContabilizacaoFiltrada.length - 1 ? '1px solid #21262D' : 'none',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                          transition: 'background-color 0.15s'
                        }}
                      >
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'white' }}>
                          @{row.username}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', color: '#8B949E', fontWeight: 600 }}>
                          Dia {row.diaNum}
                          {row.imputado && (
                            <span style={{ fontSize: 9, color: '#F59E0B', marginLeft: 4, background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B', borderRadius: 4, padding: '1px 4px' }}>
                              Mantido
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: row.color }}>
                          {formatValue(row.realVal, modoMedida)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#8B949E' }}>
                          {formatValue(row.p25Val, modoMedida)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#00F0FF' }}>
                          {formatValue(row.p50Val, modoMedida)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#8B949E' }}>
                          {formatValue(row.p75Val, modoMedida)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: row.desvioP50 >= 0 ? '#39FF14' : '#FF007A' }}>
                          {row.desvioP50 >= 0 ? '+' : ''}{modoMedida === 'PERCENTUAL' ? `${row.desvioP50.toFixed(1)}%` : `${row.desvioP50.toLocaleString('pt-BR')} seg.`}
                          <div style={{ fontSize: 10, opacity: 0.8 }}>
                            ({row.pctDesvioP50 >= 0 ? '+' : ''}{row.pctDesvioP50.toFixed(1)}% vs P50)
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: row.color,
                            background: row.bg,
                            border: `1px solid ${row.border}`,
                            borderRadius: '20px',
                            padding: '4px 10px',
                            display: 'inline-block',
                            whiteSpace: 'nowrap'
                          }}>
                            {row.categoryLabel}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
