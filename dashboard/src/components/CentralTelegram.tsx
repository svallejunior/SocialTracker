'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Search, CheckCheck, RefreshCw, Inbox, Link2, Power, PowerOff,
  ShoppingBag, MessageSquare
} from 'lucide-react';

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface Lead {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  stage: string;
  message_count: number;
  purchased: number;
  instagram_handle: string | null;
  auto_enabled: number;
  notes: string;
  created_at: number;
  last_active_at: number;
}

interface MensagemTelegram {
  id: string;
  direcao: 'recebida' | 'enviada';
  texto: string;
  timestamp: string;
}

const STAGE_LABELS: Record<string, string> = {
  abertura: '🌱 Abertura',
  aquecimento: '🔥 Aquecimento',
  oferta: '💌 Oferta',
  fechamento: '🎯 Fechamento',
  pos_venda: '✅ Pós-venda'
};

export default function CentralTelegram() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [mensagens, setMensagens] = useState<MensagemTelegram[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [texto, setTexto] = useState('');
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingMensagens, setLoadingMensagens] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedLead = leads.find(l => l.chat_id === selectedChatId) || null;

  const carregarLeads = async () => {
    setLoadingLeads(true);
    try {
      const res = await fetch('/api/telegram?action=leads');
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads || []);
        if (!selectedChatId && data.leads?.length > 0) {
          setSelectedChatId(data.leads[0].chat_id);
        }
      }
    } catch (err: unknown) {
      setStatusMsg({ text: `Erro ao carregar leads: ${errMsg(err)}`, type: 'error' });
    } finally {
      setLoadingLeads(false);
    }
  };

  const carregarMensagens = async (chatId: number) => {
    setLoadingMensagens(true);
    try {
      const res = await fetch(`/api/telegram?action=mensagens&chat_id=${chatId}`);
      const data = await res.json();
      if (data.success) setMensagens(data.mensagens || []);
    } catch (err) {
      console.error('Erro ao carregar mensagens do Telegram:', err);
    } finally {
      setLoadingMensagens(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch dispara setLoading logo na 1ª linha
    carregarLeads();
    const interval = setInterval(carregarLeads, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch dispara setLoading logo na 1ª linha
    if (selectedChatId) carregarMensagens(selectedChatId);
  }, [selectedChatId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza o campo com o lead selecionado
    setHandleInput(selectedLead?.instagram_handle || '');
  }, [selectedChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const handleEnviar = async () => {
    if (!texto.trim() || !selectedChatId || enviando) return;
    const t = texto.trim();
    setEnviando(true);
    setTexto('');
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_message', chat_id: selectedChatId, texto: t })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ text: '✅ Mensagem enfileirada — sai pelo Telegram em poucos segundos.', type: 'success' });
        setTimeout(() => carregarMensagens(selectedChatId), 4000);
      } else {
        setStatusMsg({ text: `⚠️ Erro: ${data.error}`, type: 'error' });
      }
    } catch (err: unknown) {
      setStatusMsg({ text: `⚠️ Erro de conexão: ${errMsg(err)}`, type: 'error' });
    } finally {
      setEnviando(false);
    }
  };

  const handleToggleAuto = async () => {
    if (!selectedLead) return;
    const novoEstado = !selectedLead.auto_enabled;
    setLeads(prev => prev.map(l => l.chat_id === selectedLead.chat_id ? { ...l, auto_enabled: novoEstado ? 1 : 0 } : l));
    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_auto', chat_id: selectedLead.chat_id, enabled: novoEstado })
    });
  };

  const handleVincularInstagram = async () => {
    if (!selectedLead) return;
    setLeads(prev => prev.map(l => l.chat_id === selectedLead.chat_id ? { ...l, instagram_handle: handleInput || null } : l));
    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'link_instagram', chat_id: selectedLead.chat_id, handle: handleInput })
    });
    setStatusMsg({ text: '✅ Instagram vinculado ao lead.', type: 'success' });
  };

  const handleMarcarCompra = async () => {
    if (!selectedLead) return;
    if (!confirm(`Confirmar: marcar ${selectedLead.first_name || selectedLead.chat_id} como comprado?`)) return;
    setLeads(prev => prev.map(l => l.chat_id === selectedLead.chat_id ? { ...l, purchased: 1 } : l));
    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'marcar_compra', chat_id: selectedLead.chat_id })
    });
  };

  const leadsFiltrados = leads.filter(l => {
    const q = searchQuery.toLowerCase();
    return (l.first_name || '').toLowerCase().includes(q) ||
      (l.username || '').toLowerCase().includes(q) ||
      String(l.chat_id).includes(q) ||
      (l.instagram_handle || '').toLowerCase().includes(q);
  });

  const formatHora = (timestampStr: string) => {
    try {
      const d = new Date(timestampStr);
      const diffMin = Math.floor((new Date().getTime() - d.getTime()) / 60000);
      if (diffMin < 1) return 'Agora';
      if (diffMin < 60) return `${diffMin}m`;
      if (diffMin < 1440) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeIn 0.3s ease' }}>
      {statusMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          fontSize: 12.5,
          fontWeight: 500,
          background: statusMsg.type === 'error' ? 'rgba(255, 0, 122, 0.08)' : 'rgba(0, 240, 255, 0.08)',
          border: statusMsg.type === 'error' ? '1px solid rgba(255, 0, 122, 0.35)' : '1px solid rgba(0, 240, 255, 0.35)',
          color: statusMsg.type === 'error' ? '#FF6B9D' : '#00F0FF',
          display: 'flex', justifyContent: 'space-between', gap: 12
        }}>
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, minHeight: 650, height: 'calc(100vh - 300px)' }}>
        {/* ═══ COLUNA ESQUERDA: LEADS ═══ */}
        <div style={{
          background: 'rgba(22, 27, 34, 0.7)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(240, 246, 252, 0.1)', borderRadius: 16,
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ padding: 16, borderBottom: '1px solid rgba(240, 246, 252, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'white' }}>💬 Leads do Bot (Telegram)</span>
              <button onClick={carregarLeads} style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer' }}>
                <RefreshCw size={14} className={loadingLeads ? 'animate-spin' : ''} />
              </button>
            </div>
            <div style={{
              background: '#0D1117', border: '1px solid #30363D', borderRadius: 10,
              display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8
            }}>
              <Search size={14} color="#8B949E" />
              <input
                type="text"
                placeholder="Buscar por nome, @ ou chat_id..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: 13, padding: '10px 0', width: '100%' }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {leadsFiltrados.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
                <Inbox size={32} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                Nenhum lead encontrado.
              </div>
            ) : (
              leadsFiltrados.map(lead => {
                const isSelected = lead.chat_id === selectedChatId;
                return (
                  <div
                    key={lead.chat_id}
                    onClick={() => setSelectedChatId(lead.chat_id)}
                    style={{
                      background: isSelected ? 'linear-gradient(135deg, rgba(113, 0, 226, 0.25), rgba(0, 240, 255, 0.12))' : 'transparent',
                      border: isSelected ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid transparent',
                      borderRadius: 12, padding: '10px 12px', marginBottom: 4, cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#FFF' : '#E6EDF3' }}>
                        {lead.first_name || `Lead ${lead.chat_id}`}
                      </span>
                      <span style={{ fontSize: 10, color: '#8B949E' }}>{formatHora(new Date(lead.last_active_at * 1000).toISOString())}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: '#8B949E' }}>chat_id: {lead.chat_id}</span>
                      {lead.instagram_handle && (
                        <span style={{ fontSize: 10, color: '#E1306C', display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Link2 size={10} /> @{lead.instagram_handle}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                        background: lead.purchased ? 'rgba(63, 185, 80, 0.15)' : 'rgba(0, 240, 255, 0.1)',
                        color: lead.purchased ? '#3FB950' : '#00F0FF'
                      }}>
                        {lead.purchased ? '✅ Comprou' : STAGE_LABELS[lead.stage] || lead.stage}
                      </span>
                      {!lead.auto_enabled && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'rgba(255, 0, 122, 0.12)', color: '#FF007A' }}>
                          IA OFF
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ COLUNA DIREITA: CHAT ═══ */}
        <div style={{
          background: 'rgba(22, 27, 34, 0.7)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(240, 246, 252, 0.1)', borderRadius: 16,
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          {selectedLead ? (
            <>
              {/* Header */}
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid rgba(240, 246, 252, 0.08)',
                background: 'rgba(13, 17, 23, 0.4)', display: 'flex', flexWrap: 'wrap',
                alignItems: 'center', justifyContent: 'space-between', gap: 10
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'white' }}>
                    {selectedLead.first_name || `Lead ${selectedLead.chat_id}`}
                    {selectedLead.username && <span style={{ color: '#8B949E', fontWeight: 400 }}> (@{selectedLead.username})</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#8B949E' }}>
                    chat_id: {selectedLead.chat_id} · {selectedLead.message_count} mensagens
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* Vincular Instagram */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      value={handleInput}
                      onChange={e => setHandleInput(e.target.value)}
                      placeholder="@ do Instagram"
                      style={{
                        background: '#0D1117', border: '1px solid #30363D', borderRadius: 6,
                        padding: '5px 8px', color: 'white', fontSize: 11, width: 120
                      }}
                    />
                    <button onClick={handleVincularInstagram} title="Vincular Instagram" style={{
                      background: 'rgba(225, 48, 108, 0.15)', border: '1px solid rgba(225, 48, 108, 0.4)',
                      color: '#E1306C', borderRadius: 6, padding: '5px 8px', cursor: 'pointer'
                    }}>
                      <Link2 size={12} />
                    </button>
                  </div>

                  {/* Toggle IA */}
                  <button
                    onClick={handleToggleAuto}
                    title={selectedLead.auto_enabled ? 'Desligar IA pra esse lead' : 'Ligar IA pra esse lead'}
                    style={{
                      background: selectedLead.auto_enabled ? 'rgba(46, 160, 67, 0.15)' : 'rgba(255, 0, 122, 0.15)',
                      border: `1px solid ${selectedLead.auto_enabled ? 'rgba(46, 160, 67, 0.4)' : 'rgba(255, 0, 122, 0.4)'}`,
                      color: selectedLead.auto_enabled ? '#00FFC8' : '#FF007A',
                      borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6
                    }}
                  >
                    {selectedLead.auto_enabled ? <Power size={13} /> : <PowerOff size={13} />}
                    IA {selectedLead.auto_enabled ? 'ligada' : 'desligada'}
                  </button>

                  {/* Marcar compra */}
                  {!selectedLead.purchased && (
                    <button onClick={handleMarcarCompra} style={{
                      background: 'rgba(0, 240, 255, 0.1)', border: '1px solid rgba(0, 240, 255, 0.3)',
                      color: '#00F0FF', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                    }}>
                      <ShoppingBag size={13} /> Marcar comprado
                    </button>
                  )}
                </div>
              </div>

              {/* Mensagens */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {loadingMensagens ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
                    Carregando histórico...
                  </div>
                ) : mensagens.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
                    Nenhuma mensagem ainda.
                  </div>
                ) : (
                  mensagens.map(msg => {
                    const isMinha = msg.direcao === 'enviada';
                    return (
                      <div key={msg.id} style={{
                        display: 'flex', flexDirection: 'column', maxWidth: '75%',
                        alignSelf: isMinha ? 'flex-end' : 'flex-start', alignItems: isMinha ? 'flex-end' : 'flex-start'
                      }}>
                        <div style={{
                          background: isMinha ? 'linear-gradient(135deg, #7100E2 0%, #00F0FF 100%)' : '#161B22',
                          color: isMinha ? '#FFFFFF' : '#E6EDF3',
                          border: isMinha ? 'none' : '1px solid #30363D',
                          borderRadius: isMinha ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          padding: '10px 14px', fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word'
                        }}>
                          {msg.texto}
                        </div>
                        <div style={{ fontSize: 10, color: '#8B949E', marginTop: 4, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>{formatHora(msg.timestamp)}</span>
                          {isMinha && <CheckCheck size={12} color="#00F0FF" />}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Campo de envio */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(240, 246, 252, 0.08)', background: '#0D1117', display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                <textarea
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar(); } }}
                  placeholder={`Responder ${selectedLead.first_name || selectedLead.chat_id} manualmente... (Enter pra enviar — sai pela fila do bot em poucos segundos)`}
                  rows={2}
                  style={{
                    flex: 1, background: 'rgba(22, 27, 34, 0.8)', border: '1px solid #30363D', borderRadius: 10,
                    padding: '10px 14px', color: 'white', fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.4
                  }}
                />
                <button
                  onClick={handleEnviar}
                  disabled={!texto.trim() || enviando}
                  style={{
                    background: texto.trim() ? 'linear-gradient(135deg, #7100E2, #00F0FF)' : 'rgba(255, 255, 255, 0.05)',
                    border: 'none', borderRadius: 10, padding: '12px 18px',
                    color: texto.trim() ? '#FFFFFF' : '#586069', fontWeight: 700, fontSize: 13,
                    cursor: texto.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 8, height: 48
                  }}
                >
                  {enviando ? <RefreshCw size={16} className="animate-spin" /> : <><Send size={16} /><span>Enviar</span></>}
                </button>
              </div>
            </>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', padding: 40, color: '#8B949E' }}>
              <MessageSquare size={48} style={{ margin: '0 auto 16px auto', opacity: 0.3 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 6 }}>Nenhum lead selecionado</h3>
              <p style={{ fontSize: 13, maxWidth: 320 }}>Escolha um lead na lista lateral pra ver a conversa.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
