'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AvatarModelo from './AvatarModelo';
import { formatDisplayDateBR, formatDisplayDateTimeBR } from '@/lib/timezone';
import {
  AlertTriangle, CheckCircle2, Rocket, Trash2, RefreshCw, TrendingUp, Users,
  FileText, Search, Zap, Filter, Edit3, Calendar, ChevronLeft, ChevronRight,
  ExternalLink, Sparkles, ShieldAlert, Check, ArrowRight, History
} from 'lucide-react';

interface AnomaliaItem {
  id: number;
  username: string;
  data_coleta: string;
  seguidores: number;
  total_posts: number;
  foto_url: string;
  primeira_postagem: string | null;
  meu_perfil: number;
  tipo_janela: string;
  revisado_manualmente: number;
  delta_s: number;
  pct_delta_s: number;
  delta_posts: number;
  seg_anterior: number;
  gatilhos: string[];
  dias_intervalo?: number;
  media_diaria_delta_s?: number;
  pct_media_diaria_delta_s?: number;
}

interface PerfilSumario {
  username: string;
  total_coletas: number;
  pendentes: number;
  ads_count: number;
  organicos_count: number;
  primeira_postagem: string | null;
  foto_url: string;
  meu_perfil: number;
  ultima_coleta: string | null;
  comentarios_pendentes?: number;
  mensagens_pendentes?: number;
  tem_pendencias?: boolean;
}

interface GlobalStats {
  dias_coletados: number;
  contas_coletadas: number;
  pendentes_validacao: number;
  dias_organicos: number;
  dias_ads: number;
}

interface CentralAnomaliasProps {
  onCountUpdate?: (count: number) => void;
}

