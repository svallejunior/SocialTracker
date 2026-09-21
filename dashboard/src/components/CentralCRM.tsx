'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, DollarSign, TrendingUp, Crown, Search, Filter, Plus,
  MessageSquare, Phone, Mail, Send, ExternalLink,
  Edit2, Trash2, CheckCircle2, AlertCircle, ShoppingBag,
  Download, RefreshCw, X, ArrowUpDown, ChevronDown, Tag,
  Kanban, Table as TableIcon, Calendar, UserCheck, MessageCircle
} from 'lucide-react';

const InstagramIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

interface Cliente {
  id: number;
  nome: string;
  celular: string | null;
  email: string | null;
  telegram_id: string | null;
  telegram_username: string | null;
  instagram_username: string | null;
  valor_gasto: number;
  status: 'lead' | 'negociacao' | 'cliente' | 'vip' | 'inativo';
  origem: string;
  perfil_modelo: string | null;
  tags: string[];
  observacoes: string;
  ultimo_contato: string;
  criado_em: string;
  atualizado_em: string;
}

interface Transacao {
  id: number;
  cliente_id: number;
  valor: number;
  descricao: string;
  data_transacao: string;
  metodo_pagamento: string;
  perfil_modelo: string;
  criado_em: string;
}

interface Metricas {
  total_clientes: number;
  total_faturado: number;
  ticket_medio: number;
  total_vips: number;
  total_leads: number;
  total_negociacao: number;
  total_ativos: number;
  total_inativos: number;
}

interface CentralCRMProps {
  profiles?: Array<{ username: string; nome?: string; meu_perfil?: number | boolean }>;
}

const STATUS_CONFIG: Record<string, { label: string; cor: string; bg: string; border: string }> = {
  lead: {
    label: 'Lead',
    cor: '#00F0FF',
    bg: 'rgba(0, 240, 255, 0.12)',
    border: 'rgba(0, 240, 255, 0.3)'
  },
  negociacao: {
    label: 'Em Negociação',
    cor: '#FFB800',
    bg: 'rgba(255, 184, 0, 0.12)',
    border: 'rgba(255, 184, 0, 0.3)'
  },
  cliente: {
    label: 'Cliente Ativo',
    cor: '#00FFC8',
    bg: 'rgba(0, 255, 200, 0.12)',
    border: 'rgba(0, 255, 200, 0.3)'
  },
  vip: {
    label: 'VIP 💎',
    cor: '#D946EF',
    bg: 'rgba(217, 70, 239, 0.15)',
    border: 'rgba(217, 70, 239, 0.4)'
  },
  inativo: {
    label: 'Inativo',
    cor: '#8B949E',
    bg: 'rgba(139, 148, 158, 0.12)',
    border: 'rgba(139, 148, 158, 0.25)'
  }
};

const KANBAN_COLUMNS: Array<{ id: Cliente['status']; title: string; color: string }> = [
  { id: 'lead', title: '🎯 Leads', color: '#00F0FF' },
  { id: 'negociacao', title: '💬 Em Negociação', color: '#FFB800' },
  { id: 'cliente', title: '✅ Clientes Ativos', color: '#00FFC8' },
  { id: 'vip', title: '💎 Clientes VIP', color: '#D946EF' },
  { id: 'inativo', title: '💤 Inativos', color: '#8B949E' }
];

function formatBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function cleanDigits(val: string): string {
  return (val || '').replace(/\D/g, '');
}

function getWhatsappUrl(tel: string): string {
  const digits = cleanDigits(tel);
  if (!digits) return '';
  const finalNum = digits.length <= 11 && !digits.startsWith('55') ? `55${digits}` : digits;
  return `https://wa.me/${finalNum}`;
}

