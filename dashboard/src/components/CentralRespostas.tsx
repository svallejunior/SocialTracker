'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Send, Search, CheckCheck, Check, Clock, User,
  ExternalLink, Sparkles, Heart, Flame, Smile, RefreshCw, Filter,
  Inbox, AlertCircle, ShieldAlert, ChevronRight, HelpCircle, Zap, Info, EyeOff
} from 'lucide-react';
import AvatarModelo from './AvatarModelo';
import CentralComentarios from './CentralComentarios';

interface Profile {
  username: string;
  foto_url?: string;
  foto_perfil?: string;
  seguidores?: number;
  mensagens_pendentes?: number;
  comentarios_pendentes?: number;
  tem_pendencias?: boolean;
  meta_account_id?: string;
  tem_meta_id?: boolean;
  [key: string]: any;
}

interface Conversa {
  conversation_id: string;
  remetente_username: string;
  remetente_id?: string;
  ultima_mensagem: string;
  ultima_direcao: 'recebida' | 'enviada';
  ultimo_timestamp: string;
  total_mensagens: number;
  pendentes_count: number;
  nao_lidas_count: number;
}

interface Mensagem {
  id: string;
  conversation_id: string;
  modelo_username: string;
  remetente_username: string;
  remetente_id?: string;
  direcao: 'recebida' | 'enviada';
  texto: string;
  timestamp: string;
  lida: number;
  respondida: number;
}

interface CentralRespostasProps {
  profiles: Profile[];
  onRefresh?: () => void;
}

const TEMPLATES_RESPOSTAS = [
  'Oie! Tudo bem? 🥰',
  'Muito obrigada pelo carinho! ❤️',
  'O link exclusivo tá fixado na bio! ✨',
  'Acabei de postar novidade lá! Corre ver 🔥',
  'Obrigada fofo! Beijão 💋'
];

const EMOJIS_RAPIDOS = ['❤️', '🔥', '🥰', '😍', '✨', '👏', '💋', '😘'];