export default function CentralAnomalias({ onCountUpdate }: CentralAnomaliasProps) {
  // Dados principais
  const [stats, setStats] = useState<GlobalStats>({
    dias_coletados: 0,
    contas_coletadas: 0,
    pendentes_validacao: 0,
    dias_organicos: 0,
    dias_ads: 0
  });
  const [perfis, setPerfis] = useState<PerfilSumario[]>([]);
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [items, setItems] = useState<AnomaliaItem[]>([]);

  // Estados de carregamento e mensagens
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Filtros da barra de perfis
  const [searchPerfil, setSearchPerfil] = useState('');
  const [filtroPerfisTipo, setFiltroPerfisTipo] = useState<'TODOS' | 'PENDENTES' | 'MEUS'>('TODOS');

  // Filtros da tabela do perfil
  const [tipoJanelaFilter, setTipoJanelaFilter] = useState<string>('TODOS');
  const [apenasPendentesTable, setApenasPendentesTable] = useState<boolean>(false);

  // Estados de busca de post viral sob demanda
  const [viralSearchingId, setViralSearchingId] = useState<number | null>(null);
  const [viralModalItem, setViralModalItem] = useState<AnomaliaItem | null>(null);
  const [viralData, setViralData] = useState<any | null>(null);
  const [viralLoadingApi, setViralLoadingApi] = useState<boolean>(false);

  // Estado do campo de link manual
  const [linkManual, setLinkManual] = useState<string>('');
  const [linkManualLoading, setLinkManualLoading] = useState<boolean>(false);
  const [linkManualErro, setLinkManualErro] = useState<string | null>(null);

  // Ordenação da tabela
  type SortCol = 'dia_operacao' | 'data_coleta' | 'seguidores' | 'delta_s' | 'pct_delta_s' | 'tipo_janela' | 'revisado_manualmente';
  const [sortCol, setSortCol] = useState<SortCol>('data_coleta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Dispara a busca de post viral (72h) localmente ou via Apify
  const handleBuscarViral = async (item: AnomaliaItem, forceApi = false) => {
    if (forceApi) {
      setViralLoadingApi(true);
    } else {
      setViralSearchingId(item.id);
    }
    // Limpa estado de link manual ao abrir novo modal
    setLinkManual('');
    setLinkManualErro(null);
    try {
      const res = await fetch('/api/anomalias/buscar-viral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: item.username,
          data_coleta: item.data_coleta,
          force_api: forceApi
        })
      });
      const json = await res.json();
      if (json.success) {
        setViralData(json);
        setViralModalItem(item);
      } else {
        alert(`⚠️ Não foi possível buscar posts virais: ${json.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) {
      alert(`Erro na requisição de busca viral: ${e.message}`);
    } finally {
      setViralSearchingId(null);
      setViralLoadingApi(false);
    }
  };

  // Registra manualmente um post pelo link do Instagram
  const handleRegistrarPorLink = async () => {
    if (!viralModalItem || !linkManual.trim()) return;
    setLinkManualErro(null);
    setLinkManualLoading(true);
    try {
      const res = await fetch('/api/anomalias/registrar-post-viral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: viralModalItem.username,
          post_url: linkManual.trim(),
          data_coleta: viralModalItem.data_coleta
        })
      });
      const json = await res.json();
      if (json.success && json.post) {
        // Injeta o post como top_post no modal atual
        setViralData((prev: any) => ({
          ...prev,
          top_post: json.post,
          sugestao_viral: null,
          total_posts_janela: 1,
          registrado_manualmente: true,
          ja_existia: json.ja_existia
        }));
        setLinkManual('');
      } else {
        setLinkManualErro(json.error || 'Erro ao registrar post');
      }
    } catch (e: any) {
      setLinkManualErro(e.message || 'Erro de conexão');
    } finally {
      setLinkManualLoading(false);
    }
  };

  // Cálculo do Dia da Operação relativo à primeira postagem
  const calcDiaOperacao = useCallback((dataColetaStr?: string | null, primeiraPostagemStr?: string | null): number | null => {
    if (!primeiraPostagemStr || !dataColetaStr) return null;
    try {
      const dataInicio = new Date(primeiraPostagemStr.split('T')[0].split(' ')[0] + 'T00:00:00');
      const dataColeta = new Date(dataColetaStr.split('T')[0].split(' ')[0] + 'T00:00:00');
      if (isNaN(dataInicio.getTime()) || isNaN(dataColeta.getTime())) return null;
      const diffMs = dataColeta.getTime() - dataInicio.getTime();
      const diffDias = Math.floor(diffMs / 86400000) + 1;
      return diffDias;
    } catch {
      return null;
    }
  }, []);

  // Busca dados iniciais (stats e lista de perfis)
  const fetchOverview = useCallback(async (preserveSelected?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/anomalias');
      const json = await res.json();
      if (json.success) {
        if (json.stats) setStats(json.stats);
        const listaPerfis: PerfilSumario[] = json.perfis_sumario || [];
        setPerfis(listaPerfis);
        onCountUpdate?.(json.stats?.pendentes_validacao || 0);

        // Se deve preservar a seleção e o perfil ainda existe na lista
        if (preserveSelected) {
          setSelectedUsername(prev => {
            if (prev && listaPerfis.some(p => p.username === prev)) {
              return prev;
            }
            return '';
          });
        }
      } else {
        setError(json.error || 'Falha ao carregar visão geral do histórico');
      }
    } catch (e: any) {
      setError(e.message || 'Erro de conexão ao carregar histórico');
    } finally {
      setLoading(false);
    }
  }, [onCountUpdate]);

  // Busca registros específicos do perfil selecionado
  const fetchProfileItems = useCallback(async (username: string) => {
    if (!username) return;
    setItemsLoading(true);
    try {
      const url = `/api/anomalias?username=${encodeURIComponent(username)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setItems(json.items || []);
        if (json.stats) setStats(json.stats);
        onCountUpdate?.(json.stats?.pendentes_validacao || 0);
      }
    } catch (e: any) {
      console.error('Erro ao buscar itens do perfil:', e);
    } finally {
      setItemsLoading(false);
    }
  }, [onCountUpdate]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (selectedUsername) {
      fetchProfileItems(selectedUsername);
    }
  }, [selectedUsername, fetchProfileItems]);

  // Executa varrida histórica de anomalias
  const handleScanHistorico = async () => {
    setScanLoading(true);
    setScanMessage(null);
    try {
      const res = await fetch('/api/anomalias', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setScanMessage(`⚡ Varrida concluída! ${json.auto_validados || 0} coletas validadas automaticamente como Orgânico e ${json.marcados || 0} nova(s) coleta(s) enviadas para análise (> 2% e > 10 seg).`);
        await fetchOverview(true);
        if (selectedUsername) await fetchProfileItems(selectedUsername);
        setTimeout(() => setScanMessage(null), 8000);
      }
    } catch (e: any) {
      setScanMessage(`⚠️ Erro ao executar varrida: ${e.message}`);
    } finally {
      setScanLoading(false);
    }
  };

  // Atualiza classificação (tipo_janela) de um registro
  const handleAction = async (id: number, tipo_janela: string) => {
    setActionLoading(id);
    try {
      const res = await fetch('/api/anomalias', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, tipo_janela })
      });
      const json = await res.json();
      if (json.success) {
        setItems(prev => prev.map(item => item.id === id ? { ...item, tipo_janela, revisado_manualmente: 1 } : item));
        // Recarrega visão geral para sincronizar scores e sumários
        fetchOverview(true);
      }
    } catch (e: any) {
      console.error('Erro ao atualizar registro:', e);
    } finally {
      setActionLoading(null);
    }
  };

  // Alterna status de validação manual
  const handleToggleRevisado = async (id: number, currentRevisado: number) => {
    setActionLoading(id);
    const newRevisado = currentRevisado === 1 ? 0 : 1;
    try {
      const res = await fetch('/api/anomalias', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, revisado_manualmente: newRevisado })
      });
      const json = await res.json();
      if (json.success) {
        setItems(prev => prev.map(item => item.id === id ? { ...item, revisado_manualmente: newRevisado } : item));
        fetchOverview(true);
      }
    } catch (e: any) {
      console.error('Erro ao alternar status de validação:', e);
    } finally {
      setActionLoading(null);
    }
  };

  // Perfil atualmente selecionado
  const activeProfile = useMemo(() => {
    return perfis.find(p => p.username === selectedUsername) || null;
  }, [perfis, selectedUsername]);

  // Lista de perfis filtrados para a barra de seleção
  const perfisFiltrados = useMemo(() => {
    return perfis.filter(p => {
      // Filtro de texto
      if (searchPerfil && !p.username.toLowerCase().includes(searchPerfil.toLowerCase())) {
        return false;
      }
      // Filtro de tipo
      if (filtroPerfisTipo === 'PENDENTES' && p.pendentes <= 0) {
        return false;
      }
      if (filtroPerfisTipo === 'MEUS' && !p.meu_perfil) {
        return false;
      }
      return true;
    });
  }, [perfis, searchPerfil, filtroPerfisTipo]);

  // Navegação entre perfis (Anterior / Próximo)
  const currentProfileIndex = useMemo(() => {
    return perfisFiltrados.findIndex(p => p.username === selectedUsername);
  }, [perfisFiltrados, selectedUsername]);

  const handlePrevProfile = () => {
    if (perfisFiltrados.length === 0) return;
    const newIdx = currentProfileIndex > 0 ? currentProfileIndex - 1 : perfisFiltrados.length - 1;
    setSelectedUsername(perfisFiltrados[newIdx].username);
  };

  const handleNextProfile = () => {
    if (perfisFiltrados.length === 0) return;
    const newIdx = currentProfileIndex < perfisFiltrados.length - 1 ? currentProfileIndex + 1 : 0;
    setSelectedUsername(perfisFiltrados[newIdx].username);
  };

  // Ordenação da tabela de coletas
  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'dia_operacao' || col === 'data_coleta' ? 'desc' : 'asc');
    }
  };

  const filteredAndSortedItems = useMemo(() => {
    let list = [...items];

    // Filtro por tipo_janela
    if (tipoJanelaFilter !== 'TODOS') {
      list = list.filter(item => item.tipo_janela === tipoJanelaFilter);
    }

    // Filtro por apenas pendentes (qualquer coleta não validada)
    if (apenasPendentesTable) {
      list = list.filter(item => Number(item.revisado_manualmente || 0) === 0);
    }

    // Ordenação
    return list.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortCol === 'dia_operacao') {
        aVal = calcDiaOperacao(a.data_coleta, a.primeira_postagem || activeProfile?.primeira_postagem) ?? -999999;
        bVal = calcDiaOperacao(b.data_coleta, b.primeira_postagem || activeProfile?.primeira_postagem) ?? -999999;
      } else if (sortCol === 'data_coleta') {
        aVal = new Date(a.data_coleta).getTime();
        bVal = new Date(b.data_coleta).getTime();
      } else if (sortCol === 'tipo_janela') {
        aVal = a.tipo_janela || '';
        bVal = b.tipo_janela || '';
      } else {
        aVal = Number(a[sortCol]) || 0;
        bVal = Number(b[sortCol]) || 0;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, tipoJanelaFilter, apenasPendentesTable, sortCol, sortDir, calcDiaOperacao, activeProfile]);

  const formatDelta = (num: number) => {
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toLocaleString('pt-BR')}`;
  };

  const getTipoJanelaIcon = (tipo: string) => {
    switch (tipo) {
      case 'ORGANICO': return '🌱';
      case 'VIRAL_ORGANICO': return '🔥';
      case 'ADS': return '🚀';
      case 'IGNORAR': return '🗑️';
      default: return '📊';
    }
  };

  const getTipoJanelaColor = (tipo: string) => {
    switch (tipo) {
      case 'ORGANICO': return '#00FFC8';
      case 'VIRAL_ORGANICO': return '#39FF14';
      case 'ADS': return '#FF6B35';
      case 'IGNORAR': return '#8B949E';
      default: return '#FFFFFF';
    }
  };

  const getBadgeStyleClass = (tipo: string) => {
    switch (tipo) {
      case 'ORGANICO': return { bg: 'rgba(0, 255, 200, 0.1)', color: '#00FFC8', border: 'rgba(0, 255, 200, 0.3)', label: '🌱 Orgânico' };
      case 'VIRAL_ORGANICO': return { bg: 'rgba(57, 255, 20, 0.1)', color: '#39FF14', border: 'rgba(57, 255, 20, 0.3)', label: '🔥 Viral Orgânico' };
      case 'ADS': return { bg: 'rgba(255, 107, 53, 0.1)', color: '#FF6B35', border: 'rgba(255, 107, 53, 0.3)', label: '🚀 ADS / Tráfego' };
      case 'IGNORAR': return { bg: 'rgba(139, 148, 158, 0.1)', color: '#8B949E', border: 'rgba(139, 148, 158, 0.3)', label: '🗑️ Ignorado' };
      default: return { bg: 'rgba(255,255,255,0.05)', color: '#FFFFFF', border: '#30363D', label: tipo };
    }
  };

  const formatDateBR = (dateStr?: string | null) => {
    return formatDisplayDateBR(dateStr);
  };

  const formatDateTimeBR = (dateStr?: string | null) => {
    return formatDisplayDateTimeBR(dateStr);
  };

  return (
    <div className="anomalias-container">
      {/* ─── Header Principal ─── */}
      <div className="anomalias-header">
        <div className="anomalias-header-left">
          <div className="anomalias-icon-box">
            <History size={24} />
          </div>
          <div>
            <h2 className="anomalias-title">Histórico da Conta & Validação por Perfil</h2>
            <p className="anomalias-subtitle">
              Validação de coletas com variação &gt; 2% e &gt; 10 seguidores. Registros dentro da variação normal são validados automaticamente como orgânico no banco de dados.
            </p>
          </div>
        </div>

        <div className="anomalias-header-right">
          <button
            className="anomalias-scan-btn"
            onClick={handleScanHistorico}
            disabled={scanLoading}
            title="Executa a regra de detecção de anomalias em todo o histórico do banco de dados"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #7100E2 0%, #4D0099 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: scanLoading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(113, 0, 226, 0.4)',
              transition: 'all 0.2s'
            }}
          >
            <Zap size={15} className={scanLoading ? 'anomalias-spin' : ''} />
            <span>{scanLoading ? 'Varrendo Histórico...' : '⚡ Varrer Anomalias no Histórico'}</span>
          </button>

          <button
            className="anomalias-refresh-btn"
            onClick={() => {
              fetchOverview(true);
              if (selectedUsername) fetchProfileItems(selectedUsername);
            }}
            title="Atualizar dados"
          >
            <RefreshCw size={16} className={loading || itemsLoading ? 'anomalias-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Banner de Mensagem de Scan */}
      {scanMessage && (
        <div style={{
          background: 'rgba(113, 0, 226, 0.15)',
          borderBottom: '1px solid rgba(113, 0, 226, 0.3)',
          padding: '10px 28px',
          color: '#00F0FF',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          {scanMessage}
        </div>
      )}

      <div className="anomalias-content">
        {/* ─── 1. CARDS SCORE (ACIMA DA TABELA) ─── */}
        <div className="anomalias-score-grid">
          {/* Card 1: Dias Coletados */}
          <div className="anomalias-score-card" style={{ borderColor: 'rgba(0, 240, 255, 0.25)' }}>
            <div className="anomalias-score-icon" style={{ background: 'rgba(0, 240, 255, 0.12)', color: '#00F0FF' }}>
              <Calendar size={20} />
            </div>
            <div className="anomalias-score-body">
              <span className="anomalias-score-label">Dias Coletados</span>
              <div className="anomalias-score-value" style={{ color: '#00F0FF' }}>
                {(stats?.dias_coletados ?? 0).toLocaleString('pt-BR')}
              </div>
              <span className="anomalias-score-sub">Total de datas com coletas</span>
            </div>
          </div>

          {/* Card 2: Contas Diferentes Coletadas */}
          <div className="anomalias-score-card" style={{ borderColor: 'rgba(168, 85, 247, 0.25)' }}>
            <div className="anomalias-score-icon" style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#A855F7' }}>
              <Users size={20} />
            </div>
            <div className="anomalias-score-body">
              <span className="anomalias-score-label">Contas Coletadas</span>
              <div className="anomalias-score-value" style={{ color: '#A855F7' }}>
                {(stats?.contas_coletadas ?? 0).toLocaleString('pt-BR')}
              </div>
              <span className="anomalias-score-sub">Perfis distintos no banco</span>
            </div>
          </div>

          {/* Card 3: Dados Pendentes de Validação */}
          <div
            className="anomalias-score-card"
            style={{
              borderColor: (stats?.pendentes_validacao ?? 0) > 0 ? 'rgba(255, 68, 68, 0.45)' : 'rgba(48, 54, 61, 0.4)',
              background: (stats?.pendentes_validacao ?? 0) > 0 ? 'rgba(255, 68, 68, 0.06)' : undefined
            }}
          >
            <div className="anomalias-score-icon" style={{ background: 'rgba(255, 68, 68, 0.15)', color: '#FF4444' }}>
              <ShieldAlert size={20} />
            </div>
            <div className="anomalias-score-body">
              <span className="anomalias-score-label">Pendentes de Validação</span>
              <div className="anomalias-score-value" style={{ color: '#FF4444', display: 'flex', alignItems: 'center', gap: 8 }}>
                {(stats?.pendentes_validacao ?? 0).toLocaleString('pt-BR')}
                {(stats?.pendentes_validacao ?? 0) > 0 && (
                  <span className="anomalias-pulse-dot" title="Coletas pendentes de validação manual" />
                )}
              </div>
              <span className="anomalias-score-sub">Coletas não validadas</span>
            </div>
          </div>

          {/* Card 4: Dias Orgânicos */}
          <div className="anomalias-score-card" style={{ borderColor: 'rgba(0, 255, 200, 0.25)' }}>
            <div className="anomalias-score-icon" style={{ background: 'rgba(0, 255, 200, 0.12)', color: '#00FFC8' }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="anomalias-score-body">
              <span className="anomalias-score-label">Dias Orgânicos</span>
              <div className="anomalias-score-value" style={{ color: '#00FFC8' }}>
                {(stats?.dias_organicos ?? 0).toLocaleString('pt-BR')}
              </div>
              <span className="anomalias-score-sub">Coletas limpas / benchmark</span>
            </div>
          </div>

          {/* Card 5: Dias ADS */}
          <div className="anomalias-score-card" style={{ borderColor: 'rgba(255, 107, 53, 0.25)' }}>
            <div className="anomalias-score-icon" style={{ background: 'rgba(255, 107, 53, 0.12)', color: '#FF6B35' }}>
              <Rocket size={20} />
            </div>
            <div className="anomalias-score-body">
              <span className="anomalias-score-label">Dias ADS</span>
              <div className="anomalias-score-value" style={{ color: '#FF6B35' }}>
                {(stats?.dias_ads ?? 0).toLocaleString('pt-BR')}
              </div>
              <span className="anomalias-score-sub">Janelas marcadas com tráfego</span>
            </div>
          </div>
        </div>

        {/* ─── 2. SELETOR DE PERFIS (LISTA DIVIDIDA POR NOME DE PERFIL) ─── */}
        <div className="anomalias-profiles-section">
          <div className="anomalias-profiles-toolbar">
            <div className="anomalias-profiles-title-area">
              <span className="anomalias-section-tag">Tratamento por Conta</span>
              <h3 className="anomalias-section-title">Selecione o Perfil para Tratamento</h3>
            </div>

            <div className="anomalias-profiles-filters">
              {/* Barra de Busca de Perfil */}
              <div className="anomalias-search-box">
                <Search size={14} color="#8B949E" />
                <input
                  type="text"
                  placeholder="Buscar perfil..."
                  value={searchPerfil}
                  onChange={e => setSearchPerfil(e.target.value)}
                  className="anomalias-search-input"
                />
                {searchPerfil && (
                  <button
                    onClick={() => setSearchPerfil('')}
                    style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', fontSize: 12 }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Botões de Filtro Rápido de Perfis */}
              <div className="anomalias-filter-chips">
                <button
                  onClick={() => setFiltroPerfisTipo('TODOS')}
                  className={`anomalias-chip-btn ${filtroPerfisTipo === 'TODOS' ? 'active' : ''}`}
                >
                  Todos ({perfis.length})
                </button>
                <button
                  onClick={() => setFiltroPerfisTipo('PENDENTES')}
                  className={`anomalias-chip-btn ${filtroPerfisTipo === 'PENDENTES' ? 'active alert' : ''}`}
                >
                  ⚠️ Pendentes ({perfis.filter(p => p.pendentes > 0).length})
                </button>
                <button
                  onClick={() => setFiltroPerfisTipo('MEUS')}
                  className={`anomalias-chip-btn ${filtroPerfisTipo === 'MEUS' ? 'active gold' : ''}`}
                >
                  ⭐ Meus Perfis ({perfis.filter(p => p.meu_perfil === 1).length})
                </button>
              </div>
            </div>
          </div>

          {/* Lista de Chips dos Perfis */}
          <div className="anomalias-profile-list-scroll">
            {perfisFiltrados.length === 0 ? (
              <div className="anomalias-no-profiles">
                Nenhum perfil encontrado com os filtros selecionados.
              </div>
            ) : (
              perfisFiltrados.map(p => {
                const isSelected = p.username === selectedUsername;
                const hasPendentes = p.pendentes > 0;

                return (
                  <button
                    key={p.username}
                    onClick={() => setSelectedUsername(p.username)}
                    className={`anomalias-profile-chip ${isSelected ? 'selected' : ''} ${hasPendentes ? 'has-pendentes' : ''}`}
                  >
                    <AvatarModelo
                      src={p.foto_url || null}
                      username={p.username}
                      size={32}
                      comentariosPendentes={p.comentarios_pendentes || 0}
                      mensagensPendentes={p.mensagens_pendentes || 0}
                      temPendencias={p.tem_pendencias || false}
                    />

                    <div className="anomalias-chip-info">
                      <div className="anomalias-chip-header">
                        <span className="anomalias-chip-name">@{p.username}</span>
                        {p.meu_perfil === 1 && <span className="anomalias-chip-star" title="Meu Perfil">⭐</span>}
                      </div>
                      <div className="anomalias-chip-stats">
                        <span className="anomalias-chip-coletas">{p.total_coletas} coletas</span>
                        {hasPendentes && (
                          <span className="anomalias-chip-pending-badge">
                            ⚠️ {p.pendentes}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ─── 3. TABELA DO PERFIL ATUALMENTE EM TRATAMENTO ─── */}
        {!activeProfile ? (
          <div className="anomalias-table-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, padding: '50px 20px', textAlign: 'center', border: '1px dashed #30363D', borderRadius: '12px', background: 'rgba(22, 27, 34, 0.4)' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(113, 0, 226, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00F0FF', marginBottom: 16 }}>
              <History size={30} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#E6EDF3', marginBottom: 6 }}>
              Selecione um Perfil para Carregar o Histórico
            </h3>
            <p style={{ fontSize: 13, color: '#8B949E', maxWidth: 480, lineHeight: 1.5 }}>
              Clique em qualquer perfil na lista acima para visualizar, validar e classificar o histórico completo de coletas e anomalias.
            </p>
          </div>
        ) : (
          <div className="anomalias-table-card">
            {/* Header do Perfil Selecionado */}
            <div className="anomalias-selected-header">
              <div className="anomalias-selected-left">
                <div className="anomalias-selected-avatar">
                  <AvatarModelo
                    src={activeProfile.foto_url || null}
                    username={activeProfile.username}
                    size={44}
                    comentariosPendentes={activeProfile.comentarios_pendentes || 0}
                    mensagensPendentes={activeProfile.mensagens_pendentes || 0}
                    temPendencias={activeProfile.tem_pendencias || false}
                    showCountInBadge={true}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 className="anomalias-selected-title">
                      @{activeProfile.username}
                    </h3>
                    <a
                      href={`https://www.instagram.com/${activeProfile.username}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="anomalias-ig-link"
                      title="Abrir no Instagram"
                    >
                      Instagram <ExternalLink size={12} />
                    </a>
                    {activeProfile.meu_perfil === 1 && (
                      <span className="anomalias-badge-star">⭐ Meu Perfil</span>
                    )}
                  </div>

                  <div className="anomalias-selected-meta">
                    <span title="Data da primeira postagem cadastrada">
                      📅 1ª Postagem: <strong>{formatDateBR(activeProfile.primeira_postagem)}</strong>
                    </span>
                    <span>•</span>
                    <span>Total de Coletas: <strong>{activeProfile.total_coletas}</strong></span>
                    <span>•</span>
                    <span style={{ color: '#00FFC8' }}>Orgânicos: <strong>{activeProfile.organicos_count}</strong></span>
                    <span>•</span>
                    <span style={{ color: '#FF6B35' }}>ADS: <strong>{activeProfile.ads_count}</strong></span>
                    {activeProfile.pendentes > 0 && (
                      <>
                        <span>•</span>
                        <span style={{ color: '#FF4444', fontWeight: 800 }}>⚠️ {activeProfile.pendentes} pendente(s)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Controles de Navegação e Filtros da Tabela */}
              <div className="anomalias-selected-right">
                {/* Filtro de Tipo de Janela na Tabela */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Filter size={14} color="#8B949E" />
                  <select
                    value={tipoJanelaFilter}
                    onChange={e => setTipoJanelaFilter(e.target.value)}
                    className="anomalias-select-filter"
                  >
                    <option value="TODOS">🌐 Todas as Coletas</option>
                    <option value="ORGANICO">🌱 ORGANICO</option>
                    <option value="VIRAL_ORGANICO">🔥 VIRAL_ORGANICO</option>
                    <option value="ADS">🚀 ADS</option>
                    <option value="IGNORAR">🗑️ IGNORAR</option>
                  </select>
                </div>

                {/* Alternar apenas pendentes */}
                <button
                  onClick={() => setApenasPendentesTable(prev => !prev)}
                  className={`anomalias-pendentes-toggle-btn ${apenasPendentesTable ? 'active' : ''}`}
                  title="Exibir somente coletas pendentes de validação"
                >
                  ⚠️ Apenas Pendentes
                </button>

                {/* Botões de Navegação entre perfis */}
                <div className="anomalias-nav-btns">
                  <button
                    onClick={handlePrevProfile}
                    className="anomalias-nav-btn"
                    title="Perfil Anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="anomalias-nav-index">
                    {currentProfileIndex + 1} / {perfisFiltrados.length}
                  </span>
                  <button
                    onClick={handleNextProfile}
                    className="anomalias-nav-btn"
                    title="Próximo Perfil"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Tabela de Coletas do Perfil */}
            {itemsLoading ? (
              <div className="anomalias-empty-state">
                <RefreshCw size={32} className="anomalias-spin" style={{ color: '#7100E2' }} />
                <p>Carregando coletas de @{activeProfile.username}...</p>
              </div>
            ) : filteredAndSortedItems.length === 0 ? (
              <div className="anomalias-empty-state">
                <CheckCircle2 size={36} style={{ color: '#00FFC8', marginBottom: 8 }} />
                <p style={{ fontWeight: 700, color: 'white' }}>Nenhum registro encontrado com os filtros atuais.</p>
                <p style={{ fontSize: 12, color: '#8B949E' }}>Altere os filtros acima para visualizar outras coletas.</p>
              </div>
            ) : (
              <div className="anomalias-table-wrapper">
                <table className="anomalias-table">
                  <thead>
                    <tr>
                      {/* DIA DA OPERAÇÃO */}
                      <th
                        onClick={() => handleSort('dia_operacao')}
                        className="anomalias-th-sortable"
                        title="Dia da operação relativo à data da primeira postagem"
                        style={{ color: sortCol === 'dia_operacao' ? '#00F0FF' : undefined, textAlign: 'center' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Dia Op.
                          <span className="anomalias-sort-arrow">{sortCol === 'dia_operacao' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                        </span>
                      </th>

                      {/* DATA DA COLETA */}
                      <th
                        onClick={() => handleSort('data_coleta')}
                        className="anomalias-th-sortable"
                        style={{ color: sortCol === 'data_coleta' ? '#00F0FF' : undefined }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Data da Coleta
                          <span className="anomalias-sort-arrow">{sortCol === 'data_coleta' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                        </span>
                      </th>

                      {/* SEGUIDORES */}
                      <th
                        onClick={() => handleSort('seguidores')}
                        className="anomalias-th-sortable"
                        style={{ color: sortCol === 'seguidores' ? '#00F0FF' : undefined, textAlign: 'right' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          Seguidores
                          <span className="anomalias-sort-arrow">{sortCol === 'seguidores' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                        </span>
                      </th>

                      {/* ΔS (24h) */}
                      <th
                        onClick={() => handleSort('delta_s')}
                        className="anomalias-th-sortable"
                        style={{ color: sortCol === 'delta_s' ? '#00F0FF' : undefined, textAlign: 'right' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          ΔS (Ganho)
                          <span className="anomalias-sort-arrow">{sortCol === 'delta_s' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                        </span>
                      </th>

                      {/* %ΔS */}
                      <th
                        onClick={() => handleSort('pct_delta_s')}
                        className="anomalias-th-sortable"
                        style={{ color: sortCol === 'pct_delta_s' ? '#00F0FF' : undefined, textAlign: 'right' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          %ΔS
                          <span className="anomalias-sort-arrow">{sortCol === 'pct_delta_s' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                        </span>
                      </th>

                      {/* ΔPosts */}
                      <th style={{ textAlign: 'center' }}>ΔPosts</th>

                      {/* ALERTA / GATILHO */}
                      <th>Gatilhos Detectados</th>

                      {/* POST VIRAL */}
                      <th style={{ textAlign: 'center' }}>Publicação na Janela</th>

                      {/* CLASSIFICAÇÃO ATUAL */}
                      <th
                        onClick={() => handleSort('tipo_janela')}
                        className="anomalias-th-sortable"
                        style={{ color: sortCol === 'tipo_janela' ? '#00F0FF' : undefined }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Classificação
                          <span className="anomalias-sort-arrow">{sortCol === 'tipo_janela' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                        </span>
                      </th>

                      {/* STATUS DE VALIDAÇÃO */}
                      <th
                        onClick={() => handleSort('revisado_manualmente')}
                        className="anomalias-th-sortable"
                        style={{ textAlign: 'center', color: sortCol === 'revisado_manualmente' ? '#00F0FF' : undefined }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          Status
                          <span className="anomalias-sort-arrow">{sortCol === 'revisado_manualmente' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                        </span>
                      </th>

                      {/* AÇÕES RÁPIDAS */}
                      <th style={{ textAlign: 'center' }}>Ações Rápidas</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAndSortedItems.map(item => {
                      const isPending = item.revisado_manualmente === 0;
                      const isActioning = actionLoading === item.id;
                      const diaOp = calcDiaOperacao(item.data_coleta, item.primeira_postagem || activeProfile.primeira_postagem);
                      const badge = getBadgeStyleClass(item.tipo_janela);

                      return (
                        <tr
                          key={item.id}
                          className={`anomalias-row ${isPending ? 'row-pending-alert' : ''}`}
                        >
                          {/* 1. Dia da Operação */}
                          <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                            {diaOp !== null ? (
                              <span
                                className="anomalias-dia-op-badge"
                                title={`Dia ${diaOp} da operação da conta (a partir de ${formatDateBR(item.primeira_postagem || activeProfile.primeira_postagem)})`}
                                style={{
                                  color: diaOp >= 90 ? '#10B981' : diaOp >= 30 ? '#00F0FF' : '#FFD700',
                                  borderColor: diaOp >= 90 ? 'rgba(16, 185, 129, 0.4)' : diaOp >= 30 ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 215, 0, 0.4)',
                                  background: diaOp >= 90 ? 'rgba(16, 185, 129, 0.12)' : diaOp >= 30 ? 'rgba(0, 240, 255, 0.12)' : 'rgba(255, 215, 0, 0.12)'
                                }}
                              >
                                D{diaOp}
                              </span>
                            ) : (
                              <span style={{ color: '#484F58', fontSize: 11 }}>—</span>
                            )}
                          </td>

                          {/* 2. Data Coleta */}
                          <td style={{ fontSize: 12, color: '#8B949E', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            {formatDateTimeBR(item.data_coleta)}
                          </td>

                          {/* 3. Seguidores */}
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>
                            {item.seguidores ? item.seguidores.toLocaleString('pt-BR') : '—'}
                          </td>

                          {/* 4. ΔS (Ganho) */}
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            color: item.delta_s > 0 ? '#00FFC8' : item.delta_s < 0 ? '#FF007A' : '#8B949E'
                          }}>
                            <div>{formatDelta(item.delta_s)}</div>
                            {item.dias_intervalo && item.dias_intervalo > 1 ? (
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: '#8B949E',
                                  marginTop: 2
                                }}
                                title={`Média diária dividida em ${item.dias_intervalo} dias de intervalo`}
                              >
                                ~{formatDelta(item.media_diaria_delta_s || 0)}/dia ({item.dias_intervalo}d)
                              </div>
                            ) : null}
                          </td>

                          {/* 5. %ΔS */}
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            color: item.pct_delta_s >= 25 ? '#FF4444' : (item.pct_delta_s > 2.0 && item.delta_s > 10) ? '#FFB800' : '#8B949E'
                          }}>
                            <div>{item.pct_delta_s > 0 ? '+' : ''}{item.pct_delta_s}%</div>
                          </td>

                          {/* 6. ΔPosts */}
                          <td style={{ textAlign: 'center', color: item.delta_posts > 0 ? '#00F0FF' : '#8B949E', fontSize: 12, fontWeight: 700 }}>
                            {item.delta_posts > 0 ? `+${item.delta_posts}` : item.delta_posts === 0 ? '0' : item.delta_posts}
                          </td>

                          {/* 7. GATILHO / ALERTA */}
                          <td>
                            {item.gatilhos && item.gatilhos.length > 0 ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {item.gatilhos.map((g, gi) => (
                                  <span key={gi} className="anomalias-gatilho-badge">
                                    {g === 'CRESCIMENTO_ALTO' ? '📈 Var. > 2% (>10 seg)' : g === 'VOLUME_SEM_CONTEUDO' ? '📦 Sem Conteúdo' : '🔥 Explosão %'}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: '#484F58', fontSize: 11 }}>Normal</span>
                            )}
                          </td>

                          {/* 8. POST NA JANELA (AUDITORIA SOB DEMANDA) */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => handleBuscarViral(item, false)}
                              disabled={viralSearchingId === item.id || isActioning}
                              className="anomalias-viral-btn"
                              title="Buscar publicação viral lançada em até 72h desta coleta"
                            >
                              {viralSearchingId === item.id ? (
                                <>
                                  <RefreshCw size={12} className="anomalias-spin" />
                                  <span>Buscando...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={12} />
                                  <span>Auditar Post</span>
                                </>
                              )}
                            </button>
                          </td>

                          {/* 9. CLASSIFICAÇÃO (TIPO DE JANELA) */}
                          <td>
                            <select
                              value={item.tipo_janela}
                              disabled={isActioning}
                              onChange={e => handleAction(item.id, e.target.value)}
                              className="anomalias-table-select"
                              style={{
                                background: badge.bg,
                                color: badge.color,
                                borderColor: badge.border
                              }}
                            >
                              <option value="ORGANICO" style={{ background: '#161B22', color: '#00FFC8' }}>🌱 ORGANICO</option>
                              <option value="VIRAL_ORGANICO" style={{ background: '#161B22', color: '#39FF14' }}>🔥 VIRAL_ORGANICO</option>
                              <option value="ADS" style={{ background: '#161B22', color: '#FF6B35' }}>🚀 ADS (Tráfego Pago)</option>
                              <option value="IGNORAR" style={{ background: '#161B22', color: '#8B949E' }}>🗑️ IGNORAR (Descartar)</option>
                            </select>
                          </td>

                          {/* 10. STATUS DE REVISÃO */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => handleToggleRevisado(item.id, item.revisado_manualmente)}
                              disabled={isActioning}
                              title={item.revisado_manualmente === 1 ? "Validado manualmente (Clique para desmarcar)" : "Pendente de validação (Clique para validar)"}
                              className={`anomalias-validacao-btn ${item.revisado_manualmente === 1 ? 'validado' : 'pendente'}`}
                            >
                              {item.revisado_manualmente === 1 ? (
                                <>
                                  <Check size={12} />
                                  <span>Validado</span>
                                </>
                              ) : (
                                <span>⚠️ Pendente</span>
                              )}
                            </button>
                          </td>

                          {/* 11. AÇÕES RÁPIDAS DE TRIAGEM */}
                          <td>
                            <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                              <button
                                onClick={() => handleAction(item.id, 'VIRAL_ORGANICO')}
                                disabled={isActioning || item.tipo_janela === 'VIRAL_ORGANICO'}
                                title="Marcar como Viral Orgânico"
                                className="anomalias-quick-btn organico"
                              >
                                🔥 Orgânico
                              </button>

                              <button
                                onClick={() => handleAction(item.id, 'ADS')}
                                disabled={isActioning || item.tipo_janela === 'ADS'}
                                title="Marcar como ADS"
                                className="anomalias-quick-btn ads"
                              >
                                🚀 ADS
                              </button>

                              <button
                                onClick={() => handleAction(item.id, 'IGNORAR')}
                                disabled={isActioning || item.tipo_janela === 'IGNORAR'}
                                title="Ignorar este registro"
                                className="anomalias-quick-btn ignorar"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL DE POST VIRAL (JANELA 48H) ─── */}
      {viralModalItem && viralData && (
        <div className="viral-modal-overlay" onClick={() => { setViralModalItem(null); setViralData(null); }}>
          <div className="viral-modal-content" onClick={e => e.stopPropagation()}>
            {/* Header do Modal */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #30363D', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'rgba(22, 27, 34, 0.6)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>🔥</span>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'white' }}>
                    Auditoria de Publicação Viral
                  </h3>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: viralData.origem === 'APIFY_API' ? 'rgba(0, 240, 255, 0.15)' : 'rgba(113, 0, 226, 0.2)',
                    color: viralData.origem === 'APIFY_API' ? '#00F0FF' : '#C084FC',
                    border: `1px solid ${viralData.origem === 'APIFY_API' ? 'rgba(0, 240, 255, 0.4)' : 'rgba(113, 0, 226, 0.4)'}`
                  }}>
                    {viralData.origem === 'APIFY_API' ? '🌐 API Instagram' : '💾 Banco Local'}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#8B949E' }}>
                  Analisando posts publicados em até 48h antes da coleta de <strong>@{viralModalItem.username}</strong>
                </p>
              </div>

              <button
                onClick={() => { setViralModalItem(null); setViralData(null); }}
                style={{ background: 'transparent', border: 'none', color: '#8B949E', fontSize: 18, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Contexto da Coleta */}
            <div style={{ padding: '14px 22px', background: '#161B22', borderBottom: '1px solid #21262D', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, flexShrink: 0 }}>
              <div>
                <span style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', fontWeight: 700 }}>Data da Coleta</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginTop: 2 }}>{formatDateTimeBR(viralModalItem.data_coleta)}</div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', fontWeight: 700 }}>Salto (ΔS)</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: viralModalItem.delta_s > 0 ? '#00FFC8' : '#FF007A', marginTop: 2 }}>
                  {formatDelta(viralModalItem.delta_s)} ({viralModalItem.pct_delta_s > 0 ? '+' : ''}{viralModalItem.pct_delta_s}%)
                  {viralModalItem.dias_intervalo && viralModalItem.dias_intervalo > 1 && (
                    <span style={{ fontSize: 11, color: '#00F0FF', marginLeft: 6, fontWeight: 700 }}>
                      [~{formatDelta(viralModalItem.media_diaria_delta_s || 0)}/dia em {viralModalItem.dias_intervalo}d]
                    </span>
                  )}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', fontWeight: 700 }}>Classificação Atual</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#00F0FF', marginTop: 2 }}>{viralModalItem.tipo_janela}</div>
              </div>
            </div>

            {/* Corpo do Modal (com rolagem fluida e ocupando o espaço livre) */}
            <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
              {(() => {
                const activePost = viralData.top_post || viralData.sugestao_viral;
                const isSuggestion = !viralData.top_post && !!viralData.sugestao_viral;

                if (activePost) {
                  return (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: isSuggestion ? '#FFB800' : '#39FF14', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isSuggestion ? '🔥 Publicação Viral Recente Identificada (Fora da Janela Direta de 48h)' : '⚡ Publicação Responsável pelo Salto Detectada'}
                        </span>
                        {activePost.horas_antes_coleta !== null && (
                          <span style={{ fontSize: 11, color: '#8B949E', background: '#21262D', padding: '2px 8px', borderRadius: 4 }}>
                            {activePost.horas_antes_coleta < 0 ? `Publicado ${Math.abs(activePost.horas_antes_coleta)}h após a leitura` : `Publicado ${activePost.horas_antes_coleta}h antes da leitura`}
                          </span>
                        )}
                      </div>

                      {/* Card Principal do Post */}
                      <div style={{ background: '#161B22', border: isSuggestion ? '1px solid #FFB80040' : '1px solid #30363D', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                          <div>
                            <span style={{
                              display: 'inline-block',
                              fontSize: 11,
                              fontWeight: 800,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: activePost.formato === 'Reels' ? 'rgba(0, 240, 255, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                              color: activePost.formato === 'Reels' ? '#00F0FF' : '#C084FC',
                              marginBottom: 6
                            }}>
                              {activePost.formato === 'Reels' ? '🎬 Reels' : activePost.formato === 'Carrossel' ? '📑 Carrossel' : '🖼️ Imagem'}
                            </span>
                            <div style={{ fontSize: 12, color: '#8B949E' }}>
                              📅 Postado em: <strong style={{ color: 'white' }}>{formatDateTimeBR(activePost.data_postagem)}</strong>
                            </div>
                          </div>

                          <a
                            href={activePost.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              background: '#7100E2',
                              color: 'white',
                              padding: '6px 12px',
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              textDecoration: 'none',
                              boxShadow: '0 2px 8px rgba(113, 0, 226, 0.4)'
                            }}
                          >
                            Abrir Post <ExternalLink size={12} />
                          </a>
                        </div>

                        {/* Legenda do Post */}
                        {activePost.legenda && (
                          <div style={{
                            background: '#0D1117',
                            border: '1px solid #21262D',
                            borderRadius: 8,
                            padding: 10,
                            fontSize: 12,
                            color: '#C9D1D9',
                            maxHeight: 100,
                            overflowY: 'auto',
                            marginBottom: 14,
                            lineHeight: 1.4
                          }}>
                            {activePost.legenda}
                          </div>
                        )}

                        {/* Grid de Métricas do Post */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                          <div style={{ background: '#0D1117', padding: '10px 8px', borderRadius: 8, textAlign: 'center', border: '1px solid #21262D' }}>
                            <span style={{ fontSize: 10, color: '#8B949E', display: 'block', fontWeight: 600 }}>❤️ CURTIDAS</span>
                            <strong style={{ fontSize: 15, color: 'white', marginTop: 4, display: 'block' }}>
                              {activePost.likes.toLocaleString('pt-BR')}
                            </strong>
                          </div>

                          <div style={{ background: '#0D1117', padding: '10px 8px', borderRadius: 8, textAlign: 'center', border: '1px solid #21262D' }}>
                            <span style={{ fontSize: 10, color: '#8B949E', display: 'block', fontWeight: 600 }}>💬 COMENTÁRIOS</span>
                            <strong style={{ fontSize: 15, color: 'white', marginTop: 4, display: 'block' }}>
                              {activePost.comentarios.toLocaleString('pt-BR')}
                            </strong>
                          </div>

                          <div style={{ background: '#0D1117', padding: '10px 8px', borderRadius: 8, textAlign: 'center', border: '1px solid #21262D' }}>
                            <span style={{ fontSize: 10, color: '#8B949E', display: 'block', fontWeight: 600 }}>👁️ VIEWS REELS</span>
                            <strong style={{ fontSize: 15, color: '#00F0FF', marginTop: 4, display: 'block' }}>
                              {activePost.views > 0 ? activePost.views.toLocaleString('pt-BR') : '—'}
                            </strong>
                          </div>

                          <div style={{ background: '#0D1117', padding: '10px 8px', borderRadius: 8, textAlign: 'center', border: '1px solid #21262D' }}>
                            <span style={{ fontSize: 10, color: '#8B949E', display: 'block', fontWeight: 600 }}>⚡ SCORE TRAÇÃO</span>
                            <strong style={{ fontSize: 15, color: '#39FF14', marginTop: 4, display: 'block' }}>
                              {activePost.score_tracao.toLocaleString('pt-BR')}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{ background: 'rgba(255, 107, 53, 0.08)', border: '1px solid rgba(255, 107, 53, 0.3)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 20 }}>⚠️</span>
                      <strong style={{ fontSize: 14, color: '#FF6B35' }}>Nenhum post encontrado na janela de 72h antes da coleta.</strong>
                    </div>
                    <p style={{ fontSize: 12, color: '#8B949E', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                      Não identificamos nenhuma publicação nas 72 horas anteriores à leitura. Isso pode indicar <strong>Tráfego Pago (ADS)</strong>, crescimento retroativo de posts antigos, ou um viral que ainda não está no banco.
                    </p>
                    {/* Input de link manual */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: 'column' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase' }}>
                        🔗 Já sabe o link do post viral? Cole aqui:
                      </span>
                      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <input
                          type="text"
                          value={linkManual}
                          onChange={e => { setLinkManual(e.target.value); setLinkManualErro(null); }}
                          placeholder="https://www.instagram.com/p/ABC123/ ou /reel/..."
                          onKeyDown={e => e.key === 'Enter' && handleRegistrarPorLink()}
                          style={{
                            flex: 1,
                            background: '#0D1117',
                            border: linkManualErro ? '1px solid #FF007A' : '1px solid #30363D',
                            borderRadius: 8,
                            padding: '8px 12px',
                            color: 'white',
                            fontSize: 12,
                            outline: 'none',
                            fontFamily: 'monospace'
                          }}
                        />
                        <button
                          onClick={handleRegistrarPorLink}
                          disabled={linkManualLoading || !linkManual.trim()}
                          style={{
                            background: linkManual.trim() ? '#7100E2' : '#21262D',
                            border: 'none',
                            color: 'white',
                            borderRadius: 8,
                            padding: '8px 14px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: linkManualLoading || !linkManual.trim() ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            opacity: !linkManual.trim() ? 0.5 : 1
                          }}
                        >
                          {linkManualLoading ? <RefreshCw size={12} className="anomalias-spin" /> : <ExternalLink size={12} />}
                          {linkManualLoading ? 'Registrando...' : 'Registrar Post'}
                        </button>
                      </div>
                      {linkManualErro && (
                        <span style={{ fontSize: 11, color: '#FF007A' }}>❌ {linkManualErro}</span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Outros posts recentes (caso haja) */}
              {viralData.outros_posts_recentes && viralData.outros_posts_recentes.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                    Outras publicações recentes encontradas ({viralData.outros_posts_recentes.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {viralData.outros_posts_recentes.map((op: any, opi: number) => {
                      const isViral = (op.views >= 5000 || op.likes >= 200 || (op.score_tracao && op.score_tracao >= 1500));
                      return (
                        <div key={opi} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: isViral ? 'rgba(255, 184, 0, 0.08)' : '#161B22',
                          border: isViral ? '1px solid rgba(255, 184, 0, 0.3)' : '1px solid transparent',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 12
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isViral && (
                              <span style={{ background: '#FFB800', color: '#000', fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 4 }}>
                                🔥 VIRAL
                              </span>
                            )}
                            <span style={{ color: 'white', fontWeight: 600 }}>
                              {op.formato} • {formatDateTimeBR(op.data_postagem)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ color: isViral ? '#00FFC8' : '#8B949E', fontWeight: 700 }}>
                              ❤️ {op.likes.toLocaleString('pt-BR')} | 👁️ {op.views ? op.views.toLocaleString('pt-BR') : '—'}
                            </span>
                            <a href={op.url} target="_blank" rel="noopener noreferrer" style={{ color: '#00F0FF', textDecoration: 'none', fontWeight: 700 }}>
                              Ver 🔗
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do Modal: Link manual + Ações de Triagem */}
            <div style={{ borderTop: '1px solid #30363D', background: '#0D1117', flexShrink: 0 }}>

              {/* Campo de Link Manual (sempre visível no rodapé) */}
              <div style={{ padding: '14px 22px', borderBottom: '1px solid #21262D' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase', marginBottom: 8 }}>
                  🔗 Registrar post por link (opcional)
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={linkManual}
                    onChange={e => { setLinkManual(e.target.value); setLinkManualErro(null); }}
                    placeholder="https://www.instagram.com/p/ABC123/ ou /reel/..."
                    onKeyDown={e => e.key === 'Enter' && handleRegistrarPorLink()}
                    style={{
                      flex: 1,
                      background: '#161B22',
                      border: linkManualErro ? '1px solid #FF007A' : '1px solid #30363D',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: 'white',
                      fontSize: 12,
                      outline: 'none',
                      fontFamily: 'monospace'
                    }}
                  />
                  <button
                    onClick={handleRegistrarPorLink}
                    disabled={linkManualLoading || !linkManual.trim()}
                    style={{
                      background: linkManual.trim() ? '#7100E2' : '#21262D',
                      border: 'none',
                      color: 'white',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: linkManualLoading || !linkManual.trim() ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      opacity: !linkManual.trim() ? 0.5 : 1,
                      boxShadow: linkManual.trim() ? '0 2px 8px rgba(113,0,226,0.4)' : 'none'
                    }}
                  >
                    {linkManualLoading ? <RefreshCw size={12} className="anomalias-spin" /> : <ExternalLink size={12} />}
                    {linkManualLoading ? 'Registrando...' : 'Registrar Post'}
                  </button>
                </div>
                {linkManualErro && (
                  <div style={{ fontSize: 11, color: '#FF007A', marginTop: 6 }}>❌ {linkManualErro}</div>
                )}
                {viralData?.registrado_manualmente && (
                  <div style={{ fontSize: 11, color: '#39FF14', marginTop: 6 }}>
                    ✅ Post {viralData?.ja_existia ? 'já existia no banco e foi' : 'registrado com sucesso!'} {viralData?.ja_existia ? 'recuperado.' : ''}
                    {' '}<span style={{ color: '#F59E0B' }}>(data de postagem estimada: coleta − 24h)</span>
                  </div>
                )}
              </div>

              {/* Botões de Triagem */}
              <div style={{ padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <button
                onClick={() => handleBuscarViral(viralModalItem, true)}
                disabled={viralLoadingApi}
                style={{
                  background: 'transparent',
                  border: '1px solid #30363D',
                  color: '#8B949E',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: viralLoadingApi ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <RefreshCw size={12} className={viralLoadingApi ? 'anomalias-spin' : ''} />
                <span>{viralLoadingApi ? 'Consultando Apify...' : 'Forçar Consulta na API'}</span>
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={async () => {
                    await handleAction(viralModalItem.id, 'VIRAL_ORGANICO');
                    setViralModalItem(null);
                    setViralData(null);
                  }}
                  style={{
                    background: '#238636',
                    border: 'none',
                    color: 'white',
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(35, 134, 54, 0.4)'
                  }}
                >
                  🔥 Confirmar VIRAL_ORGANICO
                </button>

                <button
                  onClick={async () => {
                    await handleAction(viralModalItem.id, 'ADS');
                    setViralModalItem(null);
                    setViralData(null);
                  }}
                  style={{
                    background: 'rgba(255, 107, 53, 0.2)',
                    border: '1px solid #FF6B35',
                    color: '#FF6B35',
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  🚀 Marcar como ADS
                </button>

                <button
                  onClick={async () => {
                    await handleAction(viralModalItem.id, 'ORGANICO');
                    setViralModalItem(null);
                    setViralData(null);
                  }}
                  style={{
                    background: '#21262D',
                    border: '1px solid #30363D',
                    color: '#8B949E',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  🌱 Normal
                </button>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
