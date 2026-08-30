"use client";
export const dynamic = 'force-dynamic';
import React, { useState, useEffect } from 'react';
import {
  TrendingUp, ExternalLink, LogOut, Calendar, Search, Users, MessageSquare, Eye, EyeOff, Heart, Filter,
  BarChart3, Play, Hash, Hash as TagIcon, Image as ImageIcon, Film as VideoIcon, Layers as LayersIcon,
  HelpCircle, CheckCircle2, DollarSign, Wallet, FileText, X, Brain, AlertTriangle, BadgeCheck, History
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, AreaChart, Area, ReferenceLine, CartesianGrid,
  Legend, BarChart, Bar, Brush, ReferenceArea, ReferenceDot,
} from 'recharts';
interface Props {
  isOpen: boolean;
  onClose: () => void;
  username?: string;
  onSave: (payload: any) => void;
}
import ModalLancamento from "../components/ModalLancamento";
import GraficoProjecao from "../components/GraficoProjecao";
import CentralAnomalias from "../components/CentralAnomalias";
import CentralAutomatizacao from "../components/CentralAutomatizacao";
import CentralRespostas from "../components/CentralRespostas";
import AvatarModelo from "../components/AvatarModelo";

const ModalLancamentoInline = ({ isOpen, onClose, username, onSave, perfisDisponiveis }: any) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const [dados, setDados] = useState({
    tipo: 'despesa',
    valor_original: 0,
    moeda: 'BRL',
    taxa_conversao: 1,
    data_lancamento: new Date().toISOString().split('T')[0],
    descricao: '',
    rateio: false,
    perfis_rateio: username ? [username] : []
  });

  if (!isOpen) return null;

  const valorBrl = dados.valor_original * dados.taxa_conversao;
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal-window"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-white mb-4">Novo Lançamento {username ? ` para @${username}` : '(Rateado)'}</h3>

        <div className="modal-content">
          <div className="form-group">
            <label>Tipo</label>
            <select
              className="modal-select"
              value={dados.tipo}
              onChange={(e) => setDados({ ...dados, tipo: e.target.value })}
            >
              <option value="despesa">Despesa (Saída)</option>
              <option value="recebido">Recebido (Entrada)</option>
            </select>
          </div>
          <div className="modal-grid">
            <div className="form-group">
              <label>Data Evento</label>
              <input
                type="date"
                className="modal-select"
                value={dados.data_lancamento}
                onChange={(e) => setDados({ ...dados, data_lancamento: e.target.value })}
              />
            </div>
          </div>
          <div className="modal-grid">
            <div className="form-group">
              <label>Valor Original</label>
              <input
                type="number"
                className="w-full bg-slate-800 border-slate-700 rounded-lg text-white p-2"
                value={dados.valor_original}
                onChange={(e) => setDados({ ...dados, valor_original: Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label>Moeda</label>
              <select
                className="w-full bg-slate-800 border-slate-700 rounded-lg text-white p-2"
                value={dados.moeda}
                onChange={(e) => setDados({ ...dados, moeda: e.target.value, taxa_conversao: e.target.value === 'BRL' ? 1 : dados.taxa_conversao })}
              >
                <option value="BRL">BRL (R$)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>

          {dados.moeda !== 'BRL' && (
            <div className="form-group">
              <label>Taxa de Conversão (1 {dados.moeda} = X BRL)</label>
              <input
                type="number" step="0.01"
                className="w-full bg-slate-800 border-slate-700 rounded-lg text-white p-2"
                value={dados.taxa_conversao}
                onChange={(e) => setDados({ ...dados, taxa_conversao: Number(e.target.value) })}
              />
            </div>
          )}

          <div className="total-card">
            <span className="text-xs text-slate-400 block uppercase font-bold">Total Estimado</span>
            <span className="text-xl font-mono text-emerald-400">R$ {valorBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="form-group">
            <label>Descrição</label>
            <input
              type="text" placeholder="Ex: Tráfego Pago, Designer..."
              className="w-full bg-slate-800 border-slate-700 rounded-lg text-white p-2"
              value={dados.descricao}
              onChange={(e) => setDados({ ...dados, descricao: e.target.value })}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">Cancelar</button>
          <button
            onClick={() => onSave({ ...dados, valor_brl: valorBrl })}
            className="btn-save"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};
// 🚀 Nova formatação à prova de fuso horário (Timezone)
const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    // Isola apenas a parte da data se houver hora junta (ex: "2026-07-12T00:00:00.000Z" -> "2026-07-12")
    const apenasData = dateStr.split(' ')[0].split('T')[0];

    // Divide "AAAA-MM-DD" em partes
    const partes = apenasData.split('-');

    // Se não estiver no formato esperado (ex: se já estiver formatada), retorna o texto original
    if (partes.length !== 3) return dateStr;

    const [ano, mes, dia] = partes;

    // Junta no formato DD/MM/AAAA puro
    return `${dia}/${mes}/${ano}`;
  } catch {
    return dateStr;
  }
};

// Converte ID numérico de mídia do Instagram (ex: 3924559581854350296) para Shortcode base64 (ex: DZ21iWASLvY)
const idToShortcode = (idInput: string | number): string => {
  if (!idInput) return '';
  const strId = String(idInput).split('_')[0].trim();
  if (/[a-zA-Z]/.test(strId)) return strId;
  try {
    let bigId = BigInt(strId);
    if (bigId <= BigInt(0)) return strId;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let shortcode = '';
    const sixtyFour = BigInt(64);
    const zero = BigInt(0);
    while (bigId > zero) {
      const remainder = Number(bigId % sixtyFour);
      bigId = bigId / sixtyFour;
      shortcode = alphabet[remainder] + shortcode;
    }
    return shortcode;
  } catch {
    return strId;
  }
};

const getInstagramPostUrl = (post: any): string => {
  if (!post) return '#';

  if (post.shortcode && post.shortcode !== 'None' && post.shortcode !== 'null' && /[a-zA-Z]/.test(post.shortcode)) {
    return `https://www.instagram.com/p/${post.shortcode}/`;
  }

  const targetLink = post.link || post.url || '';
  if (targetLink) {
    const match = String(targetLink).match(/\/p\/(\d+)\/?/);
    if (match && match[1]) {
      const converted = idToShortcode(match[1]);
      return `https://www.instagram.com/p/${converted}/`;
    }
    if (targetLink.includes('/p/')) return targetLink;
  }

  if (post.post_id) {
    const code = idToShortcode(post.post_id);
    if (code) return `https://www.instagram.com/p/${code}/`;
  }

  if (post.username) {
    return `https://www.instagram.com/${post.username}/`;
  }

  return '#';
};

// ============================================================
// 🎯 PERFORMANCE SCORE — Cálculo dos 3 Pilares (0–100)
// ============================================================

/**
 * Retorna a mediana de um array de números.
 */
function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calcula a idade em dias desde a primeira_postagem até a data da última coleta.
 */
function calcularIdadeDias(primeiraPostagem: string | null, dataColeta: string | null): number {
  if (!primeiraPostagem || !dataColeta) return 0;
  try {
    const inicio = new Date(primeiraPostagem.split(' ')[0].split('T')[0] + 'T00:00:00');
    const fim = new Date(dataColeta.split(' ')[0].split('T')[0] + 'T00:00:00');
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return 0;
    const diff = (fim.getTime() - inicio.getTime()) / 86400000;
    return Math.max(1, diff);
  } catch {
    return 0;
  }
}

interface PillarDetail {
  sCrescimento: number;
  sRitmo: number;
  sEficiencia: number;
  ganhoDiarioReal: number;
  postsPorDiaReal: number;
  eficienciaReal: number;
  medGanhoBenchmark: number;
  medEficienciaBenchmark: number;
}

interface PSResult {
  score: number;
  detail: PillarDetail;
}

/**
 * Calcula o Performance Score (0–100) para um perfil.
 * Requer: primeira_postagem, seguidores, total_posts e data_coleta.
 */
function calcularPerformanceScore(
  perfil: any,
  allProfiles: any[],
): PSResult | null {
  // Sem data de início, impossível calcular
  if (!perfil.primeira_postagem) return null;

  const idadeDias = calcularIdadeDias(perfil.primeira_postagem, perfil.data_coleta);
  const seguidoresAtual = Number(perfil.seguidores) || 0;
  const totalPosts = Number(perfil.total_posts) || 0;

  // Pilar 1: Ganho diário de seguidores
  const ganhoDiarioReal = seguidoresAtual / Math.max(1, idadeDias);

  // Pilar 2: Ritmo de postagem (posts por dia)
  const postsPorDiaReal = totalPosts / Math.max(1, idadeDias);

  // Pilar 3: Eficiência (seguidores por post)
  const eficienciaReal = totalPosts > 0 ? seguidoresAtual / totalPosts : 0;

  // ── Benchmark: perfis do mesmo tipo_conta onde meu_perfil = 0 (ou null) ──
  const tipoConta = perfil.tipo_conta || '';
  const benchmarkPerfis = allProfiles.filter(p =>
    (p.meu_perfil === 0 || p.meu_perfil === null) &&
    (p.tipo_conta || '') === tipoConta &&
    p.primeira_postagem != null
  );

  const benchGanhos: number[] = benchmarkPerfis.map(b => {
    const id = calcularIdadeDias(b.primeira_postagem, b.data_coleta);
    return (Number(b.seguidores) || 0) / Math.max(1, id);
  });

  const benchEficiencias: number[] = benchmarkPerfis.map(b => {
    const posts = Number(b.total_posts) || 0;
    return posts > 0 ? (Number(b.seguidores) || 0) / posts : 0;
  });

  const medGanhoBenchmark = mediana(benchGanhos);
  const medEficienciaBenchmark = mediana(benchEficiencias);

  // ── S_crescimento (40%) ──
  let sCrescimento: number;
  if (idadeDias < 3 && ganhoDiarioReal === 0) {
    // Conta nova sem histórico suficiente → valor neutro provisório
    sCrescimento = 50;
  } else if (medGanhoBenchmark <= 0) {
    // Sem benchmark disponível → neutro
    sCrescimento = 50;
  } else {
    sCrescimento = Math.min(100, (ganhoDiarioReal / medGanhoBenchmark) * 50);
  }

  // ── S_ritmo (35%) ──
  const META_POSTS_DIA = 1.8;
  const sRitmo = Math.min(100, (postsPorDiaReal / META_POSTS_DIA) * 100);

  // ── S_eficiência (25%) ──
  let sEficiencia: number;
  if (medEficienciaBenchmark <= 0) {
    sEficiencia = 50; // Sem benchmark → neutro
  } else {
    sEficiencia = Math.min(100, (eficienciaReal / medEficienciaBenchmark) * 50);
  }

  const score = Math.round(
    0.40 * sCrescimento +
    0.35 * sRitmo +
    0.25 * sEficiencia
  );

  if (isNaN(score)) return null;

  return {
    score: Math.max(0, Math.min(100, score)),
    detail: {
      sCrescimento: Math.round(sCrescimento),
      sRitmo: Math.round(sRitmo),
      sEficiencia: Math.round(sEficiencia),
      ganhoDiarioReal,
      postsPorDiaReal,
      eficienciaReal,
      medGanhoBenchmark,
      medEficienciaBenchmark,
    }
  };
}

/**
 * Retorna cor e emoji de status com base no score.
 */
function psStatusInfo(score: number): { color: string; bg: string; border: string; emoji: string; label: string } {
  if (score >= 90) return { color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: '#10B981', emoji: '🟢', label: 'Alta Performance' };
  if (score >= 60) return { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: '#F59E0B', emoji: '🟡', label: 'Dentro do Esperado' };
  return { color: '#F85149', bg: 'rgba(248,81,73,0.12)', border: '#F85149', emoji: '🔴', label: 'Abaixo do Esperado' };
}


function ModalControleEditInline({ perfil, onClose, onSave }: { perfil: any; onClose: () => void; onSave: (d: any) => void }) {
  const [form, setForm] = useState({
    username: perfil.username,
    nome: perfil.nome || '',
    nascimento: perfil.nascimento || '',
    email: perfil.email || '',
    reserva: perfil.reserva || '',
    linktree: perfil.linktree || '',
    inicio: perfil.inicio || '',
    telegram: perfil.telegram || '',
    status: perfil.status || '⏳ Aguardando',
    foto_url: perfil.foto_url || '',
    nova_obs: '',
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("A imagem deve ter no máximo 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm(f => ({ ...f, foto_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const field = (label: string, key: string, type = 'text', placeholder = '') => (
    <div>
      <label style={{ fontSize: 11, color: '#8B949E', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>
        {label.toUpperCase()}
      </label>
      <input
        type={type}
        value={(form as any)[key]}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{
          width: '100%',
          background: '#0D1117',
          border: '1px solid #30363D',
          borderRadius: 8,
          padding: '10px 14px',
          color: 'white',
          fontSize: 13,
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.2s'
        }}
        onFocus={e => e.currentTarget.style.borderColor = '#00F0FF'}
        onBlur={e => e.currentTarget.style.borderColor = '#30363D'}
      />
    </div>
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div style={{ position: 'relative', background: '#12161A', border: '1px solid #30363D', borderRadius: 16, padding: 32, width: 720, maxHeight: '95vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>

        {/* Header Section */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingRight: 40 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1.5px solid #10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10B981',
            marginRight: 16,
            flexShrink: 0
          }}>
            <Users size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ color: '#8B949E', fontSize: 20, fontWeight: 800, lineHeight: 1 }}>@</span>
              <input
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="username"
                title="Clique para editar o @"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1.5px solid transparent',
                  color: 'white',
                  fontSize: 20,
                  fontWeight: 800,
                  outline: 'none',
                  width: '100%',
                  cursor: 'text',
                  padding: '2px 4px',
                  borderRadius: 4,
                  transition: 'border-color 0.2s, background 0.2s'
                }}
                onFocus={e => {
                  e.currentTarget.style.borderBottomColor = '#00F0FF';
                  e.currentTarget.style.background = 'rgba(0,240,255,0.05)';
                }}
                onBlur={e => {
                  e.currentTarget.style.borderBottomColor = 'transparent';
                  e.currentTarget.style.background = 'transparent';
                }}
              />
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button onClick={onClose} style={{
          background: 'transparent',
          border: 'none',
          color: '#8B949E',
          cursor: 'pointer',
          padding: 8,
          position: 'absolute',
          top: 28,
          right: 28,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
          onMouseEnter={e => e.currentTarget.style.color = 'white'}
          onMouseLeave={e => e.currentTarget.style.color = '#8B949E'}
        >
          <X size={20} />
        </button>

        {/* Form Body split in columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, marginBottom: 20 }}>

          {/* Left Column: Photo upload */}
          <div>
            <label style={{ fontSize: 11, color: '#8B949E', display: 'block', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>
              FOTO DE ROSTO
            </label>
            <div style={{
              border: '1px dashed #30363D',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#161B22',
              height: 290,
              boxSizing: 'border-box'
            }}>
              <div style={{
                width: 160,
                height: 160,
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#0D1117',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid #30363D',
                marginBottom: 12,
                boxShadow: '0 0 0 4px rgba(0,240,255,0.08)'
              }}>
                {form.foto_url ? (
                  <img src={form.foto_url} alt="Foto de Rosto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ color: '#8B949E', fontSize: 32 }}>👤</div>
                )}
              </div>
              <label style={{
                color: '#00F0FF',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4
              }}>
                <span style={{ fontSize: 14 }}>📤</span> Alterar foto
                <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
              </label>
              <span style={{ fontSize: 10, color: '#8B949E' }}>JPG, PNG • Máx. 5MB</span>
            </div>
          </div>

          {/* Right Column: Grid fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {field('Nome', 'nome', 'text', 'Digite o nome')}
            {field('Nascimento', 'nascimento', 'date')}
            {field('Início', 'inicio', 'date')}
            <div>
              <label style={{ fontSize: 11, color: '#8B949E', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>
                GRUPO TELEGRAM
              </label>
              <div style={{ display: 'flex', background: '#0D1117', border: '1px solid #30363D', borderRadius: 8, overflow: 'hidden', height: 41 }}>
                {(['SIM', 'NÃO'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, telegram: opt }))}
                    style={{
                      flex: 1,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                      transition: 'all 0.2s',
                      background: form.telegram === opt
                        ? (opt === 'SIM' ? '#0e4429' : '#3b1219')
                        : 'transparent',
                      color: form.telegram === opt
                        ? (opt === 'SIM' ? '#2ea043' : '#f85149')
                        : '#8B949E',
                      borderRight: opt === 'SIM' ? '1px solid #30363D' : 'none'
                    }}
                  >
                    {opt === 'SIM' ? '✅ SIM' : '❌ NÃO'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8B949E', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>
                RESERVA (FUTUROS)
              </label>
              <div style={{
                background: '#0D1117',
                border: '1px solid #30363D',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#58A6FF',
                fontSize: 13,
                fontWeight: 700,
                boxSizing: 'border-box'
              }}>
                📅 {form.reserva || 0} {Number(form.reserva) === 1 ? 'post agendado' : 'posts agendados'}
              </div>
            </div>
            {field('Linktree', 'linktree', 'text', 'https://linktree.ee/usuario')}

            <div>
              <label style={{ fontSize: 11, color: '#8B949E', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>
                STATUS
              </label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{
                  width: '100%',
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: 'white',
                  fontSize: 13,
                  outline: 'none',
                  height: 41,
                  boxSizing: 'border-box'
                }}
              >
                <option value="🚀 Em Uso">🚀 Em Uso</option>
                <option value="⏳ Aguardando">⏳ Aguardando</option>
                <option value="⛔ Pausado">⛔ Pausado</option>
                <option value="☠️ Morreu">☠️ Morreu</option>
              </select>
            </div>
          </div>

        </div>

        {/* Bottom full width textareas */}
        <div>
          <label style={{ fontSize: 11, color: '#8B949E', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>
            E-MAIL / USUÁRIO (um por linha)
          </label>
          <textarea
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            rows={4}
            placeholder="Digite os e-mails/usuários..."
            style={{
              width: '100%',
              background: '#0D1117',
              border: '1px solid #30363D',
              borderRadius: 8,
              padding: '12px 14px',
              color: 'white',
              fontSize: 13,
              boxSizing: 'border-box',
              resize: 'vertical',
              outline: 'none'
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#00F0FF'}
            onBlur={e => e.currentTarget.style.borderColor = '#30363D'}
          />
        </div>

        {/* Observations history/diary */}
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 11, color: '#8B949E', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>
            DIÁRIO DE OBSERVAÇÕES
          </label>
          <div style={{
            maxHeight: 150,
            overflowY: 'auto',
            background: '#0D1117',
            border: '1px solid #30363D',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 12
          }}>
            {(perfil.obs_historico || []).length === 0 ? (
              <span style={{ color: '#586069', fontSize: 12, fontStyle: 'italic' }}>Nenhuma observação registrada no diário.</span>
            ) : (
              (perfil.obs_historico || []).map((o: any, idx: number) => (
                <div key={o.id || idx} style={{ borderBottom: idx < (perfil.obs_historico || []).length - 1 ? '1px solid #21262D' : 'none', paddingBottom: idx < (perfil.obs_historico || []).length - 1 ? 8 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#00F0FF', fontSize: 11, fontWeight: 600 }}>Nota</span>
                    <span style={{ color: '#586069', fontSize: 10 }}>{formatDate(o.criado_em)}</span>
                  </div>
                  <p style={{ color: 'white', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>{o.texto}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 11, color: '#8B949E', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>
            NOVA OBSERVAÇÃO (ACRESCENTAR AO DIÁRIO)
          </label>
          <textarea
            value={form.nova_obs}
            onChange={e => setForm(f => ({ ...f, nova_obs: e.target.value }))}
            rows={2}
            placeholder="Adicione uma nova observação ou nota diária..."
            style={{
              width: '100%',
              background: '#0D1117',
              border: '1px solid #30363D',
              borderRadius: 8,
              padding: '12px 14px',
              color: 'white',
              fontSize: 13,
              boxSizing: 'border-box',
              resize: 'vertical',
              outline: 'none'
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#00F0FF'}
            onBlur={e => e.currentTarget.style.borderColor = '#30363D'}
          />
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 8,
              border: '1px solid #30363D',
              background: 'transparent',
              color: '#8B949E',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'white'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8B949E'; }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            style={{
              flex: 2,
              padding: '12px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #7100E2, #00F0FF)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              boxShadow: '0 4px 15px rgba(113, 0, 226, 0.3)',
              transition: 'transform 0.15s, opacity 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Salvar alterações
          </button>
        </div>

      </div>
    </div>
  );
}

function EditModal({ profile, onSave, onClose }: { profile: any; onSave: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(profile.username);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div style={{ background: "#161B22", border: "1px solid #30363D", borderRadius: 12, padding: 28, minWidth: 320 }}>
        <h3 style={{ color: "white", marginBottom: 16, fontSize: 16, fontWeight: 700 }}>✏️ Editar perfil</h3>
        <label style={{ color: "#8B949E", fontSize: 12, display: "block", marginBottom: 6 }}>Username do Instagram</label>
        <input value={value} onChange={e => setValue(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#0D1117", border: "1px solid #30363D", color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #30363D", background: "transparent", color: "#8B949E", cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => onSave(value)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7100E2,#00F0FF)", color: "white", cursor: "pointer", fontWeight: 700 }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function AddModal({ onSave, onClose }: { onSave: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div style={{ background: "#161B22", border: "1px solid #30363D", borderRadius: 12, padding: 28, minWidth: 320 }}>
        <h3 style={{ color: "white", marginBottom: 16, fontSize: 16, fontWeight: 700 }}>➕ Adicionar perfil</h3>
        <label style={{ color: "#8B949E", fontSize: 12, display: "block", marginBottom: 6 }}>Username (sem @)</label>
        <input value={value} onChange={e => setValue(e.target.value.replace(/^@+/, ''))} placeholder="ex: nasa"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#0D1117", border: "1px solid #30363D", color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #30363D", background: "transparent", color: "#8B949E", cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => value.trim() && onSave(value.trim())} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7100E2,#00F0FF)", color: "white", cursor: "pointer", fontWeight: 700 }}>Adicionar</button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ username, onConfirm, onClose }: { username: string; onConfirm: () => void; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div style={{ background: "#161B22", border: "1px solid #30363D", borderRadius: 12, padding: 28, minWidth: 320 }}>
        <h3 style={{ color: "white", marginBottom: 10, fontSize: 16, fontWeight: 700 }}>⏸️ Colocar em Espera / Desativar</h3>
        <p style={{ color: "#8B949E", fontSize: 14, marginBottom: 20 }}>
          Deseja colocar <strong style={{ color: "white" }}>@{username}</strong> em espera (inativo)?<br />
          <span style={{ color: "#00F0FF", fontSize: 12 }}>O histórico e estatísticas serão mantidos no banco de dados.</span>
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #30363D", background: "transparent", color: "#8B949E", cursor: "pointer" }}>Cancelar</button>
          <button onClick={onConfirm} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#F85149", color: "white", cursor: "pointer", fontWeight: 700 }}>Desativar</button>
        </div>
      </div>
    </div>
  );
}

function ModalPerfilIndisponivel({
  username,
  ultimoSeguidores = 0,
  dataUltimaColeta = null,
  onClose,
  onSaveFollowers,
  onConfirmIndisponivel,
  onConfirmZeroFollowers
}: {
  username: string;
  ultimoSeguidores?: number;
  dataUltimaColeta?: string | null;
  onClose: () => void;
  onSaveFollowers: (val: number) => void;
  onConfirmIndisponivel: () => void;
  onConfirmZeroFollowers: () => void;
}) {
  const [manualCount, setManualCount] = useState<string>(ultimoSeguidores > 0 ? String(ultimoSeguidores) : '');
  const [showInput, setShowInput] = useState<boolean>(true);
  const [showConfirmacaoVariacao, setShowConfirmacaoVariacao] = useState<boolean>(false);

  const novoValNum = Number(manualCount);
  const hasValidNum = !isNaN(novoValNum) && novoValNum >= 0 && manualCount.trim() !== '';
  const diffSeguidores = hasValidNum && ultimoSeguidores > 0 ? novoValNum - ultimoSeguidores : 0;
  const pctVariacao = hasValidNum && ultimoSeguidores > 0 ? (diffSeguidores / ultimoSeguidores) * 100 : 0;
  const isVariacaoAlta = hasValidNum && ultimoSeguidores > 0 && Math.abs(pctVariacao) > 5;

  const dataFormatada = dataUltimaColeta
    ? new Date(dataUltimaColeta.split('T')[0].split(' ')[0] + 'T00:00:00').toLocaleDateString('pt-BR')
    : null;

  const handleTentarSalvar = () => {
    if (!hasValidNum) {
      alert('Por favor, insira um número válido de seguidores.');
      return;
    }

    if (isVariacaoAlta && !showConfirmacaoVariacao) {
      setShowConfirmacaoVariacao(true);
      return;
    }

    onSaveFollowers(novoValNum);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 250, backdropFilter: "blur(6px)"
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#161B22", border: "1px solid #30363D",
        borderRadius: 16, padding: 28, width: 540, maxWidth: "92vw",
        boxShadow: "0 20px 40px rgba(0,0,0,0.6)", position: "relative"
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%",
            background: "rgba(245, 158, 11, 0.15)", border: "1.5px solid #F59E0B",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#F59E0B", fontSize: 20, flexShrink: 0
          }}>
            ⚠️
          </div>
          <div>
            <h3 style={{ color: "white", fontSize: 18, fontWeight: 700, margin: 0 }}>
              Dados não encontrados / Perfil Indisponível
            </h3>
            <span style={{ color: "#8B949E", fontSize: 13 }}>
              Perfil: <strong style={{ color: "#00F0FF" }}>@{username}</strong>
            </span>
          </div>
        </div>

        <p style={{ color: "#C9D1D9", fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
          A API do Instagram retornou indisponível ou 0 seguidores para este perfil. Como você deseja proceder?
        </p>

        {/* 4 Opções */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Opção 1: Abrir o perfil */}
          <button
            onClick={() => {
              window.open(`https://www.instagram.com/${username}/`, '_blank');
            }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", borderRadius: 10, background: "#0D1117",
              border: "1px solid #30363D", color: "white", cursor: "pointer",
              fontSize: 13, fontWeight: 600, textAlign: "left",
              transition: "border-color 0.2s, background 0.2s"
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#00F0FF'; e.currentTarget.style.background = '#1C2128'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363D'; e.currentTarget.style.background = '#0D1117'; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>1️⃣ 🌐</span>
              <span>Abrir perfil no Instagram para verificar</span>
            </div>
            <ExternalLink size={14} style={{ color: "#8B949E" }} />
          </button>

          {/* Opção 2: Inserir manualmente os seguidores (com valor pré-preenchido do banco) */}
          <div style={{
            background: "#0D1117",
            border: `1px solid ${showInput ? '#00F0FF' : '#30363D'}`,
            borderRadius: 10,
            padding: 14,
            transition: 'border-color 0.2s'
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>2️⃣ ✏️</span>
                <span style={{ color: "white", fontSize: 13, fontWeight: 700 }}>
                  Inserir quantidade de seguidores
                </span>
              </div>
              {ultimoSeguidores > 0 && (
                <span style={{
                  fontSize: 11,
                  background: 'rgba(0, 240, 255, 0.12)',
                  color: '#00F0FF',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontWeight: 600
                }}>
                  Último valor: {ultimoSeguidores.toLocaleString('pt-BR')} seg. {dataFormatada ? `(${dataFormatada})` : ''}
                </span>
              )}
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  placeholder="Ex: 2500"
                  value={manualCount}
                  onChange={e => {
                    setManualCount(e.target.value);
                    setShowConfirmacaoVariacao(false);
                  }}
                  autoFocus
                  style={{
                    flex: 1, background: "#161B22", border: `1px solid ${isVariacaoAlta ? '#F59E0B' : '#30363D'}`,
                    borderRadius: 6, padding: "8px 12px", color: "white", fontSize: 14, fontWeight: 600, outline: "none"
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleTentarSalvar();
                  }}
                />
                <button
                  onClick={handleTentarSalvar}
                  style={{
                    padding: "8px 20px", borderRadius: 6, border: "none",
                    background: "linear-gradient(135deg, #7100E2, #00F0FF)",
                    color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12
                  }}
                >
                  Salvar
                </button>
              </div>

              {/* Alerta / Confirmação de Variação > 5% */}
              {isVariacaoAlta && (
                <div style={{
                  marginTop: 10,
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid #F59E0B',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F59E0B', fontSize: 12, fontWeight: 700 }}>
                    <span>⚠️ Variação de {pctVariacao > 0 ? '+' : ''}{pctVariacao.toFixed(1)}% detectada!</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: '#C9D1D9' }}>
                      (De {ultimoSeguidores.toLocaleString('pt-BR')} para {novoValNum.toLocaleString('pt-BR')} seg.)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8B949E' }}>
                    Esta alteração ultrapassa o limite de 5% de variação segura. Deseja realmente confirmar?
                  </div>

                  {showConfirmacaoVariacao && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        onClick={() => onSaveFollowers(novoValNum)}
                        style={{
                          background: '#F59E0B',
                          color: '#000',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 14px',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        Sim, Confirmar e Salvar
                      </button>
                      <button
                        onClick={() => setShowConfirmacaoVariacao(false)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #30363D',
                          color: '#8B949E',
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: 11,
                          cursor: 'pointer'
                        }}
                      >
                        Corrigir Valor
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Opção 3: Confirmar que o perfil está indisponível */}
          <button
            onClick={onConfirmIndisponivel}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", borderRadius: 10, background: "#0D1117",
              border: "1px solid #30363D", color: "#F59E0B", cursor: "pointer",
              fontSize: 13, fontWeight: 600, textAlign: "left",
              transition: "border-color 0.2s, background 0.2s"
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#F59E0B'; e.currentTarget.style.background = 'rgba(245, 158, 11, 0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363D'; e.currentTarget.style.background = '#0D1117'; }}
          >
            <span style={{ fontSize: 16 }}>3️⃣ 🚫</span>
            <div>
              <div>Confirmar perfil indisponível (Suspenso / Privado)</div>
              <div style={{ color: "#8B949E", fontSize: 11, fontWeight: 400 }}>Registra este evento e marca o status como INDISPONÍVEL</div>
            </div>
          </button>

          {/* Opção 4: Confirmar que o perfil está sem seguidores */}
          <button
            onClick={onConfirmZeroFollowers}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", borderRadius: 10, background: "#0D1117",
              border: "1px solid #30363D", color: "white", cursor: "pointer",
              fontSize: 13, fontWeight: 600, textAlign: "left",
              transition: "border-color 0.2s, background 0.2s"
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#00F0FF'; e.currentTarget.style.background = '#1C2128'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363D'; e.currentTarget.style.background = '#0D1117'; }}
          >
            <span style={{ fontSize: 16 }}>4️⃣ 0️⃣</span>
            <div>
              <div>Confirmar que o perfil está sem seguidores (0 seguidores)</div>
              <div style={{ color: "#8B949E", fontSize: 11, fontWeight: 400 }}>Registra a coleta de 0 seguidores para o perfil no histórico</div>
            </div>
          </button>

        </div>

        {/* Footer */}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid #30363D",
              background: "transparent", color: "#8B949E", cursor: "pointer", fontSize: 12
            }}
          >
            Cancelar / Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [historicoSeguidores, setHistoricoSeguidores] = useState<any[]>([])
  const [graficoAtivo, setGraficoAtivo] = useState<'financeiro' | 'seguidores' | 'correlacao'>('financeiro');
  const [lancamentoSelecionado, setLancamentoSelecionado] = useState<any>(null);
  const [perfisOcultos, setPerfisOcultos] = useState<Set<string>>(new Set());
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoGrafico, setTipoGrafico] = useState<'linha' | 'barra'>('linha');

  // Dados brutos da API
  const [profiles, setProfiles] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [followersHistory, setFollowersHistory] = useState<any>({});

  // Estados de Navegação e Filtros
  const [activeTab, setActiveTab] = useState<'acompanhados' | 'cards' | 'followers' | 'posts' | 'controle' | 'anomalias' | 'automatizacao' | 'respostas'>('controle');
  const [anomaliasCount, setAnomaliasCount] = useState<number>(0);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('Todos');
  const [selectedProfileFilter, setSelectedProfileFilter] = useState('Todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortField, setSortField] = useState<string>('data_postagem');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  // Paginação da Tabela Feed Geral
  const [postsPage, setPostsPage] = useState<number>(1);
  const [postsPerPage, setPostsPerPage] = useState<number>(20);
  const [searchAcompanhados, setSearchAcompanhados] = useState('');
  const [acompStatusFilter, setAcompStatusFilter] = useState<'TODOS' | 'ATIVO' | 'INATIVO' | 'INDISPONIVEL' | 'MORREU'>('TODOS');
  const [incluirTodosPerfis, setIncluirTodosPerfis] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [acompSortField, setAcompSortField] = useState<string>('meu_perfil');
  const [acompSortDir, setAcompSortDir] = useState<'asc' | 'desc'>('desc');
  const [comparativoMode, setComparativoMode] = useState<'absoluto' | 'percentual' | 'projecao'>('absoluto');
  const [showEvolutionChart, setShowEvolutionChart] = useState(false);
  const [perfisComparativosAdicionais, setPerfisComparativosAdicionais] = useState<string[]>([]);
  const [perfisComparativosExcluidos, setPerfisComparativosExcluidos] = useState<string[]>([]);
  const [linhasOcultas, setLinhasOcultas] = useState<Set<string>>(new Set());
  // Edição inline de Primeira Postagem
  const [editingPrimeiraPostagem, setEditingPrimeiraPostagem] = useState<string | null>(null);
  const [primeiraPostagemDraft, setPrimeiraPostagemDraft] = useState<string>('');

  // Edição inline de Seguidores e Modal de Resolução
  const [editingSeguidores, setEditingSeguidores] = useState<string | null>(null);
  const [seguidoresDraft, setSeguidoresDraft] = useState<string>('');
  const [modalPerfilSemDados, setModalPerfilSemDados] = useState<{ username: string } | null>(null);

  const handleAcompSort = (field: string) => {
    if (acompSortField === field) {
      setAcompSortDir(acompSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setAcompSortField(field);
      setAcompSortDir(['meu_perfil', 'performance_score', 'seguidores', 'evolucao', 'pctCrescimento', 'is_verified'].includes(field) ? 'desc' : 'asc');
    }
  };

  const profilesBase = incluirTodosPerfis ? profiles : profiles.filter(p => p.exibir !== 0);
  const countOcultos = profiles.filter(p => p.exibir === 0).length;

  const countAtivos = profilesBase.filter(p => (p.status || 'ATIVO').toUpperCase() === 'ATIVO').length;
  const countInativos = profilesBase.filter(p => (p.status || 'ATIVO').toUpperCase() === 'INATIVO').length;
  const countIndisponiveis = profilesBase.filter(p => {
    const st = (p.status || 'ATIVO').toUpperCase();
    return st === 'INDISPONIVEL' || st === 'INDISPONÍVEL';
  }).length;
  const countMorreu = profilesBase.filter(p => {
    const st = (p.status || 'ATIVO').toUpperCase();
    const stCtrl = (p.status_controle || '').toUpperCase();
    return st === 'MORREU' || stCtrl.includes('MORREU');
  }).length;

  const profilesFiltrados = profiles
    .filter(p => (incluirTodosPerfis ? true : p.exibir !== 0))
    .filter(p => p.username.toLowerCase().includes(searchAcompanhados.toLowerCase()))
    .filter(p => {
      if (acompStatusFilter === 'TODOS') return true;
      const st = (p.status || 'ATIVO').toUpperCase();
      const stCtrl = (p.status_controle || '').toUpperCase();
      if (acompStatusFilter === 'INDISPONIVEL') {
        return st === 'INDISPONIVEL' || st === 'INDISPONÍVEL';
      }
      if (acompStatusFilter === 'MORREU') {
        return st === 'MORREU' || stCtrl.includes('MORREU');
      }
      return st === acompStatusFilter;
    })
    .map(p => {
      // Calcula evolução e % crescimento a partir do followersHistory
      // Regra: compara a coleta mais recente com a coleta do dia anterior.
      // Se não houver coleta do dia anterior, usa a média diária do intervalo disponível.
      const hist = (followersHistory[p.username] || [])
        .slice()
        .sort((a: any, b: any) => String(a.data || a.data_coleta || '').localeCompare(String(b.data || b.data_coleta || '')));

      let evolucao: number | null = null;
      let pctCrescimento: number | null = null;

      if (hist.length >= 2) {
        const lastEntry = hist[hist.length - 1];
        const ultimoVal = Number(lastEntry.total_seguidores);
        // Data da coleta mais recente (apenas YYYY-MM-DD)
        const lastDateStr = (lastEntry.data || '').split('T')[0].split(' ')[0];
        const lastDate = new Date(lastDateStr + 'T00:00:00');
        // Dia anterior à coleta mais recente
        const prevDate = new Date(lastDate);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = prevDate.toISOString().split('T')[0];

        // Procura coleta do dia anterior (exato)
        const entryPrevDay = [...hist].reverse().find((h: any) => {
          const d = (h.data || '').split('T')[0].split(' ')[0];
          return d === prevDateStr;
        });

        if (entryPrevDay) {
          // Caso 1: coleta do dia anterior existe → comparação direta
          const prevVal = Number(entryPrevDay.total_seguidores);
          evolucao = ultimoVal - prevVal;
          const anterior1 = ultimoVal - evolucao; // = prevVal
          pctCrescimento = anterior1 > 0 ? (evolucao / anterior1) * 100 : null;
        } else {
          // Caso 2: sem coleta no dia anterior → usa média diária como evolução
          const firstEntry = hist[0];
          const firstVal = Number(firstEntry.total_seguidores);
          const firstDateStr = (firstEntry.data || '').split('T')[0].split(' ')[0];
          const firstDate = new Date(firstDateStr + 'T00:00:00');
          const diasIntervalo = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000));
          const mediaDiaria = (ultimoVal - firstVal) / diasIntervalo;
          evolucao = Math.round(mediaDiaria);
          const anterior2 = ultimoVal - evolucao; // seguidores - evolução
          pctCrescimento = anterior2 > 0 ? (evolucao / anterior2) * 100 : null;
        }
      }

      // Calcula o Performance Score para este perfil
      const psResult = calcularPerformanceScore(p, profiles);
      const performance_score = psResult ? psResult.score : null;
      const ps_detail = psResult ? psResult.detail : null;

      return { ...p, evolucao, pctCrescimento, performance_score, ps_detail };
    })
    .slice()
    .sort((a, b) => {
      // Sempre coloca estrela primeiro no empate
      if (acompSortField !== 'meu_perfil') {
        const star = (b.meu_perfil || 0) - (a.meu_perfil || 0);
        // só usa estrela como desempate quando estiverem iguais no campo principal
        let av: any, bv: any;
        if (acompSortField === 'username') {
          av = (a.username || '').toLowerCase();
          bv = (b.username || '').toLowerCase();
        } else if (acompSortField === 'seguidores') {
          av = Number(a.seguidores) || 0;
          bv = Number(b.seguidores) || 0;
        } else if (acompSortField === 'evolucao') {
          av = a.evolucao ?? -Infinity;
          bv = b.evolucao ?? -Infinity;
        } else if (acompSortField === 'pctCrescimento') {
          av = a.pctCrescimento ?? -Infinity;
          bv = b.pctCrescimento ?? -Infinity;
        } else if (acompSortField === 'is_verified') {
          av = Number(a.is_verified) || 0;
          bv = Number(b.is_verified) || 0;
        } else if (acompSortField === 'performance_score') {
          av = a.performance_score ?? -Infinity;
          bv = b.performance_score ?? -Infinity;
        } else if (acompSortField === 'inicio_monitoramento') {
          av = a.inicio_monitoramento || '';
          bv = b.inicio_monitoramento || '';
        } else if (acompSortField === 'data_coleta') {
          av = a.data_coleta || '';
          bv = b.data_coleta || '';
        } else if (acompSortField === 'primeira_postagem') {
          av = a.primeira_postagem || '';
          bv = b.primeira_postagem || '';
        } else if (acompSortField === 'dias') {
          const calcDiasPerfil = (p: any) => {
            if (!p.primeira_postagem) return -Infinity;
            const inicio = new Date(p.primeira_postagem.split(' ')[0].split('T')[0] + 'T00:00:00');
            const isM = p.status === 'MORREU' || p.status_controle === '☠️ Morreu' || (p.status_controle || '').includes('Morreu') || (p.status || '').toUpperCase() === 'MORREU';
            let fim: Date;
            if (isM && p.data_coleta) {
              fim = new Date(p.data_coleta.split(' ')[0].split('T')[0] + 'T00:00:00');
            } else {
              fim = new Date();
              fim.setHours(0, 0, 0, 0);
            }
            return Math.max(0, Math.floor((fim.getTime() - inicio.getTime()) / 86400000));
          };
          av = calcDiasPerfil(a);
          bv = calcDiasPerfil(b);
        } else {
          av = (a[acompSortField] || '').toString().toLowerCase();
          bv = (b[acompSortField] || '').toString().toLowerCase();
        }
        const cmp = typeof av === 'number'
          ? (acompSortDir === 'asc' ? av - bv : bv - av)
          : (acompSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av));
        if (cmp !== 0) return cmp;
        return star; // desempate: estrela
      }
      // Ordenação por estrela
      const diff = (b.meu_perfil || 0) - (a.meu_perfil || 0);
      if (diff !== 0) return acompSortDir === 'desc' ? diff : -diff;
      // Desempate: ordem alfabética
      return (a.username || '').toLowerCase().localeCompare((b.username || '').toLowerCase());
    });
  const handleSort = (field: string) => {
    setPostsPage(1);
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  // Carregar dados da API
  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/data', {
        cache: 'no-store'
      });
      const json = await response.json();

      if (json.success) {
        const rawPosts = json.posts || [];
        const rawProfiles = json.profiles || [];

        // Calcular engajamento médio de posts por perfil
        const userAvgEng: Record<string, number> = {};
        const userPostCounts: Record<string, number> = {};

        rawPosts.forEach((p: any) => {
          const u = (p.username || '').toLowerCase();
          const eng = (Number(p.likes) || 0) + (Number(p.comentarios) || 0);
          userAvgEng[u] = (userAvgEng[u] || 0) + eng;
          userPostCounts[u] = (userPostCounts[u] || 0) + 1;
        });

        Object.keys(userAvgEng).forEach(u => {
          if (userPostCounts[u] > 0) {
            userAvgEng[u] = userAvgEng[u] / userPostCounts[u];
          }
        });

        const enrichedPosts = rawPosts.map((p: any) => {
          const u = (p.username || '').toLowerCase();
          const eng = (Number(p.likes) || 0) + (Number(p.comentarios) || 0);
          const avg = userAvgEng[u] || 0;
          const pMult = typeof p.performanceMultiplier === 'number' && !isNaN(p.performanceMultiplier)
            ? p.performanceMultiplier
            : (avg > 0 ? Number((eng / avg).toFixed(2)) : 1.0);
          // Gerar link do post no Instagram convertendo ID numérico para Shortcode se necessário
          const postLink = getInstagramPostUrl(p);

          return {
            ...p,
            performanceMultiplier: pMult,
            link: postLink
          };
        });

        const fHistory = json.followersHistory || {};

        const enrichedProfiles = rawProfiles.map((prof: any) => {
          const u = (prof.username || '').toLowerCase();
          const profPosts = enrichedPosts.filter((p: any) => (p.username || '').toLowerCase() === u);
          const uFHist = fHistory[u] || [];

          // Cálculo de novos seguidores nas últimas 24h / coleta anterior
          let novosSeguidores24h = 0;
          if (uFHist.length >= 2) {
            const lastSeg = Number(uFHist[uFHist.length - 1]?.total_seguidores) || 0;
            const prevSeg = Number(uFHist[uFHist.length - 2]?.total_seguidores) || 0;
            novosSeguidores24h = lastSeg - prevSeg;
          }

          // Cálculo real de dias de base
          const dataInicioStr = prof.primeira_postagem || prof.inicio_monitoramento || prof.criado_em;
          const dataFimStr = prof.data_coleta || (uFHist.length > 0 ? uFHist[uFHist.length - 1].data : null) || new Date().toISOString();
          let diaMonitoramento = 1;
          if (dataInicioStr) {
            try {
              const inicio = new Date(dataInicioStr.split(' ')[0].split('T')[0] + 'T00:00:00');
              const fim = new Date(dataFimStr.split(' ')[0].split('T')[0] + 'T00:00:00');
              if (!isNaN(inicio.getTime()) && !isNaN(fim.getTime())) {
                const diff = Math.floor((fim.getTime() - inicio.getTime()) / 86400000);
                diaMonitoramento = Math.max(1, diff + 1);
              }
            } catch {
              diaMonitoramento = 1;
            }
          }

          // Posts virais e médias
          let postMaisViral: any = null;
          const viralPosts = profPosts.filter((p: any) => p.performanceMultiplier >= 1.8 || p.viralStatus === 'Viralizando');
          if (profPosts.length > 0) {
            const sortedByPerf = [...profPosts].sort((a, b) => b.performanceMultiplier - a.performanceMultiplier);
            postMaisViral = { ...sortedByPerf[0] };
            postMaisViral.viralStatus = postMaisViral.performanceMultiplier >= 1.8 ? 'Viralizando' : 'Normal';
          }

          // Timestamp da postagem viral mais recente
          let latestViralTimestamp = 0;
          if (viralPosts.length > 0) {
            latestViralTimestamp = Math.max(...viralPosts.map((p: any) => new Date(p.data_postagem || 0).getTime()));
          } else if (postMaisViral && postMaisViral.data_postagem) {
            latestViralTimestamp = new Date(postMaisViral.data_postagem).getTime();
          }

          // Média de engajamento dos posts virais
          let mediaPostsVirais = 0;
          if (viralPosts.length > 0) {
            const somaViral = viralPosts.reduce((acc: number, p: any) => acc + (Number(p.likes) || 0) + (Number(p.comentarios) || 0), 0);
            mediaPostsVirais = Math.round(somaViral / viralPosts.length);
          } else if (postMaisViral) {
            mediaPostsVirais = (Number(postMaisViral.likes) || 0) + (Number(postMaisViral.comentarios) || 0);
          }

          // Média histórica da conta
          const mediaHistoricaConta = userAvgEng[u] || 0;

          // Nível de confiança baseado no tempo e quantidade de dados
          let confiancaTexto = 'em maturação';
          let confiancaCor = '#8B949E';
          if (diaMonitoramento >= 14 && profPosts.length >= 5) {
            confiancaTexto = 'confiança alta';
            confiancaCor = '#10B981';
          } else if (diaMonitoramento >= 7 && profPosts.length >= 2) {
            confiancaTexto = 'confiança média';
            confiancaCor = '#F59E0B';
          }

          return {
            ...prof,
            postMaisViral,
            viralPosts,
            mediaPostsVirais,
            mediaHistoricaConta,
            latestViralTimestamp,
            diaMonitoramento,
            novosSeguidores24h,
            confiancaTexto,
            confiancaCor
          };
        });

        setProfiles(enrichedProfiles);
        setPosts(enrichedPosts);
        setFollowersHistory(fHistory);

        if (enrichedProfiles.length > 0) {
          const firstActive = enrichedProfiles.find((p: any) => p.exibir !== 0);
          setSelectedProfile(firstActive ? firstActive.username : enrichedProfiles[0].username);
        }

        // Atualiza contagem global de anomalias/pendências de validação do Histórico da Conta
        fetch('/api/anomalias')
          .then(r => r.json())
          .then(anomJson => {
            if (anomJson?.success && anomJson.stats?.pendentes_validacao !== undefined) {
              setAnomaliasCount(anomJson.stats.pendentes_validacao);
            }
          })
          .catch(() => {});
      } else {
        setError(json.error || "Falha ao ler dados do SQLite");
      }
    } catch (err: any) {
      console.error("Erro no fetch:", err);
      setError("Erro ao carregar dados. O servidor Next.js está de pé?");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
  }, []);
  // Handler de login fictício/logout
  const handleLogout = () => {
    alert("Logout efetuado (Sessão SocialTracker encerrada)");
  };
  // ── Estados da aba Controle ──────────────────────────────
  const [controleData, setControleData] = useState<any[]>([]);
  const [controleLoading, setControleLoading] = useState(false);
  const [ultimaMetaExec, setUltimaMetaExec] = useState<string | null>(null);
  const [modalLancamento, setModalLancamento] = useState<{ username: string; tipo: string; } | null>(null);
  const [modalControleEdit, setModalControleEdit] = useState<any | null>(null);

  const [ingestingProfile, setIngestingProfile] = useState<string | null>(null);
  const [ingestingAll, setIngestingAll] = useState(false);
  const [ingestingMeta, setIngestingMeta] = useState(false);

  async function handleRunIngestion(username?: string) {
    if (username) {
      setIngestingProfile(username);
    } else {
      setIngestingAll(true);
    }

    try {
      const res = await fetch('/api/ingestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const json = await res.json();
      if (json.success) {
        if (json.warning && username) {
          // Se foi para um perfil específico e deu warning/sem dados, abre modal de resolução sem alterar ou recarregar nada previamente
          setModalPerfilSemDados({ username });
        } else if (json.warning) {
          fetchData(); // Recarrega os dados
          alert("⚠️ A ingestão foi concluída, mas alguns perfis não retornaram dados (privados ou indisponíveis).");
        } else {
          fetchData(); // Recarrega os dados
          alert(username ? `✅ Ingestão concluída com sucesso para @${username}!` : "✅ Ingestão concluída para todos os perfis ativos!");
        }
      } else {
        alert(`❌ Erro na ingestão: ${json.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) {
      alert(`Erro na requisição: ${e.message}`);
    } finally {
      if (username) {
        setIngestingProfile(null);
      } else {
        setIngestingAll(false);
      }
    }
  }

  async function handleRunMetaIngestion() {
    setIngestingMeta(true);
    try {
      const res = await fetch('/api/meta-ingestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (json.success) {
        fetchControle();
        fetchData();
        alert('✅ Atualização via Meta API concluída com sucesso!');
      } else if (json.warning) {
        alert(`⚠️ ${json.message || 'Nenhuma conta Meta configurada encontrada.'}`);
      } else {
        alert(`❌ Erro na atualização Meta: ${json.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) {
      alert(`Erro na requisição: ${e.message}`);
    } finally {
      setIngestingMeta(false);
    }
  }

  const USD_BRL = 5.10; // Atualize conforme necessário
  async function fetchControle() {
    setControleLoading(true);
    try {
      const res = await fetch('/api/controle');
      const json = await res.json();
      if (json.success) {
        setControleData(json.perfis || []);
        if (json.ultima_execucao_meta) {
          setUltimaMetaExec(json.ultima_execucao_meta);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar controle:", e);
    } finally {
      setControleLoading(false);
    }
  }
  useEffect(() => {
    if (activeTab === 'controle') fetchControle();
  }, [activeTab]);

  // Busca contagem de anomalias pendentes para o badge na aba (independente da aba ativa)
  useEffect(() => {
    fetch('/api/anomalias')
      .then(r => r.json())
      .then(json => { if (json.success) setAnomaliasCount(json.total_pendentes || 0); })
      .catch(() => { });
  }, []);
  // ====================================================================
  // 🔥 LÓGICA DE SEGUIDORES
  // ====================================================================
  const prepararDadosSeguidores = () => {
    const listaControle = controleData || [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // 1. Ordenação e Datas de Início
    const listaOrdenada = [...listaControle].sort((a, b) =>
      new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
    );

    const usuariosOrdenados = listaOrdenada.map(p => p.username);
    const datasInicio: Record<string, Date> = {};

    listaOrdenada.forEach(p => {
      if (p.inicio) {
        datasInicio[p.username] = new Date(p.inicio.split('T')[0]);
      }
    });

    // 2. Processamento dos dados (Lendo do 'followersHistory' do seu Banco de Dados)
    const seguidoresPorDia: Record<number, Record<string, number>> = {};
    const maxDia: Record<string, number> = {};

    usuariosOrdenados.forEach(username => { maxDia[username] = 0; });

    usuariosOrdenados.forEach(username => {
      const historicoDoUsuario = followersHistory[username] || [];

      historicoDoUsuario.forEach((h: any) => {
        if (!datasInicio[username] || !h.data || h.total_seguidores === null || h.total_seguidores === undefined) return;

        const dataColeta = new Date(h.data.split('T')[0].split(' ')[0]);
        const diffDays = Math.floor((dataColeta.getTime() - datasInicio[username].getTime()) / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays >= 1) {
          if (!seguidoresPorDia[diffDays]) seguidoresPorDia[diffDays] = {};

          seguidoresPorDia[diffDays][username] = Math.max(
            seguidoresPorDia[diffDays][username] || 0,
            Number(h.total_seguidores)
          );

          if (diffDays > maxDia[username]) {
            maxDia[username] = diffDays;
          }
        }
      });

      const p = listaOrdenada.find(item => item.username === username);
      if (p && datasInicio[username]) {
        if (p.ultima_coleta) {
          const dataColeta = new Date(p.ultima_coleta.split('T')[0].split(' ')[0]);
          const diffDays = Math.floor((dataColeta.getTime() - datasInicio[username].getTime()) / (1000 * 60 * 60 * 24)) + 1;
          if (diffDays >= 1 && p.seguidores) {
            if (!seguidoresPorDia[diffDays]) seguidoresPorDia[diffDays] = {};
            seguidoresPorDia[diffDays][username] = Math.max(
              seguidoresPorDia[diffDays][username] || 0,
              Number(p.seguidores)
            );
            if (diffDays > maxDia[username]) maxDia[username] = diffDays;
          }
        } else if (p.seguidores > 0) {
          if (!seguidoresPorDia[1]) seguidoresPorDia[1] = {};
          seguidoresPorDia[1][username] = Math.max(seguidoresPorDia[1][username] || 0, Number(p.seguidores));
          if (maxDia[username] < 1) maxDia[username] = 1;
        }
      }
    });

    const limiteGlobal = Math.max(1, ...usuariosOrdenados.map(u => maxDia[u] || 0));

    // 3. Montagem do array final linear
    const dadosFinais = [];
    const ultimoValor: Record<string, number> = {};

    usuariosOrdenados.forEach(u => {
      const diasComDados = Object.keys(seguidoresPorDia)
        .map(Number)
        .filter(d => seguidoresPorDia[d]?.[u] !== undefined)
        .sort((a, b) => a - b);

      if (diasComDados.length > 0) {
        ultimoValor[u] = seguidoresPorDia[diasComDados[0]][u];
      } else {
        ultimoValor[u] = 0;
      }
    });

    for (let dia = 1; dia <= limiteGlobal; dia++) {
      const pontoDeDado: any = { name: `Dia ${dia}`, dia: dia };

      usuariosOrdenados.forEach(u => {
        const userMaxDia = maxDia[u] || 0;

        if (seguidoresPorDia[dia] && seguidoresPorDia[dia][u] !== undefined) {
          ultimoValor[u] = seguidoresPorDia[dia][u];
        }

        if (dia <= userMaxDia && userMaxDia > 0) {
          pontoDeDado[`${u}_acumulado`] = ultimoValor[u];
        } else {
          pontoDeDado[`${u}_acumulado`] = undefined;
        }
      });
      dadosFinais.push(pontoDeDado);
    }

    return { dadosFinais, usuarios: usuariosOrdenados };
  };

  // ====================================================================
  // 🔥 LÓGICA DO GRÁFICO (DEVE FICAR ABAIXO DE TODOS OS USESTATES E USEEFFECTS)
  // ====================================================================
  const prepararDadosGrafico = () => {
    const dadosPorDia: Record<number, Record<string, { diario: number }>> = {};
    const listaControle = controleData || [];
    // 1. Ordena os perfis pelo campo 'inicio' (data mais antiga primeiro)
    const listaControleOrdenada = [...listaControle].sort((a, b) => {
      const dataA = a.inicio ? new Date(a.inicio).getTime() : 0;
      const dataB = b.inicio ? new Date(b.inicio).getTime() : 0;
      return dataA - dataB;
    });

    // 2. Extrai os usuários já na ordem correta
    const usuarios = listaControleOrdenada.map((p: any) => p.username);

    // Helper de data local
    const parseDataLocal = (dataStr: string) => {
      const [y, m, d] = dataStr.split('T')[0].split('-');
      return new Date(Number(y), Number(m) - 1, Number(d));
    };

    // 1. Mapear datas de início e limites por perfil
    const datasInicio: Record<string, Date> = {};
    const maxDia: Record<string, number> = {};
    listaControle.forEach((p: any) => {
      if (p.inicio) {
        datasInicio[p.username] = parseDataLocal(p.inicio);
        maxDia[p.username] = 0;
      }
    });

    // 3. Mapear os gastos
    const listaLancamentos = listaControle.flatMap((p: any) =>
      (p.lancamentos || []).map((l: any) => ({ ...l, username: p.username }))
    );

    listaLancamentos.forEach((l: any) => {
      if (!datasInicio[l.username] || !l.data_lancamento) return;
      const dataLancamento = parseDataLocal(l.data_lancamento);
      const diffDays = Math.floor((dataLancamento.getTime() - datasInicio[l.username].getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (diffDays > 0) {
        if (!dadosPorDia[diffDays]) dadosPorDia[diffDays] = {};
        if (!dadosPorDia[diffDays][l.username]) dadosPorDia[diffDays][l.username] = { diario: 0 };
        dadosPorDia[diffDays][l.username].diario += (l.tipo === 'despesa' ? -Number(l.valor_brl) : Number(l.valor_brl));

        if (diffDays > maxDia[l.username]) {
          maxDia[l.username] = diffDays;
        }
      }
    });

    // 2. Definir o limite global com base nos dias reais com dados
    const limiteGlobal = Math.max(1, ...usuarios.map(u => maxDia[u] || 0));

    // 4. Montar o array linear com propagação de saldo
    const dadosFinais = [];
    const saldosAtuais: Record<string, number> = {}; // Armazena o último saldo conhecido
    usuarios.forEach((u: string) => { saldosAtuais[u] = 0; });

    for (let dia = 1; dia <= limiteGlobal; dia++) {
      const pontoDeDado: any = { name: `Dia ${dia}`, dia: dia };

      usuarios.forEach((u: string) => {
        const userMaxDia = maxDia[u] || 0;
        const dadosDoDia = dadosPorDia[dia]?.[u];

        // 1. Se houve operação no dia, atualizamos o saldo
        if (dadosDoDia) {
          saldosAtuais[u] += dadosDoDia.diario;
        }

        if (dia <= userMaxDia && userMaxDia > 0) {
          pontoDeDado[`${u}_diario`] = dadosDoDia?.diario || 0;
          pontoDeDado[`${u}_acumulado`] = saldosAtuais[u];
        } else {
          // Após a última data de lançamento do perfil, interrompe a linha
          pontoDeDado[`${u}_diario`] = undefined;
          pontoDeDado[`${u}_acumulado`] = undefined;
        }
      });

      dadosFinais.push(pontoDeDado);
    }
    return { dadosFinais, usuarios };
  };
  // Executa com segurança após as variáveis existirem no escopo do componente
  const { dadosFinais, usuarios } = prepararDadosGrafico();
  const dadosDoGrafico = graficoAtivo === 'financeiro'
    ? prepararDadosGrafico().dadosFinais
    : prepararDadosSeguidores();

  // 2. Cálculo dos dados (Executa a lógica com base no estado atual)
  const financeiro = prepararDadosGrafico();
  const seguidores = prepararDadosSeguidores();

  // 3. Correlação: calcula efetividade (saldo acumulado ÷ quantidade de seguidores) por dia
  const prepararDadosCorrelacao = () => {
    const fin = prepararDadosGrafico();
    const seg = prepararDadosSeguidores();
    const todosUsuarios = fin.usuarios;

    const limiteCorrelacao = Math.max(fin.dadosFinais.length, seg.dadosFinais.length);

    const segPorDia: Record<number, Record<string, number>> = {};
    seg.dadosFinais.forEach((ponto: any) => {
      segPorDia[ponto.dia] = segPorDia[ponto.dia] || {};
      todosUsuarios.forEach((u: string) => {
        if (ponto[`${u}_acumulado`] !== undefined) {
          segPorDia[ponto.dia][u] = ponto[`${u}_acumulado`];
        }
      });
    });

    const finPorDia: Record<number, Record<string, number>> = {};
    fin.dadosFinais.forEach((ponto: any) => {
      finPorDia[ponto.dia] = finPorDia[ponto.dia] || {};
      todosUsuarios.forEach((u: string) => {
        if (ponto[`${u}_acumulado`] !== undefined) {
          finPorDia[ponto.dia][u] = ponto[`${u}_acumulado`];
        }
      });
    });

    const dadosMesclados = [];
    for (let dia = 1; dia <= limiteCorrelacao; dia++) {
      const novoPonto: any = { name: `Dia ${dia}`, dia: dia };
      todosUsuarios.forEach((u: string) => {
        const receita = finPorDia[dia]?.[u];
        const seguidoresUser = segPorDia[dia]?.[u];

        novoPonto[`${u}_receita`] = receita;
        novoPonto[`${u}_seguidores`] = seguidoresUser ?? undefined;

        if (receita !== undefined && seguidoresUser !== undefined && seguidoresUser > 0) {
          novoPonto[`${u}_efetividade`] = Math.max(0, receita) / seguidoresUser;
        } else {
          novoPonto[`${u}_efetividade`] = undefined;
        }
      });
      dadosMesclados.push(novoPonto);
    }
    return { dadosFinais: dadosMesclados, usuarios: todosUsuarios };
  };
  const correlacao = prepararDadosCorrelacao();

  const dadosAtivos = graficoAtivo === 'financeiro' ? financeiro.dadosFinais
    : graficoAtivo === 'seguidores' ? seguidores.dadosFinais
      : correlacao.dadosFinais;
  const usuariosAtivos = graficoAtivo === 'financeiro' ? financeiro.usuarios
    : graficoAtivo === 'seguidores' ? seguidores.usuarios
      : correlacao.usuarios;
  // ====================================================================


  function calcIdade(nascimento: string) {
    if (!nascimento) return '—';
    const hoje = new Date();
    const nasc = new Date(nascimento);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return `${idade} anos`;
  }

  function calcProntaEm(inicio: string) {
    if (!inicio) return '—';
    const d = new Date(inicio);
    d.setDate(d.getDate() + 14);
    return d.toLocaleDateString('pt-BR');
  }

  function calcDias(inicio: string) {
    if (!inicio) return 0;
    const dataInicioStr = inicio.split(' ')[0].split('T')[0];
    const dataInicio = new Date(dataInicioStr + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((hoje.getTime() - dataInicio.getTime()) / 86400000));
  }

  function fmtBRL(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  }

  async function salvarLancamento(payload: any) {
    const metodo = payload.id ? "PUT" : "POST";
    await fetch("/api/controle", {
      method: metodo,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    fetchControle();
    setModalLancamento(null);
    setLancamentoSelecionado(null);
  }

  async function excluirLancamento(id: any, grupoRateio?: string) {
    if (!confirm(grupoRateio ? "Deseja excluir todos os lançamentos deste rateio?" : "Deseja realmente excluir este lançamento?")) {
      return;
    }
    const param = grupoRateio ? `grupo_rateio=${grupoRateio}` : `id=${id}`;
    await fetch(`/api/controle?${param}`, {
      method: "DELETE"
    });
    fetchControle();
    setModalLancamento(null);
    setLancamentoSelecionado(null);
  }

  async function salvarControleEdit(dados: any) {
    if (modalControleEdit && modalControleEdit.username) {
      const usernameOriginal = modalControleEdit.username;
      const usernameNovo = dados.username ? dados.username.trim().toLowerCase().replace(/^@+/, '') : usernameOriginal;

      if (usernameNovo && usernameNovo !== usernameOriginal) {
        try {
          const res = await fetch('/api/data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameOriginal, newUsername: usernameNovo })
          });
          if (!res.ok) {
            const err = await res.json();
            alert(`Erro ao renomear username: ${err.error || 'desconhecido'}`);
            return;
          }
          dados.username = usernameNovo;
        } catch (err) {
          console.error('Erro ao renomear username:', err);
          alert('Erro de conexão ao renomear username.');
          return;
        }
      }
    }

    await fetch('/api/controle', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    fetchData();
    fetchControle();
    setModalControleEdit(null);
  }
  // Formatação de números
  const formatNumber = (num: number | string) => {
    const val = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(val)) return '0';
    return new Intl.NumberFormat('pt-BR').format(val);
  };

  if (loading) {
    return (
      <div className="loading-box">
        <div className="spinner"></div>
        <p>Carregando banco de dados SQLite do SocialTracker...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-box" style={{ color: '#FF007A' }}>
        <p>❌ {error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '20px',
            backgroundColor: '#7100E2',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  // --- FILTRAGENS ---

  // Filtrar posts para a tabela da aba "Posts"
  const filteredPosts = posts.filter(post => {
    const matchesSearch = searchQuery === '' ||
      (post.legenda && post.legenda.toLowerCase().includes(searchQuery.toLowerCase())) ||
      post.username.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFormat = selectedFormat === 'Todos' || post.formato === selectedFormat;

    const matchesProfile = selectedProfileFilter === 'Todos' || post.username === selectedProfileFilter;

    // Filtro de data simples
    const dateLimit = post.data_postagem ? post.data_postagem.split(' ')[0] : '';
    const matchesDate = (!startDate || dateLimit >= startDate) && (!endDate || dateLimit <= endDate);

    return matchesSearch && matchesFormat && matchesProfile && matchesDate;
  });

  // Ordenar posts para a tabela
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'data_postagem') {
      aVal = a.data_postagem ? new Date(a.data_postagem).getTime() : 0;
      bVal = b.data_postagem ? new Date(b.data_postagem).getTime() : 0;
    } else if (sortField === 'taxa_engajamento') {
      aVal = a.taxa_engajamento || 0;
      bVal = b.taxa_engajamento || 0;
    } else if (sortField === 'performanceMultiplier') {
      aVal = a.performanceMultiplier || 0;
      bVal = b.performanceMultiplier || 0;
    } else if (['likes', 'comentarios', 'views'].includes(sortField)) {
      aVal = Number(aVal) || 0;
      bVal = Number(bVal) || 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Paginação para a Tabela Feed Geral
  const totalPostsCount = sortedPosts.length;
  const totalPostsPages = Math.ceil(totalPostsCount / postsPerPage) || 1;
  const currentPostsPage = Math.min(postsPage, totalPostsPages);
  const startPostIdx = (currentPostsPage - 1) * postsPerPage;
  const paginatedPosts = sortedPosts.slice(startPostIdx, startPostIdx + postsPerPage);

  async function changeStatus(username: string, novoStatus: string) {
    try {
      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, status: novoStatus })
      });

      if (res.ok) {
        setProfiles(prev => prev.map(p => {
          if (p.username === username) {
            const isMorreu = novoStatus === 'MORREU';
            return {
              ...p,
              status: novoStatus,
              status_controle: isMorreu ? '☠️ Morreu' : (p.status_controle === '☠️ Morreu' ? '⏳ Aguardando' : p.status_controle)
            };
          }
          return p;
        }));
        setControleData(prev => prev.map(cp => {
          if (cp.username === username) {
            const isMorreu = novoStatus === 'MORREU';
            return {
              ...cp,
              status: isMorreu ? '☠️ Morreu' : (cp.status === '☠️ Morreu' ? '⏳ Aguardando' : cp.status)
            };
          }
          return cp;
        }));
      }
    } catch (err) {
      console.error("Erro ao mudar status:", err);
    }
  }

  async function handleEdit(novoUsername: string) {
    if (!editTarget || !novoUsername.trim()) {
      setEditTarget(null);
      return;
    }
    const usernameOriginal = editTarget.username;
    const usernameNovo = novoUsername.trim().toLowerCase().replace(/^@+/, '');
    if (usernameOriginal === usernameNovo) {
      setEditTarget(null);
      return;
    }
    try {
      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameOriginal, newUsername: usernameNovo })
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`Erro ao renomear perfil: ${err.error || 'desconhecido'}`);
      }
    } catch (err) {
      console.error('Erro ao renomear perfil:', err);
      alert('Erro de conexão ao renomear perfil.');
    }
    setEditTarget(null);
  }

  async function handleAdd(username: string) {
    const usernameLower = username.toLowerCase();
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameLower })
      });
      if (res.ok) {
        setShowAdd(false);
        // Navega para a aba Acompanhando
        setActiveTab('acompanhados');
        // Recarrega lista de perfis
        await fetchData();
        // Dispara ingestão inicial automaticamente
        await handleRunIngestion(usernameLower);
      }
    } catch (err) {
      console.error(err);
    }
    setShowAdd(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/data?username=${encodeURIComponent(deleteTarget)}`, { method: 'DELETE' });
      if (res.ok) {
        setProfiles(prev => prev.map((p: any) => p.username === deleteTarget ? { ...p, status: 'INATIVO', exibir: 0 } : p));
      }
    } catch (err) {
      console.error("Erro ao desativar perfil:", err);
    }
    setDeleteTarget(null);
  }

  return (
    <div className="dashboard-container">
      {/* --- CABEÇALHO DO DASHBOARD --- */}
      <header className="app-header">
        <div className="brand-section">
          <div className="logo-icon">
            <img src="/img/logo.jpeg" alt="SocialTracker Logo" />
          </div>
          <div className="brand-name">SocialTracker</div>
        </div>

        <div className="header-actions">
          {/* Navegação principal por Abas */}
          <div className="nav-tabs">
            <button
              className={`tab-btn ${activeTab === 'controle' ? 'active' : ''}`}
              onClick={() => setActiveTab('controle')}
            >
              🎛️ Controle
            </button>
            <button
              className={`tab-btn ${activeTab === 'acompanhados' ? 'active' : ''}`}
              onClick={() => setActiveTab('acompanhados')}
            >
              <Heart size={16} />
              Acompanhando
            </button>
            <button
              className={`tab-btn ${activeTab === 'followers' ? 'active' : ''}`}
              onClick={() => setActiveTab('followers')}
            >
              <Users size={16} />
              Seguidores
            </button>
            <button
              className={`tab-btn ${activeTab === 'cards' ? 'active' : ''}`}
              onClick={() => setActiveTab('cards')}
            >
              <BarChart3 size={16} />
              Posts Virais
            </button>
            <button
              className={`tab-btn ${activeTab === 'posts' ? 'active' : ''}`}
              onClick={() => setActiveTab('posts')}
            >
              <LayersIcon size={16} />
              Feed Geral
            </button>
            <button
              className={`tab-btn ${activeTab === 'anomalias' ? 'active' : ''}`}
              onClick={() => setActiveTab('anomalias')}
            >
              <History size={16} />
              Histórico Conta
              {anomaliasCount > 0 && (
                <span className="tab-badge">{anomaliasCount}</span>
              )}
            </button>
            <button
              className={`tab-btn ${activeTab === 'automatizacao' ? 'active' : ''}`}
              onClick={() => setActiveTab('automatizacao')}
            >
              <span style={{ fontSize: 16 }}>🤖</span>
              Automatização
            </button>
            <button
              className={`tab-btn ${activeTab === 'respostas' ? 'active' : ''}`}
              onClick={() => setActiveTab('respostas')}
              style={{ position: 'relative' }}
            >
              <MessageSquare size={16} />
              Respostas
              {(() => {
                const totalMsg = profiles.reduce((acc, p) => acc + (p.mensagens_pendentes || 0), 0);
                const totalCom = profiles.reduce((acc, p) => acc + (p.comentarios_pendentes || 0), 0);
                const total = totalMsg + totalCom;
                return total > 0 ? (
                  <span className="tab-badge" style={{ background: 'linear-gradient(135deg, #FF007A, #FF4500)', color: 'white' }}>
                    {total}
                  </span>
                ) : null;
              })()}
            </button>
          </div>

          {/* Seletor de Datas Falso (Visual) */}
          <a
            href="https://whimsical.com/svj8/gerou-lead-AKg9ULSb61KNUNUNWANtot"
            target="_blank"
            style={{ display: 'flex', alignSelf: 'stretch', textDecoration: 'none' }}
          >
            <button style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: '#39ff14',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              padding: '0 14px',
              height: '100%',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 0 8px #39ff14, 0 0 16px #39ff1466',
              letterSpacing: '0.5px',
              whiteSpace: 'nowrap'
            }}>
              <Brain size={14} />
              MAPA MENTAL
            </button>
          </a>

        </div>
      </header>
      {/* ====================================================
        ABA 0: ACOMPANHADOS
      ==================================================== */}
      {activeTab === 'acompanhados' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px' }}>👥 Perfis Acompanhados</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Gerencie os perfis monitorados, veja o histórico de coletas e adicione novos.
              </p>
            </div>
            <button
              onClick={() => handleRunIngestion()}
              disabled={ingestingAll || ingestingProfile !== null}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: ingestingAll ? "#30363D" : "#238636",
                color: "white",
                cursor: (ingestingAll || ingestingProfile !== null) ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "background 0.2s"
              }}
              onMouseEnter={e => { if (!ingestingAll && ingestingProfile === null) e.currentTarget.style.background = "#2ea043"; }}
              onMouseLeave={e => { if (!ingestingAll && ingestingProfile === null) e.currentTarget.style.background = "#238636"; }}
            >
              {ingestingAll ? (
                <>
                  <span className="spinner-mini" style={{ display: "inline-block", width: 12, height: 12, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}></span>
                  Rodando Ingestão...
                </>
              ) : (
                <>
                  <Play size={14} fill="white" />
                  Rodar Ingestão (Todos Ativos)
                </>
              )}
            </button>
          </div>

          {/* Placar de Status dos Perfis */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "16px",
            marginBottom: "24px"
          }}>
            {/* Card Total */}
            <div
              onClick={() => setAcompStatusFilter('TODOS')}
              style={{
                background: acompStatusFilter === 'TODOS' ? "rgba(113, 0, 226, 0.12)" : "#161B22",
                border: `1px solid ${acompStatusFilter === 'TODOS' ? '#7100E2' : '#30363D'}`,
                borderRadius: "12px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: acompStatusFilter === 'TODOS' ? "0 0 12px rgba(113, 0, 226, 0.2)" : "none"
              }}
            >
              <div style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "rgba(113, 0, 226, 0.15)",
                border: "1px solid rgba(113, 0, 226, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#a855f7"
              }}>
                <Users size={20} />
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {incluirTodosPerfis ? 'Total no Banco' : 'Perfis em Exibição'}
                </div>
                <div style={{ fontSize: "22px", fontWeight: "800", color: "#F0F6FC", marginTop: "2px" }}>
                  {profilesBase.length}
                </div>
              </div>
            </div>

            {/* Card Ativos */}
            <div
              onClick={() => setAcompStatusFilter(acompStatusFilter === 'ATIVO' ? 'TODOS' : 'ATIVO')}
              style={{
                background: acompStatusFilter === 'ATIVO' ? "rgba(46, 160, 67, 0.15)" : "#161B22",
                border: `1px solid ${acompStatusFilter === 'ATIVO' ? '#2ea043' : '#30363D'}`,
                borderRadius: "12px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: acompStatusFilter === 'ATIVO' ? "0 0 12px rgba(46, 160, 67, 0.2)" : "none"
              }}
            >
              <div style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "rgba(46, 160, 67, 0.15)",
                border: "1px solid rgba(46, 160, 67, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#2ea043"
              }}>
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Perfis Ativos
                </div>
                <div style={{ fontSize: "22px", fontWeight: "800", color: "#2ea043", marginTop: "2px" }}>
                  {countAtivos}
                </div>
              </div>
            </div>

            {/* Card Inativos */}
            <div
              onClick={() => setAcompStatusFilter(acompStatusFilter === 'INATIVO' ? 'TODOS' : 'INATIVO')}
              style={{
                background: acompStatusFilter === 'INATIVO' ? "rgba(248, 81, 73, 0.15)" : "#161B22",
                border: `1px solid ${acompStatusFilter === 'INATIVO' ? '#f85149' : '#30363D'}`,
                borderRadius: "12px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: acompStatusFilter === 'INATIVO' ? "0 0 12px rgba(248, 81, 73, 0.2)" : "none"
              }}
            >
              <div style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "rgba(248, 81, 73, 0.15)",
                border: "1px solid rgba(248, 81, 73, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f85149"
              }}>
                <X size={20} />
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Perfis Inativos
                </div>
                <div style={{ fontSize: "22px", fontWeight: "800", color: "#f85149", marginTop: "2px" }}>
                  {countInativos}
                </div>
              </div>
            </div>

            {/* Card Indisponíveis */}
            <div
              onClick={() => setAcompStatusFilter(acompStatusFilter === 'INDISPONIVEL' ? 'TODOS' : 'INDISPONIVEL')}
              style={{
                background: acompStatusFilter === 'INDISPONIVEL' ? "rgba(245, 158, 11, 0.15)" : "#161B22",
                border: `1px solid ${acompStatusFilter === 'INDISPONIVEL' ? '#F59E0B' : '#30363D'}`,
                borderRadius: "12px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: acompStatusFilter === 'INDISPONIVEL' ? "0 0 12px rgba(245, 158, 11, 0.2)" : "none"
              }}
            >
              <div style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "rgba(245, 158, 11, 0.15)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#F59E0B"
              }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Perfis Indisponíveis
                </div>
                <div style={{ fontSize: "22px", fontWeight: "800", color: "#F59E0B", marginTop: "2px" }}>
                  {countIndisponiveis}
                </div>
              </div>
            </div>

            {/* Card Morreu */}
            <div
              onClick={() => setAcompStatusFilter(acompStatusFilter === 'MORREU' ? 'TODOS' : 'MORREU')}
              style={{
                background: acompStatusFilter === 'MORREU' ? "rgba(248, 81, 73, 0.15)" : "#161B22",
                border: `1px solid ${acompStatusFilter === 'MORREU' ? '#f85149' : '#30363D'}`,
                borderRadius: "12px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: acompStatusFilter === 'MORREU' ? "0 0 12px rgba(248, 81, 73, 0.2)" : "none"
              }}
            >
              <div style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "rgba(248, 81, 73, 0.15)",
                border: "1px solid rgba(248, 81, 73, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f85149",
                fontSize: 20
              }}>
                ☠️
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "600", color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Perfis Morreu
                </div>
                <div style={{ fontSize: "22px", fontWeight: "800", color: "#f85149", marginTop: "2px" }}>
                  {countMorreu}
                </div>
              </div>
            </div>
          </div>

          {/* Barra de ações */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#161B22", border: "1px solid #30363D",
              borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 180
            }}>
              <span style={{ color: "#8B949E", fontSize: 14 }}>🔍</span>
              <input
                value={searchAcompanhados}
                onChange={e => setSearchAcompanhados(e.target.value)}
                placeholder="Buscar perfil..."
                style={{
                  background: "transparent", border: "none", outline: "none",
                  color: "white", fontSize: 13, width: "100%"
                }}
              />
            </div>

            {/* BOTÃO LIGA / DESLIGA: Incluir todos os perfis na análise vs apenas os marcados */}
            <div
              onClick={() => setIncluirTodosPerfis(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#161B22',
                border: `1px solid ${incluirTodosPerfis ? '#7100E2' : '#30363D'}`,
                borderRadius: 8,
                padding: '6px 14px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                userSelect: 'none',
                boxShadow: incluirTodosPerfis ? '0 0 14px rgba(113, 0, 226, 0.3)' : 'none'
              }}
              title={incluirTodosPerfis ? "Clique para desativar e ver apenas os perfis marcados como ativos na visualização" : "Clique para ativar e incluir todos os perfis do banco (inclusive os tirados de visualização)"}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {incluirTodosPerfis ? (
                  <Eye size={15} color="#00F0FF" />
                ) : (
                  <EyeOff size={15} color="#8B949E" />
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: incluirTodosPerfis ? '#00F0FF' : '#F0F6FC', whiteSpace: 'nowrap' }}>
                    {incluirTodosPerfis ? '🌐 Todos os Perfis' : '🎯 Apenas Marcados'}
                  </span>
                  <span style={{ fontSize: 9, color: incluirTodosPerfis ? '#A855F7' : '#8B949E', whiteSpace: 'nowrap' }}>
                    {incluirTodosPerfis ? `Mostrando todos (${countOcultos} ocultos inclusos)` : `Ocultos filtrados (${countOcultos})`}
                  </span>
                </div>
              </div>

              {/* Interruptor Liga/Desliga */}
              <div style={{
                width: 34,
                height: 18,
                borderRadius: 10,
                background: incluirTodosPerfis ? 'linear-gradient(135deg, #7100E2, #00F0FF)' : '#21262D',
                border: `1px solid ${incluirTodosPerfis ? '#00F0FF' : '#484F58'}`,
                position: 'relative',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: 2,
                  left: incluirTodosPerfis ? 18 : 2,
                  transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.5)'
                }} />
              </div>
            </div>

            <div style={{
              background: "#161B22", border: "1px solid #30363D",
              borderRadius: 8, padding: "8px 16px", color: "#8B949E", fontSize: 13
            }}>
              {acompStatusFilter !== 'TODOS' ? `${profilesFiltrados.length} de ${profilesBase.length} perfis` : `${profilesBase.length} perfis`}
            </div>
            <button
              onClick={() => setShowAdd(true)}
              style={{
                padding: "9px 18px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg, #7100E2, #00F0FF)",
                color: "white", cursor: "pointer",
                fontSize: 13, fontWeight: 700, whiteSpace: "nowrap"
              }}
            >
              ➕ Adicionar perfil
            </button>
          </div>

          {/* Tabela */}
          <div style={{
            background: "#161B22", border: "1px solid #30363D",
            borderRadius: 12, overflow: "hidden"
          }}>
            {/* Cabeçalho */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 85px 90px 120px 70px 110px 110px 125px 110px 80px 80px 44px 80px 70px",
              padding: "12px 16px",
              borderBottom: "1px solid #30363D",
              color: "#8B949E",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              alignItems: "center",
              minWidth: 1385
            }}>
              {([
                { key: 'username', label: 'Perfil', align: 'left' },
                { key: 'is_verified', label: 'Verificado', align: 'center' },
                { key: 'performance_score', label: 'Score PS', align: 'center' },
                { key: 'primeira_postagem', label: '1ª Post', align: 'center' },
                { key: 'dias', label: 'DIAs', align: 'center' },
                { key: 'inicio_monitoramento', label: 'Primeira coleta', align: 'center' },
                { key: 'data_coleta', label: 'Última coleta', align: 'center' },
                { key: 'status', label: 'Status', align: 'center' },
                { key: 'seguidores', label: 'Seguidores', align: 'center' },
                { key: 'evolucao', label: 'Evolução', align: 'center' },
                { key: 'pctCrescimento', label: '% Cresc.', align: 'center' },
                { key: 'meu_perfil', label: '⭐', align: 'center' },
              ] as { key: string; label: string; align: string }[]).map(col => (
                <button
                  key={col.key}
                  onClick={() => handleAcompSort(col.key)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: acompSortField === col.key ? '#00F0FF' : '#8B949E',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', padding: 0,
                    textAlign: col.align as any,
                    display: 'flex', alignItems: 'center',
                    justifyContent: col.align === 'center' ? 'center' : 'flex-start',
                    gap: 4, width: '100%',
                    transition: 'color 0.15s'
                  }}
                >
                  {col.label}
                  {acompSortField === col.key ? (
                    <span style={{ fontSize: 10, opacity: 0.9 }}>
                      {acompSortDir === 'asc' ? '▲' : '▼'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, opacity: 0.25 }}>⇅</span>
                  )}
                </button>
              ))}
              <span style={{ textAlign: "center" }}>Coletar</span>
              <span style={{ textAlign: "center" }}>Ações</span>
            </div>

            {/* Linhas */}
            {profilesFiltrados.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#8B949E", fontSize: 14 }}>
                Nenhum perfil encontrado.
              </div>
            ) : (
              profilesFiltrados.map((perfil, idx) => {
                const isMorreu = perfil.status === 'MORREU' || perfil.status_controle === '☠️ Morreu' || (perfil.status_controle || '').includes('Morreu');
                const isMeuPerfil = perfil.meu_perfil === 1 || Boolean(perfil.meu_perfil);
                const isIndisponivel = (perfil.status || '').toUpperCase() === 'INDISPONIVEL' || (perfil.status || '').toUpperCase() === 'INDISPONÍVEL';
                const isYellowRow = isMeuPerfil && isIndisponivel && !isMorreu;
                const isGreenRow = isMeuPerfil && !isMorreu && !isIndisponivel;
                return (
                  <div
                    key={perfil.username}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.3fr 85px 90px 120px 70px 110px 110px 125px 110px 80px 80px 44px 80px 70px",
                      padding: "14px 16px",
                      borderBottom: idx < profilesFiltrados.length - 1 ? "1px solid #21262D" : "none",
                      alignItems: "center",
                      transition: "background 0.15s",
                      background: isMorreu ? 'rgba(248,81,73,0.08)' : (isYellowRow ? 'rgba(245,158,11,0.08)' : (isGreenRow ? 'rgba(46,160,67,0.08)' : 'transparent')),
                      borderLeft: isMorreu ? '3px solid #F85149' : (isYellowRow ? '3px solid #F59E0B' : (isGreenRow ? '3px solid #2ea043' : '3px solid transparent')),
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = isMorreu ? 'rgba(248,81,73,0.16)' : (isYellowRow ? 'rgba(245,158,11,0.16)' : (isGreenRow ? 'rgba(46,160,67,0.16)' : "#1C2128")))}
                    onMouseLeave={e => (e.currentTarget.style.background = isMorreu ? 'rgba(248,81,73,0.08)' : (isYellowRow ? 'rgba(245,158,11,0.08)' : (isGreenRow ? 'rgba(46,160,67,0.08)' : "transparent")))}
                  >
                    {/* Perfil */}
                    <a
                      href={`https://www.instagram.com/${perfil.username}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = "1.0"; }}
                    >
                      {perfil.foto_url ? (
                        <AvatarModelo
                          src={perfil.foto_url}
                          username={perfil.username}
                          size={36}
                          comentariosPendentes={perfil.comentarios_pendentes || 0}
                          mensagensPendentes={perfil.mensagens_pendentes || 0}
                          temPendencias={perfil.tem_pendencias || false}
                        />
                      ) : (
                        <AvatarModelo
                          src={null}
                          username={perfil.username}
                          size={36}
                          comentariosPendentes={perfil.comentarios_pendentes || 0}
                          mensagensPendentes={perfil.mensagens_pendentes || 0}
                          temPendencias={perfil.tem_pendencias || false}
                        />
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 14, textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.15)" }}>@{perfil.username}</span>
                          {perfil.exibir === 0 && (
                            <span style={{
                              background: 'rgba(139, 148, 158, 0.15)',
                              border: '1px solid rgba(139, 148, 158, 0.35)',
                              color: '#8B949E',
                              fontSize: 10,
                              padding: '1px 5px',
                              borderRadius: 4,
                              fontWeight: 700
                            }}>
                              👁️ Oculto
                            </span>
                          )}
                        </div>
                        <div style={{ color: "#8B949E", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                          instagram <ExternalLink size={10} style={{ color: "#8B949E" }} />
                        </div>
                      </div>
                    </a>

                    {/* ── Verificado (Instagram Verified) ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <button
                        title={perfil.is_verified ? "Perfil verificado no Instagram (clique para alternar)" : "Marcar perfil como verificado no Instagram"}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const novoValor = perfil.is_verified ? 0 : 1;
                          setProfiles(prev => prev.map(p => p.username === perfil.username ? { ...p, is_verified: novoValor } : p));
                          await fetch('/api/data', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: perfil.username, is_verified: novoValor })
                          });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          transition: 'transform 0.15s, opacity 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                      >
                        {perfil.is_verified ? (
                          <BadgeCheck size={20} fill="#0095F6" color="#ffffff" style={{ filter: 'drop-shadow(0 0 4px rgba(0, 149, 246, 0.4))' }} />
                        ) : (
                          <BadgeCheck size={20} fill="transparent" color="#444C56" style={{ opacity: 0.4 }} />
                        )}
                      </button>
                    </div>

                    {/* ── Performance Score (PS) Badge ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {perfil.performance_score !== null && perfil.performance_score !== undefined && !isNaN(perfil.performance_score) ? (() => {
                        const ps = perfil.performance_score as number;
                        const detail = perfil.ps_detail;
                        const si = psStatusInfo(ps);
                        const tooltipLines = detail ? [
                          `${si.emoji} ${si.label}`,
                          ``,
                          `📈 S_crescimento (40%): ${detail.sCrescimento}`,
                          `   Ganho/dia: ${detail.ganhoDiarioReal.toFixed(1)} seg | Bench: ${detail.medGanhoBenchmark.toFixed(1)}`,
                          ``,
                          `📅 S_ritmo (35%): ${detail.sRitmo}`,
                          `   Posts/dia: ${detail.postsPorDiaReal.toFixed(2)} | Meta: 1.8`,
                          ``,
                          `⚡ S_eficiência (25%): ${detail.sEficiencia}`,
                          `   Seg/post: ${detail.eficienciaReal.toFixed(1)} | Bench: ${detail.medEficienciaBenchmark.toFixed(1)}`,
                        ].join('\n') : '';
                        return (
                          <div
                            title={tooltipLines}
                            style={{
                              display: 'inline-flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 2,
                              cursor: 'default',
                            }}
                          >
                            <div style={{
                              background: si.bg,
                              border: `1.5px solid ${si.border}`,
                              borderRadius: 8,
                              padding: '4px 10px',
                              minWidth: 52,
                              textAlign: 'center',
                              boxShadow: `0 0 8px ${si.bg}`,
                              transition: 'box-shadow 0.2s',
                            }}>
                              <div style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'baseline' }}>
                                <span
                                  style={{
                                    fontSize: 15,
                                    fontWeight: 800,
                                    color: si.color,
                                    letterSpacing: '-0.5px',
                                    fontVariantNumeric: 'tabular-nums',
                                    lineHeight: 1.2,
                                  }}
                                >
                                  {ps}
                                </span>
                                <span
                                  style={{
                                    fontSize: 8,
                                    color: si.color,
                                    opacity: 0.75,
                                    fontWeight: 700,
                                    letterSpacing: '0.05em',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  /100
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })() : (
                        <span style={{ color: '#444C56', fontSize: 12 }} title="Sem data de 1ª postagem para calcular">—</span>
                      )}
                    </div>

                    {/* Primeira Postagem */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      {editingPrimeiraPostagem === perfil.username ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="date"
                            autoFocus
                            value={primeiraPostagemDraft}
                            onChange={e => setPrimeiraPostagemDraft(e.target.value)}
                            style={{
                              background: "#0D1117", border: "1px solid #00F0FF",
                              borderRadius: 5, padding: "3px 6px", color: "white",
                              fontSize: 11, outline: "none", width: 110
                            }}
                            onKeyDown={async e => {
                              if (e.key === 'Enter') {
                                await fetch('/api/data', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ username: perfil.username, primeiraPostagem: primeiraPostagemDraft || null })
                                });
                                setEditingPrimeiraPostagem(null);
                                fetchData();
                              } else if (e.key === 'Escape') {
                                setEditingPrimeiraPostagem(null);
                              }
                            }}
                          />
                          <button
                            title="Salvar"
                            onClick={async () => {
                              await fetch('/api/data', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ username: perfil.username, primeiraPostagem: primeiraPostagemDraft || null })
                              });
                              setEditingPrimeiraPostagem(null);
                              fetchData();
                            }}
                            style={{
                              background: "#23863620", border: "1px solid #2ea043",
                              borderRadius: 5, padding: "3px 6px", cursor: "pointer",
                              color: "#2ea043", fontSize: 11, fontWeight: 700
                            }}
                          >✓</button>
                          <button
                            title="Cancelar"
                            onClick={() => setEditingPrimeiraPostagem(null)}
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              color: "#8B949E", fontSize: 13, padding: "2px 4px"
                            }}
                          >✕</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 90 }}>
                          {perfil.primeira_postagem ? (
                            <span style={{
                              fontSize: 11, color: "#8B949E",
                              background: "#0D1117", border: "1px solid #30363D",
                              borderRadius: 5, padding: "3px 7px", cursor: "pointer"
                            }}
                              title="Clique para editar"
                              onClick={() => {
                                setEditingPrimeiraPostagem(perfil.username);
                                setPrimeiraPostagemDraft(perfil.primeira_postagem?.split('T')[0]?.split(' ')[0] || '');
                              }}
                            >
                              {formatDate(perfil.primeira_postagem)}
                            </span>
                          ) : (
                            <span style={{ color: "#444C56", fontSize: 12 }}>—</span>
                          )}
                          <button
                            title={perfil.primeira_postagem ? "Editar data da primeira postagem" : "Incluir data da primeira postagem"}
                            onClick={() => {
                              setEditingPrimeiraPostagem(perfil.username);
                              setPrimeiraPostagemDraft(perfil.primeira_postagem?.split('T')[0]?.split(' ')[0] || '');
                            }}
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              color: "#444C56", fontSize: 12, padding: "2px 3px",
                              lineHeight: 1, borderRadius: 4,
                              transition: "color 0.15s"
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#00F0FF")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#444C56")}
                          >✏️</button>
                        </div>
                      )}
                    </div>

                    {/* DIAs desde 1ª Postagem (se MORREU, calcula até a última data de coleta) */}
                    <div style={{ textAlign: 'center' }}>
                      {perfil.primeira_postagem ? (() => {
                        const inicio = new Date(perfil.primeira_postagem.split(' ')[0].split('T')[0] + 'T00:00:00');
                        let fim: Date;
                        let tooltipText = '';

                        if (isMorreu && perfil.data_coleta) {
                          fim = new Date(perfil.data_coleta.split(' ')[0].split('T')[0] + 'T00:00:00');
                        } else {
                          fim = new Date();
                          fim.setHours(0, 0, 0, 0);
                        }

                        const dias = Math.max(0, Math.floor((fim.getTime() - inicio.getTime()) / 86400000));

                        if (isMorreu && perfil.data_coleta) {
                          tooltipText = `${dias} dias de sobrevida (1ª postagem até última coleta em ${formatDate(perfil.data_coleta)})`;
                        } else {
                          tooltipText = `${dias} dias desde a primeira postagem`;
                        }

                        return (
                          <span
                            title={tooltipText}
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: isMorreu ? '#F85149' : (dias >= 365 ? '#10B981' : dias >= 90 ? '#F59E0B' : '#8B949E'),
                              background: isMorreu ? 'rgba(248,81,73,0.12)' : (dias >= 365 ? 'rgba(16,185,129,0.1)' : dias >= 90 ? 'rgba(245,158,11,0.1)' : 'rgba(139,148,158,0.08)'),
                              border: `1px solid ${isMorreu ? 'rgba(248,81,73,0.35)' : (dias >= 365 ? 'rgba(16,185,129,0.3)' : dias >= 90 ? 'rgba(245,158,11,0.3)' : '#30363D')}`,
                              borderRadius: 5,
                              padding: '3px 8px',
                              display: 'inline-block',
                              minWidth: 40,
                            }}
                          >
                            {dias}
                          </span>
                        );
                      })() : (
                        <span style={{ color: '#444C56', fontSize: 12 }}>—</span>
                      )}
                    </div>

                    {/* Primeira coleta */}
                    <div style={{ color: "#8B949E", fontSize: 12, textAlign: "center" }}>
                      {perfil.inicio_monitoramento
                        ? formatDate(perfil.inicio_monitoramento)
                        : "—"}
                    </div>

                    {/* Última coleta */}
                    <div style={{ color: "#8B949E", fontSize: 12, textAlign: "center" }}>
                      {perfil.data_coleta
                        ? formatDate(perfil.data_coleta)
                        : "—"}
                    </div>

                    {/* Status */}
                    <div style={{ textAlign: "center" }}>
                      {(() => {
                        const currentStatus = (perfil.status === 'MORREU' || (perfil.status_controle || '').includes('Morreu')) ? 'MORREU' : (perfil.status || 'ATIVO');
                        const isMorreuVal = currentStatus === 'MORREU';
                        const isIndisponivelVal = currentStatus === 'INDISPONIVEL' || currentStatus === 'INDISPONÍVEL';
                        const isAtivoVal = currentStatus === 'ATIVO';

                        const bg = isMorreuVal ? '#da363320' : (isIndisponivelVal ? 'rgba(245, 158, 11, 0.2)' : (isAtivoVal ? '#23863620' : '#da363320'));
                        const color = isMorreuVal ? '#f85149' : (isIndisponivelVal ? '#F59E0B' : (isAtivoVal ? '#2ea043' : '#f85149'));
                        const border = isMorreuVal ? '#f85149' : (isIndisponivelVal ? '#F59E0B' : (isAtivoVal ? '#2ea043' : '#f85149'));

                        return (
                          <select
                            value={currentStatus}
                            onChange={(e) => changeStatus(perfil.username, e.target.value)}
                            style={{
                              background: bg,
                              color: color,
                              border: `1px solid ${border}`,
                              borderRadius: 6, fontSize: 12, fontWeight: 700,
                              cursor: 'pointer', padding: '4px 8px',
                              outline: 'none'
                            }}
                          >
                            <option value="ATIVO" style={{ background: "#161B22", color: "#2ea043" }}>● ATIVO</option>
                            <option value="INATIVO" style={{ background: "#161B22", color: "#f85149" }}>○ INATIVO</option>
                            <option value="INDISPONIVEL" style={{ background: "#161B22", color: "#F59E0B" }}>⚠️ INDISPONÍVEL</option>
                            <option value="MORREU" style={{ background: "#161B22", color: "#f85149" }}>☠️ MORREU</option>
                          </select>
                        );
                      })()}
                    </div>

                    {/* Seguidores - Edição elegante ao clicar na borda/conteúdo */}
                    <div style={{ textAlign: "center" }}>
                      {editingSeguidores === perfil.username ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            autoFocus
                            value={seguidoresDraft}
                            onChange={e => setSeguidoresDraft(e.target.value)}
                            placeholder="0"
                            style={{
                              background: "#0D1117", border: "1px solid #00F0FF",
                              borderRadius: 6, padding: "3px 8px", color: "#00F0FF",
                              fontSize: 13, fontWeight: 700, outline: "none", width: 90, textAlign: "center"
                            }}
                            onKeyDown={async e => {
                              if (e.key === 'Enter') {
                                if (seguidoresDraft.trim() !== '') {
                                  const novo = Number(seguidoresDraft);
                                  const anterior = Number(perfil.seguidores || 0);
                                  if (anterior > 0) {
                                    const diff = Math.abs(novo - anterior);
                                    const pct = (diff / anterior) * 100;
                                    if (pct > 5) {
                                      const sinal = novo > anterior ? '+' : '-';
                                      if (!confirm(`⚠️ Variação de ${sinal}${pct.toFixed(1)}% detectada!\n\nDe ${anterior.toLocaleString('pt-BR')} para ${novo.toLocaleString('pt-BR')} seguidores.\nDeseja confirmar a gravação?`)) {
                                        return;
                                      }
                                    }
                                  }
                                  await fetch('/api/data', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ username: perfil.username, seguidores: novo })
                                  });
                                  setEditingSeguidores(null);
                                  fetchData();
                                }
                              } else if (e.key === 'Escape') {
                                setEditingSeguidores(null);
                              }
                            }}
                          />
                          <button
                            title="Salvar seguidores"
                            onClick={async () => {
                              if (seguidoresDraft.trim() !== '') {
                                const novo = Number(seguidoresDraft);
                                const anterior = Number(perfil.seguidores || 0);
                                if (anterior > 0) {
                                  const diff = Math.abs(novo - anterior);
                                  const pct = (diff / anterior) * 100;
                                  if (pct > 5) {
                                    const sinal = novo > anterior ? '+' : '-';
                                    if (!confirm(`⚠️ Variação de ${sinal}${pct.toFixed(1)}% detectada!\n\nDe ${anterior.toLocaleString('pt-BR')} para ${novo.toLocaleString('pt-BR')} seguidores.\nDeseja confirmar a gravação?`)) {
                                      return;
                                    }
                                  }
                                }
                                await fetch('/api/data', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ username: perfil.username, seguidores: novo })
                                });
                                setEditingSeguidores(null);
                                fetchData();
                              }
                            }}
                            style={{
                              background: "#23863620", border: "1px solid #2ea043",
                              borderRadius: 5, padding: "3px 6px", cursor: "pointer",
                              color: "#2ea043", fontSize: 11, fontWeight: 700
                            }}
                          >✓</button>
                          <button
                            title="Cancelar"
                            onClick={() => setEditingSeguidores(null)}
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              color: "#8B949E", fontSize: 13, padding: "2px 4px"
                            }}
                          >✕</button>
                        </div>
                      ) : (
                        <>
                          <span
                            title="Clique para editar manualmente o número de seguidores"
                            onClick={() => {
                              setEditingSeguidores(perfil.username);
                              setSeguidoresDraft(perfil.seguidores != null ? String(perfil.seguidores) : '');
                            }}
                            style={{
                              background: "#0D1117", border: "1px solid #30363D",
                              borderRadius: 6, padding: "3px 10px", fontSize: 13, fontWeight: 700,
                              color: perfil.seguidores != null ? "#00F0FF" : "#8B949E",
                              cursor: "pointer", display: "inline-block",
                              transition: "all 0.2s ease"
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.borderColor = "#00F0FF";
                              e.currentTarget.style.boxShadow = "0 0 8px rgba(0, 240, 255, 0.3)";
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.borderColor = "#30363D";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
                            {perfil.seguidores != null ? Number(perfil.seguidores).toLocaleString("pt-BR") : "—"}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Evolução */}
                    <div style={{ textAlign: "center" }}>
                      {perfil.evolucao !== null && perfil.evolucao !== undefined ? (
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          color: perfil.evolucao > 0 ? '#10B981' : perfil.evolucao < 0 ? '#F85149' : '#8B949E'
                        }}>
                          {perfil.evolucao > 0 ? '+' : ''}{Number(perfil.evolucao).toLocaleString('pt-BR')}
                        </span>
                      ) : (
                        <span style={{ color: "#8B949E", fontSize: 12 }}>—</span>
                      )}
                    </div>

                    {/* % Crescimento */}
                    <div style={{ textAlign: "center" }}>
                      {perfil.pctCrescimento !== null && perfil.pctCrescimento !== undefined ? (
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          color: perfil.pctCrescimento > 0 ? '#10B981' : perfil.pctCrescimento < 0 ? '#F85149' : '#8B949E',
                          background: perfil.pctCrescimento > 0 ? 'rgba(16,185,129,0.1)' : perfil.pctCrescimento < 0 ? 'rgba(248,81,73,0.1)' : 'transparent',
                          borderRadius: 4, padding: '2px 6px'
                        }}>
                          {perfil.pctCrescimento > 0 ? '+' : ''}{perfil.pctCrescimento.toFixed(2)}%
                        </span>
                      ) : (
                        <span style={{ color: "#8B949E", fontSize: 12 }}>—</span>
                      )}
                    </div>
                    {/* Estrela - Meu Perfil */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <button
                        title={perfil.meu_perfil ? "Meu perfil (clique para desmarcar)" : "Marcar como meu perfil"}
                        onClick={async () => {
                          const novoValor = perfil.meu_perfil ? 0 : 1;
                          await fetch('/api/data', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: perfil.username, meuPerfil: novoValor })
                          });
                          fetchData();
                        }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 18, lineHeight: 1, padding: 0,
                          color: perfil.meu_perfil ? "#F5C518" : "#444C56",
                          transition: "transform 0.15s, color 0.15s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.3)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                      >
                        {perfil.meu_perfil ? "⭐" : "☆"}
                      </button>
                    </div>

                    {/* Coletar (Ingestion) */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <button
                        onClick={() => handleRunIngestion(perfil.username)}
                        disabled={ingestingAll || ingestingProfile !== null}
                        title="Rodar Ingestão para este perfil"
                        style={{
                          background: ingestingProfile === perfil.username ? "#1b2d1d" : "#23863620",
                          border: `1px solid ${ingestingProfile === perfil.username ? "#2ea043" : "#2ea043"}`,
                          borderRadius: 6, padding: "5px 12px", cursor: (ingestingAll || ingestingProfile !== null) ? "not-allowed" : "pointer",
                          color: "#2ea043", fontSize: 11, fontWeight: 700,
                          display: "flex", alignItems: "center", gap: 4,
                          transition: "all 0.2s"
                        }}
                        onMouseEnter={e => {
                          if (!ingestingAll && ingestingProfile === null) {
                            e.currentTarget.style.background = "#2ea043";
                            e.currentTarget.style.color = "white";
                          }
                        }}
                        onMouseLeave={e => {
                          if (!ingestingAll && ingestingProfile === null) {
                            e.currentTarget.style.background = "#23863620";
                            e.currentTarget.style.color = "#2ea043";
                          }
                        }}
                      >
                        {ingestingProfile === perfil.username ? (
                          <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #2ea043", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}></span>
                        ) : (
                          <>
                            <Play size={10} fill="currentColor" />
                            Rodar
                          </>
                        )}
                      </button>
                    </div>

                    {/* Ações */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button
                        onClick={() => setEditTarget(perfil)}
                        title="Editar"
                        style={{
                          background: "#21262D", border: "1px solid #30363D",
                          borderRadius: 6, padding: "5px 9px", cursor: "pointer",
                          color: "#8B949E", fontSize: 13
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#30363D"; e.currentTarget.style.color = "white"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#21262D"; e.currentTarget.style.color = "#8B949E"; }}
                      >✏️</button>

                      {perfil.exibir === 0 ? (
                        <button
                          onClick={async () => {
                            setProfiles(prev => prev.map(p => p.username === perfil.username ? { ...p, exibir: 1, status: p.status === 'INATIVO' ? 'ATIVO' : p.status } : p));
                            await fetch('/api/data', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ username: perfil.username, exibir: 1, status: perfil.status === 'INATIVO' ? 'ATIVO' : perfil.status })
                            });
                          }}
                          title="Restaurar perfil para a visualização ativa (exibir=1)"
                          style={{
                            background: "rgba(0, 240, 255, 0.12)", border: "1px solid rgba(0, 240, 255, 0.35)",
                            borderRadius: 6, padding: "5px 9px", cursor: "pointer",
                            color: "#00F0FF", fontSize: 13
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "rgba(0, 240, 255, 0.25)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0, 240, 255, 0.12)"; }}
                        >👁️</button>
                      ) : (
                        <button
                          onClick={() => setDeleteTarget(perfil.username)}
                          title="Tirar da visualização / Desativar"
                          style={{
                            background: "#21262D", border: "1px solid #30363D",
                            borderRadius: 6, padding: "5px 9px", cursor: "pointer",
                            color: "#8B949E", fontSize: 13
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#F8514920"; e.currentTarget.style.color = "#F85149"; e.currentTarget.style.borderColor = "#F85149"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#21262D"; e.currentTarget.style.color = "#8B949E"; e.currentTarget.style.borderColor = "#30363D"; }}
                        >🗑️</button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {/* Modais */}
          {editTarget && (
            <EditModal
              profile={editTarget}
              onSave={handleEdit}
              onClose={() => setEditTarget(null)}
            />
          )}
          {deleteTarget && (
            <DeleteConfirm
              username={deleteTarget}
              onConfirm={handleDelete}
              onClose={() => setDeleteTarget(null)}
            />
          )}
          {showAdd && (
            <AddModal
              onSave={handleAdd}
              onClose={() => setShowAdd(false)}
            />
          )}
        </div>
      )}
      {/* ====================================================
          ABA 1: CARDS DE PERFIL E POSTS VIRAIS (LAYOUT PRINCIPAL)
          ==================================================== */}
      {activeTab === 'cards' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px' }}>Posts com Crescimento Acelerado</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Identificação algorítmica de perfis e postagens que estão apresentando tração acima da média histórica de engajamento do perfil.
            </p>
          </div>

          <div className="cards-grid">
            {[...profiles]
              .filter(p => p.exibir !== 0)
              .sort((a, b) => {
                const isMeA = Number(a.meu_perfil) === 1 ? 1 : 0;
                const isMeB = Number(b.meu_perfil) === 1 ? 1 : 0;
                if (isMeA !== isMeB) {
                  return isMeB - isMeA; // 1º Meus perfis
                }
                // Depois o que estiver com a última postagem viralizada e assim por diante
                const dateA = a.latestViralTimestamp || 0;
                const dateB = b.latestViralTimestamp || 0;
                if (dateB !== dateA) {
                  return dateB - dateA;
                }
                return (b.seguidores || 0) - (a.seguidores || 0);
              })
              .map(perfil => {
              // Pegar o post mais viral deste perfil
              const topPost = perfil.postMaisViral;
              const hasViral = topPost && topPost.viralStatus === 'Viralizando';
              const formattedFollowers = formatNumber(perfil.seguidores);

              // Histórico de seguidores deste perfil
              const hist = (followersHistory[perfil.username] || [])
                .sort((a: any, b: any) => new Date(a.data).getTime() - new Date(b.data).getTime())
                .map((pt: any) => ({
                  data: pt.data.substring(8, 16),
                  seguidores: Number(pt.total_seguidores)
                }));

              // Histórico de engajamento dos posts recentes para o gráfico mini
              const postsDoPerfil = posts
                .filter(p => p.username === perfil.username)
                .slice(0, 10) // 10 posts recentes
                .reverse() // Do antigo para o novo
                .map((p, idx) => ({
                  idx: idx + 1,
                  engajamento: p.likes + p.comentarios
                }));
              // ── Modal de Lançamento ──────────────────────────────────
              return (
                <div key={perfil.username} className="profile-card">
                  {/* Cabeçalho do Card */}
                  <div className="card-header-row">
                    <div className="user-info-group">
                      <AvatarModelo
                        src={perfil.foto_url || null}
                        username={perfil.username}
                        size={42}
                        comentariosPendentes={perfil.comentarios_pendentes || 0}
                        mensagensPendentes={perfil.mensagens_pendentes || 0}
                        temPendencias={perfil.tem_pendencias || false}
                      />
                      <div className="user-handle-box">
                        <span className="user-handle">@{perfil.username}</span>
                      </div>
                      {Number(perfil.meu_perfil) === 1 && (
                        <span title="Meu perfil" style={{ fontSize: '16px', marginLeft: '4px', cursor: 'default', userSelect: 'none' }}>
                          ⭐
                        </span>
                      )}
                    </div>
                    <div className="badges-group">
                      {perfil.status === 'INATIVO' && (
                        <span style={{
                          background: "#da363320",
                          color: "#f85149",
                          border: "1px solid #f85149",
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700
                        }}>Em espera</span>
                      )}
                      {hasViral ? (
                        <span className="viral-badge">🔥 Viralizando</span>
                      ) : (
                        <span className="normal-badge">Normal</span>
                      )}
                      <span className="time-badge">{perfil.diaMonitoramento}º dia de base</span>
                    </div>
                  </div>

                  {/* Texto de Insight dinâmico */}
                  <p className="insight-text">
                    <strong>
                      {topPost
                        ? (topPost.viralStatus === 'Viralizando'
                          ? `Um post está performando ${(topPost.performanceMultiplier || 1.0).toFixed(1).replace('.', ',')}x a média histórica da conta, e o ganho de seguidores acelerou no mesmo período — forte indício de que o post está atraindo novos seguidores.`
                          : `A melhor publicação performou ${(topPost.performanceMultiplier || 1.0).toFixed(1).replace('.', ',')}x a média da conta, mantendo o nível estável de crescimento de seguidores.`)
                        : "Aguardando mais coletas para computar desvios de desempenho."
                      }
                    </strong>
                  </p>

                  {/* Grid de 3 Métricas */}
                  <div className="metrics-row">
                    <div className="metric-box">
                      <span className="metric-lbl">👥 Novos Seguidores</span>
                      <span className="metric-val" style={{ color: perfil.novosSeguidores24h > 0 ? '#10B981' : perfil.novosSeguidores24h < 0 ? '#F85149' : undefined }}>
                        {perfil.novosSeguidores24h > 0 ? '+' : ''}{perfil.novosSeguidores24h !== 0 ? formatNumber(perfil.novosSeguidores24h) : '0'}
                      </span>
                      <span className="metric-sub green">vs. coleta anterior</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-lbl">🔥 Média Posts Virais</span>
                      <span className="metric-val">
                        {perfil.mediaPostsVirais > 0 ? formatNumber(perfil.mediaPostsVirais) : (topPost ? formatNumber(topPost.likes + topPost.comentarios) : '0')}
                      </span>
                      <span className="metric-sub">
                        Média conta: {formatNumber(Math.round(perfil.mediaHistoricaConta || 0))}
                      </span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-lbl">👁️ Visualizações</span>
                      <span className="metric-val">
                        {topPost && topPost.views > 0 ? formatNumber(topPost.views) : '—'}
                      </span>
                      <span className="metric-sub">
                        {topPost && topPost.views > 0 ? 'Reels plays' : 'Post estático'}
                      </span>
                    </div>
                  </div>

                  {/* Thumbnail e Mini-Gráficos */}
                  <div className="card-content-body">
                    {/* Thumbnail placeholder elegante */}
                    <div className="thumbnail-area">
                      {topPost && topPost.formato === 'Reels' ? (
                        <>
                          <VideoIcon />
                          <span>{topPost.formato}</span>
                        </>
                      ) : topPost && topPost.formato === 'Carrossel' ? (
                        <>
                          <LayersIcon />
                          <span>{topPost.formato}</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon />
                          <span>Imagem</span>
                        </>
                      )}
                      <span style={{ opacity: 0.5 }}>Post {topPost ? topPost.post_id : 'nulo'}</span>
                    </div>

                    {/* Área lateral com os 2 mini-gráficos */}
                    <div className="mini-charts-area">
                      {/* Mini Gráfico 1: Engajamento */}
                      <div className="mini-chart-wrapper">
                        <div className="mini-chart-title">
                          <span>Engajamento</span>
                          <span className="val">
                            {postsDoPerfil.length > 0 ? formatNumber(postsDoPerfil[postsDoPerfil.length - 1].engajamento) : '0'}
                          </span>
                        </div>
                        <div className="chart-container-mini">
                          {postsDoPerfil.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={postsDoPerfil}>
                                <Line
                                  type="monotone"
                                  dataKey="engajamento"
                                  stroke="#7100E2"
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sem histórico de posts</div>
                          )}
                        </div>
                      </div>

                      {/* Mini Gráfico 2: Seguidores */}
                      <div className="mini-chart-wrapper">
                        <div className="mini-chart-title">
                          <span>Seguidores</span>
                          <span className="val">
                            {formatNumber(perfil.seguidores)}
                          </span>
                        </div>
                        <div className="chart-container-mini">
                          {hist.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={hist}>
                                <YAxis
                                  dataKey="seguidores"
                                  domain={['dataMin - 1', 'dataMax + 1']}
                                  hide
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: '#161B22',
                                    borderColor: '#30363D',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    color: 'white',
                                    padding: '6px 10px'
                                  }}
                                  formatter={(value: any) => [formatNumber(value), 'Seguidores']}
                                  labelFormatter={(label: any) => `📅 ${label}`}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="seguidores"
                                  stroke="#00F0FF"
                                  strokeWidth={2}
                                  dot={{ r: 3, fill: '#00F0FF', strokeWidth: 0 }}
                                  activeDot={{ r: 5, fill: '#00F0FF' }}
                                  isAnimationActive={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sem histórico de base</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do Card */}
                  <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: perfil.confiancaCor || 'var(--text-muted)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: perfil.confiancaCor || '#8B949E', display: 'inline-block' }} />
                      {perfil.confiancaTexto} — {perfil.diaMonitoramento}d de base
                    </span>
                    {topPost && (topPost.permalink || topPost.shortcode || topPost.post_id) ? (
                      <a
                        href={getInstagramPostUrl(topPost)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="post-link"
                        style={{ textTransform: 'uppercase', fontWeight: 800, fontSize: '11px', letterSpacing: '0.5px' }}
                      >
                        VER POST <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====================================================
          ABA 2: BASE DE SEGUIDORES (GRÁFICO COMPLETO)
          ==================================================== */}
      {activeTab === 'followers' && (
        <div className="followers-history-box">
          <div className="chart-title-area">
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '800' }}>
                Evolução da Base de Seguidores{selectedProfile ? ` — @${selectedProfile}` : ''}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                Curva detalhada de crescimento com granularidade por coleta diária.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                className="profile-select"
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                style={{ margin: 0 }}
              >
                {profiles
                  .filter(p => p.exibir !== 0)
                  .slice()
                  .sort((a, b) => {
                    const starA = (a.meu_perfil === 1 || a.meu_perfil === true) ? 1 : 0;
                    const starB = (b.meu_perfil === 1 || b.meu_perfil === true) ? 1 : 0;
                    if (starB !== starA) return starB - starA;
                    return a.username.localeCompare(b.username);
                  })
                  .map(p => (
                  <option key={p.username} value={p.username}>
                    {(p.meu_perfil === 1 || p.meu_perfil === true) ? '⭐ ' : ''}{p.username}{p.status === 'INATIVO' ? ' (inativo)' : ''}
                  </option>
                ))}
              </select>
              {selectedProfile && (() => {
                const perfilObj = profiles.find(p => p.username === selectedProfile);
                if (!perfilObj) return null;
                const isInComparison = perfilObj.meu_perfil === 1
                  ? !perfisComparativosExcluidos.includes(selectedProfile)
                  : perfisComparativosAdicionais.includes(selectedProfile);

                return (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      disabled={isInComparison}
                      onClick={() => {
                        if (perfilObj.meu_perfil === 1) {
                          setPerfisComparativosExcluidos(prev => prev.filter(u => u !== selectedProfile));
                        } else {
                          setPerfisComparativosAdicionais(prev => [...prev, selectedProfile]);
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: isInComparison ? 'not-allowed' : 'pointer',
                        background: isInComparison ? 'transparent' : '#161B22',
                        color: isInComparison ? '#484F58' : '#39FF14',
                        borderColor: isInComparison ? '#30363D' : '#39FF14',
                        opacity: isInComparison ? 0.4 : 1,
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      ＋ Adicionar
                    </button>
                    <button
                      disabled={!isInComparison}
                      onClick={() => {
                        if (perfilObj.meu_perfil === 1) {
                          setPerfisComparativosExcluidos(prev => [...prev, selectedProfile]);
                        } else {
                          setPerfisComparativosAdicionais(prev => prev.filter(u => u !== selectedProfile));
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: !isInComparison ? 'not-allowed' : 'pointer',
                        background: !isInComparison ? 'transparent' : '#161B22',
                        color: !isInComparison ? '#484F58' : '#FF007A',
                        borderColor: !isInComparison ? '#30363D' : '#FF007A',
                        opacity: !isInComparison ? 0.4 : 1,
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      ✕ Excluir
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Análise de Seguidores do Perfil Selecionado */}
          {selectedProfile && (() => {
            const perfil = profiles.find(p => p.username === selectedProfile);
            const isDead = perfil?.status === 'MORREU' || perfil?.status === 'INATIVO' || perfil?.status_controle === '☠️ Morreu' || (perfil?.status_controle || '').includes('Morreu');
            const rawHist = (followersHistory[selectedProfile] || []).slice().sort((a: any, b: any) => String(a.data || '').localeCompare(String(b.data || '')));

            let lastValid = 0;
            const histData = rawHist.map((pt: any, idx: number) => {
              let seguidores = Number(pt.total_seguidores) || 0;
              if (seguidores > 0) {
                lastValid = seguidores;
              } else if (!isDead && lastValid > 0) {
                seguidores = lastValid;
              }
              const segAnterior = idx > 0 ? (Number(rawHist[idx - 1].total_seguidores) || seguidores) : seguidores;
              const diff = seguidores - segAnterior;
              return {
                // Formata a data para visualização curta (ex: 22/01 12:12)
                data: pt.data.substring(8, 10) + '/' + pt.data.substring(5, 7) + ' ' + pt.data.substring(11, 16),
                rawDate: pt.data,
                seguidores,
                diff
              };
            });

            // Calcular crescimento com relação à última coleta
            let delta = 0;
            let percentStr = "0.00%";
            if (histData.length > 1) {
              const prevSeg = histData[histData.length - 2].seguidores;
              const endSeg = histData[histData.length - 1].seguidores;
              delta = endSeg - prevSeg;
              percentStr = prevSeg > 0 ? `${((delta / prevSeg) * 100).toFixed(2)}%` : "0.00%";
            }

            return (
              <div>
                {/* Indicador de Total e Variação */}
                <div style={{ marginBottom: '24px' }}>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '700' }}>Total Atual</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '4px' }}>
                    <span style={{ fontSize: '36px', fontWeight: '800', color: 'white' }}>
                      {perfil ? formatNumber(perfil.seguidores) : '0'}
                    </span>
                    {histData.length > 1 && (
                      <span
                        style={{
                          backgroundColor: delta >= 0 ? 'rgba(0, 255, 200, 0.1)' : 'rgba(255, 0, 122, 0.1)',
                          color: delta >= 0 ? 'var(--color-green)' : 'var(--color-pink)',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '14px',
                          fontWeight: '700'
                        }}
                      >
                        {delta >= 0 ? '↑' : '↓'} {formatNumber(Math.abs(delta))} ({delta >= 0 ? '+' : ''}{percentStr})
                      </span>
                    )}
                  </div>
                </div>

                {/* Gráfico de Área (Plotly-like, em Recharts) */}
                <div className="chart-container-large">
                  {histData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={histData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorSeg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#00F0FF" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="data"
                          stroke="#586069"
                          tickLine={false}
                          style={{ fontSize: '11px' }}
                        />
                        <YAxis
                          stroke="#586069"
                          tickLine={false}
                          style={{ fontSize: '11px' }}
                          domain={['auto', 'auto']}
                          tickFormatter={(v) => formatNumber(v)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#161B22',
                            borderColor: 'var(--border-color)',
                            borderRadius: '8px',
                            color: 'white'
                          }}
                          formatter={(value: any, name: any, item: any) => {
                            const diff = item?.payload?.diff ?? 0;
                            const diffStr = diff >= 0 ? `+${formatNumber(diff)}` : formatNumber(diff);
                            return [`${formatNumber(value)} (${diffStr})`, 'Seguidores'];
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="seguidores"
                          stroke="#00F0FF"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorSeg)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="loading-box" style={{ padding: '40px' }}>
                      <p>Nenhum histórico de seguidores coletado para este perfil.</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ====================================================
              GRÁFICO COMPARATIVO — MEUS PERFIS (⭐)
              ==================================================== */}
          {(() => {
            const meusPerfis = profiles.filter(p =>
              p.meu_perfil === 1
                ? !perfisComparativosExcluidos.includes(p.username)
                : perfisComparativosAdicionais.includes(p.username)
            );

            const cores = [
              '#00F0FF', '#7100E2', '#FF007A', '#39FF14', '#FFD700', '#FF4500',
              '#00E5FF', '#A855F7', '#EC4899', '#10B981', '#F59E0B', '#EF4444',
              '#3B82F6', '#8B5CF6', '#F43F5E', '#06B6D4', '#84CC16', '#EAB308',
              '#F97316', '#D946EF', '#6366F1', '#14B8A6', '#FBBF24', '#E11D48', '#22C55E'
            ];

            // Gera range contínuo de datas (YYYY-MM-DD) do primeiro ao último dia com coleta
            // Assim dias sem nenhuma coleta também aparecem no gráfico (preenchidos por forward-fill)
            const diasComColeta = meusPerfis.flatMap(p =>
              (followersHistory[p.username] || []).map((h: any) => (h.data || '').substring(0, 10))
            ).filter(Boolean);

            const minDia = diasComColeta.length > 0 ? diasComColeta.reduce((a, b) => a < b ? a : b) : '';
            const maxDia = diasComColeta.length > 0 ? diasComColeta.reduce((a, b) => a > b ? a : b) : '';

            const todasDatas: string[] = [];
            if (minDia && maxDia) {
              const cur = new Date(minDia + 'T00:00:00');
              const end = new Date(maxDia + 'T00:00:00');
              while (cur <= end) {
                todasDatas.push(cur.toISOString().substring(0, 10));
                cur.setDate(cur.getDate() + 1);
              }
            }

            // Prepara histórico limpo com forward-fill para cada perfil
            // Chave de dadosPorData: 'YYYY-MM-DD' (apenas data, sem hora)
            const perfisHistLimpo: Record<string, {
              isDead: boolean;
              primeiraDia: string;
              ultimaDiaComDados: string;
              dadosPorDia: Record<string, number>;
            }> = {};

            meusPerfis.forEach(p => {
              const isDead = p.status === 'MORREU' || p.status === 'INATIVO' || p.status_controle === '☠️ Morreu' || (p.status_controle || '').includes('Morreu');
              const raw = (followersHistory[p.username] || []).slice().sort((a: any, b: any) => String(a.data || '').localeCompare(String(b.data || '')));

              let lastVal = 0;
              let primeiraDia = '';
              let ultimaDiaComDados = '';
              const dadosPorDia: Record<string, number> = {};

              for (const pt of raw) {
                const dia = (pt.data || '').substring(0, 10); // 'YYYY-MM-DD'
                if (!dia) continue;
                let seg = Number(pt.total_seguidores) || 0;
                if (seg > 0) {
                  lastVal = seg;
                  if (!primeiraDia) primeiraDia = dia;
                  ultimaDiaComDados = dia;
                } else if (!isDead && lastVal > 0) {
                  seg = lastVal;
                }
                // Perfil morto: só registra dias com coleta real (seg > 0)
                // Perfil ativo: usa forward-fill para dias sem coleta
                if (isDead) {
                  if (seg > 0) {
                    dadosPorDia[dia] = seg;
                  }
                } else {
                  if (seg > 0 || primeiraDia) {
                    const finalVal = seg > 0 ? seg : lastVal;
                    if (dadosPorDia[dia] === undefined || finalVal > dadosPorDia[dia]) {
                      dadosPorDia[dia] = finalVal;
                    }
                  }
                }
              }

              perfisHistLimpo[p.username] = {
                isDead,
                primeiraDia,
                ultimaDiaComDados,
                dadosPorDia
              };
            });

            // Monta array linear { name: 'DD/MM', username1: valor, ... } com forward-fill contínuo
            const ultimoValorRastreado: Record<string, number> = {};
            const segAnteriorRastreado: Record<string, number> = {};

            const dadosComparativo = todasDatas.map(dia => {
              const entry: any = {
                // Exibe como DD/MM
                name: dia.substring(8, 10) + '/' + dia.substring(5, 7)
              };

              meusPerfis.forEach(p => {
                const info = perfisHistLimpo[p.username];
                if (!info || !info.primeiraDia) return;

                // Não plota pontos antes da primeira leitura do perfil
                if (dia < info.primeiraDia) return;

                // Perfil morto: para de plotar após o último dia com dados reais
                if (info.isDead && info.ultimaDiaComDados && dia > info.ultimaDiaComDados) return;

                let valAtual = info.dadosPorDia[dia];

                if (valAtual !== undefined && valAtual > 0) {
                  ultimoValorRastreado[p.username] = valAtual;
                } else if (!info.isDead) {
                  // Forward-fill apenas para perfis ativos
                  valAtual = ultimoValorRastreado[p.username];
                }

                if (valAtual !== undefined) {
                  const segAnterior = segAnteriorRastreado[p.username] !== undefined ? segAnteriorRastreado[p.username] : valAtual;
                  const diff = valAtual - segAnterior;
                  segAnteriorRastreado[p.username] = valAtual;

                  if (comparativoMode === 'percentual') {
                    const pct = segAnterior > 0 ? (((valAtual - segAnterior) / segAnterior) * 100) : 0;
                    const limitedPct = Math.min(50, Math.max(-50, pct));
                    entry[p.username] = Number(limitedPct.toFixed(2));
                    entry[`${p.username}_diff`] = diff;
                  } else {
                    entry[p.username] = valAtual;
                    entry[`${p.username}_diff`] = diff;
                  }
                }
              });

              return entry;
            });

            // Dados para o gráfico de evolução percentual
            const dadosEvolucaoPercentual = dadosComparativo;

            return (
              <div style={{ marginTop: 32 }}>
                <div className="chart-title-area" style={{ marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800' }}>
                      {comparativoMode === 'projecao'
                        ? '🎯 Projeção de Crescimento Pós-Postagem'
                        : comparativoMode === 'percentual'
                          ? '📈 Grau de Evolução Diário (%) — Meus Perfis'
                          : '⭐ Comparativo — Meus Perfis'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                      {comparativoMode === 'projecao'
                        ? 'Curva acumulada de seguidores em tempo relativo (Dia 0, Dia 1, ...) comparada à expectativa da base.'
                        : comparativoMode === 'percentual'
                          ? 'Evolução diária em porcentagem do número de seguidores (limitado a teto de 50%).'
                          : 'Evolução diária de seguidores dos perfis marcados com estrela.'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {/* Botões de Toggle para o Modo Comparativo */}
                    <div style={{ display: 'flex', gap: 6, background: '#161B22', padding: 4, borderRadius: 8, border: '1px solid #30363D' }}>
                      <button
                        onClick={() => setComparativoMode('absoluto')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: comparativoMode === 'absoluto' ? '#30363D' : 'transparent',
                          color: comparativoMode === 'absoluto' ? 'white' : '#8B949E',
                          transition: 'all 0.2s'
                        }}
                      >
                        Nº Usuários
                      </button>
                      <button
                        onClick={() => setComparativoMode('percentual')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: comparativoMode === 'percentual' ? '#30363D' : 'transparent',
                          color: comparativoMode === 'percentual' ? 'white' : '#8B949E',
                          transition: 'all 0.2s'
                        }}
                      >
                        Percentual
                      </button>
                      <button
                        onClick={() => setComparativoMode('projecao')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: comparativoMode === 'projecao' ? '#7100E2' : 'transparent',
                          color: comparativoMode === 'projecao' ? 'white' : '#8B949E',
                          transition: 'all 0.2s'
                        }}
                      >
                        🎯 Projeção
                      </button>
                    </div>
                  </div>
                </div>

                {comparativoMode === 'projecao' ? (
                  <GraficoProjecao meusPerfis={meusPerfis} todosPerfis={profiles} />
                ) : (
                  <>
                    <div className="chart-container-large">
                      {meusPerfis.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={comparativoMode === 'percentual' ? dadosEvolucaoPercentual : dadosComparativo}
                            margin={{ top: 10, right: 30, left: 20, bottom: 0 }}
                          >
                            <XAxis
                              dataKey="name"
                              stroke="#586069"
                              tickLine={false}
                              style={{ fontSize: '11px' }}
                            />
                            <YAxis
                              stroke="#586069"
                              tickLine={false}
                              style={{ fontSize: '11px' }}
                              domain={comparativoMode === 'percentual' ? [0, 50] : ['auto', 'auto']}
                              tickFormatter={(v) => comparativoMode === 'percentual' ? `${v}%` : formatNumber(v)}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#161B22',
                                borderColor: 'var(--border-color)',
                                borderRadius: '8px',
                                color: 'white'
                              }}
                              formatter={(value: any, name: any, item: any) => {
                                const username = name;
                                const diff = item?.payload?.[`${username}_diff`] ?? 0;
                                if (comparativoMode === 'percentual') {
                                  const diffStr = diff >= 0 ? `+${formatNumber(diff)}` : formatNumber(diff);
                                  return [`${value}% (${diffStr} seguidores)`, `@${username}`];
                                } else {
                                  const diffStr = diff >= 0 ? `+${formatNumber(diff)}` : formatNumber(diff);
                                  return [`${formatNumber(value)} (${diffStr})`, `@${username}`];
                                }
                              }}
                            />
                            {meusPerfis.map((p, i) => (
                              <Line
                                key={p.username}
                                type="monotone"
                                dataKey={p.username}
                                name={p.username}
                                stroke={cores[i % cores.length]}
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 5 }}
                                connectNulls
                                hide={linhasOcultas.has(p.username)}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="loading-box" style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                          <p style={{ color: 'var(--text-secondary)' }}>Nenhum perfil ativo no comparativo. Adicione perfis acima para comparar.</p>
                        </div>
                      )}
                    </div>

                    {/* Legenda interativa — clique para ocultar/mostrar a linha */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
                      {meusPerfis.map((p, i) => {
                        const hidden = linhasOcultas.has(p.username);
                        const cor = cores[i % cores.length];
                        return (
                          <button
                            key={p.username}
                            onClick={() => {
                              setLinhasOcultas(prev => {
                                const next = new Set(prev);
                                if (next.has(p.username)) next.delete(p.username);
                                else next.add(p.username);
                                return next;
                              });
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px 8px',
                              borderRadius: 6,
                              transition: 'all 0.15s',
                              opacity: hidden ? 0.4 : 1,
                              textDecoration: hidden ? 'line-through' : 'none'
                            }}
                          >
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cor, display: 'inline-block' }} />
                            <span style={{ color: hidden ? '#586069' : 'white' }}>@{p.username}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

        </div>
      )}

      {/* ====================================================
          ABA 3: FEED GERAL DE POSTS
          ==================================================== */}
      {activeTab === 'posts' && (
        <div className="posts-table-box">
          <div className="table-header-filters">
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Tabela de Auditoria Social</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                Todos os posts coletados e calculados. Clique nos títulos para ordenar.
              </p>
            </div>

            {/* Filtros */}
            <div className="filters-group">
              <input
                type="text"
                placeholder="🔍 Buscar na legenda..."
                className="filter-input"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPostsPage(1); }}
              />

              <select
                className="filter-select"
                value={selectedProfileFilter}
                onChange={(e) => { setSelectedProfileFilter(e.target.value); setPostsPage(1); }}
              >
                <option value="Todos">Todos Perfis</option>
                {[...profiles]
                  .filter(p => p.exibir !== 0)
                  .sort((a, b) => {
                    const starA = a.meu_perfil ? 1 : 0;
                    const starB = b.meu_perfil ? 1 : 0;
                    if (starB !== starA) return starB - starA;
                    return a.username.localeCompare(b.username);
                  })
                  .map(p => (
                    <option key={p.username} value={p.username}>
                      {p.meu_perfil ? '⭐ ' : ''}@{p.username}{p.status === 'INATIVO' ? ' (inativo)' : ''}
                    </option>
                  ))}
              </select>

              <select
                className="filter-select"
                value={selectedFormat}
                onChange={(e) => { setSelectedFormat(e.target.value); setPostsPage(1); }}
              >
                <option value="Todos">Todos Formatos</option>
                <option value="Reels">Reels</option>
                <option value="Carrossel">Carrossel</option>
                <option value="Imagem">Imagem</option>
              </select>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="date"
                  className="filter-input"
                  title="Data Inicial"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPostsPage(1); }}
                  style={{ width: 'auto', fontSize: '12px' }}
                />
                <span style={{ color: '#8B949E', fontSize: '12px' }}>até</span>
                <input
                  type="date"
                  className="filter-input"
                  title="Data Final"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPostsPage(1); }}
                  style={{ width: 'auto', fontSize: '12px' }}
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(''); setEndDate(''); setPostsPage(1); }}
                    style={{
                      background: 'transparent',
                      border: '1px solid #30363D',
                      color: '#8B949E',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                    title="Limpar filtro de data"
                  >
                    ✕ Limpar Datas
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabela de Posts */}
          <div style={{ overflowX: 'auto' }}>
            {sortedPosts.length > 0 ? (
              <table className="social-table">
                <thead>
                  <tr>
                    <th>Perfil</th>
                    <th className={`sortable ${sortField === 'data_postagem' ? 'active' : ''}`} onClick={() => handleSort('data_postagem')}>
                      Data {sortField === 'data_postagem' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>Formato</th>
                    <th style={{ width: '30%' }}>Legenda / Hashtags</th>
                    <th className={`sortable ${sortField === 'likes' ? 'active' : ''}`} onClick={() => handleSort('likes')}>
                      Curtidas {sortField === 'likes' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className={`sortable ${sortField === 'comentarios' ? 'active' : ''}`} onClick={() => handleSort('comentarios')}>
                      Comentários {sortField === 'comentarios' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className={`sortable ${sortField === 'views' ? 'active' : ''}`} onClick={() => handleSort('views')}>
                      Visualizações {sortField === 'views' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className={`sortable ${sortField === 'taxa_engajamento' ? 'active' : ''}`} onClick={() => handleSort('taxa_engajamento')}>
                      Engajamento {sortField === 'taxa_engajamento' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className={`sortable ${sortField === 'performanceMultiplier' ? 'active' : ''}`} onClick={() => handleSort('performanceMultiplier')}>
                      Desempenho {sortField === 'performanceMultiplier' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPosts.map(post => {
                    // Determinar classe de performance
                    const rawMult = post.performanceMultiplier;
                    const pMult = typeof rawMult === 'number' && !isNaN(rawMult) ? rawMult : 1.0;
                    const performanceClass = pMult >= 1.8
                      ? 'high'
                      : pMult >= 1.0
                        ? 'medium'
                        : 'low';

                    return (
                      <tr key={post.post_id}>
                        <td style={{ fontWeight: '700' }}>@{post.username}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(post.data_postagem)}</td>
                        <td>
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px'
                            }}
                          >
                            {post.formato === 'Reels' ? (
                              <VideoIcon size={12} style={{ color: 'var(--color-cyan)' }} />
                            ) : post.formato === 'Carrossel' ? (
                              <LayersIcon size={12} style={{ color: 'var(--color-purple)' }} />
                            ) : (
                              <ImageIcon size={12} style={{ color: 'var(--text-secondary)' }} />
                            )}
                            {post.formato}
                          </span>
                        </td>
                        <td className="legenda-cell">
                          <div
                            style={{
                              maxHeight: '60px',
                              overflowY: 'auto',
                              fontSize: '13px',
                              lineHeight: '1.4',
                              marginBottom: '6px'
                            }}
                          >
                            {post.legenda || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem legenda</span>}
                          </div>
                          {/* Hashtags identificadas */}
                          {post.hashtags && post.hashtags.map((tag: string, index: number) => (
                            <span key={`${tag}-${index}`} className="hashtag-pill">{tag}</span>
                          ))}
                        </td>
                        <td>{formatNumber(post.likes)}</td>
                        <td>{formatNumber(post.comentarios)}</td>
                        <td>{post.views > 0 ? formatNumber(post.views) : <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td style={{ fontWeight: '600' }}>{post.taxa_engajamento ? `${post.taxa_engajamento.toFixed(2)}%` : '0,00%'}</td>
                        <td>
                          <span className={`performance-badge ${performanceClass}`}>
                            {pMult >= 1.8 ? '🔥 ' : ''}
                            {pMult.toFixed(1).replace('.', ',')}x
                          </span>
                        </td>
                        <td>
                          <a
                            href={getInstagramPostUrl(post)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="post-link"
                            style={{ fontSize: '13px' }}
                          >
                            Abrir <ExternalLink size={12} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="loading-box" style={{ padding: '40px' }}>
                <p>Nenhuma publicação encontrada para os filtros selecionados.</p>
              </div>
            )}
          </div>
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: '#161B22', padding: '12px 18px', borderRadius: '10px', border: '1px solid #21262D' }}>
            <div style={{ fontSize: '13px', color: '#8B949E' }}>
              Exibindo <strong style={{ color: 'white' }}>{totalPostsCount > 0 ? startPostIdx + 1 : 0}–{Math.min(startPostIdx + postsPerPage, totalPostsCount)}</strong> de <strong style={{ color: 'white' }}>{totalPostsCount}</strong> posts gravados.
            </div>

            {/* Controles de Paginação */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select
                value={postsPerPage}
                onChange={(e) => { setPostsPerPage(Number(e.target.value)); setPostsPage(1); }}
                style={{
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  color: 'white',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <option value={20}>20 por página</option>
                <option value={50}>50 por página</option>
                <option value={100}>100 por página</option>
              </select>

              {totalPostsPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setPostsPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPostsPage === 1}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      background: currentPostsPage === 1 ? '#21262D' : '#7100E2',
                      border: '1px solid #30363D',
                      color: currentPostsPage === 1 ? '#484F58' : 'white',
                      cursor: currentPostsPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '700',
                      transition: 'all 0.2s'
                    }}
                  >
                    ◀ Anterior
                  </button>

                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'white', padding: '0 4px' }}>
                    {currentPostsPage} / {totalPostsPages}
                  </span>

                  <button
                    onClick={() => setPostsPage(prev => Math.min(totalPostsPages, prev + 1))}
                    disabled={currentPostsPage === totalPostsPages}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      background: currentPostsPage === totalPostsPages ? '#21262D' : '#7100E2',
                      border: '1px solid #30363D',
                      color: currentPostsPage === totalPostsPages ? '#484F58' : 'white',
                      cursor: currentPostsPage === totalPostsPages ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '700',
                      transition: 'all 0.2s'
                    }}
                  >
                    Próxima ▶
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ====================================================
        ABA: CONTROLE
      ==================================================== */}
      {activeTab === 'controle' && (
        <div>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Minhas Operações</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Gestão das minhas operações.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <button
                onClick={handleRunMetaIngestion}
                disabled={ingestingMeta}
                title="Atualiza seguidores, posts e métricas das operações que possuem META ID configurado, usando exclusivamente a API oficial da Meta"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid rgba(0, 149, 246, 0.5)',
                  background: ingestingMeta
                    ? 'rgba(0, 149, 246, 0.08)'
                    : 'linear-gradient(135deg, rgba(0, 149, 246, 0.15), rgba(113, 0, 226, 0.15))',
                  color: ingestingMeta ? '#8B949E' : '#0095F6',
                  cursor: ingestingMeta ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                  boxShadow: ingestingMeta ? 'none' : '0 0 16px rgba(0, 149, 246, 0.2)',
                }}
                onMouseEnter={e => {
                  if (!ingestingMeta) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#0095F6';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 20px rgba(0, 149, 246, 0.4)';
                  }
                }}
                onMouseLeave={e => {
                  if (!ingestingMeta) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0, 149, 246, 0.5)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 16px rgba(0, 149, 246, 0.2)';
                  }
                }}
              >
                {ingestingMeta ? (
                  <>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: '2px solid #8B949E',
                      borderTopColor: '#0095F6',
                      animation: 'spin 0.8s linear infinite',
                      flexShrink: 0
                    }} />
                    Atualizando Meta API...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    Atualizar via Meta API
                  </>
                )}
              </button>

              {ultimaMetaExec && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  color: '#8B949E',
                  fontWeight: 500,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block', boxShadow: '0 0 6px #10B981' }} />
                  <span>
                    Última execução: <strong style={{ color: '#C9D1D9', fontFamily: 'monospace' }}>
                      {(() => {
                        try {
                          const dateObj = new Date(ultimaMetaExec.includes('T') ? ultimaMetaExec : ultimaMetaExec.replace(' ', 'T'));
                          if (isNaN(dateObj.getTime())) return ultimaMetaExec;
                          return dateObj.toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          });
                        } catch {
                          return ultimaMetaExec;
                        }
                      })()}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {controleLoading ? (
            <div className="loading-box"><div className="spinner"></div><p>Carregando...</p></div>
          ) : controleData.length === 0 ? (
            <div className="loading-box"><p>Nenhum perfil marcado com ⭐ encontrado.</p></div>
          ) : (
            <>
              {/* === TABELA PRINCIPAL === */}
              <div style={{ overflowX: 'auto', background: '#161B22', border: '1px solid #30363D', borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1300, fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#0D1117', borderBottom: '1px solid #30363D' }}>
                      {['Nome', 'Nascimento', 'Idade', 'Seguidores', 'E-mail / Usuário', 'Reserva', 'Linktree', 'Início', 'Telegram', 'Pronta em', 'Dias', 'Resultado', 'Status', 'Obs'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#8B949E', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const getDiasPerfil = (p: any) => {
                        const isMorreu = (p.status || '').toLowerCase().includes('morreu') || (p.status_controle || '').toLowerCase().includes('morreu') || (p.status || '').toUpperCase() === 'MORREU';
                        if (isMorreu && p.inicio && p.ultima_coleta) {
                          const dataInicioStr = p.inicio.split(' ')[0].split('T')[0];
                          const dataColetaStr = p.ultima_coleta.split(' ')[0].split('T')[0];
                          const dtInicio = new Date(dataInicioStr + 'T00:00:00').getTime();
                          const dtColeta = new Date(dataColetaStr + 'T00:00:00').getTime();
                          return Math.max(0, Math.floor((dtColeta - dtInicio) / 86400000));
                        }
                        if (p.inicio) return calcDias(p.inicio);
                        return 0;
                      };

                      return controleData
                        .slice() // Cria uma cópia para não mutar o array original
                        .sort((a: any, b: any) => {
                          const isDeadA = (a.status || '').toLowerCase().includes('morreu') || (a.status_controle || '').toLowerCase().includes('morreu') || (a.status || '').toUpperCase() === 'MORREU';
                          const isDeadB = (b.status || '').toLowerCase().includes('morreu') || (b.status_controle || '').toLowerCase().includes('morreu') || (b.status || '').toUpperCase() === 'MORREU';

                          // 1. Perfis "morreu" sempre no final
                          if (isDeadA && !isDeadB) return 1;
                          if (!isDeadA && isDeadB) return -1;

                          // 2. Ordenar por dias do maior para o menor
                          const diasA = getDiasPerfil(a);
                          const diasB = getDiasPerfil(b);

                          if (diasB !== diasA) {
                            return diasB - diasA; // Do maior para o menor
                          }

                          // 3. Desempate pela data de início (mais antiga primeiro)
                          const dataA = a.inicio ? new Date(a.inicio.split(' ')[0].split('T')[0] + 'T00:00:00').getTime() : 0;
                          const dataB = b.inicio ? new Date(b.inicio.split(' ')[0].split('T')[0] + 'T00:00:00').getTime() : 0;
                          return dataA - dataB;
                        })
                        .map((p: any, i: number) => {
                          // Proteção de dados e cálculos
                          const dataInicio = p.inicio || null;
                          const dataNasc = p.nascimento || null;
                          const lancamentosSeguros = Array.isArray(p.lancamentos) ? p.lancamentos : [];
                          const diasTotal = getDiasPerfil(p);
                          const diasValidos = diasTotal > 0 ? diasTotal : 1;

                          const totalR = lancamentosSeguros.filter((l: any) => l.tipo === 'recebido').reduce((s: number, l: any) => s + (Number(l.valor_brl) || 0), 0);
                          const totalD = lancamentosSeguros.filter((l: any) => l.tipo === 'despesa').reduce((s: number, l: any) => s + (Number(l.valor_brl) || 0), 0);
                          const lucro = totalR - totalD;
                          const diaTrabalho = lucro / diasValidos;

                          const isMorreu = (p.status || '').toLowerCase().includes('morreu') || (p.status_controle || '').toLowerCase().includes('morreu') || (p.status || '').toUpperCase() === 'MORREU';
                          const isAtivo = !isMorreu;

                          return (
                            <tr
                              key={p.username || i}
                              onClick={() => setModalControleEdit(p)}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = isMorreu ? 'rgba(248,81,73,0.18)' : (isAtivo ? 'rgba(46,160,67,0.18)' : '#1C2128'); }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = isMorreu ? 'rgba(248,81,73,0.08)' : (isAtivo ? 'rgba(46,160,67,0.08)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')); }}
                              style={{
                                borderBottom: '1px solid #21262D',
                                borderLeft: isMorreu ? '3px solid #F85149' : (isAtivo ? '3px solid #2ea043' : '3px solid transparent'),
                                background: isMorreu ? 'rgba(248,81,73,0.08)' : (isAtivo ? 'rgba(46,160,67,0.08)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')),
                                cursor: 'pointer',
                                transition: 'background-color 0.15s'
                              }}
                            >
                              <td style={{ padding: '12px 12px', whiteSpace: 'nowrap' }}>
                                <a
                                  href={`https://www.instagram.com/${(p.username || '').replace(/^@/, '')}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  title={`Abrir @${p.username} no Instagram`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    textDecoration: 'none',
                                    color: 'inherit',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <AvatarModelo
                                    src={p.foto_url || null}
                                    username={p.username}
                                    size={32}
                                    comentariosPendentes={p.comentarios_pendentes || 0}
                                    mensagensPendentes={p.mensagens_pendentes || 0}
                                    temPendencias={p.tem_pendencias || false}
                                  />
                                  <div>
                                    <div style={{ fontWeight: 700, color: 'white' }}>{p.nome || p.username}</div>
                                    <div style={{ color: '#8B949E', fontSize: 11 }}>@{p.username}</div>
                                  </div>
                                </a>
                              </td>
                              <td style={{ padding: '12px 12px', color: '#8B949E', whiteSpace: 'nowrap' }}>
                                {dataNasc ? formatDate(dataNasc) : '—'}
                              </td>
                              <td style={{ padding: '12px 12px', whiteSpace: 'nowrap', color: 'white' }}>
                                {dataNasc ? calcIdade(dataNasc) : '—'}
                              </td>
                              <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                <span style={{ background: (p.seguidores || 0) > 0 ? 'rgba(0,240,255,0.08)' : 'rgba(255,0,122,0.1)', color: (p.seguidores || 0) > 0 ? '#00F0FF' : '#FF007A', padding: '2px 8px', borderRadius: 20, fontWeight: 700, fontFamily: 'monospace' }}>
                                  {p.seguidores ? Number(p.seguidores).toLocaleString('pt-BR') : '—'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 12px', maxWidth: 180 }}>
                                {(p.email || '').split('\n').map((line: string, j: number) => (
                                  <div key={j} style={{ color: j % 2 === 0 ? 'white' : '#8B949E', fontSize: 11, lineHeight: 1.6 }}>{line}</div>
                                ))}
                              </td>
                              <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                {Number(p.reserva) > 0 ? (
                                  <span
                                    title={`${p.reserva} postagem(ns) agendada(s) futura(s)`}
                                    style={{
                                      background: 'rgba(56, 139, 253, 0.15)',
                                      color: '#58A6FF',
                                      border: '1px solid rgba(56, 139, 253, 0.35)',
                                      padding: '2px 8px',
                                      borderRadius: 12,
                                      fontWeight: 800,
                                      fontSize: 12,
                                      fontFamily: 'monospace',
                                      display: 'inline-block'
                                    }}
                                  >
                                    {p.reserva}
                                  </span>
                                ) : (
                                  <span style={{ color: '#484F58', fontSize: 12 }}>0</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                {p.linktree ? (
                                  <a
                                    href={p.linktree.startsWith('http') ? p.linktree : `https://${p.linktree}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    title={p.linktree}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      width: 28, height: 28, borderRadius: 6,
                                      background: 'rgba(0, 240, 255, 0.1)',
                                      border: '1px solid rgba(0, 240, 255, 0.3)',
                                      color: '#00F0FF',
                                      textDecoration: 'none',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0, 240, 255, 0.25)'; e.currentTarget.style.borderColor = '#00F0FF'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0, 240, 255, 0.1)'; e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.3)'; }}
                                  >
                                    <ExternalLink size={13} />
                                  </a>
                                ) : (
                                  <span style={{ opacity: 0.25 }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 12px', whiteSpace: 'nowrap', color: '#8B949E' }}>
                                {dataInicio ? formatDate(dataInicio) : '—'}
                              </td>
                              <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                {p.telegram === 'SIM' ? (
                                  <span
                                    title="Tem grupo de retenção no Telegram"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      width: 28, height: 28, borderRadius: 6,
                                      background: 'rgba(38, 168, 235, 0.12)',
                                      border: '1px solid rgba(38, 168, 235, 0.35)',
                                      fontSize: 14
                                    }}
                                  >
                                    📦
                                  </span>
                                ) : (
                                  <span style={{ opacity: 0.25 }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 12px', whiteSpace: 'nowrap', color: '#00F0FF', fontWeight: 700 }}>
                                {dataInicio ? calcProntaEm(dataInicio) : '—'}
                              </td>
                              <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                <span
                                  title={isMorreu && p.ultima_coleta ? `Início: ${formatDate(p.inicio)} | Último registro: ${formatDate(p.ultima_coleta)}` : (p.inicio ? `Início: ${formatDate(p.inicio)}` : undefined)}
                                  style={{
                                    fontWeight: 700,
                                    color: 'white',
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    border: '1px solid #30363D',
                                    borderRadius: 6,
                                    padding: '2px 10px',
                                    display: 'inline-block',
                                    cursor: 'default',
                                    fontSize: 13,
                                  }}
                                >
                                  {diasTotal}
                                </span>
                              </td>
                              <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLancamentoSelecionado(null);
                                    setModalLancamento({ username: p.username, tipo: lucro >= 0 ? "recebido" : "despesa" });
                                  }}
                                  style={{
                                    background: lucro >= 0 ? 'rgba(57,255,20,0.1)' : 'rgba(255,0,122,0.15)',
                                    border: `1px solid ${lucro >= 0 ? '#39FF14' : '#FF007A'}`,
                                    color: lucro >= 0 ? '#39FF14' : '#FF007A',
                                    borderRadius: 8,
                                    padding: '5px 10px',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {lucro >= 0 ? '💰' : '💸'} {fmtBRL(lucro)}
                                </button>
                              </td>
                              <td style={{ padding: '12px 12px', whiteSpace: 'nowrap' }}>
                                <span style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: 'white' }}>
                                  {p.status || '—'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                {(p.obs_historico || []).length > 0 ? (
                                  <span title={`${(p.obs_historico || []).length} observações no diário`} style={{ fontSize: 14 }}>
                                    📝
                                  </span>
                                ) : (
                                  <span style={{ opacity: 0.25 }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* === BLOCO DOS GRÁFICOS === */}
              {(() => {
                const CORES_GRAFICO = [
                  '#39FF14', '#00F0FF', '#FF007A', '#FF9F00', '#9E00FF', '#FF6B6B',
                  '#4ECDC4', '#7100E2', '#FFD700', '#FF4500', '#10B981', '#EC4899',
                  '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#84CC16',
                  '#D946EF', '#F97316', '#6366F1', '#14B8A6', '#FBBF24', '#E11D48', '#22C55E'
                ];
                const todosUsuarios = financeiro.usuarios;
                const usuariosVisiveis = todosUsuarios.filter((u: string) => !perfisOcultos.has(u));

                const togglePerfil = (username: string) => {
                  setPerfisOcultos(prev => {
                    const next = new Set(prev);
                    if (next.has(username)) next.delete(username);
                    else next.add(username);
                    return next;
                  });
                };

                // Dados filtrados pelos perfis visíveis (suporta _acumulado/_diario, _seguidores/_receita e _efetividade)
                const dadosAtivosFiltrados = dadosAtivos.map((ponto: any) => {
                  const novoPonto: any = { name: ponto.name, dia: ponto.dia };
                  usuariosVisiveis.forEach((u: string) => {
                    // Financeiro / Seguidores
                    if (ponto[`${u}_acumulado`] !== undefined) novoPonto[`${u}_acumulado`] = ponto[`${u}_acumulado`];
                    if (ponto[`${u}_diario`] !== undefined) novoPonto[`${u}_diario`] = ponto[`${u}_diario`];
                    // Correlação
                    if (ponto[`${u}_seguidores`] !== undefined) novoPonto[`${u}_seguidores`] = ponto[`${u}_seguidores`];
                    if (ponto[`${u}_receita`] !== undefined) novoPonto[`${u}_receita`] = ponto[`${u}_receita`];
                    if (ponto[`${u}_efetividade`] !== undefined) novoPonto[`${u}_efetividade`] = ponto[`${u}_efetividade`];
                  });
                  return novoPonto;
                });

                // Legenda clicável compartilhada
                const LegendaPerfis = () => (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, paddingTop: 14, borderTop: '1px solid #21262D' }}>
                    {todosUsuarios.map((user: string, idx: number) => {
                      const oculto = perfisOcultos.has(user);
                      const cor = CORES_GRAFICO[idx % CORES_GRAFICO.length];
                      return (
                        <button
                          key={user}
                          onClick={() => togglePerfil(user)}
                          title={oculto ? `Adicionar @${user} na comparação` : `Remover @${user} da comparação`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                            border: `1.5px solid ${oculto ? '#30363D' : cor}`,
                            background: oculto ? 'transparent' : `${cor}18`,
                            color: oculto ? '#586069' : cor,
                            fontSize: 12, fontWeight: 600, transition: 'all 0.18s',
                            opacity: oculto ? 0.45 : 1,
                            textDecoration: 'none'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = oculto ? '0.45' : '1'; e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: oculto ? '#586069' : cor, display: 'inline-block', flexShrink: 0 }} />
                          @{user}
                          <span style={{ fontSize: 10, opacity: 0.7 }}>{oculto ? '＋' : '✕'}</span>
                        </button>
                      );
                    })}
                  </div>
                );

                return (
                  <div className="mb-6">
                    {/* Gráfico principal: Financeiro / Seguidores */}
                    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 20, marginTop: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                        <div>
                          <h3 style={{ margin: 0, color: '#f0f6fc', fontSize: 16, fontWeight: 600 }}>Comparativo de Comportamento Operacional</h3>
                          <p style={{ margin: '4px 0 0 0', color: '#8b949e', fontSize: 12 }}>Acompanhamento relativo por dia de início de cada operação</p>
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', background: '#0d1117', padding: 4, borderRadius: 6, border: '1px solid #30363d' }}>
                            {(['financeiro', 'seguidores', 'correlacao'] as const).map(tipo => (
                              <button
                                key={tipo}
                                onClick={() => setGraficoAtivo(tipo)}
                                style={{
                                  background: graficoAtivo === tipo ? '#21262d' : 'transparent',
                                  color: graficoAtivo === tipo ? '#fff' : '#8b949e',
                                  border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600
                                }}
                              >
                                {tipo === 'financeiro' ? 'Financeiro' : tipo === 'seguidores' ? 'Seguidores' : '📊 Correlação'}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', background: '#0d1117', padding: 4, borderRadius: 6, border: '1px solid #30363d' }}>
                            {(['linha', 'barra'] as const).map(tipo => (
                              <button
                                key={tipo}
                                onClick={() => setTipoGrafico(tipo)}
                                style={{
                                  background: tipoGrafico === tipo ? '#21262d' : 'transparent',
                                  color: tipoGrafico === tipo ? '#39FF14' : '#8b949e',
                                  border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600
                                }}
                              >
                                {tipo === 'linha' ? 'Linha' : 'Barras'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div style={{ width: '100%', height: 340 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          {graficoAtivo === 'correlacao' ? (
                            // Gráfico de correlação: Efetividade (Saldo Acumulado ÷ Seguidores)
                            <LineChart data={dadosAtivosFiltrados} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" />
                              <XAxis dataKey="name" stroke="#8b949e" fontSize={11} />
                              <YAxis
                                stroke="#39FF14"
                                fontSize={10}
                                tickFormatter={(v) => `R$ ${v.toFixed(2)}`}
                                label={{ value: 'Eficácia (Saldo / Seguidor)', angle: -90, position: 'insideLeft', offset: 10, fill: '#39FF14', fontSize: 10 }}
                              />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', borderRadius: 6 }}
                                itemStyle={{ fontSize: 11 }}
                                labelStyle={{ color: '#fff' }}
                                formatter={((value: any, name: string, item: any) => {
                                  const username = name.replace('_efetividade', '');
                                  const payload = item?.payload || {};
                                  const receita = payload[`${username}_receita`] || 0;
                                  const seguidoresUser = payload[`${username}_seguidores`] || 0;

                                  return [
                                    <div key={username} style={{ display: 'inline-block' }}>
                                      <span style={{ fontWeight: 800 }}>R$ {Number(value).toFixed(3)} / seg.</span>
                                      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>
                                        Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receita)} | Segs: {seguidoresUser.toLocaleString('pt-BR')}
                                      </div>
                                    </div>,
                                    `@${username}`
                                  ];
                                }) as any}
                              />
                              <ReferenceLine y={0} stroke="#30363d" strokeWidth={1.5} />
                              {usuariosVisiveis.map((user: string) => {
                                const cor = CORES_GRAFICO[todosUsuarios.indexOf(user) % CORES_GRAFICO.length];
                                return (
                                  <Line
                                    key={`${user}_efetividade`}
                                    type="monotone"
                                    dataKey={`${user}_efetividade`}
                                    name={`${user}_efetividade`}
                                    stroke={cor}
                                    strokeWidth={2.5}
                                    dot={{ r: 3 }}
                                    connectNulls={true}
                                  />
                                );
                              })}
                            </LineChart>
                          ) : tipoGrafico === 'linha' ? (
                            <LineChart data={dadosAtivosFiltrados} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                              <XAxis dataKey="name" stroke="#8b949e" fontSize={11} />
                              <YAxis stroke="#8b949e" fontSize={11} tickFormatter={(v) => graficoAtivo === 'financeiro' ? fmtBRL(v) : v.toLocaleString('pt-BR')} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', borderRadius: 6 }}
                                itemStyle={{ fontSize: 12 }}
                                labelStyle={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}
                                formatter={(value: any, name: any) => [
                                  graficoAtivo === 'financeiro'
                                    ? fmtBRL(Number(value))
                                    : Number(value).toLocaleString('pt-BR'),
                                  name
                                ]}
                              />
                              <ReferenceLine y={0} stroke="#30363d" strokeWidth={1.5} />
                              {usuariosVisiveis.map((user: string, idx: number) => (
                                <Line key={user} type="monotone" dataKey={`${user}_acumulado`} name={`@${user}`}
                                  stroke={CORES_GRAFICO[todosUsuarios.indexOf(user) % CORES_GRAFICO.length]}
                                  strokeWidth={2.5} dot={{ r: 3 }} connectNulls={true} />
                              ))}
                            </LineChart>
                          ) : (
                            <BarChart data={dadosAtivosFiltrados} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                              <XAxis dataKey="name" stroke="#8b949e" fontSize={11} />
                              <YAxis stroke="#8b949e" fontSize={11} tickFormatter={(v) => graficoAtivo === 'financeiro' ? fmtBRL(v) : v.toLocaleString('pt-BR')} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0d1117', borderColor: '#30363d', borderRadius: 6 }}
                                itemStyle={{ fontSize: 12 }}
                                labelStyle={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}
                                formatter={(value: any, name: any) => [
                                  graficoAtivo === 'financeiro'
                                    ? fmtBRL(Number(value))
                                    : Number(value).toLocaleString('pt-BR'),
                                  name
                                ]}
                              />
                              <ReferenceLine y={0} stroke="#484f58" strokeWidth={1.5} />
                              {usuariosVisiveis.map((user: string, idx: number) => (
                                <Bar key={user}
                                  dataKey={graficoAtivo === 'financeiro' ? `${user}_diario` : `${user}_acumulado`}
                                  name={`@${user}`}
                                  fill={CORES_GRAFICO[todosUsuarios.indexOf(user) % CORES_GRAFICO.length]}
                                  radius={[4, 4, 0, 0]} />
                              ))}
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>

                      {/* Nota de legenda para o modo correlação */}
                      {graficoAtivo === 'correlacao' && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap', paddingBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8b949e' }}>
                            <span style={{ fontSize: 13 }}>💡</span>
                            <strong>Eficácia:</strong> Mostra o valor em Reais gerado por seguidor individual (Saldo Acumulado ÷ Seguidores) ao longo dos dias.
                          </div>
                        </div>
                      )}

                      <LegendaPerfis />
                    </div>

                  </div>
                );
              })()}
              {/* <-- FIM DOS GRÁFICOS */}

              {/* === EXTRATO DE LANÇAMENTOS === */}
              <div style={{ marginTop: 32 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📋 Extrato de Lançamentos</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {controleData
                    .slice()
                    .sort((a: any, b: any) => {
                      const lA = Array.isArray(a.lancamentos) ? a.lancamentos : [];
                      const lB = Array.isArray(b.lancamentos) ? b.lancamentos : [];

                      const maxA = lA.reduce((max: string, l: any) => {
                        const d = l.data_lancamento || '';
                        return d > max ? d : max;
                      }, '');
                      const maxB = lB.reduce((max: string, l: any) => {
                        const d = l.data_lancamento || '';
                        return d > max ? d : max;
                      }, '');

                      if (maxA === '' && maxB !== '') return 1;
                      if (maxB === '' && maxA !== '') return -1;
                      return maxB.localeCompare(maxA);
                    })
                    .map((p: any) => {
                      const items: any[] = Array.isArray(p.lancamentos) ? p.lancamentos : [];

                      // Ordena os lançamentos em ordem decrescente de data
                      const sortedItems = [...items].sort((a, b) => {
                        const dateA = a.data_lancamento || '';
                        const dateB = b.data_lancamento || '';
                        return dateB.localeCompare(dateA);
                      });

                      return (
                        <div key={`extrato-${p.username}`} style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontWeight: 700, marginBottom: 12, color: 'white' }}>@{p.username}</div>
                          {sortedItems.length === 0 ? (
                            <div style={{ color: '#586069', fontSize: 12 }}>Nenhum lançamento ainda.</div>
                          ) : (
                            <div style={{ maxHeight: '255px', overflowY: 'auto', paddingRight: '6px' }} className="custom-scrollbar">
                              {sortedItems.map((l: any, i: number) => (
                                <div
                                  key={i}
                                  style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0',
                                    borderBottom: i < sortedItems.length - 1 ? '1px solid #21262D' : 'none', fontSize: 12, cursor: 'pointer'
                                  }}
                                  onClick={() => {
                                    setLancamentoSelecionado(l);
                                    setModalLancamento({ username: p.username, tipo: l.tipo });
                                  }}
                                >
                                  <div>
                                    <span style={{ color: l.tipo === 'despesa' ? '#FF007A' : '#39FF14', marginRight: 6 }}>
                                      {l.tipo === 'despesa' ? '💸' : '💰'}
                                    </span>
                                    <span style={{ color: '#8B949E' }}>
                                      {l.data_lancamento ? formatDate(l.data_lancamento) : ''}
                                    </span>
                                    {l.rateado === 1 && <span style={{ color: '#7100E2', marginLeft: 6, fontSize: 10, fontWeight: 700 }}>RATEIO</span>}
                                    {l.descricao && <div style={{ color: '#586069', fontSize: 11, marginTop: 2 }}>{l.descricao}</div>}
                                  </div>
                                  <span style={{ fontWeight: 700, color: l.tipo === 'despesa' ? '#FF007A' : '#39FF14' }}>
                                    {fmtBRL(l.valor_brl)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )} {/* <-- Fecha o if do carregamento/tabela/graficos */}

          {/* === MODAIS === */}
          {modalLancamento && (
            <ModalLancamento
              isOpen={!!modalLancamento}
              onClose={() => {
                setModalLancamento(null);
                setLancamentoSelecionado(null);
              }}
              username={modalLancamento?.username}
              lancamento={lancamentoSelecionado || { tipo: modalLancamento?.tipo }}
              onSave={salvarLancamento}
              onDelete={excluirLancamento}
            />
          )}

          {modalControleEdit && (
            <ModalControleEditInline perfil={modalControleEdit} onClose={() => setModalControleEdit(null)} onSave={salvarControleEdit} />
          )}

        </div>
      )}

      {/* ====================================================
        ABA: HISTÓRICO CONTA
      ==================================================== */}
      {activeTab === 'anomalias' && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>📜 Histórico da Conta</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Auditoria e validação manual do histórico de coletas de cada perfil. Valide os registros para manter a pureza do benchmark orgânico.
            </p>
          </div>
          <CentralAnomalias onCountUpdate={(count: number) => setAnomaliasCount(count)} />
        </div>
      )}

      {/* ====================================================
        ABA: AUTOMATIZAÇÃO
      ==================================================== */}
      {activeTab === 'automatizacao' && (
        <CentralAutomatizacao profiles={profiles} onRefresh={fetchData} />
      )}

      {/* ====================================================
        ABA: RESPOSTAS (CHAT DE DIRECTS & ENGAJAMENTO)
      ==================================================== */}
      {activeTab === 'respostas' && (
        <CentralRespostas profiles={profiles} onRefresh={fetchData} />
      )}

      {/* Modal Global de Resolução de Perfil Sem Dados / Indisponível */}
      {modalPerfilSemDados && (
        <ModalPerfilIndisponivel
          username={modalPerfilSemDados.username}
          ultimoSeguidores={(() => {
            const u = modalPerfilSemDados.username.toLowerCase();
            const p = profiles.find(pr => pr.username.toLowerCase() === u);
            if (p && p.seguidores != null && Number(p.seguidores) > 0) return Number(p.seguidores);
            const hist = followersHistory[u] || [];
            if (hist.length > 0) {
              const valid = hist.filter((h: any) => Number(h.total_seguidores || h.seguidores || 0) > 0);
              if (valid.length > 0) return Number(valid[valid.length - 1].total_seguidores || valid[valid.length - 1].seguidores);
            }
            return 0;
          })()}
          dataUltimaColeta={(() => {
            const u = modalPerfilSemDados.username.toLowerCase();
            const p = profiles.find(pr => pr.username.toLowerCase() === u);
            return p?.data_coleta || null;
          })()}
          onClose={() => setModalPerfilSemDados(null)}
          onSaveFollowers={async (val) => {
            await fetch('/api/data', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: modalPerfilSemDados.username, seguidores: val, inativo: 0, status: 'ATIVO' })
            });
            setModalPerfilSemDados(null);
            fetchData();
          }}
          onConfirmIndisponivel={async () => {
            await fetch('/api/data', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: modalPerfilSemDados.username, status: 'INDISPONIVEL' })
            });
            await fetch('/api/data', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: modalPerfilSemDados.username, seguidores: 0, inativo: 1 })
            });
            setModalPerfilSemDados(null);
            fetchData();
          }}
          onConfirmZeroFollowers={async () => {
            await fetch('/api/data', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: modalPerfilSemDados.username, seguidores: 0, inativo: 1 })
            });
            setModalPerfilSemDados(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
};

