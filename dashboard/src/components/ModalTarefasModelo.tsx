"use client";

import React, { useState, useEffect } from 'react';
import {
  X, CheckSquare, Square, Flame, Zap, Wine, ShieldAlert,
  Smartphone, Calendar, CheckCircle2, Copy, Check, ArrowRight,
  RotateCcw, Sparkles, AlertTriangle, Layers
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  modelo: {
    username: string;
    nome?: string;
    foto_url?: string;
    situacao_aquecimento?: string | null;
    esteira_aquecimento?: string | null;
  } | null;
  onSaveConfig: (username: string, situacao: string, esteira?: string | null) => Promise<void>;
}

export default function ModalTarefasModelo({ isOpen, onClose, modelo, onSaveConfig }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [etapaManual, setEtapaManual] = useState<'AUTO' | 'PERGUNTAR_SITUACAO' | 'ESCOLHER_ESTEIRA' | 'VER_TAREFAS'>('AUTO');
  const [tarefasConcluidas, setTarefasConcluidas] = useState<Record<string, boolean>>({});

  // Carrega estado de checkboxes salvo em localStorage por modelo
  useEffect(() => {
    if (modelo?.username) {
      try {
        const key = `st_tarefas_${modelo.username.toLowerCase()}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          setTarefasConcluidas(JSON.parse(saved));
        } else {
          setTarefasConcluidas({});
        }
      } catch (e) {}
    }
  }, [modelo?.username]);

  // Tecla Escape para fechar
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !modelo) return null;

  const toggleCheck = (id: string) => {
    setTarefasConcluidas(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(`st_tarefas_${modelo.username.toLowerCase()}`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Determina a etapa visual atual
  let etapaAtual = etapaManual;
  if (etapaManual === 'AUTO') {
    if (!modelo.situacao_aquecimento) {
      etapaAtual = 'PERGUNTAR_SITUACAO';
    } else if (modelo.situacao_aquecimento === 'EM_AQUECIMENTO' && !modelo.esteira_aquecimento) {
      etapaAtual = 'ESCOLHER_ESTEIRA';
    } else {
      etapaAtual = 'VER_TAREFAS';
    }
  }

  const handleEscolherSituacao = async (situacao: 'EM_AQUECIMENTO' | 'AQUECIDA') => {
    if (situacao === 'AQUECIDA') {
      setSalvando(true);
      try {
        await onSaveConfig(modelo.username, 'AQUECIDA', null);
        setEtapaManual('VER_TAREFAS');
      } finally {
        setSalvando(false);
      }
    } else {
      // Se for em aquecimento, passa para a escolha de esteira
      setEtapaManual('ESCOLHER_ESTEIRA');
    }
  };

  const handleEscolherEsteira = async (esteira: 'NORMAL' | 'ACELERADO' | 'TORRE_CHAMPAGNE') => {
    setSalvando(true);
    try {
      await onSaveConfig(modelo.username, 'EM_AQUECIMENTO', esteira);
      setEtapaManual('VER_TAREFAS');
    } finally {
      setSalvando(false);
    }
  };

  const textoRoteiroAcelerado = `================= ESTEIRA RÁPIDA ==================
*** FORMATE O CELULAR
*** USE CONTA GOOGLE OU APPLE NOVA
*** DEFINA IDADE COM PELO MENOS 21 ANOS
*** DESATIVE SERVIÇO DE LOCALIZAÇÃO
*** SE FOR IPHONE NÃO ACEITE ICLOUD KEYCHAIN E OPTE POR NÃO COMPARTILHAR DADOS ANALÍTICOS
*** baixe 3 apps ANTES DE baixar o instagram

DIA 1 e 2:
* Configure nome de usuário(sem numero, sem letras repetidas e sem caracteres especiais)
* nunca crie carolina1, carolina2... para contas de mesma modelo
* coloque nome no perfil e bio
* adicione uma foto de perfil (quando tiver mais de 1 conta, use ilustração de foto da modelo - fotos devem ser white)
* siga entre 10 a 20 modelos de conteúdo adulto da mesma estética da sua modelo e do mesmo país.
* deixe nas primeiras 48 10 curtidas + comentários por dia, NÃO MAIS QUE ISSO
* poste 1 FEED por dia
* POSTE 1 STORY por dia
* Consuma conteúdo (pelo menos 15 minutos)* SEMPRE REMOVA METADADOS

DIA 3:
* Poste 1 REEL
* poste 1 FEED por dia
* POSTE 1 STORY por dia
* Consuma conteúdo (pelo menos 15 minutos)
* siga entre 10 modelos de conteúdo adulto da mesma estética da sua modelo e do mesmo país.
* 5 curtidas + comentários por dia, NÃO MAIS QUE ISSO

DIA 4:
* Poste 2 REELS
* poste 1 FEED por dia
* POSTE 1 STORY por dia
* Consuma conteúdo (pelo menos 15 minutos)
* siga entre 10 modelos de conteúdo adulto OU DE LEAD (5/5, 3/7, etc..)
* 5 curtidas + comentários por dia, NÃO MAIS QUE ISSO

REPITA até o dia 20`;

  const handleCopiarRoteiro = () => {
    navigator.clipboard.writeText(textoRoteiroAcelerado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const situacaoEfetiva = modelo.situacao_aquecimento;
  const esteiraEfetiva = modelo.esteira_aquecimento;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 10, 0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 220,
        backdropFilter: 'blur(8px)',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          position: 'relative',
          background: '#0F1318',
          border: '1px solid #30363D',
          borderRadius: 20,
          width: '100%',
          maxWidth: 820,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 240, 255, 0.08)',
          overflow: 'hidden'
        }}
      >
        {/* TOPO / CABEÇALHO DO MODAL */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid #21262D',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, rgba(22, 27, 34, 0.8) 0%, rgba(15, 19, 24, 0.95) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(113, 0, 226, 0.2), rgba(0, 240, 255, 0.2))',
              border: '1px solid rgba(0, 240, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00F0FF',
              boxShadow: '0 0 16px rgba(0, 240, 255, 0.25)'
            }}>
              <CheckSquare size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#F0F6FC', margin: 0 }}>
                  Tarefas & Esteira da Modelo
                </h2>
                {situacaoEfetiva && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: situacaoEfetiva === 'AQUECIDA' ? 'rgba(0, 255, 102, 0.12)' : 'rgba(255, 170, 0, 0.15)',
                    border: `1px solid ${situacaoEfetiva === 'AQUECIDA' ? 'rgba(0, 255, 102, 0.4)' : 'rgba(255, 170, 0, 0.4)'}`,
                    color: situacaoEfetiva === 'AQUECIDA' ? '#00FF66' : '#FFAA00',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    {situacaoEfetiva === 'AQUECIDA' ? <Zap size={12} /> : <Flame size={12} />}
                    {situacaoEfetiva === 'AQUECIDA' ? 'Modelo Aquecida' : (
                      esteiraEfetiva === 'ACELERADO' ? 'Aquecimento Acelerado' :
                      esteiraEfetiva === 'TORRE_CHAMPAGNE' ? 'Torre de Champagne' : 'Aquecimento Normal'
                    )}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#8B949E', marginTop: 2 }}>
                @{modelo.username} {modelo.nome ? `(${modelo.nome})` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {situacaoEfetiva && etapaAtual === 'VER_TAREFAS' && (
              <button
                type="button"
                onClick={() => setEtapaManual('PERGUNTAR_SITUACAO')}
                title="Alterar situação ou esteira da modelo"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid #30363D',
                  color: '#8B949E',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#00F0FF'; e.currentTarget.style.color = '#F0F6FC'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363D'; e.currentTarget.style.color = '#8B949E'; }}
              >
                <RotateCcw size={12} />
                Trocar situação
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8B949E',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = '#21262D'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* CONTEÚDO SCROLLÁVEL */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>

          {/* ====================================================
              PASSO 1: VERIFICAR SITUAÇÃO DA MODELO
              ==================================================== */}
          {etapaAtual === 'PERGUNTAR_SITUACAO' && (
            <div style={{ maxWidth: 640, margin: '16px auto', textAlign: 'center' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1.5px solid #00F0FF',
                color: '#00F0FF',
                marginBottom: 16,
                boxShadow: '0 0 20px rgba(0, 240, 255, 0.25)'
              }}>
                <Sparkles size={28} />
              </div>

              <h3 style={{ fontSize: 22, fontWeight: 800, color: '#F0F6FC', marginBottom: 8 }}>
                Qual é a situação atual desta modelo?
              </h3>
              <p style={{ fontSize: 14, color: '#8B949E', marginBottom: 28, lineHeight: 1.5 }}>
                Esta configuração será salva no banco para <strong>@{modelo.username}</strong> e as tarefas adequadas serão carregadas automaticamente nas próximas vezes.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* 1 - Modelo em Aquecimento */}
                <div
                  onClick={() => !salvando && handleEscolherSituacao('EM_AQUECIMENTO')}
                  style={{
                    background: 'rgba(255, 170, 0, 0.05)',
                    border: '1.5px solid rgba(255, 170, 0, 0.3)',
                    borderRadius: 14,
                    padding: '24px 20px',
                    cursor: salvando ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = '#FFAA00';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(255, 170, 0, 0.2)';
                    e.currentTarget.style.background = 'rgba(255, 170, 0, 0.1)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'rgba(255, 170, 0, 0.3)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.background = 'rgba(255, 170, 0, 0.05)';
                  }}
                >
                  <div>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: 'rgba(255, 170, 0, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFAA00',
                      marginBottom: 14
                    }}>
                      <Flame size={24} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#FFAA00', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                      Opção 1
                    </div>
                    <h4 style={{ fontSize: 17, fontWeight: 800, color: '#F0F6FC', margin: '0 0 8px 0' }}>
                      Modelo em Aquecimento
                    </h4>
                    <p style={{ fontSize: 12, color: '#8B949E', lineHeight: 1.5, margin: 0 }}>
                      Conta nova ou recente em processo de maturação e blindagem algorítmica contra bloqueios.
                    </p>
                  </div>
                  <div style={{
                    marginTop: 18,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#FFAA00'
                  }}>
                    <span>Configurar esteira</span>
                    <ArrowRight size={14} />
                  </div>
                </div>

                {/* 2 - Modelo Aquecida */}
                <div
                  onClick={() => !salvando && handleEscolherSituacao('AQUECIDA')}
                  style={{
                    background: 'rgba(0, 255, 102, 0.05)',
                    border: '1.5px solid rgba(0, 255, 102, 0.3)',
                    borderRadius: 14,
                    padding: '24px 20px',
                    cursor: salvando ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = '#00FF66';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 255, 102, 0.2)';
                    e.currentTarget.style.background = 'rgba(0, 255, 102, 0.1)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'rgba(0, 255, 102, 0.3)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.background = 'rgba(0, 255, 102, 0.05)';
                  }}
                >
                  <div>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: 'rgba(0, 255, 102, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#00FF66',
                      marginBottom: 14
                    }}>
                      <Zap size={24} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#00FF66', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                      Opção 2
                    </div>
                    <h4 style={{ fontSize: 17, fontWeight: 800, color: '#F0F6FC', margin: '0 0 8px 0' }}>
                      Modelo Aquecida
                    </h4>
                    <p style={{ fontSize: 12, color: '#8B949E', lineHeight: 1.5, margin: 0 }}>
                      Conta já maturada, com histórico estável e liberada para rotina operacional e escala de postagens.
                    </p>
                  </div>
                  <div style={{
                    marginTop: 18,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#00FF66'
                  }}>
                    <span>Salvar e ver rotina</span>
                    <ArrowRight size={14} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================
              PASSO 2: ESCOLHER ESTEIRA DE AQUECIMENTO
              ==================================================== */}
          {etapaAtual === 'ESCOLHER_ESTEIRA' && (
            <div style={{ maxWidth: 740, margin: '8px auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#FFAA00',
                  letterSpacing: '0.06em',
                  background: 'rgba(255, 170, 0, 0.1)',
                  padding: '3px 10px',
                  borderRadius: 6
                }}>
                  Modelo em Aquecimento
                </span>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: '#F0F6FC', marginTop: 8, marginBottom: 6 }}>
                  Escolha a Esteira de Aquecimento
                </h3>
                <p style={{ fontSize: 13, color: '#8B949E', margin: 0 }}>
                  Selecione qual metodologia será aplicada para <strong>@{modelo.username}</strong>:
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {/* 1. AQUECIMENTO NORMAL */}
                <div
                  onClick={() => !salvando && handleEscolherEsteira('NORMAL')}
                  style={{
                    background: '#161B22',
                    border: '1.5px solid #30363D',
                    borderRadius: 14,
                    padding: '22px 18px',
                    cursor: salvando ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#58A6FF';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(88, 166, 255, 0.2)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#30363D';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(88, 166, 255, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#58A6FF',
                      marginBottom: 12
                    }}>
                      <Layers size={20} />
                    </div>
                    <h4 style={{ fontSize: 15, fontWeight: 800, color: '#F0F6FC', margin: '0 0 6px 0' }}>
                      AQUECIMENTO NORMAL
                    </h4>
                    <p style={{ fontSize: 12, color: '#8B949E', lineHeight: 1.45, margin: 0 }}>
                      Esteira com ritmo padrão progressivo para contas sem urgência de tráfego.
                    </p>
                  </div>
                  <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, color: '#58A6FF', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Selecionar <ArrowRight size={12} />
                  </div>
                </div>

                {/* 2. AQUECIMENTO ACELERADO (DESTAQUE) */}
                <div
                  onClick={() => !salvando && handleEscolherEsteira('ACELERADO')}
                  style={{
                    background: 'linear-gradient(145deg, rgba(0, 240, 255, 0.08) 0%, rgba(113, 0, 226, 0.12) 100%)',
                    border: '2px solid #00F0FF',
                    borderRadius: 14,
                    padding: '22px 18px',
                    cursor: salvando ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 0 20px rgba(0, 240, 255, 0.15)',
                    position: 'relative'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 240, 255, 0.3)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 240, 255, 0.15)';
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: -10,
                    right: 14,
                    background: 'linear-gradient(135deg, #00F0FF, #7100E2)',
                    color: '#0B0E14',
                    fontWeight: 800,
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 10,
                    letterSpacing: '0.04em'
                  }}>
                    ESTEIRA RÁPIDA
                  </div>

                  <div>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(0, 240, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#00F0FF',
                      marginBottom: 12
                    }}>
                      <Flame size={20} />
                    </div>
                    <h4 style={{ fontSize: 15, fontWeight: 800, color: '#00F0FF', margin: '0 0 6px 0' }}>
                      AQUECIMENTO ACELERADO
                    </h4>
                    <p style={{ fontSize: 12, color: '#C9D1D9', lineHeight: 1.45, margin: 0 }}>
                      Setup rigoroso do aparelho + protocolo intensivo de 20 dias para blindagem e escala rápida.
                    </p>
                  </div>
                  <div style={{ marginTop: 18, fontSize: 12, fontWeight: 800, color: '#00F0FF', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Abrir Roteiro Completo <ArrowRight size={12} />
                  </div>
                </div>

                {/* 3. AQUECIMENTO TORRE DE CHAMPAGNE */}
                <div
                  onClick={() => !salvando && handleEscolherEsteira('TORRE_CHAMPAGNE')}
                  style={{
                    background: '#161B22',
                    border: '1.5px solid #30363D',
                    borderRadius: 14,
                    padding: '22px 18px',
                    cursor: salvando ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#E3B341';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(227, 179, 65, 0.2)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#30363D';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(227, 179, 65, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#E3B341',
                      marginBottom: 12
                    }}>
                      <Wine size={20} />
                    </div>
                    <h4 style={{ fontSize: 15, fontWeight: 800, color: '#F0F6FC', margin: '0 0 6px 0' }}>
                      TORRE DE CHAMPAGNE
                    </h4>
                    <p style={{ fontSize: 12, color: '#8B949E', lineHeight: 1.45, margin: 0 }}>
                      Estratégia em cascata multiconas, distribuição simultânea de autoridade e tráfego cruzado.
                    </p>
                  </div>
                  <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, color: '#E3B341', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Selecionar <ArrowRight size={12} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================
              PASSO 3: VISUALIZAÇÃO DAS TAREFAS / ROTEIROS
              ==================================================== */}
          {etapaAtual === 'VER_TAREFAS' && (
            <div>
              {/* CASO: MODELO AQUECIDA */}
              {situacaoEfetiva === 'AQUECIDA' && (
                <div style={{ maxWidth: 700, margin: '0 auto' }}>
                  <div style={{
                    background: 'rgba(0, 255, 102, 0.08)',
                    border: '1px solid rgba(0, 255, 102, 0.3)',
                    borderRadius: 12,
                    padding: '20px 24px',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16
                  }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'rgba(0, 255, 102, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#00FF66',
                      flexShrink: 0
                    }}>
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: 16, fontWeight: 800, color: '#00FF66', margin: '0 0 4px 0' }}>
                        Modelo Aquecida e Pronta para Escala
                      </h4>
                      <p style={{ fontSize: 13, color: '#C9D1D9', margin: 0, lineHeight: 1.4 }}>
                        A conta de <strong>@{modelo.username}</strong> já passou pelo período crítico de maturação. Siga a rotina operacional regular de publicações e engajamento:
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { id: 'aq_1', titulo: 'Verificar Comentários e Directs', desc: 'Responder leads pendentes na Central de Respostas para manter o índice de resposta alto.' },
                      { id: 'aq_2', titulo: 'Conferir Agendamentos de Posts & Reels', desc: 'Garantir pelo menos 1 a 2 Reels e 1 Feed programados para os horários de pico.' },
                      { id: 'aq_3', titulo: 'Publicação de Stories Diários', desc: 'Postar sequência de Stories (enquetes, bastidores e chamadas para ação).' },
                      { id: 'aq_4', titulo: 'Interação Orgânica do Dia', desc: 'Consumir conteúdo por 15 minutos e interagir organicamente no nicho.' },
                      { id: 'aq_5', titulo: 'Acompanhar Tração e Métricas', desc: 'Verificar a aba Análise para acompanhar views e novos seguidores.' },
                    ].map(t => {
                      const checked = Boolean(tarefasConcluidas[t.id]);
                      return (
                        <div
                          key={t.id}
                          onClick={() => toggleCheck(t.id)}
                          style={{
                            background: checked ? 'rgba(0, 255, 102, 0.05)' : '#161B22',
                            border: `1px solid ${checked ? 'rgba(0, 255, 102, 0.35)' : '#30363D'}`,
                            borderRadius: 10,
                            padding: '14px 18px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 14,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ color: checked ? '#00FF66' : '#8B949E', marginTop: 2 }}>
                            {checked ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <div>
                            <div style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: checked ? '#00FF66' : '#F0F6FC',
                              textDecoration: checked ? 'line-through' : 'none'
                            }}>
                              {t.titulo}
                            </div>
                            <div style={{ fontSize: 12, color: '#8B949E', marginTop: 3, lineHeight: 1.4 }}>
                              {t.desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CASO: ESTEIRA ACELERADA (ESTEIRA RÁPIDA COMPLETA) */}
              {situacaoEfetiva === 'EM_AQUECIMENTO' && esteiraEfetiva === 'ACELERADO' && (
                <div>
                  {/* Banner de Título com Botão de Copiar */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.12), rgba(113, 0, 226, 0.15))',
                    border: '1px solid rgba(0, 240, 255, 0.35)',
                    borderRadius: 14,
                    padding: '16px 20px',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flame size={18} color="#00F0FF" />
                        <h4 style={{ fontSize: 16, fontWeight: 800, color: '#00F0FF', margin: 0 }}>
                          ESTEIRA RÁPIDA (AQUECIMENTO ACELERADO)
                        </h4>
                      </div>
                      <p style={{ fontSize: 12, color: '#C9D1D9', margin: '4px 0 0 0' }}>
                        Protocolo intensivo de blindagem de dispositivo e maturação de 20 dias para @{modelo.username}.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopiarRoteiro}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 14px',
                        background: copiado ? '#238636' : 'rgba(0, 240, 255, 0.15)',
                        border: `1px solid ${copiado ? '#2ea043' : 'rgba(0, 240, 255, 0.4)'}`,
                        borderRadius: 8,
                        color: copiado ? '#fff' : '#00F0FF',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {copiado ? <Check size={14} /> : <Copy size={14} />}
                      {copiado ? 'Copiado!' : 'Copiar Roteiro'}
                    </button>
                  </div>

                  {/* BLOCO 1: CONFIGURAÇÃO DO CELULAR */}
                  <div style={{
                    background: '#161B22',
                    border: '1px solid rgba(248, 81, 73, 0.3)',
                    borderRadius: 12,
                    padding: '18px 20px',
                    marginBottom: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Smartphone size={16} color="#F85149" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#F85149', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        PREPARAÇÃO DO APARELHO (SETUP INICIAL CRÍTICO)
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { id: 'cel_1', texto: 'FORMATE O CELULAR' },
                        { id: 'cel_2', texto: 'USE CONTA GOOGLE OU APPLE NOVA' },
                        { id: 'cel_3', texto: 'DEFINA IDADE COM PELO MENOS 21 ANOS' },
                        { id: 'cel_4', texto: 'DESATIVE SERVIÇO DE LOCALIZAÇÃO' },
                        { id: 'cel_5', texto: 'SE FOR IPHONE: NÃO ACEITE ICLOUD KEYCHAIN E OPTE POR NÃO COMPARTILHAR DADOS ANALÍTICOS' },
                        { id: 'cel_6', texto: 'BAIXE 3 APPS ANTES DE BAIXAR O INSTAGRAM' },
                      ].map(item => {
                        const checked = Boolean(tarefasConcluidas[item.id]);
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleCheck(item.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              background: checked ? 'rgba(46, 160, 67, 0.1)' : 'rgba(0, 0, 0, 0.25)',
                              border: `1px solid ${checked ? 'rgba(46, 160, 67, 0.4)' : '#21262D'}`,
                              borderRadius: 8,
                              padding: '8px 12px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <span style={{ color: checked ? '#00FF66' : '#8B949E' }}>
                              {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                            </span>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: checked ? '#00FF66' : '#F0F6FC',
                              textDecoration: checked ? 'line-through' : 'none',
                              lineHeight: 1.3
                            }}>
                              {item.texto}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* BLOCO 2: DIAS 1 E 2 */}
                  <div style={{
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: 12,
                    padding: '18px 20px',
                    marginBottom: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Calendar size={16} color="#00F0FF" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#00F0FF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        DIA 1 E 2: CRIAÇÃO & PRIMEIROS PASSOS
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { id: 'd12_1', texto: 'Configure nome de usuário (sem número, sem letras repetidas e sem caracteres especiais)' },
                        { id: 'd12_2', texto: 'NUNCA crie carolina1, carolina2... para contas de mesma modelo' },
                        { id: 'd12_3', texto: 'Coloque nome no perfil e bio estruturada' },
                        { id: 'd12_4', texto: 'Adicione uma foto de perfil (quando tiver mais de 1 conta, use ilustração da modelo - fotos devem ser white)' },
                        { id: 'd12_5', texto: 'Siga entre 10 a 20 modelos de conteúdo adulto da mesma estética da sua modelo e do mesmo país' },
                        { id: 'd12_6', texto: 'Deixe nas primeiras 48h no MÁXIMO 10 curtidas + comentários por dia, NÃO MAIS QUE ISSO' },
                        { id: 'd12_7', texto: 'Poste 1 FEED por dia' },
                        { id: 'd12_8', texto: 'Poste 1 STORY por dia' },
                        { id: 'd12_9', texto: 'Consuma conteúdo (pelo menos 15 minutos) * SEMPRE REMOVA METADADOS das mídias' },
                      ].map(item => {
                        const checked = Boolean(tarefasConcluidas[item.id]);
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleCheck(item.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              background: checked ? 'rgba(0, 255, 102, 0.06)' : 'rgba(0, 0, 0, 0.2)',
                              border: `1px solid ${checked ? 'rgba(0, 255, 102, 0.3)' : '#21262D'}`,
                              borderRadius: 8,
                              padding: '8px 12px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <span style={{ color: checked ? '#00FF66' : '#8B949E' }}>
                              {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                            </span>
                            <span style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: checked ? '#00FF66' : '#C9D1D9',
                              textDecoration: checked ? 'line-through' : 'none'
                            }}>
                              {item.texto}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* BLOCO 3: DIA 3 */}
                  <div style={{
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: 12,
                    padding: '18px 20px',
                    marginBottom: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Calendar size={16} color="#A855F7" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#A855F7', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        DIA 3: INTRODUÇÃO DE REELS
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { id: 'd3_1', texto: 'Poste 1 REEL' },
                        { id: 'd3_2', texto: 'Poste 1 FEED por dia' },
                        { id: 'd3_3', texto: 'Poste 1 STORY por dia' },
                        { id: 'd3_4', texto: 'Consuma conteúdo (pelo menos 15 minutos)' },
                        { id: 'd3_5', texto: 'Siga entre 10 modelos de conteúdo adulto da mesma estética da sua modelo e do mesmo país' },
                        { id: 'd3_6', texto: '5 curtidas + comentários por dia, NÃO MAIS QUE ISSO' },
                      ].map(item => {
                        const checked = Boolean(tarefasConcluidas[item.id]);
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleCheck(item.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              background: checked ? 'rgba(0, 255, 102, 0.06)' : 'rgba(0, 0, 0, 0.2)',
                              border: `1px solid ${checked ? 'rgba(0, 255, 102, 0.3)' : '#21262D'}`,
                              borderRadius: 8,
                              padding: '8px 12px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <span style={{ color: checked ? '#00FF66' : '#8B949E' }}>
                              {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                            </span>
                            <span style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: checked ? '#00FF66' : '#C9D1D9',
                              textDecoration: checked ? 'line-through' : 'none'
                            }}>
                              {item.texto}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* BLOCO 4: DIA 4 ATÉ O DIA 20 */}
                  <div style={{
                    background: 'linear-gradient(180deg, #161B22 0%, rgba(22, 27, 34, 0.6) 100%)',
                    border: '1.5px solid rgba(0, 255, 102, 0.3)',
                    borderRadius: 12,
                    padding: '18px 20px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={16} color="#00FF66" />
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#00FF66', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          DIA 4: ESCALA DIÁRIA (REPITA ATÉ O DIA 20)
                        </span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(0, 255, 102, 0.15)', color: '#00FF66' }}>
                        REPITA ATÉ O DIA 20
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { id: 'd4_1', texto: 'Poste 2 REELS por dia' },
                        { id: 'd4_2', texto: 'Poste 1 FEED por dia' },
                        { id: 'd4_3', texto: 'Poste 1 STORY por dia' },
                        { id: 'd4_4', texto: 'Consuma conteúdo (pelo menos 15 minutos diários)' },
                        { id: 'd4_5', texto: 'Siga entre 10 modelos de conteúdo adulto OU DE LEAD (5/5, 3/7, etc..)' },
                        { id: 'd4_6', texto: '5 curtidas + comentários por dia, NÃO MAIS QUE ISSO' },
                      ].map(item => {
                        const checked = Boolean(tarefasConcluidas[item.id]);
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleCheck(item.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              background: checked ? 'rgba(0, 255, 102, 0.06)' : 'rgba(0, 0, 0, 0.2)',
                              border: `1px solid ${checked ? 'rgba(0, 255, 102, 0.3)' : '#21262D'}`,
                              borderRadius: 8,
                              padding: '8px 12px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <span style={{ color: checked ? '#00FF66' : '#8B949E' }}>
                              {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                            </span>
                            <span style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: checked ? '#00FF66' : '#C9D1D9',
                              textDecoration: checked ? 'line-through' : 'none'
                            }}>
                              {item.texto}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* CASO: AQUECIMENTO NORMAL */}
              {situacaoEfetiva === 'EM_AQUECIMENTO' && esteiraEfetiva === 'NORMAL' && (
                <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', padding: '30px 20px' }}>
                  <div style={{
                    width: 50,
                    height: 50,
                    borderRadius: 12,
                    background: 'rgba(88, 166, 255, 0.15)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#58A6FF',
                    marginBottom: 16
                  }}>
                    <Layers size={26} />
                  </div>
                  <h4 style={{ fontSize: 18, fontWeight: 800, color: '#F0F6FC', marginBottom: 8 }}>
                    Esteira de Aquecimento Normal
                  </h4>
                  <p style={{ fontSize: 13, color: '#8B949E', maxWidth: 520, margin: '0 auto 24px auto', lineHeight: 1.5 }}>
                    Esta esteira segue o ritmo progressivo padrão para aquecimento orgânico de @{modelo.username}.
                  </p>
                  <div style={{
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: 12,
                    padding: '20px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}>
                    <div style={{ fontSize: 13, color: '#C9D1D9' }}>• <strong>Dias 1-3:</strong> Configuração de perfil, consumo diário de 20 min e 5-10 interações orgânicas leves.</div>
                    <div style={{ fontSize: 13, color: '#C9D1D9' }}>• <strong>Dias 4-7:</strong> 1 Feed + 1 Story por dia, seguir 5-10 perfis do nicho.</div>
                    <div style={{ fontSize: 13, color: '#C9D1D9' }}>• <strong>Dias 8+:</strong> Início de Reels (1 a cada 2 dias) e expansão gradual de stories e engajamento.</div>
                  </div>
                </div>
              )}

              {/* CASO: AQUECIMENTO TORRE DE CHAMPAGNE */}
              {situacaoEfetiva === 'EM_AQUECIMENTO' && esteiraEfetiva === 'TORRE_CHAMPAGNE' && (
                <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', padding: '30px 20px' }}>
                  <div style={{
                    width: 50,
                    height: 50,
                    borderRadius: 12,
                    background: 'rgba(227, 179, 65, 0.15)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#E3B341',
                    marginBottom: 16
                  }}>
                    <Wine size={26} />
                  </div>
                  <h4 style={{ fontSize: 18, fontWeight: 800, color: '#F0F6FC', marginBottom: 8 }}>
                    Esteira Torre de Champagne
                  </h4>
                  <p style={{ fontSize: 13, color: '#8B949E', maxWidth: 520, margin: '0 auto 24px auto', lineHeight: 1.5 }}>
                    Estratégia multiconas interligadas em cascata para transbordar tráfego para a conta principal de @{modelo.username}.
                  </p>
                  <div style={{
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: 12,
                    padding: '20px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}>
                    <div style={{ fontSize: 13, color: '#C9D1D9' }}>• <strong>Nível 1 (Topo da Torre):</strong> Perfil principal com identidade consolidada e conversão direta.</div>
                    <div style={{ fontSize: 13, color: '#C9D1D9' }}>• <strong>Nível 2 (Perfis Satélites):</strong> Contas em aquecimento direcionando tráfego via menções e colaborações estratégicas.</div>
                    <div style={{ fontSize: 13, color: '#C9D1D9' }}>• <strong>Distribuição:</strong> Transbordo de engajamento conforme as contas satélites atingem o limiar de 14 dias de maturação.</div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
