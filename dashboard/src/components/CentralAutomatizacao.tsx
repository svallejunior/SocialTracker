'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Bot, Play, CheckCircle2, RefreshCw, Trash2,
  Settings, HelpCircle, Bell, CreditCard, LayoutGrid, Shield,
  Plus, ExternalLink, Sliders, Image as ImageIcon, Sparkles, Check,
  AlertCircle, ChevronDown, Zap, X, Calendar, Clock, Film, UploadCloud,
  FileText, Repeat, Shuffle, ArrowDownAZ, ListOrdered, Layers,
  ChevronLeft, ChevronRight
} from 'lucide-react';

interface Profile {
  username: string;
  meu_perfil?: number | boolean;
  status?: string;
  status_controle?: string;
  is_morreu?: boolean;
  foto_url?: string;
  foto_perfil?: string;
  seguidores?: number;
  [key: string]: any;
}

interface CentralAutomatizacaoProps {
  profiles: Profile[];
  onRefresh?: () => void;
}

interface AutomacaoConfig {
  reelsNaGrade: boolean;
  metaAccountId: string;
  displayName?: string;
}

export interface AgendamentoArquivo {
  name: string;
  savedName?: string;
  path?: string;
  size?: number;
  type?: string;
  previewUrl?: string | null;
}

export interface Agendamento {
  id: string;
  username: string;
  meta_account_id: string;
  tipo_postagem: 'FEED' | 'REELS' | 'STORIES';
  arquivos: AgendamentoArquivo[];
  ordem_arquivos: 'ALEATORIA' | 'ALFANUMERICA' | 'ORDEM_SELECAO';
  tipo_agendamento?: 'DATA_ESPECIFICA' | 'RECORRENTE';
  data_especifica?: string;
  duracao_recorrencia?: 'SEMPRE' | 'PERIODO';
  data_inicio?: string;
  data_fim?: string;
  dias_selecionados: string[];
  modo_hora: 'FIXA' | 'ALEATORIA' | 'VARIAR_MINUTOS';
  hora_fixa: string;
  hora_janela_inicio: string;
  hora_janela_fim: string;
  variacao_minutos: number;
  recorrencia: 'UNICA' | 'DIARIA' | 'SEMANAL' | 'DIAS_UTEIS' | 'PERSONALIZADA';
  legenda: string;
  status: 'AGENDADO' | 'PUBLICADO' | 'PAUSADO' | 'ERRO';
  meta_media_id?: string;
  publicado_em?: string;
  erro_detalhe?: string;
  criado_em?: string;
  atualizado_em?: string;
}

// Opção de Reels na Grade default DESABILITADA
const DEFAULT_CONFIG: AutomacaoConfig = {
  reelsNaGrade: false,
  metaAccountId: ''
};

function getPseudoMetaId(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash << 5) - hash + username.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  return `288${String(positive).padStart(8, '0')}472${username.length % 10}9`;
}

export function isAgendamentoNoDia(ag: Agendamento, dataObj: Date): boolean {
  if (ag.status === 'PAUSADO') return false;

  const diaSemanaMap: { [key: number]: string } = {
    0: 'DOM',
    1: 'SEG',
    2: 'TER',
    3: 'QUA',
    4: 'QUI',
    5: 'SEX',
    6: 'SAB'
  };
  const diaSemana = diaSemanaMap[dataObj.getDay()];
  const yyyy = String(dataObj.getFullYear());
  const mm = String(dataObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dataObj.getDate()).padStart(2, '0');
  const isoDate = `${yyyy}-${mm}-${dd}`;
  const brDate = `${dd}/${mm}/${yyyy}`;

  const isDataEspecifica = ag.tipo_agendamento === 'DATA_ESPECIFICA' || ag.recorrencia === 'UNICA';

  if (isDataEspecifica) {
    if (ag.data_especifica && (ag.data_especifica === isoDate || ag.data_especifica === brDate)) return true;
    if (Array.isArray(ag.dias_selecionados) && (ag.dias_selecionados.includes(isoDate) || ag.dias_selecionados.includes(brDate))) return true;
    if (ag.criado_em && ag.criado_em.startsWith(isoDate)) return true;
    return false;
  }

  // Validação de intervalo de período da rotina
  if (ag.duracao_recorrencia === 'PERIODO') {
    if (ag.data_inicio && isoDate < ag.data_inicio) return false;
    if (ag.data_fim && isoDate > ag.data_fim) return false;
  }

  if (ag.recorrencia === 'DIARIA' || (Array.isArray(ag.dias_selecionados) && ag.dias_selecionados.length === 7)) return true;
  if (ag.recorrencia === 'DIAS_UTEIS') {
    return ['SEG', 'TER', 'QUA', 'QUI', 'SEX'].includes(diaSemana);
  }

  if (Array.isArray(ag.dias_selecionados)) {
    if (ag.dias_selecionados.includes(diaSemana) || ag.dias_selecionados.includes(isoDate) || ag.dias_selecionados.includes(brDate)) return true;
  }

  return false;
}

function formatDaemonTime(dateStr?: string) {
  if (!dateStr) return 'Aguardando primeira verificação...';
  try {
    const [d, t] = dateStr.split(' ');
    const [year, month, day] = d.split('-');
    const [hour, min, sec] = t.split(':');
    const dt = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec));
    const now = new Date();
    const diffSec = Math.max(0, Math.floor((now.getTime() - dt.getTime()) / 1000));

    let relative = '';
    if (diffSec < 10) relative = 'agora mesmo';
    else if (diffSec < 60) relative = `há ${diffSec}s atrás`;
    else if (diffSec < 3600) relative = `há ${Math.floor(diffSec / 60)}min atrás`;
    else relative = `há ${Math.floor(diffSec / 3600)}h atrás`;

    return `${day}/${month}/${year} às ${hour}:${min}:${sec} (${relative})`;
  } catch (e) {
    return dateStr;
  }
}

const DIAS_SEMANA = [
  { key: 'SEG', label: 'Seg' },
  { key: 'TER', label: 'Ter' },
  { key: 'QUA', label: 'Qua' },
  { key: 'QUI', label: 'Qui' },
  { key: 'SEX', label: 'Sex' },
  { key: 'SAB', label: 'Sáb' },
  { key: 'DOM', label: 'Dom' }
];

// ─── Componente: Editor inline de Meta Account ID com botões ✓ e ✗ ───────────
function MetaIdEditor({ username, currentId, onSave }: {
  username: string;
  currentId: string;
  onSave: (newId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentId);

  // Sincroniza quando o valor externo muda
  React.useEffect(() => {
    if (!editing) setValue(currentId);
  }, [currentId, editing]);

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#6E7681' }}>Meta ID:</span>
        <span
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: currentId && !currentId.startsWith('288') ? '#58A6FF' : '#EF4444',
            background: '#0D1117',
            border: '1px solid #30363D',
            borderRadius: 4,
            padding: '2px 6px',
            cursor: 'pointer',
            maxWidth: 155,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
          title="Clique para editar o Meta Account ID"
          onClick={() => setEditing(true)}
        >
          {currentId || '⚠️ Clique para configurar'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#6E7681', flexShrink: 0 }}>Meta ID:</span>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            const trimmed = value.trim();
            if (trimmed) { onSave(trimmed); }
            setEditing(false);
          } else if (e.key === 'Escape') {
            setValue(currentId);
            setEditing(false);
          }
        }}
        placeholder="ex: 17841234567890"
        style={{
          background: '#0D1117',
          border: '1px solid #388BFD',
          borderRadius: 4,
          color: '#58A6FF',
          fontSize: 11,
          fontFamily: 'monospace',
          padding: '2px 6px',
          width: 140,
          outline: 'none'
        }}
      />
      {/* ✓ Confirmar */}
      <button
        type="button"
        title="Confirmar"
        onClick={() => {
          const trimmed = value.trim();
          if (trimmed) { onSave(trimmed); }
          setEditing(false);
        }}
        style={{
          background: '#166534',
          border: '1px solid #22C55E',
          borderRadius: 4,
          color: '#4ADE80',
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: 13,
          padding: '0px 6px',
          lineHeight: '20px',
          flexShrink: 0
        }}
      >
        ✓
      </button>
      {/* ✗ Cancelar */}
      <button
        type="button"
        title="Cancelar"
        onClick={() => {
          setValue(currentId);
          setEditing(false);
        }}
        style={{
          background: '#7F1D1D',
          border: '1px solid #EF4444',
          borderRadius: 4,
          color: '#FCA5A5',
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: 13,
          padding: '0px 6px',
          lineHeight: '20px',
          flexShrink: 0
        }}
      >
        ✗
      </button>
    </div>
  );
}