export default function CentralRespostas({ profiles = [], onRefresh }: CentralRespostasProps) {
  // ─── APENAS MODELOS QUE POSSUEM META ACCOUNT ID CONFIGURADO ───
  const perfisComMeta = profiles.filter(p =>
    Boolean(p.meta_account_id && String(p.meta_account_id).trim().length > 0)
  );

  const [selectedUsername, setSelectedUsername] = useState<string>(() => {
    const comPendencia = perfisComMeta.find(p => (p.mensagens_pendentes || 0) > 0 || (p.comentarios_pendentes || 0) > 0);
    return comPendencia?.username || perfisComMeta[0]?.username || '';
  });

  const [subTab, setSubTab] = useState<'COMENTARIOS' | 'DMS'>('COMENTARIOS');

  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [selectedRemetente, setSelectedRemetente] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [textoResposta, setTextoResposta] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'TODAS' | 'PENDENTES' | 'RESPONDIDAS'>('TODAS');
  const [loadingConversas, setLoadingConversas] = useState<boolean>(false);
  const [loadingMensagens, setLoadingMensagens] = useState<boolean>(false);
  const [sincronizandoMeta, setSincronizandoMeta] = useState<boolean>(false);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Perfil selecionado atual
  const activeProfile = perfisComMeta.find(
    p => p.username.toLowerCase() === selectedUsername.toLowerCase()
  ) || perfisComMeta[0];

  // Ajusta se o perfil selecionado atual não estiver na lista com Meta ID
  useEffect(() => {
    if (perfisComMeta.length > 0 && (!selectedUsername || !perfisComMeta.some(p => p.username.toLowerCase() === selectedUsername.toLowerCase()))) {
      setSelectedUsername(perfisComMeta[0].username);
    }
  }, [profiles]);

  // Carrega as conversas do perfil selecionado (e opcionalmente sincroniza com Meta)
  const carregarConversas = async (username: string, syncMeta = false) => {
    if (!username) return;
    if (syncMeta) setSincronizandoMeta(true);
    else setLoadingConversas(true);
    setSyncStatusMsg(null);

    try {
      const url = `/api/respostas?action=conversas&username=${encodeURIComponent(username)}${syncMeta ? '&sync=1' : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setConversas(data.conversas || []);
        if (data.sync_result) {
          if (data.sync_result.success) {
            setSyncStatusMsg({
              text: `✅ Meta API: ${data.sync_result.mensagens_sincronizadas} mensagens sincronizadas em ${data.sync_result.conversas_count} conversas.`,
              type: 'success'
            });
          } else {
            setSyncStatusMsg({
              text: `⚠️ Meta API: ${data.sync_result.error}`,
              type: 'error'
            });
          }
        }

        // Se houver conversas e nenhuma selecionada (ou a atual não estiver na lista), seleciona a primeira
        if (data.conversas && data.conversas.length > 0) {
          const existe = data.conversas.some((c: Conversa) => c.remetente_username.toLowerCase() === selectedRemetente?.toLowerCase());
          if (!existe || !selectedRemetente) {
            setSelectedRemetente(data.conversas[0].remetente_username);
          }
        } else {
          setSelectedRemetente(null);
          setMensagens([]);
        }
      } else if (data.error) {
        setSyncStatusMsg({ text: `Erro: ${data.error}`, type: 'error' });
      }
    } catch (err: any) {
      console.error('Erro ao carregar conversas:', err);
      setSyncStatusMsg({ text: `Erro ao conectar com API: ${err.message}`, type: 'error' });
    } finally {
      setLoadingConversas(false);
      setSincronizandoMeta(false);
    }
  };

  // Carrega o histórico de mensagens da conversa selecionada
  const carregarMensagens = async (username: string, remetente: string) => {
    if (!username || !remetente) return;
    setLoadingMensagens(true);
    try {
      const res = await fetch(`/api/respostas?action=mensagens&username=${encodeURIComponent(username)}&remetente=${encodeURIComponent(remetente)}`);
      const data = await res.json();
      if (data.success) {
        setMensagens(data.mensagens || []);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico de mensagens:', err);
    } finally {
      setLoadingMensagens(false);
    }
  };

  // Atualiza conversas quando muda o perfil
  useEffect(() => {
    if (selectedUsername) {
      carregarConversas(selectedUsername);
    }
  }, [selectedUsername]);

  // Atualiza mensagens quando muda a conversa selecionada
  useEffect(() => {
    if (selectedUsername && selectedRemetente) {
      carregarMensagens(selectedUsername, selectedRemetente);
    }
  }, [selectedUsername, selectedRemetente]);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // Conversa ativa selecionada
  const activeConversa = conversas.find(
    c => c.remetente_username.toLowerCase() === selectedRemetente?.toLowerCase()
  );

  // Enviar mensagem
  const handleEnviarMensagem = async () => {
    if (!textoResposta.trim() || !selectedUsername || !selectedRemetente || enviando) return;

    const texto = textoResposta.trim();
    setEnviando(true);
    setTextoResposta('');

    // Atualização otimista
    const tempId = `temp_${Date.now()}`;
    const novaMsg: Mensagem = {
      id: tempId,
      conversation_id: `conv_${selectedUsername}_${selectedRemetente}`,
      modelo_username: selectedUsername,
      remetente_username: selectedRemetente,
      remetente_id: activeConversa?.remetente_id,
      direcao: 'enviada',
      texto: texto,
      timestamp: new Date().toISOString(),
      lida: 1,
      respondida: 1
    };

    setMensagens(prev => [...prev, novaMsg]);

    try {
      const res = await fetch('/api/respostas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_message',
          modelo_username: selectedUsername,
          remetente_username: selectedRemetente,
          remetente_id: activeConversa?.remetente_id,
          texto: texto
        })
      });
      const data = await res.json();
      if (data.success) {
        // Atualiza lista de conversas localmente: zera pendência e atualiza última msg
        const agora = new Date().toISOString();
        setConversas(prev =>
          prev.map(c =>
            c.remetente_username.toLowerCase() === selectedRemetente.toLowerCase()
              ? {
                  ...c,
                  pendentes_count: 0,
                  nao_lidas_count: 0,
                  ultima_mensagem: texto,
                  ultima_direcao: 'enviada' as const,
                  ultimo_timestamp: agora
                }
              : c
          )
        );
      }
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    } finally {
      setEnviando(false);
      textareaRef.current?.focus();
    }
  };

  // Helper: zera pendência de uma conversa localmente
  const zerarPendenciaLocal = (remetente: string) => {
    setConversas(prev =>
      prev.map(c =>
        c.remetente_username.toLowerCase() === remetente.toLowerCase()
          ? { ...c, pendentes_count: 0, nao_lidas_count: 0 }
          : c
      )
    );
  };

  // Marcar conversa como respondida/lida manualmente
  const handleMarcarComoRespondida = async () => {
    if (!selectedUsername || !selectedRemetente) return;
    // Atualização otimista local — sem reload
    zerarPendenciaLocal(selectedRemetente);
    setMensagens(prev => prev.map(m =>
      m.direcao === 'recebida' ? { ...m, lida: 1, respondida: 1 } : m
    ));
    try {
      await fetch('/api/respostas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_read',
          modelo_username: selectedUsername,
          remetente_username: selectedRemetente
        })
      });
    } catch (err) {
      console.error('Erro ao marcar conversa como lida:', err);
    }
  };

  // Dispensar conversa (Não quero responder / Baixar pendência sem resposta)
  const handleDispensarConversa = async () => {
    if (!selectedUsername || !selectedRemetente) return;
    if (!confirm(`Confirmar: baixar a pendência de @${selectedRemetente} sem enviar resposta?`)) return;
    // Atualização otimista local — sem reload
    zerarPendenciaLocal(selectedRemetente);
    try {
      await fetch('/api/respostas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_ignore',
          modelo_username: selectedUsername,
          remetente_username: selectedRemetente
        })
      });
    } catch (err) {
      console.error('Erro ao dispensar conversa:', err);
    }
  };

  // Trata tecla Enter para envio
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviarMensagem();
    }
  };

  // Filtra as conversas pela busca e pelo filtro de status
  const conversasFiltradas = conversas.filter(c => {
    const matchBusca = c.remetente_username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ultima_mensagem.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchBusca) return false;

    if (filterMode === 'PENDENTES') return c.pendentes_count > 0;
    if (filterMode === 'RESPONDIDAS') return c.pendentes_count === 0;
    return true;
  });

  // Formata hora/data relativa
  const formatHoraRelativa = (timestampStr: string) => {
    if (!timestampStr) return '';
    try {
      const data = new Date(timestampStr);
      const agora = new Date();
      const diffMs = agora.getTime() - data.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHoras = Math.floor(diffMin / 60);

      if (diffMin < 1) return 'Agora';
      if (diffMin < 60) return `${diffMin}m`;
      if (diffHoras < 24) {
        return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
      return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  // Se nenhuma conta tiver Meta ID configurado
  if (perfisComMeta.length === 0) {
    return (
      <div style={{
        background: 'rgba(22, 27, 34, 0.7)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(240, 246, 252, 0.1)',
        borderRadius: 16,
        padding: '60px 20px',
        textAlign: 'center',
        color: '#8B949E'
      }}>
        <ShieldAlert size={48} color="#FF007A" style={{ margin: '0 auto 16px auto' }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', marginBottom: 8 }}>
          Nenhuma conta com META ID configurada
        </h2>
        <p style={{ fontSize: 14, maxWidth: 500, margin: '0 auto 20px auto', lineHeight: 1.6 }}>
          A Central de Respostas opera exclusivamente com contas oficiais conectadas à <strong>Meta Graph API</strong>.
          Configure o <strong>Meta Account ID</strong> e o token das suas modelos na aba <strong>Automatização</strong> para habilitar as mensagens reais.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeIn 0.3s ease' }}>
      
      {/* ─── 1. SELETOR SUPERIOR DE MODELOS (CHIPS APENAS COM META ID) ─── */}
      <div style={{
        background: 'rgba(22, 27, 34, 0.7)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(240, 246, 252, 0.1)',
        borderRadius: 16,
        padding: '16px 20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.37)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>💬</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
                  Central de Respostas & Directs (Meta Oficial)
                </h2>
                <span style={{
                  background: 'rgba(0, 240, 255, 0.1)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  color: '#00F0FF',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 20
                }}>
                  {perfisComMeta.length} {perfisComMeta.length === 1 ? 'modelo conectada' : 'modelos conectadas'}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#8B949E' }}>
                Exibindo apenas modelos com META ID ativo. Mensagens 100% reais sincronizadas com a Meta API.
              </p>
            </div>
          </div>

          {/* Botões de Ação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => carregarConversas(selectedUsername, true)}
              disabled={sincronizandoMeta}
              style={{
                background: 'linear-gradient(135deg, rgba(113, 0, 226, 0.4), rgba(0, 240, 255, 0.3))',
                border: '1px solid #00F0FF',
                borderRadius: 8,
                padding: '6px 14px',
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: 700,
                cursor: sincronizandoMeta ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 0 12px rgba(0, 240, 255, 0.25)',
                transition: 'all 0.2s'
              }}
              title="Sincronizar conversas recentes diretamente da Meta Graph API"
            >
              <Zap size={14} className={sincronizandoMeta ? 'animate-spin' : ''} color="#00F0FF" />
              {sincronizandoMeta ? 'Sincronizando Meta...' : 'Sincronizar Meta API'}
            </button>

            <button
              onClick={() => {
                if (selectedUsername) carregarConversas(selectedUsername, false);
                if (onRefresh) onRefresh();
              }}
              style={{
                background: 'rgba(240, 246, 252, 0.05)',
                border: '1px solid rgba(240, 246, 252, 0.1)',
                borderRadius: 8,
                padding: '6px 12px',
                color: '#8B949E',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#8B949E'; }}
            >
              <RefreshCw size={14} className={loadingConversas ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Notificação de Status de Sincronização */}
        {syncStatusMsg && (
          <div style={{
            padding: '12px 16px',
            marginBottom: 14,
            borderRadius: 10,
            fontSize: 12.5,
            lineHeight: 1.5,
            fontWeight: 500,
            whiteSpace: 'pre-line',
            background: syncStatusMsg.type === 'error' ? 'rgba(255, 0, 122, 0.08)' : 'rgba(0, 240, 255, 0.08)',
            border: syncStatusMsg.type === 'error' ? '1px solid rgba(255, 0, 122, 0.35)' : '1px solid rgba(0, 240, 255, 0.35)',
            color: syncStatusMsg.type === 'error' ? '#FF6B9D' : '#00F0FF',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16 }}>{syncStatusMsg.type === 'error' ? '⚠️' : '✅'}</span>
              <span>{syncStatusMsg.text}</span>
            </div>
            <button
              onClick={() => setSyncStatusMsg(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Lista Horizontal de Modelos com Meta ID */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 4
        }}>
          {perfisComMeta.map(p => {
            const isSelected = p.username.toLowerCase() === selectedUsername.toLowerCase();
            const nMsg = p.mensagens_pendentes || 0;
            const nCom = p.comentarios_pendentes || 0;
            const totalPend = nMsg + nCom;
            const temPend = totalPend > 0;

            return (
              <button
                key={p.username}
                onClick={() => setSelectedUsername(p.username)}
                style={{
                  background: isSelected ? 'linear-gradient(135deg, rgba(113, 0, 226, 0.35), rgba(0, 240, 255, 0.2))' : 'rgba(13, 17, 23, 0.6)',
                  border: isSelected ? '1.5px solid #00F0FF' : '1px solid rgba(240, 246, 252, 0.1)',
                  borderRadius: 30,
                  padding: '6px 14px 6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  boxShadow: isSelected ? '0 0 16px rgba(0, 240, 255, 0.25)' : 'none'
                }}
              >
                <AvatarModelo
                  src={p.foto_url || p.foto_perfil || null}
                  username={p.username}
                  size={32}
                  comentariosPendentes={nCom}
                  mensagensPendentes={nMsg}
                  temPendencias={temPend}
                  showBadge={true}
                />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#FFFFFF' : '#C9D1D9' }}>
                      @{p.username}
                    </span>
                    <span style={{ fontSize: 9, background: 'rgba(0, 240, 255, 0.15)', color: '#00F0FF', padding: '1px 4px', borderRadius: 4, fontFamily: 'monospace' }}>
                      META ID
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: temPend ? '#FF007A' : '#3FB950', fontWeight: temPend ? 700 : 500 }}>
                    {temPend ? (
                      <span>
                        {nMsg > 0 && `✉️ ${nMsg} DM${nMsg > 1 ? 's' : ''}`}
                        {nMsg > 0 && nCom > 0 && ' · '}
                        {nCom > 0 && `💬 ${nCom} comentário${nCom > 1 ? 's' : ''}`}
                      </span>
                    ) : '✅ Em dia'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ─── NAVEGAÇÃO DE SUB-ABAS: COMENTÁRIOS VS DIRECTS ─── */}
        <div style={{
          display: 'flex',
          gap: 12,
          marginTop: 14,
          paddingTop: 14,
          borderTop: '1px solid rgba(240, 246, 252, 0.08)'
        }}>
          <button
            onClick={() => setSubTab('COMENTARIOS')}
            style={{
              background: subTab === 'COMENTARIOS'
                ? 'linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(113, 0, 226, 0.35))'
                : 'rgba(255, 255, 255, 0.04)',
              border: subTab === 'COMENTARIOS' ? '1.5px solid #00F0FF' : '1px solid rgba(240, 246, 252, 0.1)',
              color: subTab === 'COMENTARIOS' ? '#FFFFFF' : '#8B949E',
              padding: '8px 18px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: subTab === 'COMENTARIOS' ? '0 0 14px rgba(0, 240, 255, 0.25)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <MessageSquare size={16} color={subTab === 'COMENTARIOS' ? '#00F0FF' : '#8B949E'} />
            <span>💬 Comentários das Publicações (Feed & Reels)</span>
            {(activeProfile?.comentarios_pendentes || 0) > 0 && (
              <span style={{
                background: '#00F0FF',
                color: '#0D1117',
                fontSize: 10,
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: 10
              }}>
                {activeProfile?.comentarios_pendentes}
              </span>
            )}
          </button>

          <button
            onClick={() => setSubTab('DMS')}
            style={{
              background: subTab === 'DMS'
                ? 'linear-gradient(135deg, rgba(255, 0, 122, 0.2), rgba(113, 0, 226, 0.35))'
                : 'rgba(255, 255, 255, 0.04)',
              border: subTab === 'DMS' ? '1.5px solid #FF007A' : '1px solid rgba(240, 246, 252, 0.1)',
              color: subTab === 'DMS' ? '#FFFFFF' : '#8B949E',
              padding: '8px 18px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: subTab === 'DMS' ? '0 0 14px rgba(255, 0, 122, 0.25)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Send size={15} color={subTab === 'DMS' ? '#FF007A' : '#8B949E'} />
            <span>✉️ Mensagens Diretas (DMs / Direct)</span>
            {(activeProfile?.mensagens_pendentes || 0) > 0 && (
              <span style={{
                background: '#FF007A',
                color: 'white',
                fontSize: 10,
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: 10
              }}>
                {activeProfile?.mensagens_pendentes}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ─── CORPO CONDICIONAL: COMENTÁRIOS OU DIRECTS ─── */}
      {subTab === 'COMENTARIOS' ? (
        <CentralComentarios
          selectedUsername={selectedUsername}
          onRefreshStats={onRefresh}
        />
      ) : (
        /* ─── 2. SPLIT SCREEN: CONVERSAS À ESQUERDA + CHAT À DIREITA ─── */
        <div style={{
          display: 'grid',
          gridTemplateColumns: '360px 1fr',
          gap: 20,
          minHeight: 650,
          height: 'calc(100vh - 300px)'
        }}>
        
        {/* ═══ COLUNA ESQUERDA: LISTA DE CONVERSAS ═══ */}
        <div style={{
          background: 'rgba(22, 27, 34, 0.7)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(240, 246, 252, 0.1)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Header da Coluna com Busca e Filtros */}
          <div style={{ padding: '16px', borderBottom: '1px solid rgba(240, 246, 252, 0.08)' }}>
            <div style={{
              background: '#0D1117',
              border: '1px solid #30363D',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 8,
              marginBottom: 12
            }}>
              <Search size={14} color="#8B949E" />
              <input
                type="text"
                placeholder="Buscar fã ou mensagem..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'white',
                  fontSize: 13,
                  padding: '10px 0',
                  width: '100%'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', fontSize: 11 }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtros de Status das Mensagens */}
            <div style={{ display: 'flex', gap: 6 }}>
              {(['TODAS', 'PENDENTES', 'RESPONDIDAS'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  style={{
                    flex: 1,
                    background: filterMode === mode ? '#7100E2' : 'rgba(240, 246, 252, 0.05)',
                    border: '1px solid ' + (filterMode === mode ? '#7100E2' : 'rgba(240, 246, 252, 0.1)'),
                    borderRadius: 6,
                    padding: '5px 0',
                    fontSize: 11,
                    fontWeight: 700,
                    color: filterMode === mode ? 'white' : '#8B949E',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {mode === 'TODAS' && 'Todas'}
                  {mode === 'PENDENTES' && '🔥 Pendentes'}
                  {mode === 'RESPONDIDAS' && 'Respondidas'}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Contatos / Conversas */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {loadingConversas ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
                Carregando conversas...
              </div>
            ) : conversasFiltradas.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
                <Inbox size={32} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                <div style={{ fontWeight: 600, color: '#C9D1D9', marginBottom: 4 }}>Nenhuma conversa encontrada</div>
                <div style={{ fontSize: 12 }}>
                  Clique no botão <strong>Sincronizar Meta API</strong> acima para puxar as mensagens recebidas no Instagram de @{selectedUsername}.
                </div>
              </div>
            ) : (
              conversasFiltradas.map(conv => {
                const isSelected = selectedRemetente?.toLowerCase() === conv.remetente_username.toLowerCase();
                const temPendencia = conv.pendentes_count > 0;

                return (
                  <div
                    key={conv.remetente_username}
                    onClick={() => setSelectedRemetente(conv.remetente_username)}
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg, rgba(113, 0, 226, 0.25), rgba(0, 240, 255, 0.12))'
                        : 'transparent',
                      border: isSelected ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid transparent',
                      borderRadius: 12,
                      padding: '12px 14px',
                      marginBottom: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* Avatar do Fã */}
                    <div style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #30363D, #161B22)',
                      border: '1px solid #30363D',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 14,
                      color: '#00F0FF',
                      flexShrink: 0
                    }}>
                      {conv.remetente_username.slice(0, 2).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#FFFFFF' : '#E6EDF3' }}>
                          @{conv.remetente_username}
                        </span>
                        <span style={{ fontSize: 11, color: '#8B949E' }}>
                          {formatHoraRelativa(conv.ultimo_timestamp)}
                        </span>
                      </div>

                      <div style={{
                        fontSize: 12,
                        color: temPendencia ? '#FFFFFF' : '#8B949E',
                        fontWeight: temPendencia ? 600 : 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {conv.ultima_direcao === 'enviada' && (
                          <span style={{ color: '#00F0FF', fontSize: 11 }}>Você:</span>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {conv.ultima_mensagem}
                        </span>
                      </div>
                    </div>

                    {/* Badge de Pendência */}
                    {temPendencia && (
                      <span style={{
                        background: 'linear-gradient(135deg, #FF007A, #FF4500)',
                        color: 'white',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: 10,
                        boxShadow: '0 0 8px rgba(255, 0, 122, 0.6)'
                      }}>
                        {conv.pendentes_count}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ COLUNA DIREITA: ÁREA DO CHAT & RESPOSTA ═══ */}
        <div style={{
          background: 'rgba(22, 27, 34, 0.7)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(240, 246, 252, 0.1)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {selectedRemetente ? (
            <>
              {/* Header do Chat */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid rgba(240, 246, 252, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(13, 17, 23, 0.4)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #30363D, #161B22)',
                    border: '1.5px solid #00F0FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 14,
                    color: '#00F0FF'
                  }}>
                    {selectedRemetente.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: 'white' }}>
                        @{selectedRemetente}
                      </span>
                      <a
                        href={`https://instagram.com/${selectedRemetente}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#8B949E', display: 'flex', alignItems: 'center' }}
                        title="Ver perfil no Instagram"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                    <div style={{ fontSize: 11, color: '#8B949E' }}>
                      Conversando como <strong style={{ color: '#00F0FF' }}>@{selectedUsername}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Mostrar botões apenas quando há pendência */}
                  {activeConversa && activeConversa.pendentes_count > 0 && (
                    <button
                      onClick={handleDispensarConversa}
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(240, 246, 252, 0.15)',
                        color: '#8B949E',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#FFFFFF';
                        e.currentTarget.style.borderColor = 'rgba(255, 0, 122, 0.5)';
                        e.currentTarget.style.background = 'rgba(255, 0, 122, 0.1)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = '#8B949E';
                        e.currentTarget.style.borderColor = 'rgba(240, 246, 252, 0.15)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                      }}
                      title="Baixar a pendência sem enviar resposta"
                    >
                      <EyeOff size={13} />
                      Não quero responder
                    </button>
                  )}
                  <button
                    onClick={handleMarcarComoRespondida}
                    style={{
                      background: 'rgba(46, 160, 67, 0.15)',
                      border: '1px solid rgba(46, 160, 67, 0.35)',
                      color: '#00FFC8',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s'
                    }}
                    title="Marcar todas as mensagens como respondidas"
                  >
                    <CheckCheck size={14} />
                    Marcar Respondida
                  </button>
                </div>
              </div>

              {/* Área de Histórico de Mensagens (Scrollable) */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                background: 'radial-gradient(circle at 50% 50%, rgba(113, 0, 226, 0.03) 0%, transparent 80%)'
              }}>
                {loadingMensagens ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
                    Carregando histórico...
                  </div>
                ) : mensagens.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
                    Nenhuma mensagem anterior gravada. Digite abaixo para responder!
                  </div>
                ) : (
                  mensagens.map(msg => {
                    const isMinha = msg.direcao === 'enviada';

                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isMinha ? 'flex-end' : 'flex-start',
                          maxWidth: '75%',
                          alignSelf: isMinha ? 'flex-end' : 'flex-start'
                        }}
                      >
                        <div style={{
                          background: isMinha
                            ? 'linear-gradient(135deg, #7100E2 0%, #00F0FF 100%)'
                            : '#161B22',
                          color: isMinha ? '#FFFFFF' : '#E6EDF3',
                          border: isMinha ? 'none' : '1px solid #30363D',
                          borderRadius: isMinha ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          padding: '10px 14px',
                          fontSize: 13,
                          lineHeight: 1.5,
                          boxShadow: isMinha
                            ? '0 4px 16px rgba(113, 0, 226, 0.35)'
                            : '0 2px 8px rgba(0,0,0,0.3)',
                          wordBreak: 'break-word'
                        }}>
                          {msg.texto}
                        </div>

                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 10,
                          color: '#8B949E',
                          marginTop: 4,
                          padding: '0 4px'
                        }}>
                          <span>{formatHoraRelativa(msg.timestamp)}</span>
                          {isMinha && <CheckCheck size={12} color="#00F0FF" />}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ─── BARRA DE RESPOSTAS RÁPIDAS & TEMPLATES ─── */}
              <div style={{
                padding: '8px 16px',
                borderTop: '1px solid rgba(240, 246, 252, 0.06)',
                background: 'rgba(13, 17, 23, 0.6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                {/* Emojis Rápidos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                  <span style={{ fontSize: 11, color: '#8B949E', fontWeight: 600, marginRight: 4 }}>Atalhos:</span>
                  {EMOJIS_RAPIDOS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setTextoResposta(prev => prev + emoji)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: 13,
                        cursor: 'pointer',
                        transition: 'transform 0.1s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      {emoji}
                    </button>
                  ))}

                  {/* Respostas Prontas / Templates */}
                  {TEMPLATES_RESPOSTAS.map((tpl, i) => (
                    <button
                      key={i}
                      onClick={() => setTextoResposta(tpl)}
                      style={{
                        background: 'rgba(113, 0, 226, 0.12)',
                        border: '1px solid rgba(113, 0, 226, 0.3)',
                        color: '#C9D1D9',
                        borderRadius: 12,
                        padding: '3px 10px',
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#00F0FF'; e.currentTarget.style.color = '#FFFFFF'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(113, 0, 226, 0.3)'; e.currentTarget.style.color = '#C9D1D9'; }}
                    >
                      {tpl}
                    </button>
                  ))}
                </div>
              </div>

              {/* ─── CAMPO DE DIGITAÇÃO DE RESPOSTA ─── */}
              <div style={{
                padding: '12px 16px',
                borderTop: '1px solid rgba(240, 246, 252, 0.08)',
                background: '#0D1117',
                display: 'flex',
                alignItems: 'flex-end',
                gap: 12
              }}>
                <textarea
                  ref={textareaRef}
                  value={textoResposta}
                  onChange={e => setTextoResposta(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Responder @${selectedRemetente} como @${selectedUsername}... (Pressione Enter para enviar)`}
                  rows={2}
                  style={{
                    flex: 1,
                    background: 'rgba(22, 27, 34, 0.8)',
                    border: '1px solid #30363D',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: 'white',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    resize: 'none',
                    outline: 'none',
                    lineHeight: 1.4
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#00F0FF'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#30363D'; }}
                />

                <button
                  onClick={handleEnviarMensagem}
                  disabled={!textoResposta.trim() || enviando}
                  style={{
                    background: textoResposta.trim()
                      ? 'linear-gradient(135deg, #7100E2, #00F0FF)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '12px 18px',
                    color: textoResposta.trim() ? '#FFFFFF' : '#586069',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: textoResposta.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    height: 48,
                    boxShadow: textoResposta.trim() ? '0 0 16px rgba(0, 240, 255, 0.3)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  {enviando ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Enviar</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div style={{
              margin: 'auto',
              textAlign: 'center',
              padding: 40,
              color: '#8B949E'
            }}>
              <MessageSquare size={48} style={{ margin: '0 auto 16px auto', opacity: 0.3 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 6 }}>
                Nenhuma conversa selecionada
              </h3>
              <p style={{ fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>
                Escolha uma conversa na lista lateral ou clique em <strong>Sincronizar Meta API</strong> para puxar as mensagens recebidas.
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
