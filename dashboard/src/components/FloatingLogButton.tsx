'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, RefreshCw, Copy, Check, Filter, ChevronDown, Download, AlertCircle } from 'lucide-react';

export default function FloatingLogButton() {
  const [isMaster, setIsMaster] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logsData, setLogsData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('daemon');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLPreElement>(null);

  // 1. Verifica se a senha logada é a 2802 (via API ou localStorage)
  useEffect(() => {
    // Checagem imediata via storage local
    if (typeof window !== 'undefined') {
      const storedRole = localStorage.getItem('st_pin_role');
      if (storedRole === '2802') {
        setIsMaster(true);
      }
    }

    // Validação com o servidor
    const checkSession = () => {
      fetch('/api/auth/session')
        .then(res => res.json())
        .then(data => {
          if (data.isMaster || data.role === '2802') {
            setIsMaster(true);
            if (typeof window !== 'undefined') {
              localStorage.setItem('st_pin_role', '2802');
            }
          } else if (data.role === '1707') {
            setIsMaster(false);
            if (typeof window !== 'undefined') {
              localStorage.removeItem('st_pin_role');
            }
          }
        })
        .catch(() => {});
    };

    checkSession();
  }, []);

  // 2. Função de busca de logs
  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.success) {
        setLogsData(data);
      }
    } catch (e) {
      console.error('Erro ao buscar logs:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  // Auto-refresh a cada 5 segundos se ativado
  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh]);

  // Scroll para o fim dos logs ao mudar de aba ou receber novos logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logsData, activeTab]);

  // Se não for o usuário 2802, não renderiza absolutamente nada
  if (!isMaster) return null;

  // Extrai o conteúdo da aba selecionada
  const getLogContent = () => {
    if (!logsData?.logs) return 'Carregando logs...';
    const l = logsData.logs;

    switch (activeTab) {
      case 'daemon':
        return l.publicador_log || l.daemon_log || l.pm2_out || l.pm2_realtime || 'Nenhum log gravado em publicador.log ainda.';
      case 'pm2':
        return l.pm2_realtime || l.pm2_out || l.pm2_status || 'PM2 não ativo neste ambiente ou sem registros.';
      case 'banco':
        return `=== STATUS DO DAEMON NO BANCO ===\n${l.db_daemon_status || 'N/A'}\n\n=== ÚLTIMAS PUBLICAÇÕES REGISTRADAS ===\n${l.db_recent_posts || 'N/A'}`;
      case 'erros':
        return l.pm2_err || l.pm2_dash_err || l.nginx_error || 'Nenhum erro crítico registrado nos logs do sistema.';
      default:
        return Object.entries(l)
          .map(([k, v]) => `=== ${k.toUpperCase()} ===\n${v}`)
          .join('\n\n');
    }
  };

  const handleCopy = () => {
    const text = getLogContent();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Ícone flutuante no canto inferior esquerdo (diagonal esquerda) */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        title="Logs do Sistema (Exclusivo 2802)"
        style={{
          position: 'fixed',
          bottom: 22,
          left: 22,
          zIndex: 9999,
          width: 46,
          height: 46,
          borderRadius: '50%',
          background: isOpen ? '#00F0FF' : '#161B22',
          border: '1.5px solid #00F0FF',
          color: isOpen ? '#0D1117' : '#00F0FF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 18px rgba(0, 240, 255, 0.35)',
          transition: 'all 0.2s ease',
          outline: 'none'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 6px 22px rgba(0, 240, 255, 0.55)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 18px rgba(0, 240, 255, 0.35)';
        }}
      >
        <Terminal size={22} strokeWidth={2.4} />
      </button>

      {/* Modal / Painel de Logs */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 78,
            left: 22,
            zIndex: 9999,
            width: 'min(92vw, 760px)',
            height: 'min(75vh, 560px)',
            background: '#0D1117',
            border: '1px solid #30363D',
            borderRadius: 14,
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(0, 240, 255, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {/* Header do Painel */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #21262D',
              background: '#161B22',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'rgba(0, 240, 255, 0.12)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#00F0FF'
                }}
              >
                <Terminal size={16} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#F0F6FC', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Logs do Sistema</span>
                  <span style={{ fontSize: 10, background: '#238636', color: 'white', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                    ADMIN 2802
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#8B949E' }}>
                  {logsData?.timestamp ? `Atualizado às ${new Date(logsData.timestamp).toLocaleTimeString('pt-BR')}` : 'Monitoramento em tempo real'}
                </div>
              </div>
            </div>

            {/* Ações da Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setAutoRefresh(prev => !prev)}
                title={autoRefresh ? 'Desativar auto-refresh' : 'Ativar auto-refresh (4s)'}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: autoRefresh ? '1px solid #238636' : '1px solid #30363D',
                  background: autoRefresh ? 'rgba(35, 134, 54, 0.2)' : 'transparent',
                  color: autoRefresh ? '#3FB950' : '#8B949E',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: autoRefresh ? '#3FB950' : '#8B949E'
                  }}
                />
                Live
              </button>

              <button
                onClick={() => fetchLogs()}
                disabled={loading}
                title="Recarregar logs agora"
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #30363D',
                  background: 'transparent',
                  color: '#C9D1D9',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                Atualizar
              </button>

              <button
                onClick={handleCopy}
                title="Copiar logs exibidos"
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #30363D',
                  background: 'transparent',
                  color: copied ? '#3FB950' : '#C9D1D9',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#8B949E',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Abas de Navegação dos Logs */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '6px 12px',
              background: '#161B22',
              borderBottom: '1px solid #21262D',
              overflowX: 'auto'
            }}
          >
            {[
              { key: 'daemon', label: '🤖 Publicador / Daemon' },
              { key: 'pm2', label: '⚡ PM2 / Processos' },
              { key: 'banco', label: '🗄️ Histórico / Banco' },
              { key: 'erros', label: '⚠️ Erros' },
              { key: 'all', label: '📄 Todos' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: activeTab === tab.key ? '#30363D' : 'transparent',
                  color: activeTab === tab.key ? '#00F0FF' : '#8B949E',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Área de Visualização do Log */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#090D13' }}>
            <pre
              ref={logContainerRef}
              style={{
                margin: 0,
                padding: 14,
                width: '100%',
                height: '100%',
                overflow: 'auto',
                fontSize: 11,
                lineHeight: 1.5,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                color: '#7EE787',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                boxSizing: 'border-box'
              }}
            >
              {getLogContent()}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