export default function CentralAutomatizacao({ profiles, onRefresh }: CentralAutomatizacaoProps) {
  const perfisAtivos = profiles.filter(p => {
    const isMeu = Number(p.meu_perfil) === 1 || p.meu_perfil === true;
    const statusGeral = (p.status || '').toUpperCase();
    const statusCtrl = (p.status_controle || '').toUpperCase();
    const isMorreu = p.is_morreu || statusGeral === 'MORREU' || statusCtrl.includes('MORREU') || statusGeral === 'INATIVO';
    return isMeu && !isMorreu;
  });

  const [configs, setConfigs] = useState<{ [username: string]: AutomacaoConfig }>({});
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);
  const [formOpenMap, setFormOpenMap] = useState<{ [username: string]: boolean }>({});
  const [editingAgendamentoMap, setEditingAgendamentoMap] = useState<{ [username: string]: Agendamento | null }>({});
  const [selectedDateMap, setSelectedDateMap] = useState<{ [username: string]: Date }>({});

  const [modalMetaApi, setModalMetaApi] = useState(false);
  const [savingMetaConfig, setSavingMetaConfig] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [metaApiSettings, setMetaApiSettings] = useState({
    appId: '',
    appSecret: '',
    accessToken: '',
    publicBaseUrl: '',
    webhookVerifyToken: ''
  });
  const [daemonStatus, setDaemonStatus] = useState<{
    ultima_verificacao?: string;
    status_daemon?: string;
    mensagem?: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchMetaConfig = async () => {
    try {
      const res = await fetch('/api/automacao/config');
      const data = await res.json();
      if (data.success) {
        if (data.config) {
          setMetaApiSettings(prev => ({
            ...prev,
            appId: data.config.app_id || prev.appId,
            appSecret: data.config.app_secret || prev.appSecret,
            accessToken: data.config.access_token || prev.accessToken,
            publicBaseUrl: data.config.public_base_url || prev.publicBaseUrl
          }));
        }
        if (data.daemon_status) {
          setDaemonStatus(data.daemon_status);
        }
      }
    } catch (e) {
      console.error('Erro ao buscar configuração Meta API:', e);
    }
  };

  const fetchAgendamentos = async () => {
    try {
      setLoadingAgendamentos(true);
      const res = await fetch('/api/automacao/agendamentos');
      const data = await res.json();
      if (data.success) {
        setAgendamentos(data.agendamentos || []);
      }
    } catch (err) {
      console.error('Erro ao buscar agendamentos:', err);
    } finally {
      setLoadingAgendamentos(false);
    }
  };

  useEffect(() => {
    fetchAgendamentos();
    fetchMetaConfig();
    try {
      const stored = localStorage.getItem('socialtracker_automacao_configs');
      if (stored) setConfigs(JSON.parse(stored));
      const storedApi = localStorage.getItem('socialtracker_meta_api_settings');
      if (storedApi) {
        const parsed = JSON.parse(storedApi);
        setMetaApiSettings(prev => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      console.error('Erro ao ler localStorage de automação:', e);
    }

    // Polling a cada 10 segundos para atualizar o status do daemon
    const interval = setInterval(() => {
      fetchMetaConfig();
      fetchAgendamentos();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSalvarMetaConfig = async () => {
    try {
      setSavingMetaConfig(true);
      const res = await fetch('/api/automacao/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaApiSettings)
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('socialtracker_meta_api_settings', JSON.stringify(metaApiSettings));
        showToast('Credenciais Meta API salvas com sucesso no banco!');
        setModalMetaApi(false);
      } else {
        alert(`Erro ao salvar: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Erro na requisição: ${e.message}`);
    } finally {
      setSavingMetaConfig(false);
    }
  };

  const handlePublicarAgora = async (id: string) => {
    if (!confirm('Deseja disparar esta publicação para o Instagram agora?')) {
      return;
    }
    try {
      setExecutingId(id);
      const res = await fetch('/api/automacao/executar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, force: true })
      });
      const data = await res.json();
      if (data.success) {
        showToast('🚀 Publicação disparada com sucesso!');
      } else {
        const errMsg = data.error || data.message || JSON.stringify(data);
        console.error(`[Automação] ❌ Erro ao publicar agendamento ${id}:`, errMsg);
        alert(`Falha ao publicar: ${errMsg}`);
      }
      fetchAgendamentos();
    } catch (e: any) {
      console.error(`[Automação] ❌ Erro na execução:`, e);
      alert(`Erro na execução: ${e.message}`);
    } finally {
      setExecutingId(null);
    }
  };

  const saveConfigs = (newConfigs: { [username: string]: AutomacaoConfig }) => {
    setConfigs(newConfigs);
    try {
      localStorage.setItem('socialtracker_automacao_configs', JSON.stringify(newConfigs));
    } catch (e) {
      console.error('Erro ao salvar configs:', e);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getConfigForUser = (username: string): AutomacaoConfig => {
    if (configs[username]) {
      return configs[username];
    }
    return {
      ...DEFAULT_CONFIG,
      metaAccountId: getPseudoMetaId(username),
      displayName: username
    };
  };

  const updateProfileConfig = (username: string, updates: Partial<AutomacaoConfig>) => {
    const current = getConfigForUser(username);
    const updated = { ...current, ...updates };
    const nextConfigs = { ...configs, [username]: updated };
    saveConfigs(nextConfigs);
    showToast(`Configurações de @${username} atualizadas!`);
  };

  const handleExcluirAgendamento = async (id: string) => {
    const ag = agendamentos.find(a => a.id === id);
    if (ag && ag.status === 'PUBLICADO') {
      alert('Esta postagem já foi publicada e não pode ser excluída.');
      return;
    }
    if (!confirm('Deseja realmente excluir esta postagem agendada?')) {
      return;
    }
    try {
      const res = await fetch(`/api/automacao/agendamentos?id=${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast('Agendamento excluído com sucesso!');
        fetchAgendamentos();
      } else {
        alert(`Erro ao excluir: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Erro na requisição: ${e.message}`);
    }
  };

  const handleSalvarAgendamento = async (agendamentoData: Partial<Agendamento>) => {
    try {
      const isEdit = !!agendamentoData.id;
      const res = await fetch('/api/automacao/agendamentos', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agendamentoData)
      });
      const data = await res.json();
      if (data.success) {
        showToast(isEdit ? 'Agendamento atualizado com sucesso!' : 'Postagem agendada com sucesso!');
        if (agendamentoData.username) {
          setFormOpenMap(prev => ({ ...prev, [agendamentoData.username!]: false }));
          setEditingAgendamentoMap(prev => ({ ...prev, [agendamentoData.username!]: null }));
        }
        fetchAgendamentos();
      } else {
        alert(`Erro ao salvar: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Erro na requisição: ${e.message}`);
    }
  };

  const formatarHorarioAgendado = (ag: Agendamento) => {
    let programacaoStr = '';
    const isDataEspecifica = ag.tipo_agendamento === 'DATA_ESPECIFICA' || ag.recorrencia === 'UNICA';

    if (isDataEspecifica) {
      const dataStr = ag.data_especifica || (ag.dias_selecionados?.[0] ? ag.dias_selecionados[0] : '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        const [y, m, d] = dataStr.split('-');
        programacaoStr = `📅 ${d}/${m}/${y}`;
      } else if (dataStr) {
        programacaoStr = `📅 ${dataStr}`;
      } else {
        programacaoStr = '📅 Data única';
      }
    } else {
      let diasStr = '';
      if (ag.dias_selecionados && ag.dias_selecionados.length > 0) {
        if (ag.dias_selecionados.length === 7) diasStr = 'Todos os dias';
        else if (ag.dias_selecionados.length === 5 && !ag.dias_selecionados.includes('SAB') && !ag.dias_selecionados.includes('DOM')) diasStr = 'Dias úteis';
        else diasStr = ag.dias_selecionados.join(', ');
      } else {
        diasStr = 'Recorrente';
      }

      let periodoStr = '';
      if (ag.duracao_recorrencia === 'PERIODO' && ag.data_fim) {
        const fimParts = ag.data_fim.split('-');
        const fimFmt = fimParts.length === 3 ? `${fimParts[2]}/${fimParts[1]}/${fimParts[0]}` : ag.data_fim;
        periodoStr = ` (até ${fimFmt})`;
      }
      programacaoStr = `🔄 ${diasStr}${periodoStr}`;
    }

    let horaStr = '';
    if (ag.modo_hora === 'FIXA') {
      horaStr = ag.hora_fixa || '18:00';
    } else if (ag.modo_hora === 'ALEATORIA') {
      horaStr = `${ag.hora_janela_inicio || '18:00'} ~ ${ag.hora_janela_fim || '21:00'} (Aleatório)`;
    } else if (ag.modo_hora === 'VARIAR_MINUTOS') {
      horaStr = `${ag.hora_fixa || '18:00'} (±${ag.variacao_minutos || 15}m)`;
    }

    return `${programacaoStr} às ${horaStr}`;
  };

  return (
    <div style={{ padding: '4px 0 40px 0', minHeight: '80vh', color: '#E6EDF3' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'linear-gradient(135deg, #1f2937, #111827)',
          border: '1px solid #3B82F6',
          color: '#60A5FA',
          padding: '12px 20px',
          borderRadius: 10,
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          zIndex: 9999,
          fontSize: 13,
          fontWeight: 600,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <CheckCircle2 size={16} color="#3B82F6" />
          {toastMessage}
        </div>
      )}

      {/* --- CABEÇALHO DA ABA --- */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 28,
        borderBottom: '1px solid #21262D',
        paddingBottom: 20
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.5px', margin: 0 }}>
              Automatização de Postagens
            </h1>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#388BFD',
              background: 'rgba(56, 139, 253, 0.15)',
              border: '1px solid rgba(56, 139, 253, 0.3)',
              padding: '2px 8px',
              borderRadius: 20
            }}>
              API Meta Graph
            </span>
          </div>
          <p style={{ color: '#8B949E', fontSize: 13, margin: '4px 0 0 0' }}>
            Agendamento inteligente e publicação automática de <strong>Reels</strong>, <strong>Feed (Posts/Carrosséis)</strong> e <strong>Stories</strong> via Meta API oficial.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={fetchAgendamentos}
            disabled={loadingAgendamentos}
            title="Atualizar Agendamentos"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#161B22',
              border: '1px solid #30363D',
              borderRadius: 8,
              padding: '8px 12px',
              color: '#8B949E',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} className={loadingAgendamentos ? 'animate-spin' : ''} />
            Atualizar
          </button>

          <button
            type="button"
            onClick={() => setModalMetaApi(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#2563EB',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              color: 'white',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)'
            }}
          >
            <Settings size={14} />
            Configurar API
          </button>
        </div>
      </div>

      {/* --- CARD DAEMON DA AUTOMAÇÃO (LARGURA TOTAL DA LINHA) --- */}
      <div style={{
        width: '100%',
        marginBottom: 24,
        background: 'linear-gradient(90deg, #0D1117 0%, #161B22 100%)',
        border: '1px solid #30363D',
        borderRadius: 12,
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Ponto Pulsante de Status do Daemon */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            flexShrink: 0
          }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#22C55E',
              boxShadow: '0 0 10px #22C55E'
            }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#F0F6FC' }}>
                Motor de Publicação Automática (Daemon)
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#4ADE80',
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '2px 8px',
                borderRadius: 12
              }}>
                ● ATIVO (Varredura a cada 30s)
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#8B949E', marginTop: 4 }}>
              Última verificação de agendamentos:{' '}
              <strong style={{ color: '#58A6FF', fontFamily: 'monospace', fontSize: 12 }}>
                {formatDaemonTime(daemonStatus?.ultima_verificacao)}
              </strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {metaApiSettings.publicBaseUrl && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#0D1117',
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #21262D'
            }}>
              <span style={{ fontSize: 11, color: '#6E7681', fontWeight: 600 }}>URL Pública:</span>
              <span style={{ fontFamily: 'monospace', color: '#A5D6FF', fontSize: 11 }}>
                {metaApiSettings.publicBaseUrl.replace('https://', '')}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              fetchMetaConfig();
              fetchAgendamentos();
              showToast("Status e agendamentos atualizados!");
            }}
            style={{
              background: '#21262D',
              border: '1px solid #30363D',
              borderRadius: 8,
              color: '#C9D1D9',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <RefreshCw size={13} />
            Atualizar Status
          </button>
        </div>
      </div>

      {/* --- AVISO SE NÃO HOUVER PERFIS ELEGÍVEIS --- */}
      {perfisAtivos.length === 0 ? (
        <div style={{
          background: '#161B22',
          border: '1px dashed #30363D',
          borderRadius: 12,
          padding: '48px 24px',
          textAlign: 'center',
          maxWidth: 600,
          margin: '40px auto'
        }}>
          <AlertCircle size={40} color="#F59E0B" style={{ margin: '0 auto 16px auto', display: 'block' }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 8 }}>
            Nenhum perfil próprio ativo encontrado
          </h3>
          <p style={{ color: '#8B949E', fontSize: 14, lineHeight: 1.5 }}>
            Apenas perfis marcados como <strong>"Meu Perfil"</strong> e com status diferente de <strong>MORREU</strong> aparecem nesta central de automação.
          </p>
        </div>
      ) : (
        /* --- GRID DE CARDS --- */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 18,
          alignItems: 'start'
        }}>
          {perfisAtivos.map(perfil => {
            const cfg = getConfigForUser(perfil.username);
            const selectedDate = selectedDateMap[perfil.username] || new Date();
            const hojeObj = new Date();
            const isDiaHoje = selectedDate.getDate() === hojeObj.getDate() &&
                              selectedDate.getMonth() === hojeObj.getMonth() &&
                              selectedDate.getFullYear() === hojeObj.getFullYear();

            const agendamentosDoPerfil = agendamentos.filter(
              a => a.username.toLowerCase() === perfil.username.toLowerCase()
            );

            // Filtra agendamentos apenas para a data selecionada/hoje
            const agendamentosDoDia = agendamentosDoPerfil.filter(
              ag => isAgendamentoNoDia(ag, selectedDate)
            );

            const totalReels = agendamentosDoDia.filter(a => a.tipo_postagem === 'REELS').length;
            const totalPost = agendamentosDoDia.filter(a => a.tipo_postagem === 'FEED').length;
            const totalStories = agendamentosDoDia.filter(a => a.tipo_postagem === 'STORIES').length;

            const isFormOpen = !!formOpenMap[perfil.username];
            const currentEditing = editingAgendamentoMap[perfil.username] || null;

            return (
              <div
                key={perfil.username}
                style={{
                  background: '#0D1117',
                  border: `1px solid ${isFormOpen ? '#388BFD' : '#21262D'}`,
                  borderRadius: 14,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  boxShadow: isFormOpen ? '0 8px 24px rgba(56, 139, 253, 0.15)' : '0 4px 12px rgba(0,0,0,0.3)',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {/* 1. Header do Card: Foto de Perfil + Username + ID Numérico */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #FF007A, #7100E2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 16,
                    color: 'white',
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '2px solid #30363D',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                  }}>
                    {(perfil.foto_url || perfil.foto_perfil) ? (
                      <img
                        src={perfil.foto_url || perfil.foto_perfil}
                        alt={perfil.username}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => {
                          (e.currentTarget.parentElement as HTMLElement).innerHTML =
                            `<span style="font-size:16px;font-weight:800;color:white">${perfil.username.slice(0, 2).toUpperCase()}</span>`;
                        }}
                      />
                    ) : (
                      perfil.username.slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: '#F0F6FC',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {cfg.displayName || perfil.username}
                    </div>
                    {/* Campo editável de Meta Account ID */}
                    <MetaIdEditor
                      username={perfil.username}
                      currentId={cfg.metaAccountId || ''}
                      onSave={(newId) => {
                        updateProfileConfig(perfil.username, { metaAccountId: newId });
                        // Também atualiza no banco de dados via API
                        fetch('/api/automacao/config', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            username: perfil.username,
                            meta_account_id: newId,
                            app_id: metaApiSettings.appId,
                            app_secret: metaApiSettings.appSecret,
                            access_token: metaApiSettings.accessToken,
                            public_base_url: metaApiSettings.publicBaseUrl
                          })
                        }).catch(() => {});
                        // Atualiza todos os agendamentos desse perfil no banco
                        fetch('/api/automacao/agendamentos/update-meta-id', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ username: perfil.username, meta_account_id: newId })
                        }).catch(() => {});
                        showToast(`Meta ID de @${perfil.username} salvo!`);
                      }}
                    />
                  </div>
                </div>

                {/* =========================================================================
                    CALENDÁRIO DE AGENDAMENTOS (Entre o Cabeçalho e os Totalizadores)
                ========================================================================= */}
                <CalendarioAgendamentos
                  agendamentos={agendamentosDoPerfil}
                  selectedDate={selectedDate}
                  onSelectDate={(d) => {
                    setSelectedDateMap(prev => {
                      const current = prev[perfil.username];
                      if (current && current.getDate() === d.getDate() && current.getMonth() === d.getMonth() && current.getFullYear() === d.getFullYear()) {
                        // Se clicar de novo no mesmo dia, volta para hoje
                        return { ...prev, [perfil.username]: new Date() };
                      }
                      return { ...prev, [perfil.username]: d };
                    });
                  }}
                />

                {/* =========================================================================
                    2. TOTALIZADOR DE AGENDAMENTOS DO DIA (SCORE)
                ========================================================================= */}
                <div style={{
                  borderTop: '1px solid #21262D',
                  paddingTop: 12
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: '#8B949E',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        📅 Totalizador do Dia
                      </span>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: isDiaHoje ? '#58A6FF' : '#FBBF24',
                        background: isDiaHoje ? 'rgba(56, 139, 253, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        border: isDiaHoje ? '1px solid rgba(56, 139, 253, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                        padding: '1px 6px',
                        borderRadius: 10
                      }}>
                        {isDiaHoje ? 'Hoje' : `${String(selectedDate.getDate()).padStart(2, '0')}/${String(selectedDate.getMonth() + 1).padStart(2, '0')}`}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: agendamentosDoDia.length > 0 ? '#34D399' : '#6E7681',
                      background: agendamentosDoDia.length > 0 ? 'rgba(52, 211, 153, 0.12)' : 'rgba(110, 118, 129, 0.12)',
                      padding: '2px 8px',
                      borderRadius: 12
                    }}>
                      {agendamentosDoDia.length} {agendamentosDoDia.length === 1 ? 'post no dia' : 'posts no dia'}
                    </span>
                  </div>

                  {/* 3 Pills de Contagem do Dia: REELS, POST, STORIES */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                    {/* REELS */}
                    <div style={{
                      background: 'rgba(236, 72, 153, 0.08)',
                      border: '1px solid rgba(236, 72, 153, 0.25)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#F472B6' }}>🎬 REELS</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#F472B6' }}>{totalReels}</span>
                    </div>

                    {/* POST / FEED */}
                    <div style={{
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#60A5FA' }}>🖼️ POST</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#60A5FA' }}>{totalPost}</span>
                    </div>

                    {/* STORIES */}
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#FBBF24' }}>📱 STORIES</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#FBBF24' }}>{totalStories}</span>
                    </div>
                  </div>

                  {/* =========================================================================
                      3. REELS NA GRADE
                  ========================================================================= */}
                  <div style={{
                    marginBottom: 12,
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: 8,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <span style={{
                        display: 'block',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#F0F6FC',
                        letterSpacing: '0.2px'
                      }}>
                        Reels na Grade
                      </span>
                      <span style={{
                        display: 'block',
                        fontSize: 9,
                        color: '#8B949E'
                      }}>
                        {cfg.reelsNaGrade ? 'Publicar no feed principal e na aba Reels' : 'Publicar apenas na aba Reels (recomendado)'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => updateProfileConfig(perfil.username, { reelsNaGrade: !cfg.reelsNaGrade })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      <div style={{
                        width: 32,
                        height: 18,
                        borderRadius: 10,
                        background: cfg.reelsNaGrade ? '#2563EB' : '#374151',
                        position: 'relative',
                        transition: 'background 0.2s',
                        display: 'inline-block',
                        flexShrink: 0
                      }}>
                        <div style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: 'white',
                          position: 'absolute',
                          top: 2,
                          left: cfg.reelsNaGrade ? 16 : 2,
                          transition: 'left 0.2s'
                        }} />
                      </div>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: cfg.reelsNaGrade ? '#60A5FA' : '#8B949E',
                        letterSpacing: '0.3px',
                        minWidth: 80,
                        textAlign: 'right'
                      }}>
                        {cfg.reelsNaGrade ? 'NA GRADE' : 'SOMENTE REELS'}
                      </span>
                    </button>
                  </div>

                  {/* =========================================================================
                      4. BOTÃO DE AGENDAR POSTAGEM / LISTA DE AGENDAMENTOS DO DIA
                  ========================================================================= */}
                  {agendamentosDoDia.length === 0 && !isFormOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAgendamentoMap(prev => ({ ...prev, [perfil.username]: null }));
                        setFormOpenMap(prev => ({ ...prev, [perfil.username]: true }));
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: '1px dashed #3B82F6',
                        background: 'rgba(59, 130, 246, 0.08)',
                        color: '#60A5FA',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        transition: 'all 0.2s',
                        marginBottom: 4
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.16)';
                        e.currentTarget.style.borderColor = '#60A5FA';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                        e.currentTarget.style.borderColor = '#3B82F6';
                      }}
                    >
                      <Plus size={15} />
                      AGENDAR POSTAGEM
                    </button>
                  )}

                  {agendamentosDoDia.length > 0 && !isFormOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
                      {agendamentosDoDia.map(ag => (
                        <div
                          key={ag.id}
                          style={{
                            background: '#161B22',
                            border: '1px solid #30363D',
                            borderRadius: 8,
                            padding: '9px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            cursor: 'pointer',
                            transition: 'border-color 0.15s, background 0.15s'
                          }}
                          onClick={() => {
                            setEditingAgendamentoMap(prev => ({ ...prev, [perfil.username]: ag }));
                            setFormOpenMap(prev => ({ ...prev, [perfil.username]: true }));
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#388BFD';
                            e.currentTarget.style.background = '#1C2128';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = '#30363D';
                            e.currentTarget.style.background = '#161B22';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '3px 7px',
                              borderRadius: 5,
                              flexShrink: 0,
                              background: ag.tipo_postagem === 'REELS' ? 'rgba(236,72,153,0.2)' : ag.tipo_postagem === 'FEED' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)',
                              color: ag.tipo_postagem === 'REELS' ? '#F472B6' : ag.tipo_postagem === 'FEED' ? '#60A5FA' : '#FBBF24'
                            }}>
                              {ag.tipo_postagem === 'FEED' ? (ag.arquivos && ag.arquivos.length > 1 ? `🖼️ Carrossel (${ag.arquivos.length})` : '🖼️ Feed') : ag.tipo_postagem === 'REELS' ? '🎬 Reels' : '📱 Stories'}
                            </span>

                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#C9D1D9' }}>
                              <span>{formatarHorarioAgendado(ag)}</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {ag.status === 'PUBLICADO' ? (
                              <span
                                title={ag.publicado_em ? `Publicado em ${ag.publicado_em} (ID: ${ag.meta_media_id || 'N/A'})` : 'Publicado no Instagram com sucesso!'}
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  background: 'rgba(52,211,153,0.15)',
                                  border: '1px solid rgba(52,211,153,0.35)',
                                  color: '#34D399',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'help'
                                }}
                              >
                                <Check size={12} strokeWidth={2.8} />
                              </span>
                            ) : ag.status === 'ERRO' ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const errMsg = ag.erro_detalhe || 'Erro na publicação Meta API';
                                  if (navigator.clipboard) {
                                    navigator.clipboard.writeText(errMsg);
                                    showToast('📋 Erro copiado para a área de transferência!');
                                  }
                                  console.error(`[Automação @${ag.username} | ID ${ag.id}] Erro Meta API:`, errMsg);
                                }}
                                title={`❌ Erro: ${ag.erro_detalhe || 'Erro na publicação Meta API'}\n(Clique para copiar o erro)`}
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  background: 'rgba(239,68,68,0.15)',
                                  border: '1px solid rgba(239,68,68,0.35)',
                                  color: '#F87171',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                                }}
                              >
                                <X size={12} strokeWidth={2.8} />
                              </span>
                            ) : (
                              <span style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: '#60A5FA',
                                background: 'rgba(96,165,250,0.1)',
                                border: '1px solid rgba(96,165,250,0.2)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#60A5FA', display: 'inline-block' }} />
                                AGENDADO
                              </span>
                            )}

                            {/* Botão de Disparo Imediato */}
                            {ag.status !== 'PUBLICADO' && (
                              <button
                                type="button"
                                title="Publicar no Instagram agora"
                                disabled={executingId === ag.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePublicarAgora(ag.id);
                                }}
                                style={{
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                  color: '#60A5FA',
                                  cursor: executingId === ag.id ? 'not-allowed' : 'pointer',
                                  padding: '3px 7px',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  borderRadius: 4,
                                  transition: 'all 0.15s'
                                }}
                              >
                                {executingId === ag.id ? (
                                  <RefreshCw size={11} className="animate-spin" />
                                ) : (
                                  <Play size={11} />
                                )}
                                Publicar Agora
                              </button>
                            )}

                            {/* Exclusão condicional */}
                            {ag.status !== 'PUBLICADO' && (
                              <button
                                type="button"
                                title="Excluir agendamento"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExcluirAgendamento(ag.id);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#8B949E',
                                  cursor: 'pointer',
                                  padding: 4,
                                  display: 'flex',
                                  borderRadius: 4
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                                onMouseLeave={e => e.currentTarget.style.color = '#8B949E'}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingAgendamentoMap(prev => ({ ...prev, [perfil.username]: null }));
                          setFormOpenMap(prev => ({ ...prev, [perfil.username]: true }));
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 6,
                          border: '1px dashed #30363D',
                          background: 'transparent',
                          color: '#8B949E',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#388BFD';
                          e.currentTarget.style.color = '#388BFD';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = '#30363D';
                          e.currentTarget.style.color = '#8B949E';
                        }}
                      >
                        <Plus size={13} />
                        Adicionar outro agendamento
                      </button>
                    </div>
                  )}

                  {/* FORMULÁRIO EXPANDIDO DE AGENDAMENTO */}
                  {isFormOpen && (
                    <FormularioAgendamento
                      metaAccountId={cfg.metaAccountId || getPseudoMetaId(perfil.username)}
                      username={perfil.username}
                      initialData={currentEditing}
                      onSave={handleSalvarAgendamento}
                      onCancel={() => {
                        setFormOpenMap(prev => ({ ...prev, [perfil.username]: false }));
                        setEditingAgendamentoMap(prev => ({ ...prev, [perfil.username]: null }));
                      }}
                    />
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* --- MODAL CONFIGURAR META API --- */}
      {modalMetaApi && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#161B22',
            border: '1px solid #30363D',
            borderRadius: 12,
            padding: 24,
            width: 480,
            maxWidth: '90vw'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', margin: 0 }}>
                Configuração da Meta Graph API
              </h3>
              <button
                type="button"
                onClick={() => setModalMetaApi(false)}
                style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 16, lineHeight: 1.4 }}>
              Insira o App ID, App Secret e o User/Page Access Token da sua aplicação Meta for Developers com permissões <code style={{ color: '#60A5FA', background: '#0D1117', padding: '2px 4px', borderRadius: 4 }}>instagram_content_publish</code>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8B949E', marginBottom: 4 }}>
                  Meta App ID
                </label>
                <input
                  type="text"
                  placeholder="ex: 183749281928472"
                  value={metaApiSettings.appId}
                  onChange={e => setMetaApiSettings({ ...metaApiSettings, appId: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#0D1117',
                    border: '1px solid #30363D',
                    borderRadius: 6,
                    color: 'white',
                    padding: '8px 12px',
                    fontSize: 12
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8B949E', marginBottom: 4 }}>
                  Meta App Secret
                </label>
                <input
                  type="password"
                  placeholder="••••••••••••••••••••••••"
                  value={metaApiSettings.appSecret}
                  onChange={e => setMetaApiSettings({ ...metaApiSettings, appSecret: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#0D1117',
                    border: '1px solid #30363D',
                    borderRadius: 6,
                    color: 'white',
                    padding: '8px 12px',
                    fontSize: 12
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#C9D1D9' }}>
                    User Access Token (Meta API)
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          const trimmed = text.trim();
                          if (trimmed.startsWith('EAA') || trimmed.length > 20) {
                            setMetaApiSettings(prev => ({ ...prev, accessToken: trimmed }));
                            showToast('📋 Novo token colado da memória!');
                          } else if (trimmed) {
                            if (confirm(`O texto na área de transferência não começa com 'EAA'. Deseja colar assim mesmo?`)) {
                              setMetaApiSettings(prev => ({ ...prev, accessToken: trimmed }));
                              showToast('📋 Texto colado!');
                            }
                          } else {
                            alert('Nenhum texto encontrado na área de transferência.');
                          }
                        } catch (err) {
                          alert('Não foi possível ler a área de transferência automaticamente. Por favor, cole usando Ctrl+V no campo de texto.');
                        }
                      }}
                      style={{
                        background: '#1F2937',
                        border: '1px solid #3B82F6',
                        color: '#60A5FA',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      📋 Colar da Memória
                    </button>

                    {metaApiSettings.accessToken && (
                      <button
                        type="button"
                        onClick={() => {
                          setMetaApiSettings(prev => ({ ...prev, accessToken: '' }));
                          showToast('🗑️ Token antigo limpo! Cole o novo token.');
                        }}
                        style={{
                          background: '#371B1E',
                          border: '1px solid #EF4444',
                          color: '#FCA5A5',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Limpar
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={3}
                  placeholder="Clique no botão 'Colar da Memória' ou pressione Ctrl+V para colar o token recém-copiado..."
                  value={metaApiSettings.accessToken}
                  onChange={e => setMetaApiSettings({ ...metaApiSettings, accessToken: e.target.value })}
                  onFocus={async () => {
                    // Auto-paste se o campo estiver vazio
                    if (!metaApiSettings.accessToken) {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text && text.trim().startsWith('EAA')) {
                          setMetaApiSettings(prev => ({ ...prev, accessToken: text.trim() }));
                          showToast('📋 Novo token colado da memória!');
                        }
                      } catch (err) {}
                    }
                  }}
                  style={{
                    width: '100%',
                    background: '#0D1117',
                    border: metaApiSettings.accessToken ? '1px solid #22C55E' : '1px solid #30363D',
                    borderRadius: 6,
                    color: metaApiSettings.accessToken ? '#4ADE80' : '#8B949E',
                    padding: '8px 12px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    resize: 'vertical'
                  }}
                />
                <span style={{ fontSize: 10, color: '#8B949E', marginTop: 4, display: 'block' }}>
                  💡 Ao salvar, o SocialTracker converterá este token para <strong>Long-Lived Token (60 Dias)</strong> e atualizará o arquivo <code style={{ color: '#60A5FA' }}>.env</code>.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8B949E', marginBottom: 4 }}>
                  URL Base Pública do SocialTracker (Para a Meta baixar as mídias)
                </label>
                <input
                  type="text"
                  placeholder="ex: https://socialtracker.seudominio.com ou http://IP_VPS:3000"
                  value={metaApiSettings.publicBaseUrl}
                  onChange={e => setMetaApiSettings({ ...metaApiSettings, publicBaseUrl: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#0D1117',
                    border: '1px solid #30363D',
                    borderRadius: 6,
                    color: 'white',
                    padding: '8px 12px',
                    fontSize: 12
                  }}
                />
                <span style={{ fontSize: 10, color: '#8B949E', marginTop: 3, display: 'block' }}>
                  Deixe vazio para usar o padrão local (<code style={{ color: '#60A5FA' }}>http://localhost:3000</code>). Na VPS, informe o IP ou domínio público.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setModalMetaApi(false)}
                style={{
                  background: '#21262D',
                  border: '1px solid #30363D',
                  color: '#C9D1D9',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingMetaConfig}
                onClick={handleSalvarMetaConfig}
                style={{
                  background: '#2563EB',
                  border: 'none',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: savingMetaConfig ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {savingMetaConfig && <RefreshCw size={12} className="animate-spin" />}
                Salvar Credenciais no Banco
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// =========================================================================
// SUB-COMPONENTE: CALENDÁRIO DE AGENDAMENTOS
// =========================================================================
interface CalendarioAgendamentosProps {
  agendamentos: Agendamento[];
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
}

function CalendarioAgendamentos({ agendamentos, selectedDate, onSelectDate }: CalendarioAgendamentosProps) {
  const [dataVisualizacao, setDataVisualizacao] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });
  const [selectedDayInfo, setSelectedDayInfo] = useState<{
    dateStr: string;
    posts: Agendamento[];
  } | null>(null);

  const mesAtual = dataVisualizacao.getMonth();
  const anoAtual = dataVisualizacao.getFullYear();

  const nomesMeses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const navegarMes = (delta: number) => {
    setDataVisualizacao(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setSelectedDayInfo(null);
  };

  const irParaHoje = () => {
    const hoje = new Date();
    setDataVisualizacao(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    setSelectedDayInfo(null);
    if (onSelectDate) onSelectDate(hoje);
  };

  // Obter primeiro dia do mês e total de dias
  const primeiroDiaSemana = new Date(anoAtual, mesAtual, 1).getDay(); // 0 = Domingo, 1 = Seg...
  const totalDiasMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
  const totalDiasMesAnterior = new Date(anoAtual, mesAtual, 0).getDate();

  const getAgendamentosDoDia = (dia: number, mes: number, ano: number): Agendamento[] => {
    const dataObj = new Date(ano, mes, dia);
    return agendamentos.filter(ag => isAgendamentoNoDia(ag, dataObj));
  };

  // Gerar células do calendário
  const celulas: { dia: number; mes: number; ano: number; isOutroMes: boolean }[] = [];

  // Dias do mês anterior para preencher a primeira semana
  for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
    celulas.push({
      dia: totalDiasMesAnterior - i,
      mes: mesAtual - 1,
      ano: mesAtual === 0 ? anoAtual - 1 : anoAtual,
      isOutroMes: true
    });
  }

  // Dias do mês atual
  for (let d = 1; d <= totalDiasMes; d++) {
    celulas.push({
      dia: d,
      mes: mesAtual,
      ano: anoAtual,
      isOutroMes: false
    });
  }

  // Dias do próximo mês para completar semanas
  const resto = celulas.length % 7;
  if (resto !== 0) {
    const faltam = 7 - resto;
    for (let p = 1; p <= faltam; p++) {
      celulas.push({
        dia: p,
        mes: mesAtual + 1,
        ano: mesAtual === 11 ? anoAtual + 1 : anoAtual,
        isOutroMes: true
      });
    }
  }

  const hoje = new Date();
  const hojeDia = hoje.getDate();
  const hojeMes = hoje.getMonth();
  const hojeAno = hoje.getFullYear();

  const isMesAtualHoje = mesAtual === hojeMes && anoAtual === hojeAno;

  // Contagem de dias com agendamentos no mês atual
  let diasComAgendamentoMes = 0;
  for (let d = 1; d <= totalDiasMes; d++) {
    if (getAgendamentosDoDia(d, mesAtual, anoAtual).length > 0) {
      diasComAgendamentoMes++;
    }
  }

  return (
    <div style={{
      borderTop: '1px solid #21262D',
      paddingTop: 12,
      marginBottom: 4
    }}>
      {/* Cabeçalho do Calendário */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={12} color="#388BFD" />
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            color: '#8B949E',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Calendário ({nomesMeses[mesAtual]} {anoAtual})
          </span>
          {diasComAgendamentoMes > 0 && (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#388BFD',
              background: 'rgba(56, 139, 253, 0.15)',
              padding: '1px 5px',
              borderRadius: 10
            }}>
              {diasComAgendamentoMes}d ativos
            </span>
          )}
        </div>

        {/* Controles de Navegação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {!isMesAtualHoje && (
            <button
              type="button"
              onClick={irParaHoje}
              title="Ir para o mês atual"
              style={{
                background: '#161B22',
                border: '1px solid #30363D',
                borderRadius: 4,
                padding: '2px 5px',
                fontSize: 9,
                fontWeight: 600,
                color: '#8B949E',
                cursor: 'pointer'
              }}
            >
              Hoje
            </button>
          )}
          <button
            type="button"
            onClick={() => navegarMes(-1)}
            title="Mês anterior"
            style={{
              background: '#161B22',
              border: '1px solid #30363D',
              borderRadius: 4,
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8B949E',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={12} />
          </button>
          <button
            type="button"
            onClick={() => navegarMes(1)}
            title="Próximo mês"
            style={{
              background: '#161B22',
              border: '1px solid #30363D',
              borderRadius: 4,
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8B949E',
              cursor: 'pointer'
            }}
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Grade do Calendário */}
      <div style={{
        background: '#0D1117',
        border: '1px solid #21262D',
        borderRadius: 8,
        padding: 6
      }}>
        {/* Cabeçalho dos Dias da Semana */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
          textAlign: 'center',
          marginBottom: 4,
          borderBottom: '1px solid #161B22',
          paddingBottom: 3
        }}>
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
            <div key={i} style={{
              fontSize: 9,
              fontWeight: 700,
              color: i === 0 || i === 6 ? '#6E7681' : '#8B949E'
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Células de Dias */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2
        }}>
          {celulas.map((c, i) => {
            const dataCel = new Date(c.ano, c.mes, c.dia);
            const ags = getAgendamentosDoDia(c.dia, c.mes, c.ano);
            const temAgendamento = ags.length > 0;
            const isHoje = c.dia === hojeDia && c.mes === hojeMes && c.ano === hojeAno;
            const hojeDataObj = new Date(hojeAno, hojeMes, hojeDia);
            const isPassado = dataCel < hojeDataObj;

            const isSelected = selectedDate
              ? (c.dia === selectedDate.getDate() && c.mes === selectedDate.getMonth() && c.ano === selectedDate.getFullYear())
              : false;

            const temReels = ags.some(a => a.tipo_postagem === 'REELS');
            const temFeed = ags.some(a => a.tipo_postagem === 'FEED');
            const temStories = ags.some(a => a.tipo_postagem === 'STORIES');

            return (
              <div
                key={i}
                onClick={() => {
                  if (onSelectDate) {
                    onSelectDate(dataCel);
                  }
                }}
                title={
                  temAgendamento
                    ? `${c.dia}/${c.mes + 1}: ${ags.length} post(s) agendado(s)${isPassado ? ' (passado)' : ''}`
                    : `${c.dia}/${c.mes + 1}`
                }
                style={{
                  height: 26,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: temAgendamento || isHoje || isSelected ? 700 : 400,
                  cursor: 'pointer',
                  opacity: c.isOutroMes ? 0.25 : 1,
                  background: isSelected
                    ? 'rgba(56, 139, 253, 0.45)'
                    : isPassado && temAgendamento
                      ? '#828385'
                      : temAgendamento
                        ? 'rgba(56, 139, 253, 0.14)'
                        : 'transparent',
                  border: isHoje
                    ? '1px solid #388BFD'
                    : isSelected
                      ? '1px solid #58A6FF'
                      : isPassado && temAgendamento
                        ? '1px solid #828385'
                        : temAgendamento
                          ? '1px solid rgba(56, 139, 253, 0.3)'
                          : '1px solid transparent',
                  color: isHoje
                    ? '#58A6FF'
                    : isSelected
                      ? '#FFFFFF'
                      : isPassado && temAgendamento
                        ? '#FFFFFF'
                        : temAgendamento
                          ? '#E6EDF3'
                          : c.isOutroMes
                            ? '#484F58'
                            : '#8B949E',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <span>{c.dia}</span>

                {/* Marcadores coloridos dos tipos de postagem */}
                {temAgendamento && (
                  <div style={{ display: 'flex', gap: 1.5, marginTop: -2 }}>
                    {temReels && (
                      <span style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: '#F472B6' }} />
                    )}
                    {temFeed && (
                      <span style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: '#60A5FA' }} />
                    )}
                    {temStories && (
                      <span style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: '#FBBF24' }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini Popover de Detalhes do Dia Selecionado */}
      {selectedDayInfo && (
        <div style={{
          marginTop: 6,
          background: '#161B22',
          border: '1px solid #388BFD',
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 11,
          animation: 'fadeIn 0.15s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: '#58A6FF' }}>
              📅 Programação para {selectedDayInfo.dateStr}:
            </span>
            <button
              type="button"
              onClick={() => setSelectedDayInfo(null)}
              style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', padding: 0 }}
            >
              <X size={12} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selectedDayInfo.posts.map((post, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#C9D1D9' }}>
                <span>
                  {post.tipo_postagem === 'REELS' && '🎬 Reels'}
                  {post.tipo_postagem === 'FEED' && '🖼️ Feed'}
                  {post.tipo_postagem === 'STORIES' && '📱 Stories'}
                  {' '}({post.modo_hora === 'FIXA' ? post.hora_fixa : `${post.hora_janela_inicio} ~ ${post.hora_janela_fim}`})
                </span>
                <span style={{ color: '#8B949E', fontSize: 10 }}>
                  {post.arquivos?.length || 0} mídia(s)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// SUB-COMPONENTE: FORMULÁRIO EXPANDIDO DE AGENDAMENTO
// =========================================================================
interface FormularioAgendamentoProps {
  username: string;
  metaAccountId: string;
  initialData?: Agendamento | null;
  onSave: (data: Partial<Agendamento>) => Promise<void>;
  onCancel: () => void;
}

function FormularioAgendamento({
  username,
  metaAccountId,
  initialData,
  onSave,
  onCancel
}: FormularioAgendamentoProps) {
  const [tipoPostagem, setTipoPostagem] = useState<'FEED' | 'REELS' | 'STORIES'>(
    initialData?.tipo_postagem || 'REELS'
  );
  const [arquivos, setArquivos] = useState<AgendamentoArquivo[]>(
    initialData?.arquivos || []
  );
  const [ordemArquivos, setOrdemArquivos] = useState<'ALEATORIA' | 'ALFANUMERICA' | 'ORDEM_SELECAO'>(
    initialData?.ordem_arquivos || 'ORDEM_SELECAO'
  );

  // 3. SELEÇÃO: DATA ESPECÍFICA vs RECORRENTE
  const [tipoAgendamento, setTipoAgendamento] = useState<'DATA_ESPECIFICA' | 'RECORRENTE'>(() => {
    if (initialData?.tipo_agendamento) return initialData.tipo_agendamento;
    if (initialData?.recorrencia && initialData.recorrencia !== 'UNICA') return 'RECORRENTE';
    if (initialData?.dias_selecionados?.[0]?.includes('-')) return 'DATA_ESPECIFICA';
    return 'DATA_ESPECIFICA';
  });

  // Campos de Data Específica
  const [dataEspecifica, setDataEspecifica] = useState<string>(() => {
    if (initialData?.data_especifica) return initialData.data_especifica;
    if (initialData?.dias_selecionados?.[0]?.includes('-')) return initialData.dias_selecionados[0];
    return new Date().toISOString().split('T')[0];
  });

  // Campos de Recorrência
  const [duracaoRecorrencia, setDuracaoRecorrencia] = useState<'SEMPRE' | 'PERIODO'>(() => {
    if (initialData?.duracao_recorrencia) return initialData.duracao_recorrencia;
    if (initialData?.data_fim) return 'PERIODO';
    return 'SEMPRE';
  });
  const [dataInicio, setDataInicio] = useState<string>(() => {
    if (initialData?.data_inicio) return initialData.data_inicio;
    return new Date().toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState<string>(() => {
    if (initialData?.data_fim) return initialData.data_fim;
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [diasSelecionados, setDiasSelecionados] = useState<string[]>(() => {
    if (initialData?.dias_selecionados && initialData.dias_selecionados.length > 0) {
      const validWeekDays = initialData.dias_selecionados.filter(d =>
        ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'].includes(d)
      );
      if (validWeekDays.length > 0) return validWeekDays;
    }
    return ['SEG', 'QUA', 'SEX'];
  });

  // Campos de Horário
  const [modoHora, setModoHora] = useState<'FIXA' | 'ALEATORIA' | 'VARIAR_MINUTOS'>(
    initialData?.modo_hora || 'FIXA'
  );
  const [horaFixa, setHoraFixa] = useState<string>(
    initialData?.hora_fixa || '18:30'
  );
  const [horaJanelaInicio, setHoraJanelaInicio] = useState<string>(
    initialData?.hora_janela_inicio || '18:00'
  );
  const [horaJanelaFim, setHoraJanelaFim] = useState<string>(
    initialData?.hora_janela_fim || '21:00'
  );
  const [variacaoMinutos, setVariacaoMinutos] = useState<number>(
    initialData?.variacao_minutos || 15
  );

  // Legenda
  const [legenda, setLegenda] = useState<string>(
    initialData?.legenda || ''
  );

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('metaAccountId', metaAccountId || username);

      for (let i = 0; i < filesList.length; i++) {
        formData.append('files', filesList[i]);
      }

      const res = await fetch('/api/automacao/upload', {
        method: 'POST',
        body: formData
      });
      const json = await res.json();

      if (json.success && json.files) {
        setArquivos(prev => [...prev, ...json.files]);
      } else {
        alert(`Erro no upload: ${json.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) {
      alert(`Falha no upload de arquivos: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveArquivo = (index: number) => {
    setArquivos(prev => prev.filter((_, i) => i !== index));
  };

  const toggleDia = (dia: string) => {
    if (diasSelecionados.includes(dia)) {
      setDiasSelecionados(prev => prev.filter(d => d !== dia));
    } else {
      setDiasSelecionados(prev => [...prev, dia]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (tipoAgendamento === 'DATA_ESPECIFICA') {
      if (!dataEspecifica) {
        alert('Por favor, selecione a data da postagem.');
        return;
      }
    } else {
      if (diasSelecionados.length === 0) {
        alert('Por favor, selecione ao menos 1 dia da semana para a postagem recorrente.');
        return;
      }
      if (duracaoRecorrencia === 'PERIODO' && !dataFim) {
        alert('Por favor, selecione a data de término do período.');
        return;
      }
    }

    setSaving(true);
    try {
      const payloadDias = tipoAgendamento === 'DATA_ESPECIFICA' ? [dataEspecifica] : diasSelecionados;
      const payloadRecorrencia = tipoAgendamento === 'DATA_ESPECIFICA'
        ? 'UNICA'
        : (diasSelecionados.length === 7 ? 'DIARIA' : (diasSelecionados.length === 5 && !diasSelecionados.includes('SAB') && !diasSelecionados.includes('DOM') ? 'DIAS_UTEIS' : 'SEMANAL'));

      await onSave({
        id: initialData?.id,
        username,
        meta_account_id: metaAccountId,
        tipo_postagem: tipoPostagem,
        arquivos,
        ordem_arquivos: ordemArquivos,
        tipo_agendamento: tipoAgendamento,
        data_especifica: tipoAgendamento === 'DATA_ESPECIFICA' ? dataEspecifica : '',
        duracao_recorrencia: tipoAgendamento === 'RECORRENTE' ? duracaoRecorrencia : 'SEMPRE',
        data_inicio: tipoAgendamento === 'RECORRENTE' && duracaoRecorrencia === 'PERIODO' ? dataInicio : '',
        data_fim: tipoAgendamento === 'RECORRENTE' && duracaoRecorrencia === 'PERIODO' ? dataFim : '',
        dias_selecionados: payloadDias,
        modo_hora: modoHora,
        hora_fixa: horaFixa,
        hora_janela_inicio: horaJanelaInicio,
        hora_janela_fim: horaJanelaFim,
        variacao_minutos: variacaoMinutos,
        recorrencia: payloadRecorrencia,
        legenda: legenda,
        status: 'AGENDADO'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: '#161B22',
        border: '1px solid #388BFD',
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #30363D', paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={14} color="#388BFD" />
          <span style={{ fontSize: 12, fontWeight: 800, color: 'white' }}>
            {initialData ? '✏️ Editar Agendamento' : '➕ Novo Agendamento de Postagem'}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* 1. TIPO DE POSTAGEM */}
      <div>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase', marginBottom: 6 }}>
          1. Tipo de Postagem
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[
            { key: 'FEED', label: '🖼️ Feed (Post / Carrossel)' },
            { key: 'REELS', label: '🎬 Reels' },
            { key: 'STORIES', label: '📱 Stories' }
          ].map(t => {
            const isSelected = tipoPostagem === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTipoPostagem(t.key as any)}
                style={{
                  padding: '7px 4px',
                  borderRadius: 6,
                  border: `1px solid ${isSelected ? '#388BFD' : '#30363D'}`,
                  background: isSelected ? 'rgba(56, 139, 253, 0.15)' : '#0D1117',
                  color: isSelected ? '#60A5FA' : '#C9D1D9',
                  fontSize: 10,
                  fontWeight: isSelected ? 800 : 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s'
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. SELEÇÃO DE ARQUIVOS COM DRAG AND DROP */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
            2. Selecione os Arquivos
          </label>
          <span style={{ fontSize: 9, color: '#388BFD', fontWeight: 600 }}>
            {arquivos.length} {arquivos.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}
          </span>
        </div>

        {/* Dropzone */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={e => handleFileUpload(e.target.files)}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            handleFileUpload(e.dataTransfer.files);
          }}
          style={{
            border: `1.5px dashed ${isDragOver ? '#388BFD' : '#30363D'}`,
            borderRadius: 8,
            padding: '14px 10px',
            textAlign: 'center',
            background: isDragOver ? 'rgba(56, 139, 253, 0.1)' : '#0D1117',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <UploadCloud size={20} color={isDragOver ? '#388BFD' : '#8B949E'} style={{ margin: '0 auto 4px auto' }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: '#F0F6FC' }}>
            {uploading ? 'Enviando arquivos...' : 'Arraste fotos ou vídeos aqui, ou clique para selecionar'}
          </div>
          <div style={{ fontSize: 9, color: '#6E7681', marginTop: 2 }}>
            Armazenamento: <code style={{ color: '#8B949E' }}>C:\Projetos\SocialTracker\automacao\{metaAccountId}</code>
          </div>
        </div>

        {/* Preview dos Arquivos Selecionados */}
        {arquivos.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {arquivos.map((arq, idx) => (
              <div
                key={idx}
                style={{
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  borderRadius: 6,
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 10
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                  {arq.previewUrl ? (
                    <img src={arq.previewUrl} alt="" style={{ width: 20, height: 20, borderRadius: 3, objectFit: 'cover' }} />
                  ) : (
                    <Film size={12} color="#60A5FA" />
                  )}
                  <span style={{ color: '#C9D1D9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {idx + 1}. {arq.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveArquivo(idx)}
                  style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: 2 }}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ORDEM DE POSTAGEM: Fica abaixo do número 2 e SÓ APARECE SE FOR SELECIONADO MAIS DE 1 ARQUIVO */}
        {arquivos.length > 1 && (
          <div style={{
            marginTop: 10,
            background: '#0D1117',
            border: '1px solid #388BFD',
            borderRadius: 8,
            padding: '10px 12px',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Shuffle size={12} color="#60A5FA" />
              <label style={{ fontSize: 10, fontWeight: 700, color: '#60A5FA', textTransform: 'uppercase' }}>
                Ordem de Postagem ({arquivos.length} arquivos selecionados)
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[
                { key: 'ALEATORIA', label: '🔀 ALEATÓRIA' },
                { key: 'ALFANUMERICA', label: '🔤 ALFANUMÉRICA' },
                { key: 'ORDEM_SELECAO', label: '🔢 ORDEM DE SELEÇÃO' }
              ].map(o => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setOrdemArquivos(o.key as any)}
                  style={{
                    padding: '7px 4px',
                    borderRadius: 5,
                    border: `1px solid ${ordemArquivos === o.key ? '#388BFD' : '#30363D'}`,
                    background: ordemArquivos === o.key ? 'rgba(56, 139, 253, 0.25)' : '#161B22',
                    color: ordemArquivos === o.key ? '#60A5FA' : '#8B949E',
                    fontSize: 9,
                    fontWeight: 800,
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. PROGRAMAÇÃO E HORÁRIO */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
            3. Programação e Horário
          </label>
          <span style={{ fontSize: 9, color: '#60A5FA', fontWeight: 600 }}>
            {tipoAgendamento === 'DATA_ESPECIFICA' ? '📅 Data Pontual' : '🔄 Publicação Recorrente'}
          </span>
        </div>

        {/* SELETOR: DATA ESPECÍFICA vs RECORRENTE */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          background: '#0D1117',
          padding: 3,
          borderRadius: 8,
          border: '1px solid #30363D'
        }}>
          <button
            type="button"
            onClick={() => setTipoAgendamento('DATA_ESPECIFICA')}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: tipoAgendamento === 'DATA_ESPECIFICA' ? '1px solid #388BFD' : '1px solid transparent',
              background: tipoAgendamento === 'DATA_ESPECIFICA' ? 'rgba(56, 139, 253, 0.2)' : 'transparent',
              color: tipoAgendamento === 'DATA_ESPECIFICA' ? '#58A6FF' : '#8B949E',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.15s'
            }}
          >
            <Calendar size={13} />
            <span>Selecionar Data</span>
          </button>

          <button
            type="button"
            onClick={() => setTipoAgendamento('RECORRENTE')}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: tipoAgendamento === 'RECORRENTE' ? '1px solid #388BFD' : '1px solid transparent',
              background: tipoAgendamento === 'RECORRENTE' ? 'rgba(56, 139, 253, 0.2)' : 'transparent',
              color: tipoAgendamento === 'RECORRENTE' ? '#58A6FF' : '#8B949E',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.15s'
            }}
          >
            <Repeat size={13} />
            <span>Recorrente (Rotina)</span>
          </button>
        </div>

        {/* --- OPÇÃO A: SELECIONAR DATA ESPECÍFICA --- */}
        {tipoAgendamento === 'DATA_ESPECIFICA' && (
          <div style={{
            background: '#0D1117',
            border: '1px solid #30363D',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            animation: 'fadeIn 0.15s ease'
          }}>
            {/* Escolha do Dia */}
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#C9D1D9', marginBottom: 5 }}>
                📅 Dia da Publicação
              </label>
              <input
                type="date"
                value={dataEspecifica}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setDataEspecifica(e.target.value)}
                style={{
                  width: '100%',
                  background: '#161B22',
                  border: '1px solid #30363D',
                  borderRadius: 6,
                  color: 'white',
                  padding: '7px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  outline: 'none'
                }}
              />
            </div>

            {/* Escolha do Horário */}
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#C9D1D9', marginBottom: 5 }}>
                ⏰ Horário de Disparo
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                {[
                  { key: 'FIXA', label: '⏰ Horário Fixo' },
                  { key: 'ALEATORIA', label: '🎲 Horário Aleatório' },
                  { key: 'VARIAR_MINUTOS', label: '⏱️ Variar Minutos' }
                ].map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setModoHora(m.key as any)}
                    style={{
                      padding: '6px 2px',
                      borderRadius: 5,
                      border: `1px solid ${modoHora === m.key ? '#388BFD' : '#30363D'}`,
                      background: modoHora === m.key ? 'rgba(56, 139, 253, 0.25)' : '#161B22',
                      color: modoHora === m.key ? '#60A5FA' : '#8B949E',
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {modoHora === 'FIXA' && (
                <div>
                  <input
                    type="time"
                    value={horaFixa}
                    onChange={e => setHoraFixa(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#161B22',
                      border: '1px solid #30363D',
                      borderRadius: 6,
                      color: 'white',
                      padding: '7px 10px',
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  />
                </div>
              )}

              {modoHora === 'ALEATORIA' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>A partir de (Início)</span>
                    <input
                      type="time"
                      value={horaJanelaInicio}
                      onChange={e => setHoraJanelaInicio(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#161B22',
                        border: '1px solid #30363D',
                        borderRadius: 6,
                        color: 'white',
                        padding: '6px 8px',
                        fontSize: 12
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>Até (Fim da Janela)</span>
                    <input
                      type="time"
                      value={horaJanelaFim}
                      onChange={e => setHoraJanelaFim(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#161B22',
                        border: '1px solid #30363D',
                        borderRadius: 6,
                        color: 'white',
                        padding: '6px 8px',
                        fontSize: 12
                      }}
                    />
                  </div>
                </div>
              )}

              {modoHora === 'VARIAR_MINUTOS' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>Horário Base</span>
                    <input
                      type="time"
                      value={horaFixa}
                      onChange={e => setHoraFixa(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#161B22',
                        border: '1px solid #30363D',
                        borderRadius: 6,
                        color: 'white',
                        padding: '6px 8px',
                        fontSize: 12
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>Margem de Variação</span>
                    <select
                      value={variacaoMinutos}
                      onChange={e => setVariacaoMinutos(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: '#161B22',
                        border: '1px solid #30363D',
                        borderRadius: 6,
                        color: 'white',
                        padding: '6px 8px',
                        fontSize: 11
                      }}
                    >
                      <option value={5}>± 5 minutos</option>
                      <option value={10}>± 10 minutos</option>
                      <option value={15}>± 15 minutos</option>
                      <option value={30}>± 30 minutos</option>
                      <option value={45}>± 45 minutos</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- OPÇÃO B: RECORRENTE --- */}
        {tipoAgendamento === 'RECORRENTE' && (
          <div style={{
            background: '#0D1117',
            border: '1px solid #30363D',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            animation: 'fadeIn 0.15s ease'
          }}>
            {/* 1º PASSO: Duração da Recorrência (Para Sempre vs Por um Período) */}
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#C9D1D9', marginBottom: 6 }}>
                🔄 1. Duração da Rotina
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setDuracaoRecorrencia('SEMPRE')}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 6,
                    border: `1px solid ${duracaoRecorrencia === 'SEMPRE' ? '#388BFD' : '#30363D'}`,
                    background: duracaoRecorrencia === 'SEMPRE' ? 'rgba(56, 139, 253, 0.2)' : '#161B22',
                    color: duracaoRecorrencia === 'SEMPRE' ? '#58A6FF' : '#8B949E',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ♾️ Para Sempre (Contínuo)
                </button>

                <button
                  type="button"
                  onClick={() => setDuracaoRecorrencia('PERIODO')}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 6,
                    border: `1px solid ${duracaoRecorrencia === 'PERIODO' ? '#388BFD' : '#30363D'}`,
                    background: duracaoRecorrencia === 'PERIODO' ? 'rgba(56, 139, 253, 0.2)' : '#161B22',
                    color: duracaoRecorrencia === 'PERIODO' ? '#58A6FF' : '#8B949E',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  🗓️ Por um Período (Datas)
                </button>
              </div>

              {/* Inputs de Período */}
              {duracaoRecorrencia === 'PERIODO' && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginTop: 8,
                  background: '#161B22',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #30363D'
                }}>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>Data de Início</span>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={e => setDataInicio(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#0D1117',
                        border: '1px solid #30363D',
                        borderRadius: 5,
                        color: 'white',
                        padding: '5px 8px',
                        fontSize: 11
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>Data de Término</span>
                    <input
                      type="date"
                      value={dataFim}
                      min={dataInicio}
                      onChange={e => setDataFim(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#0D1117',
                        border: '1px solid #30363D',
                        borderRadius: 5,
                        color: 'white',
                        padding: '5px 8px',
                        fontSize: 11
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 2º PASSO: Dias da Semana */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#C9D1D9' }}>
                  📅 2. Dias da Semana
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setDiasSelecionados(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'])}
                    style={{ background: 'none', border: 'none', color: '#58A6FF', fontSize: 9, cursor: 'pointer', padding: 0 }}
                  >
                    Todos
                  </button>
                  <span style={{ color: '#30363D', fontSize: 9 }}>•</span>
                  <button
                    type="button"
                    onClick={() => setDiasSelecionados(['SEG', 'TER', 'QUA', 'QUI', 'SEX'])}
                    style={{ background: 'none', border: 'none', color: '#58A6FF', fontSize: 9, cursor: 'pointer', padding: 0 }}
                  >
                    Dias Úteis
                  </button>
                  <span style={{ color: '#30363D', fontSize: 9 }}>•</span>
                  <button
                    type="button"
                    onClick={() => setDiasSelecionados(['SAB', 'DOM'])}
                    style={{ background: 'none', border: 'none', color: '#58A6FF', fontSize: 9, cursor: 'pointer', padding: 0 }}
                  >
                    Fim de Semana
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {DIAS_SEMANA.map(d => {
                  const isSelected = diasSelecionados.includes(d.key);
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => toggleDia(d.key)}
                      style={{
                        padding: '6px 0',
                        borderRadius: 6,
                        border: `1px solid ${isSelected ? '#388BFD' : '#30363D'}`,
                        background: isSelected ? '#2563EB' : '#161B22',
                        color: isSelected ? 'white' : '#8B949E',
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3º PASSO: Horário de Disparo */}
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#C9D1D9', marginBottom: 5 }}>
                ⏰ 3. Horários de Disparo
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                {[
                  { key: 'FIXA', label: '⏰ Horário Fixo' },
                  { key: 'ALEATORIA', label: '🎲 Horário Aleatório' },
                  { key: 'VARIAR_MINUTOS', label: '⏱️ Variar Minutos' }
                ].map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setModoHora(m.key as any)}
                    style={{
                      padding: '6px 2px',
                      borderRadius: 5,
                      border: `1px solid ${modoHora === m.key ? '#388BFD' : '#30363D'}`,
                      background: modoHora === m.key ? 'rgba(56, 139, 253, 0.25)' : '#161B22',
                      color: modoHora === m.key ? '#60A5FA' : '#8B949E',
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {modoHora === 'FIXA' && (
                <div>
                  <input
                    type="time"
                    value={horaFixa}
                    onChange={e => setHoraFixa(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#161B22',
                      border: '1px solid #30363D',
                      borderRadius: 6,
                      color: 'white',
                      padding: '7px 10px',
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  />
                </div>
              )}

              {modoHora === 'ALEATORIA' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>A partir de (Início)</span>
                    <input
                      type="time"
                      value={horaJanelaInicio}
                      onChange={e => setHoraJanelaInicio(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#161B22',
                        border: '1px solid #30363D',
                        borderRadius: 6,
                        color: 'white',
                        padding: '6px 8px',
                        fontSize: 12
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>Até (Fim da Janela)</span>
                    <input
                      type="time"
                      value={horaJanelaFim}
                      onChange={e => setHoraJanelaFim(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#161B22',
                        border: '1px solid #30363D',
                        borderRadius: 6,
                        color: 'white',
                        padding: '6px 8px',
                        fontSize: 12
                      }}
                    />
                  </div>
                </div>
              )}

              {modoHora === 'VARIAR_MINUTOS' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>Hora Base</span>
                    <input
                      type="time"
                      value={horaFixa}
                      onChange={e => setHoraFixa(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#161B22',
                        border: '1px solid #30363D',
                        borderRadius: 6,
                        color: 'white',
                        padding: '6px 8px',
                        fontSize: 12
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: 9, color: '#8B949E', display: 'block', marginBottom: 3 }}>Margem de Variação</span>
                    <select
                      value={variacaoMinutos}
                      onChange={e => setVariacaoMinutos(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: '#161B22',
                        border: '1px solid #30363D',
                        borderRadius: 6,
                        color: 'white',
                        padding: '6px 8px',
                        fontSize: 11
                      }}
                    >
                      <option value={5}>± 5 minutos</option>
                      <option value={10}>± 10 minutos</option>
                      <option value={15}>± 15 minutos</option>
                      <option value={30}>± 30 minutos</option>
                      <option value={45}>± 45 minutos</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. LEGENDA (OPCIONAL) */}
      <div>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase', marginBottom: 4 }}>
          4. Legenda do Post (Opcional)
        </label>
        <textarea
          rows={2}
          placeholder="Escreva a legenda e hashtags que serão publicadas..."
          value={legenda}
          onChange={e => setLegenda(e.target.value)}
          style={{
            width: '100%',
            background: '#0D1117',
            border: '1px solid #30363D',
            borderRadius: 6,
            color: 'white',
            fontSize: 11,
            padding: '6px 10px',
            resize: 'vertical'
          }}
        />
      </div>

      {/* BOTÕES DE AÇÃO DO FORMULÁRIO */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            background: '#21262D',
            border: '1px solid #30363D',
            color: '#8B949E',
            padding: '8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Cancelar
        </button>

        <button
          type="submit"
          disabled={saving || uploading}
          style={{
            flex: 2,
            background: 'linear-gradient(135deg, #2563EB, #388BFD)',
            border: 'none',
            color: 'white',
            padding: '8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            cursor: saving ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          {saving ? 'Salvando...' : (initialData ? '💾 Atualizar Agendamento' : '💾 Salvar Agendamento')}
        </button>
      </div>
    </form>
  );
}