export default function CentralCRM({ profiles = [] }: CentralCRMProps) {
  // Filtra estritamente apenas as "Minhas Modelos" (meu_perfil === 1)
  const minhasModelos = useMemo(() => {
    return (profiles || []).filter(p => {
      if (p.meu_perfil !== undefined) {
        return Number(p.meu_perfil) === 1 || p.meu_perfil === true;
      }
      return true;
    });
  }, [profiles]);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [metricas, setMetricas] = useState<Metricas>({
    total_clientes: 0,
    total_faturado: 0,
    ticket_medio: 0,
    total_vips: 0,
    total_leads: 0,
    total_negociacao: 0,
    total_ativos: 0,
    total_inativos: 0
  });

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroModelo, setFiltroModelo] = useState('todos');
  const [filtroOrigem, setFiltroOrigem] = useState('todos');
  const [sortBy, setSortBy] = useState('valor_gasto');
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');
  const [viewMode, setViewMode] = useState<'tabela' | 'kanban'>('tabela');

  // Modais
  const [modalClienteAberto, setModalClienteAberto] = useState(false);
  const [clienteEdicao, setClienteEdicao] = useState<Partial<Cliente> | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [salvandoCliente, setSalvandoCliente] = useState(false);

  // Modal de Transação / Compra
  const [modalTransacaoAberto, setModalTransacaoAberto] = useState(false);
  const [clienteTransacao, setClienteTransacao] = useState<Cliente | null>(null);
  const [dadosTransacao, setDadosTransacao] = useState({
    valor: '',
    descricao: '',
    data_transacao: new Date().toISOString().slice(0, 10),
    metodo_pagamento: 'PIX',
    perfil_modelo: ''
  });
  const [salvandoTransacao, setSalvandoTransacao] = useState(false);

  // Drawer / Detalhes de Transações do Cliente
  const [clienteDetalhes, setClienteDetalhes] = useState<Cliente | null>(null);
  const [historicoTransacoes, setHistoricoTransacoes] = useState<Transacao[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Toast / Mensagem de Feedback
  const [toast, setToast] = useState<{ texto: string; tipo: 'success' | 'error' } | null>(null);

  const showToast = (texto: string, tipo: 'success' | 'error' = 'success') => {
    setToast({ texto, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  // Carregamento de clientes
  const carregarClientes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filtroStatus !== 'todos') params.append('status', filtroStatus);
      if (filtroModelo !== 'todos') params.append('modelo', filtroModelo);
      if (filtroOrigem !== 'todos') params.append('origem', filtroOrigem);
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const res = await fetch(`/api/crm?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setClientes(data.clientes || []);
        if (data.metricas) setMetricas(data.metricas);
      } else {
        showToast(data.error || 'Erro ao carregar clientes', 'error');
      }
    } catch (err: unknown) {
      showToast('Falha na comunicação com o servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarClientes();
  }, [search, filtroStatus, filtroModelo, filtroOrigem, sortBy, sortOrder]);

  // Carregar histórico de um cliente
  const abrirDetalhesCliente = async (cliente: Cliente) => {
    setClienteDetalhes(cliente);
    setLoadingHistorico(true);
    try {
      const res = await fetch(`/api/crm?action=cliente&id=${cliente.id}`);
      const data = await res.json();
      if (data.success) {
        setClienteDetalhes(data.cliente);
        setHistoricoTransacoes(data.transacoes || []);
      }
    } catch {
      showToast('Erro ao buscar histórico do cliente', 'error');
    } finally {
      setLoadingHistorico(false);
    }
  };

  // Salvar cliente (novo ou edição)
  const salvarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteEdicao?.nome?.trim()) {
      showToast('O nome do cliente é obrigatório', 'error');
      return;
    }

    setSalvandoCliente(true);
    try {
      const isNovo = !clienteEdicao.id;
      const url = '/api/crm';
      const method = isNovo ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clienteEdicao)
      });
      const data = await res.json();

      if (data.success) {
        showToast(isNovo ? 'Cliente cadastrado com sucesso!' : 'Cliente atualizado com sucesso!');
        setModalClienteAberto(false);
        setClienteEdicao(null);
        carregarClientes();
      } else {
        showToast(data.error || 'Erro ao salvar cliente', 'error');
      }
    } catch {
      showToast('Falha de rede ao salvar cliente', 'error');
    } finally {
      setSalvandoCliente(false);
    }
  };

  // Alterar status rápido (Kanban ou Dropdown)
  const mudarStatusRapido = async (id: number, novoStatus: Cliente['status']) => {
    // Atualização otimista
    setClientes(prev =>
      prev.map(c => (c.id === id ? { ...c, status: novoStatus } : c))
    );

    try {
      const res = await fetch('/api/crm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'status', status: novoStatus })
      });
      const data = await res.json();
      if (!data.success) {
        showToast('Erro ao atualizar status', 'error');
        carregarClientes();
      } else {
        // Atualiza contadores locais
        carregarClientes();
      }
    } catch {
      showToast('Erro de conexão ao alterar status', 'error');
      carregarClientes();
    }
  };

  // Excluir cliente
  const excluirCliente = async (id: number, nome: string) => {
    if (!confirm(`Deseja realmente excluir o cliente "${nome}" e todo o histórico de compras?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/crm?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Cliente removido com sucesso!');
        if (clienteDetalhes?.id === id) setClienteDetalhes(null);
        carregarClientes();
      } else {
        showToast(data.error || 'Erro ao excluir cliente', 'error');
      }
    } catch {
      showToast('Falha de rede ao excluir', 'error');
    }
  };

  // Salvar transação / compra
  const salvarTransacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteTransacao) return;
    const valorNum = parseFloat(dadosTransacao.valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      showToast('Informe um valor de compra válido', 'error');
      return;
    }

    setSalvandoTransacao(true);
    try {
      const res = await fetch('/api/crm?action=transacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteTransacao.id,
          valor: valorNum,
          descricao: dadosTransacao.descricao,
          data_transacao: dadosTransacao.data_transacao,
          metodo_pagamento: dadosTransacao.metodo_pagamento,
          perfil_modelo: dadosTransacao.perfil_modelo || clienteTransacao.perfil_modelo
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Compra de ${formatBRL(valorNum)} registrada com sucesso!`);
        setModalTransacaoAberto(false);
        setDadosTransacao({
          valor: '',
          descricao: '',
          data_transacao: new Date().toISOString().slice(0, 10),
          metodo_pagamento: 'PIX',
          perfil_modelo: ''
        });
        carregarClientes();
        if (clienteDetalhes?.id === clienteTransacao.id) {
          abrirDetalhesCliente(clienteTransacao);
        }
      } else {
        showToast(data.error || 'Erro ao registrar compra', 'error');
      }
    } catch {
      showToast('Falha ao registrar compra', 'error');
    } finally {
      setSalvandoTransacao(false);
    }
  };

  // Excluir transação
  const excluirTransacao = async (transacaoId: number) => {
    if (!confirm('Deseja excluir esta transação? O total gasto pelo cliente será recalculado.')) {
      return;
    }
    try {
      const res = await fetch(`/api/crm?transacao_id=${transacaoId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Transação excluída com sucesso');
        if (clienteDetalhes) {
          setHistoricoTransacoes(prev => prev.filter(t => t.id !== transacaoId));
          carregarClientes();
        }
      }
    } catch {
      showToast('Erro ao excluir transação', 'error');
    }
  };

  // Exportar dados para CSV
  const exportarCSV = () => {
    if (clientes.length === 0) {
      showToast('Nenhum cliente para exportar', 'error');
      return;
    }

    const headers = [
      'ID',
      'Nome',
      'Celular',
      'E-mail',
      'Telegram ID',
      'Telegram @',
      'Instagram @',
      'Valor Gasto (BRL)',
      'Status',
      'Origem',
      'Modelo Atribuído',
      'Tags',
      'Criado Em'
    ];

    const rows = clientes.map(c => [
      c.id,
      `"${(c.nome || '').replace(/"/g, '""')}"`,
      `"${c.celular || ''}"`,
      `"${c.email || ''}"`,
      `"${c.telegram_id || ''}"`,
      `"${c.telegram_username ? '@' + c.telegram_username : ''}"`,
      `"${c.instagram_username ? '@' + c.instagram_username : ''}"`,
      (c.valor_gasto || 0).toFixed(2),
      `"${c.status}"`,
      `"${c.origem || ''}"`,
      `"${c.perfil_modelo || ''}"`,
      `"${(c.tags || []).join(', ')}"`,
      `"${c.criado_em || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `clientes_crm_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exportação concluída com sucesso!');
  };

  // Importar contatos do Telegram (opcional)
  const importarTelegram = async () => {
    if (!confirm('Deseja importar os contatos e leads existentes do bot do Telegram para o CRM?')) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/crm?action=importar_telegram', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`${data.importados} contato(s) importado(s) do Telegram com sucesso!`);
        carregarClientes();
      } else {
        showToast(data.error || 'Erro ao importar contatos do Telegram', 'error');
      }
    } catch {
      showToast('Erro ao importar contatos', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Adicionar Tag na edição
  const handleAddTag = () => {
    if (!tagInput.trim() || !clienteEdicao) return;
    const currentTags = clienteEdicao.tags || [];
    if (!currentTags.includes(tagInput.trim())) {
      setClienteEdicao({ ...clienteEdicao, tags: [...currentTags, tagInput.trim()] });
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!clienteEdicao) return;
    setClienteEdicao({
      ...clienteEdicao,
      tags: (clienteEdicao.tags || []).filter(t => t !== tagToRemove)
    });
  };

  return (
    <div style={{ padding: '0 0 40px 0', minHeight: '80vh' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 99999,
          padding: '12px 20px',
          borderRadius: 8,
          background: toast.tipo === 'success' ? '#00FFC8' : '#FF007A',
          color: '#090A0F',
          fontWeight: 700,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          animation: 'fadeIn 0.2s ease'
        }}>
          {toast.tipo === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{toast.texto}</span>
        </div>
      )}

      {/* Header da Aba CRM */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={28} color="#7100E2" />
            CRM de Clientes
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Gestão centralizada de clientes, leads, LTV acumulado e canais de contato direto.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Seletor de Modo Tabela / Kanban */}
          <div style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.05)',
            padding: 3,
            borderRadius: 8,
            border: '1px solid var(--border-color)'
          }}>
            <button
              onClick={() => setViewMode('tabela')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                background: viewMode === 'tabela' ? '#7100E2' : 'transparent',
                color: viewMode === 'tabela' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                transition: 'all 0.2s'
              }}
            >
              <TableIcon size={15} />
              Tabela
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                background: viewMode === 'kanban' ? '#7100E2' : 'transparent',
                color: viewMode === 'kanban' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                transition: 'all 0.2s'
              }}
            >
              <Kanban size={15} />
              Funil / Kanban
            </button>
          </div>

          {/* Botão Exportar CSV */}
          <button
            onClick={exportarCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Exportar clientes para CSV"
          >
            <Download size={15} />
            Exportar
          </button>

          {/* Botão Importar Telegram */}
          <button
            onClick={importarTelegram}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 8,
              background: 'rgba(0, 240, 255, 0.08)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              color: '#00F0FF',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Importar leads existentes do banco do Telegram"
          >
            <Send size={15} />
            Puxar do Telegram
          </button>

          {/* Botão Novo Cliente */}
          <button
            onClick={() => {
              setClienteEdicao({
                nome: '',
                celular: '',
                email: '',
                telegram_id: '',
                telegram_username: '',
                instagram_username: '',
                valor_gasto: 0,
                status: 'lead',
                origem: 'Instagram',
                perfil_modelo: minhasModelos[0]?.username || '',
                tags: [],
                observacoes: ''
              });
              setModalClienteAberto(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 18px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #7100E2 0%, #FF007A 100%)',
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(113, 0, 226, 0.35)'
            }}
          >
            <Plus size={18} />
            Novo Cliente
          </button>
        </div>
      </div>

      {/* Cards de Métricas / KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        {/* Total Clientes */}
        <div style={{
          background: 'var(--background-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total de Clientes
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#fff' }}>
              {metricas.total_clientes}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {metricas.total_leads} leads · {metricas.total_ativos} ativos
            </div>
          </div>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'rgba(113, 0, 226, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#7100E2'
          }}>
            <Users size={22} />
          </div>
        </div>

        {/* Faturamento Total / LTV */}
        <div style={{
          background: 'var(--background-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Faturamento (LTV)
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#00FFC8' }}>
              {formatBRL(metricas.total_faturado)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Total acumulado dos clientes
            </div>
          </div>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'rgba(0, 255, 200, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#00FFC8'
          }}>
            <DollarSign size={22} />
          </div>
        </div>

        {/* Ticket Médio */}
        <div style={{
          background: 'var(--background-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Ticket Médio
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#00F0FF' }}>
              {formatBRL(metricas.ticket_medio)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Por cliente comprador
            </div>
          </div>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'rgba(0, 240, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#00F0FF'
          }}>
            <TrendingUp size={22} />
          </div>
        </div>

        {/* Clientes VIP */}
        <div style={{
          background: 'var(--background-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Clientes VIP
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#D946EF' }}>
              {metricas.total_vips}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Maior valor e fidelidade
            </div>
          </div>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'rgba(217, 70, 239, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#D946EF'
          }}>
            <Crown size={22} />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div style={{
        background: 'var(--background-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 20,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        alignItems: 'center'
      }}>
        {/* Campo de Busca */}
        <div style={{
          flex: '1 1 240px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: '8px 12px'
        }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Buscar por nome, celular, @instagram, @telegram..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: 13,
              width: '100%'
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtro por Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Status:</span>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            style={{
              background: '#161B22',
              color: '#fff',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              outline: 'none'
            }}
          >
            <option value="todos">Todos os status</option>
            <option value="lead">🎯 Leads ({metricas.total_leads})</option>
            <option value="negociacao">💬 Em Negociação ({metricas.total_negociacao})</option>
            <option value="cliente">✅ Clientes Ativos ({metricas.total_ativos})</option>
            <option value="vip">💎 VIPs ({metricas.total_vips})</option>
            <option value="inativo">💤 Inativos ({metricas.total_inativos})</option>
          </select>
        </div>

        {/* Filtro por Modelo */}
        {minhasModelos.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Modelo:</span>
            <select
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              style={{
                background: '#161B22',
                color: '#fff',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 13,
                outline: 'none'
              }}
            >
              <option value="todos">Todas as modelos</option>
              {minhasModelos.map(p => (
                <option key={p.username} value={p.username}>
                  @{p.username} {p.nome ? `(${p.nome})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filtro por Origem */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Origem:</span>
          <select
            value={filtroOrigem}
            onChange={(e) => setFiltroOrigem(e.target.value)}
            style={{
              background: '#161B22',
              color: '#fff',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              outline: 'none'
            }}
          >
            <option value="todos">Todas as origens</option>
            <option value="Instagram">Instagram</option>
            <option value="Telegram">Telegram</option>
            <option value="Fanvue">Fanvue</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Tráfego Pago">Tráfego Pago</option>
            <option value="Indicação">Indicação</option>
            <option value="Orgânico">Orgânico</option>
            <option value="Outro">Outro</option>
          </select>
        </div>

        {/* Ordenação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Ordenar:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              background: '#161B22',
              color: '#fff',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              outline: 'none'
            }}
          >
            <option value="valor_gasto">Maior Valor Gasto (LTV)</option>
            <option value="ultimo_contato">Último Contato</option>
            <option value="criado_em">Data de Cadastro</option>
            <option value="nome">Nome (A-Z)</option>
          </select>
          <button
            onClick={() => setSortOrder(prev => (prev === 'DESC' ? 'ASC' : 'DESC'))}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: '6px 8px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
            title={sortOrder === 'DESC' ? 'Ordem Decrescente' : 'Ordem Crescente'}
          >
            <ArrowUpDown size={14} />
          </button>
        </div>
      </div>

      {/* Conteúdo Principal: Modo Tabela ou Modo Kanban */}
      {loading ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 0',
          color: 'var(--text-secondary)'
        }}>
          <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, color: '#7100E2' }} />
          <span>Carregando clientes...</span>
        </div>
      ) : clientes.length === 0 ? (
        <div style={{
          background: 'var(--background-card)',
          border: '1px dashed var(--border-color)',
          borderRadius: 12,
          padding: '60px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <Users size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <h3 style={{ fontSize: 18, color: '#fff', marginBottom: 6 }}>Nenhum cliente encontrado</h3>
          <p style={{ fontSize: 13, maxWidth: 450, margin: '0 auto 20px auto' }}>
            {search || filtroStatus !== 'todos' || filtroModelo !== 'todos'
              ? 'Tente ajustar os filtros ou a busca acima para encontrar os clientes desejados.'
              : 'Comece adicionando seu primeiro cliente ou importe leads automaticamente do Telegram!'}
          </p>
          <button
            onClick={() => {
              setClienteEdicao({
                nome: '',
                celular: '',
                email: '',
                telegram_id: '',
                telegram_username: '',
                instagram_username: '',
                valor_gasto: 0,
                status: 'lead',
                origem: 'Instagram',
                perfil_modelo: minhasModelos[0]?.username || '',
                tags: [],
                observacoes: ''
              });
              setModalClienteAberto(true);
            }}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              background: '#7100E2',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            + Cadastrar Primeiro Cliente
          </button>
        </div>
      ) : viewMode === 'tabela' ? (
        /* VISUALIZAÇÃO EM TABELA */
        <div style={{
          background: 'var(--background-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid var(--border-color)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  textTransform: 'uppercase'
                }}>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Cliente</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Contatos Rápidos</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Redes Sociais</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Modelo</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Status Funil</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Valor Gasto (LTV)</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => {
                  const statusConf = STATUS_CONFIG[c.status] || STATUS_CONFIG.lead;
                  const waUrl = getWhatsappUrl(c.celular || '');
                  return (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Cliente (Nome + Tags + Origem) */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>
                          {c.nome}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                          {c.origem && (
                            <span style={{
                              fontSize: 10,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: c.origem === 'Fanvue' ? 'rgba(0, 163, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                              color: c.origem === 'Fanvue' ? '#38BDF8' : 'var(--text-secondary)',
                              border: c.origem === 'Fanvue' ? '1px solid rgba(56, 189, 248, 0.4)' : 'none',
                              fontWeight: c.origem === 'Fanvue' ? 700 : 500
                            }}>
                              {c.origem === 'Fanvue' ? '💎 Fanvue' : c.origem}
                            </span>
                          )}
                          {(c.tags || []).map((t, idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: 'rgba(113, 0, 226, 0.2)',
                                color: '#C084FC',
                                border: '1px solid rgba(113, 0, 226, 0.3)'
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Contatos Rápidos (WhatsApp, Telefone, E-mail) */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {c.celular ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 8px',
                                borderRadius: 6,
                                background: 'rgba(37, 211, 102, 0.15)',
                                color: '#25D366',
                                textDecoration: 'none',
                                fontSize: 12,
                                fontWeight: 600,
                                border: '1px solid rgba(37, 211, 102, 0.3)'
                              }}
                              title={`Abrir WhatsApp com ${c.celular}`}
                            >
                              <MessageCircle size={14} />
                              {c.celular}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                          )}

                          {c.email && (
                            <a
                              href={`mailto:${c.email}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: 4,
                                borderRadius: 6,
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-secondary)',
                                textDecoration: 'none'
                              }}
                              title={`Enviar e-mail para ${c.email}`}
                            >
                              <Mail size={14} />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Redes Sociais (@ Instagram & @ Telegram / ID) */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {c.instagram_username && (
                            <a
                              href={`https://instagram.com/${c.instagram_username.replace(/^@/, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: '#FF007A',
                                textDecoration: 'none',
                                fontSize: 12,
                                fontWeight: 500
                              }}
                            >
                              <InstagramIcon size={13} />
                              @{c.instagram_username.replace(/^@/, '')}
                            </a>
                          )}

                          {(c.telegram_username || c.telegram_id) && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {c.telegram_username ? (
                                <a
                                  href={`https://t.me/${c.telegram_username.replace(/^@/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: '#00F0FF',
                                    textDecoration: 'none',
                                    fontSize: 12,
                                    fontWeight: 500
                                  }}
                                >
                                  <Send size={13} />
                                  @{c.telegram_username.replace(/^@/, '')}
                                </a>
                              ) : (
                                <span style={{ color: '#00F0FF', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Send size={12} /> ID: {c.telegram_id}
                                </span>
                              )}
                            </div>
                          )}

                          {!c.instagram_username && !c.telegram_username && !c.telegram_id && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                          )}
                        </div>
                      </td>

                      {/* Modelo Atribuída */}
                      <td style={{ padding: '14px 16px' }}>
                        {c.perfil_modelo ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: '#fff',
                            fontSize: 12,
                            fontWeight: 500
                          }}>
                            @{c.perfil_modelo}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Geral</span>
                        )}
                      </td>

                      {/* Status no Funil */}
                      <td style={{ padding: '14px 16px' }}>
                        <select
                          value={c.status}
                          onChange={(e) => mudarStatusRapido(c.id, e.target.value as Cliente['status'])}
                          style={{
                            background: statusConf.bg,
                            color: statusConf.cor,
                            border: `1px solid ${statusConf.border}`,
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: 12,
                            fontWeight: 700,
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="lead">🎯 Lead</option>
                          <option value="negociacao">💬 Em Negociação</option>
                          <option value="cliente">✅ Cliente Ativo</option>
                          <option value="vip">💎 VIP</option>
                          <option value="inativo">💤 Inativo</option>
                        </select>
                      </td>

                      {/* Valor Gasto (LTV) */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{
                          fontWeight: 800,
                          fontSize: 14,
                          color: c.valor_gasto > 0 ? '#00FFC8' : 'var(--text-muted)'
                        }}>
                          {formatBRL(c.valor_gasto)}
                        </div>
                        <button
                          onClick={() => {
                            setClienteTransacao(c);
                            setDadosTransacao({
                              valor: '',
                              descricao: '',
                              data_transacao: new Date().toISOString().slice(0, 10),
                              metodo_pagamento: 'PIX',
                              perfil_modelo: c.perfil_modelo || ''
                            });
                            setModalTransacaoAberto(true);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#7100E2',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            marginTop: 2,
                            padding: 0
                          }}
                        >
                          + Registrar Venda
                        </button>
                      </td>

                      {/* Ações */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            onClick={() => abrirDetalhesCliente(c)}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 6,
                              padding: '5px 8px',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Ver histórico de compras e observações"
                          >
                            <ShoppingBag size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setClienteEdicao({ ...c });
                              setModalClienteAberto(true);
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 6,
                              padding: '5px 8px',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Editar cliente"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => excluirCliente(c.id, c.nome)}
                            style={{
                              background: 'rgba(255, 0, 122, 0.1)',
                              border: '1px solid rgba(255, 0, 122, 0.25)',
                              borderRadius: 6,
                              padding: '5px 8px',
                              color: '#FF007A',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Excluir cliente"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISUALIZAÇÃO EM FUNIL / KANBAN */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          alignItems: 'start'
        }}>
          {KANBAN_COLUMNS.map((col) => {
            const colClientes = clientes.filter(c => c.status === col.id);
            const totalColValor = colClientes.reduce((acc, c) => acc + (c.valor_gasto || 0), 0);

            return (
              <div
                key={col.id}
                style={{
                  background: 'var(--background-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 'calc(100vh - 280px)',
                  overflow: 'hidden'
                }}
              >
                {/* Header da Coluna */}
                <div style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.02)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: col.color }}>
                      {col.title}
                    </span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'rgba(255,255,255,0.08)',
                      padding: '2px 7px',
                      borderRadius: 10,
                      color: '#fff'
                    }}>
                      {colClientes.length}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00FFC8' }}>
                    {formatBRL(totalColValor)}
                  </div>
                </div>

                {/* Lista de Cards da Coluna */}
                <div style={{
                  padding: 12,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>
                  {colClientes.length === 0 ? (
                    <div style={{
                      padding: '30px 10px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 12
                    }}>
                      Nenhum cliente nesta fase
                    </div>
                  ) : (
                    colClientes.map((c) => {
                      const waUrl = getWhatsappUrl(c.celular || '');
                      return (
                        <div
                          key={c.id}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: 10,
                            padding: '14px',
                            transition: 'all 0.15s ease',
                            cursor: 'pointer'
                          }}
                          onClick={() => abrirDetalhesCliente(c)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = col.color;
                            e.currentTarget.style.transform = 'translateY(-2px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                            e.currentTarget.style.transform = 'none';
                          }}
                        >
                          {/* Nome e LTV */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>
                              {c.nome}
                            </div>
                            <div style={{ fontWeight: 800, color: '#00FFC8', fontSize: 13 }}>
                              {formatBRL(c.valor_gasto)}
                            </div>
                          </div>

                          {/* Modelo e Origem */}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                            {c.perfil_modelo && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#fff' }}>
                                @{c.perfil_modelo}
                              </span>
                            )}
                            {c.origem && (
                              <span style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: c.origem === 'Fanvue' ? 'rgba(0, 163, 255, 0.2)' : 'rgba(0, 240, 255, 0.1)',
                                color: c.origem === 'Fanvue' ? '#38BDF8' : '#00F0FF',
                                border: c.origem === 'Fanvue' ? '1px solid rgba(56, 189, 248, 0.4)' : 'none',
                                fontWeight: c.origem === 'Fanvue' ? 700 : 500
                              }}>
                                {c.origem === 'Fanvue' ? '💎 Fanvue' : c.origem}
                              </span>
                            )}
                          </div>

                          {/* Contatos Rápidos no Card */}
                          <div
                            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {c.celular && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: '#25D366',
                                  fontSize: 11,
                                  textDecoration: 'none',
                                  fontWeight: 600
                                }}
                              >
                                <MessageCircle size={13} /> WhatsApp
                              </a>
                            )}
                            {c.instagram_username && (
                              <a
                                href={`https://instagram.com/${c.instagram_username.replace(/^@/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: '#FF007A',
                                  fontSize: 11,
                                  textDecoration: 'none'
                                }}
                              >
                                <InstagramIcon size={13} /> IG
                              </a>
                            )}
                            {c.telegram_username && (
                              <a
                                href={`https://t.me/${c.telegram_username.replace(/^@/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: '#00F0FF',
                                  fontSize: 11,
                                  textDecoration: 'none'
                                }}
                              >
                                <Send size={13} /> TG
                              </a>
                            )}
                          </div>

                          {/* Mover de Fase Rápido */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderTop: '1px solid rgba(255,255,255,0.06)',
                              paddingTop: 8,
                              marginTop: 4
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={c.status}
                              onChange={(e) => mudarStatusRapido(c.id, e.target.value as Cliente['status'])}
                              style={{
                                background: '#161B22',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 11,
                                outline: 'none'
                              }}
                            >
                              <option value="lead">Mover: Lead</option>
                              <option value="negociacao">Mover: Negociação</option>
                              <option value="cliente">Mover: Cliente</option>
                              <option value="vip">Mover: VIP</option>
                              <option value="inativo">Mover: Inativo</option>
                            </select>

                            <button
                              onClick={() => {
                                setClienteTransacao(c);
                                setDadosTransacao({
                                  valor: '',
                                  descricao: '',
                                  data_transacao: new Date().toISOString().slice(0, 10),
                                  metodo_pagamento: 'PIX',
                                  perfil_modelo: c.perfil_modelo || ''
                                });
                                setModalTransacaoAberto(true);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#7100E2',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              + Venda
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ====================================================
          MODAL: CADASTRAR / EDITAR CLIENTE
      ==================================================== */}
      {modalClienteAberto && clienteEdicao && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalClienteAberto(false);
          }}
        >
          <div style={{
            background: '#12141A',
            border: '1px solid var(--border-color)',
            borderRadius: 14,
            width: '100%',
            maxWidth: 680,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                {clienteEdicao.id ? '✏️ Editar Cliente' : '✨ Novo Cliente'}
              </h2>
              <button
                onClick={() => setModalClienteAberto(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={salvarCliente} style={{ padding: '20px 24px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {/* Nome */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João Silva"
                    value={clienteEdicao.nome || ''}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, nome: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Celular / WhatsApp */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Celular / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: (11) 99999-9999"
                    value={clienteEdicao.celular || ''}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, celular: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* E-mail */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    E-mail
                  </label>
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={clienteEdicao.email || ''}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* @ Instagram */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    @ do Instagram
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: perfil_cliente"
                    value={clienteEdicao.instagram_username || ''}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, instagram_username: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* @ do Telegram */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    @ do Telegram
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: usuario_telegram"
                    value={clienteEdicao.telegram_username || ''}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, telegram_username: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* ID Telegram */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    ID Telegram (chat_id)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 582194821"
                    value={clienteEdicao.telegram_id || ''}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, telegram_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Valor Gasto Inicial / LTV */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Valor Gasto Total (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={clienteEdicao.valor_gasto ?? 0}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, valor_gasto: parseFloat(e.target.value) || 0 })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#00FFC8',
                      fontWeight: 700,
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Status do Funil */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Status no Funil
                  </label>
                  <select
                    value={clienteEdicao.status || 'lead'}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, status: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#161B22',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  >
                    <option value="lead">🎯 Lead</option>
                    <option value="negociacao">💬 Em Negociação</option>
                    <option value="cliente">✅ Cliente Ativo</option>
                    <option value="vip">💎 VIP</option>
                    <option value="inativo">💤 Inativo</option>
                  </select>
                </div>

                {/* Modelo Atribuída */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Modelo / Perfil Vinculado
                  </label>
                  <select
                    value={clienteEdicao.perfil_modelo || ''}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, perfil_modelo: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#161B22',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  >
                    <option value="">Nenhuma / Geral</option>
                    {minhasModelos.map(p => (
                      <option key={p.username} value={p.username}>
                        @{p.username} {p.nome ? `(${p.nome})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Origem */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Origem do Cliente
                  </label>
                  <select
                    value={clienteEdicao.origem || 'Instagram'}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, origem: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#161B22',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  >
                    <option value="Instagram">Instagram</option>
                    <option value="Telegram">Telegram</option>
                    <option value="Fanvue">Fanvue</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Tráfego Pago">Tráfego Pago</option>
                    <option value="Indicação">Indicação</option>
                    <option value="Orgânico">Orgânico</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                {/* Tags */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Tags (Pressione Enter ou clique em Adicionar)
                  </label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      placeholder="Ex: VIP, Comprador Recorrente, Close Friends..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                        color: '#fff',
                        fontSize: 13,
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(113, 0, 226, 0.3)',
                        border: '1px solid #7100E2',
                        borderRadius: 6,
                        color: '#fff',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Adicionar
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(clienteEdicao.tags || []).map((t, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'rgba(113, 0, 226, 0.25)',
                          color: '#C084FC',
                          border: '1px solid rgba(113, 0, 226, 0.4)',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 12
                        }}
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Observações */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Notas & Observações de Atendimento
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Anotações sobre preferências do cliente, acordos, interesses..."
                    value={clienteEdicao.observacoes || ''}
                    onChange={(e) => setClienteEdicao({ ...clienteEdicao, observacoes: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 13,
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                marginTop: 24,
                borderTop: '1px solid var(--border-color)',
                paddingTop: 16
              }}>
                <button
                  type="button"
                  onClick={() => setModalClienteAberto(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoCliente}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #7100E2 0%, #FF007A 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: salvandoCliente ? 'not-allowed' : 'pointer',
                    opacity: salvandoCliente ? 0.7 : 1
                  }}
                >
                  {salvandoCliente ? 'Salvando...' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL: REGISTRAR NOVA VENDA / TRANSAÇÃO
      ==================================================== */}
      {modalTransacaoAberto && clienteTransacao && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalTransacaoAberto(false);
          }}
        >
          <div style={{
            background: '#12141A',
            border: '1px solid var(--border-color)',
            borderRadius: 14,
            width: '100%',
            maxWidth: 480,
            boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                  💰 Registrar Venda
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Cliente: <strong style={{ color: '#00F0FF' }}>{clienteTransacao.nome}</strong>
                </p>
              </div>
              <button
                onClick={() => setModalTransacaoAberto(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={salvarTransacao} style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Valor */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Valor da Compra (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    autoFocus
                    placeholder="Ex: 150.00"
                    value={dadosTransacao.valor}
                    onChange={(e) => setDadosTransacao({ ...dadosTransacao, valor: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'rgba(0, 255, 200, 0.08)',
                      border: '1px solid rgba(0, 255, 200, 0.3)',
                      borderRadius: 8,
                      color: '#00FFC8',
                      fontSize: 18,
                      fontWeight: 800,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Descrição */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Descrição do Produto / Serviço
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Pacote de Fotos VIP, Assinatura Mensal, etc."
                    value={dadosTransacao.descricao}
                    onChange={(e) => setDadosTransacao({ ...dadosTransacao, descricao: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 13,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Método de Pagamento */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Método de Pagamento
                  </label>
                  <select
                    value={dadosTransacao.metodo_pagamento}
                    onChange={(e) => setDadosTransacao({ ...dadosTransacao, metodo_pagamento: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#161B22',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 13,
                      outline: 'none'
                    }}
                  >
                    <option value="PIX">PIX</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cripto">Cripto</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                {/* Data */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Data da Venda
                  </label>
                  <input
                    type="date"
                    value={dadosTransacao.data_transacao}
                    onChange={(e) => setDadosTransacao({ ...dadosTransacao, data_transacao: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 13,
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                marginTop: 24,
                borderTop: '1px solid var(--border-color)',
                paddingTop: 16
              }}>
                <button
                  type="button"
                  onClick={() => setModalTransacaoAberto(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoTransacao}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    background: '#00FFC8',
                    border: 'none',
                    color: '#090A0F',
                    fontWeight: 800,
                    cursor: salvandoTransacao ? 'not-allowed' : 'pointer'
                  }}
                >
                  {salvandoTransacao ? 'Registrando...' : 'Confirmar Venda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================
          DRAWER / MODAL: DETALHES & HISTÓRICO DO CLIENTE
      ==================================================== */}
      {clienteDetalhes && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 9998,
            display: 'flex',
            justifyContent: 'flex-end'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setClienteDetalhes(null);
          }}
        >
          <div style={{
            background: '#12141A',
            borderLeft: '1px solid var(--border-color)',
            width: '100%',
            maxWidth: 520,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.8)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
                  {clienteDetalhes.nome}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: (STATUS_CONFIG[clienteDetalhes.status] || STATUS_CONFIG.lead).bg,
                    color: (STATUS_CONFIG[clienteDetalhes.status] || STATUS_CONFIG.lead).cor,
                    border: `1px solid ${(STATUS_CONFIG[clienteDetalhes.status] || STATUS_CONFIG.lead).border}`
                  }}>
                    {(STATUS_CONFIG[clienteDetalhes.status] || STATUS_CONFIG.lead).label}
                  </span>
                  {clienteDetalhes.perfil_modelo && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Modelo: <strong>@{clienteDetalhes.perfil_modelo}</strong>
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setClienteDetalhes(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {/* Card Resumo de LTV */}
              <div style={{
                background: 'rgba(0, 255, 200, 0.08)',
                border: '1px solid rgba(0, 255, 200, 0.25)',
                borderRadius: 10,
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Valor Total Gasto (LTV)
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#00FFC8', marginTop: 2 }}>
                    {formatBRL(clienteDetalhes.valor_gasto)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setClienteTransacao(clienteDetalhes);
                    setDadosTransacao({
                      valor: '',
                      descricao: '',
                      data_transacao: new Date().toISOString().slice(0, 10),
                      metodo_pagamento: 'PIX',
                      perfil_modelo: clienteDetalhes.perfil_modelo || ''
                    });
                    setModalTransacaoAberto(true);
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    background: '#00FFC8',
                    border: 'none',
                    color: '#090A0F',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  + Nova Compra
                </button>
              </div>

              {/* Informações Cadastrais */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 12 }}>
                  Canais de Contato
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {clienteDetalhes.celular && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>WhatsApp:</span>
                      <a
                        href={getWhatsappUrl(clienteDetalhes.celular)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#25D366', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <MessageCircle size={14} /> {clienteDetalhes.celular}
                      </a>
                    </div>
                  )}

                  {clienteDetalhes.email && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>E-mail:</span>
                      <a
                        href={`mailto:${clienteDetalhes.email}`}
                        style={{ color: '#00F0FF', textDecoration: 'none' }}
                      >
                        {clienteDetalhes.email}
                      </a>
                    </div>
                  )}

                  {clienteDetalhes.instagram_username && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Instagram:</span>
                      <a
                        href={`https://instagram.com/${clienteDetalhes.instagram_username.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#FF007A', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <InstagramIcon size={14} /> @{clienteDetalhes.instagram_username.replace(/^@/, '')}
                      </a>
                    </div>
                  )}

                  {(clienteDetalhes.telegram_username || clienteDetalhes.telegram_id) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Telegram:</span>
                      {clienteDetalhes.telegram_username ? (
                        <a
                          href={`https://t.me/${clienteDetalhes.telegram_username.replace(/^@/, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#00F0FF', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Send size={14} /> @{clienteDetalhes.telegram_username.replace(/^@/, '')}
                        </a>
                      ) : (
                        <span style={{ color: '#00F0FF' }}>ID: {clienteDetalhes.telegram_id}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Observações / Notas */}
              {clienteDetalhes.observacoes && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 8 }}>
                    Notas / Observações
                  </h4>
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-color)',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {clienteDetalhes.observacoes}
                  </div>
                </div>
              )}

              {/* Histórico de Compras */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    Histórico de Compras ({historicoTransacoes.length})
                  </h4>
                </div>

                {loadingHistorico ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                    Carregando transações...
                  </div>
                ) : historicoTransacoes.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '24px 12px',
                    border: '1px dashed var(--border-color)',
                    borderRadius: 8,
                    color: 'var(--text-muted)',
                    fontSize: 13
                  }}>
                    Nenhuma compra registrada para este cliente.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {historicoTransacoes.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          padding: '10px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>
                            {t.descricao || 'Compra sem descrição'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {t.data_transacao} · {t.metodo_pagamento || 'PIX'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontWeight: 700, color: '#00FFC8', fontSize: 14 }}>
                            {formatBRL(t.valor)}
                          </span>
                          <button
                            onClick={() => excluirTransacao(t.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: 2
                            }}
                            title="Excluir compra"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé Drawer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <button
                onClick={() => {
                  setClienteEdicao({ ...clienteDetalhes });
                  setModalClienteAberto(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Edit2 size={14} /> Editar Cadastro
              </button>

              <button
                onClick={() => setClienteDetalhes(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  background: '#7100E2',
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
