'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Plus, Trash2, X, Pencil, GripVertical,
  CheckCircle2, Circle, Link2, AlertCircle, RefreshCw
} from 'lucide-react';

interface Perfil {
  username: string;
  nome?: string;
  foto_url?: string | null;
  meu_perfil?: number | boolean;
}

interface Check {
  id: number;
  texto: string;
  concluida: boolean;
}

interface Card {
  id: number;
  username: string;
  titulo: string;
  tipo?: string | null;
  checks: Check[];
}

interface Template {
  id: number;
  titulo: string;
  checks: string[];
  tipo?: string | null;
  fixo?: boolean;
}

interface FollowStats {
  follows: number;
  unfollows: number;
  meta: number;
}

const TIPO_FOLLOW = 'follow_unfollow';

interface Vinculo {
  username: string;
  senha: string;
}

interface CentralProdutividadeProps {
  profiles?: Perfil[];
  userRole?: string;
  isMaster2802?: boolean;
}

const SENHAS = ['2802', '1707'] as const;
const MIME_TEMPLATE = 'application/x-prod-template';
const MIME_CARD = 'application/x-prod-card';

// Data local (YYYY-MM-DD): o checklist reseta à meia-noite do fuso de quem usa.
function dataLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function postar(body: Record<string, unknown>) {
  const res = await fetch('/api/produtividade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Erro');
  return data;
}

export default function CentralProdutividade({ profiles = [], userRole = '', isMaster2802 = false }: CentralProdutividadeProps) {
  const minhasModelos = useMemo(() => {
    return (profiles || []).filter(p => {
      if (p.meu_perfil !== undefined) {
        return Number(p.meu_perfil) === 1 || p.meu_perfil === true;
      }
      return true;
    });
  }, [profiles]);

  const [viewSenha, setViewSenha] = useState<string>(() => (userRole === '1707' ? '1707' : '2802'));
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ texto: string; tipo: 'success' | 'error' } | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [followStats, setFollowStats] = useState<Record<string, FollowStats>>({});
  const [editandoMeta, setEditandoMeta] = useState<{ username: string; valor: string } | null>(null);
  // Editor de card-modelo: id 0 = novo
  const [editor, setEditor] = useState<{ id: number; titulo: string; checks: string } | null>(null);

  const showToast = (texto: string, tipo: 'success' | 'error' = 'success') => {
    setToast({ texto, tipo });
    setTimeout(() => setToast(null), 3500);
  };

  // Só o 2802 (master) pode alternar entre as duas listas; a 1707 vê sempre a própria.
  const podeAlternarLista = isMaster2802;
  useEffect(() => {
    if (!podeAlternarLista) setViewSenha(userRole === '1707' ? '1707' : '2802');
  }, [userRole, podeAlternarLista]);

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/produtividade?data_ref=${dataLocal()}`);
      const data = await res.json();
      if (data.success) {
        setVinculos(data.vinculos || []);
        setTemplates(data.templates || []);
        setCards(data.cards || []);
        const comFollow: string[] = Array.from(new Set<string>(
          (data.cards || []).filter((c: Card) => c.tipo === TIPO_FOLLOW).map((c: Card) => c.username)
        ));
        if (comFollow.length) carregarStats(comFollow);
      } else {
        showToast(data.error || 'Erro ao carregar produtividade', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro de conexão ao carregar produtividade', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  // Follows/unfollows do dia vêm das leituras da Meta API (mesma fonte do modal de tarefas).
  const carregarStats = async (usernames: string[]) => {
    await Promise.all(usernames.map(async (u) => {
      try {
        const res = await fetch(`/api/controle/follow-stats?username=${encodeURIComponent(u)}`, { cache: 'no-store' });
        const d = await res.json();
        if (d.success) {
          setFollowStats(prev => ({
            ...prev,
            [u]: { follows: Number(d.follows_dia) || 0, unfollows: Number(d.unfollows_dia) || 0, meta: Number(d.meta_dia) || 30 }
          }));
        }
      } catch (err) {
        console.warn('Erro ao buscar follow stats de', u, err);
      }
    }));
  };


  async function salvarMeta(username: string) {
    const valor = Number(editandoMeta?.valor);
    setEditandoMeta(null);
    if (!Number.isFinite(valor) || valor < 1) return;
    setFollowStats(prev => ({ ...prev, [username]: { ...(prev[username] || { follows: 0, unfollows: 0 }), meta: valor } }));
    try {
      await fetch('/api/controle/follow-stats', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, meta_dia: valor })
      });
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar meta', 'error');
    }
  }

  // O check "Seguir" do card fixo é automático: conclui sozinho ao bater a meta do dia.
  const checkFeito = (card: Card, k: Check, idx: number): boolean => {
    if (card.tipo === TIPO_FOLLOW && idx === 0) {
      const s = followStats[card.username];
      return !!s && s.follows >= s.meta;
    }
    return k.concluida;
  };

  const senhaPorUsername = useMemo(() => {
    const map: Record<string, string> = {};
    vinculos.forEach(v => { map[v.username] = v.senha; });
    return map;
  }, [vinculos]);

  const cardsPorUsername = useMemo(() => {
    const map: Record<string, Card[]> = {};
    cards.forEach(c => {
      (map[c.username] ||= []).push(c);
    });
    return map;
  }, [cards]);

  const modelosDaLista = minhasModelos.filter(p => senhaPorUsername[p.username] === viewSenha);
  const modelosSemVinculo = minhasModelos.filter(p => !senhaPorUsername[p.username]);

  async function vincular(username: string, senha: string) {
    setVinculos(prev => [...prev.filter(v => v.username !== username), { username, senha }]);
    try {
      await postar({ action: 'vincular', username, senha });
    } catch (err) {
      console.error(err);
      showToast('Erro ao vincular modelo à lista', 'error');
      carregar();
    }
  }

  async function desvincular(username: string) {
    setVinculos(prev => prev.filter(v => v.username !== username));
    try {
      await postar({ action: 'desvincular', username });
    } catch (err) {
      console.error(err);
      showToast('Erro ao remover modelo da lista', 'error');
      carregar();
    }
  }

  async function salvarTemplate() {
    if (!editor) return;
    const titulo = editor.titulo.trim();
    if (!titulo) { showToast('Dê um título ao card', 'error'); return; }
    const checks = editor.checks.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      const data = await postar({ action: 'salvar_template', id: editor.id, titulo, checks });
      const t: Template = data.template;
      setTemplates(prev => editor.id ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]);
      setEditor(null);
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar card', 'error');
    }
  }

  async function excluirTemplate(t: Template) {
    if (!confirm(`Excluir o card "${t.titulo}" da biblioteca? Os cards já colocados nas modelos continuam.`)) return;
    setTemplates(prev => prev.filter(x => x.id !== t.id));
    try {
      await postar({ action: 'excluir_template', id: t.id });
    } catch (err) {
      console.error(err);
      showToast('Erro ao excluir card', 'error');
      carregar();
    }
  }

  async function aplicarTemplate(templateId: number, username: string) {
    // Evita duplicar o card fixo na mesma coluna
    const tpl = templates.find(t => t.id === templateId);
    if (tpl?.fixo && cards.some(c => c.username === username && c.tipo === tpl.tipo)) {
      showToast(`@${username} já tem o card ${tpl.titulo}`, 'error');
      return;
    }
    try {
      const data = await postar({ action: 'aplicar_template', template_id: templateId, username });
      setCards(prev => [...prev, data.card]);
      if (data.card.tipo === TIPO_FOLLOW) carregarStats([username]);
    } catch (err) {
      console.error(err);
      showToast('Erro ao adicionar card à modelo', 'error');
    }
  }

  async function moverCard(cardId: number, username: string) {
    const card = cards.find(c => c.id === cardId);
    if (!card || card.username === username) return;
    if (card.tipo === TIPO_FOLLOW && cards.some(c => c.username === username && c.tipo === TIPO_FOLLOW)) {
      showToast(`@${username} já tem o card Follow / Unfollow`, 'error');
      return;
    }
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, username } : c));
    if (card.tipo === TIPO_FOLLOW) carregarStats([username]);
    try {
      await postar({ action: 'mover_card', card_id: cardId, username });
    } catch (err) {
      console.error(err);
      showToast('Erro ao mover card', 'error');
      carregar();
    }
  }

  async function excluirCard(card: Card) {
    setCards(prev => prev.filter(c => c.id !== card.id));
    try {
      await postar({ action: 'excluir_card', card_id: card.id });
    } catch (err) {
      console.error(err);
      showToast('Erro ao remover card', 'error');
      carregar();
    }
  }

  async function alternarCheck(card: Card, check: Check) {
    const novoEstado = !check.concluida;
    const aplicar = (estado: boolean) => setCards(prev => prev.map(c => c.id !== card.id ? c : {
      ...c, checks: c.checks.map(k => k.id === check.id ? { ...k, concluida: estado } : k)
    }));
    aplicar(novoEstado);
    try {
      await postar({
        action: novoEstado ? 'concluir_check' : 'desmarcar_check',
        check_id: check.id,
        data_ref: dataLocal()
      });
    } catch (err) {
      console.error(err);
      showToast('Erro ao atualizar check', 'error');
      aplicar(check.concluida);
    }
  }

  function soltarNaColuna(e: React.DragEvent, username: string) {
    e.preventDefault();
    setColunaAlvo(null);
    const tpl = e.dataTransfer.getData(MIME_TEMPLATE);
    const card = e.dataTransfer.getData(MIME_CARD);
    if (tpl) aplicarTemplate(Number(tpl), username);
    else if (card) moverCard(Number(card), username);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
    color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit'
  };

  return (
    <div style={{ padding: '0 0 40px 0', minHeight: '80vh' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 99999,
          padding: '12px 20px', borderRadius: 8,
          background: toast.tipo === 'success' ? '#00FFC8' : '#FF007A',
          color: '#090A0F', fontWeight: 700,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          {toast.tipo === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{toast.texto}</span>
        </div>
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between',
        alignItems: 'center', gap: 16, marginBottom: 20
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardCheck size={28} color="#00F0FF" />
            Produtividade
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Arraste um card de cima para a coluna da modelo. Os checks resetam à meia-noite.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={carregar}
            title="Recarregar"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Atualizar
          </button>

          {podeAlternarLista ? (
            <div style={{
              display: 'flex', background: 'rgba(255,255,255,0.05)', padding: 3,
              borderRadius: 8, border: '1px solid var(--border-color)'
            }}>
              {SENHAS.map(s => (
                <button
                  key={s}
                  onClick={() => setViewSenha(s)}
                  style={{
                    padding: '6px 16px', borderRadius: 6,
                    background: viewSenha === s ? '#7100E2' : 'transparent',
                    color: viewSenha === s ? '#fff' : 'var(--text-secondary)',
                    border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13
                  }}
                >
                  Lista {s}
                </button>
              ))}
            </div>
          ) : (
            <div style={{
              padding: '8px 16px', borderRadius: 8, background: 'rgba(113,0,226,0.12)',
              border: '1px solid rgba(113,0,226,0.35)', color: '#B794F6', fontWeight: 700, fontSize: 13
            }}>
              Lista {viewSenha}
            </div>
          )}
        </div>
      </div>

      {/* Biblioteca de cards (parte superior) */}
      <div style={{
        marginBottom: 20, padding: 14, borderRadius: 12,
        background: 'rgba(113,0,226,0.06)', border: '1px solid rgba(113,0,226,0.25)'
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#B794F6', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Meus cards — arraste para uma modelo
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
          {templates.map(t => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(MIME_TEMPLATE, String(t.id));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onDragEnd={() => setColunaAlvo(null)}
              style={{
                width: 220, padding: '10px 10px 10px 6px', borderRadius: 10, cursor: 'grab',
                background: 'var(--bg-card, rgba(255,255,255,0.06))', border: '1px solid var(--border-color)',
                display: 'flex', gap: 6, alignItems: 'flex-start'
              }}
            >
              <GripVertical size={14} color="#8B949E" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t.titulo}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {t.tipo === TIPO_FOLLOW ? 'Fixo · contagem automática' : `${t.checks.length} ${t.checks.length === 1 ? 'check' : 'checks'}`}
                </div>
              </div>
              {!t.fixo && (
                <>
                  <button
                    onClick={() => setEditor({ id: t.id, titulo: t.titulo, checks: t.checks.join('\n') })}
                    title="Editar card"
                    style={{ background: 'transparent', border: 'none', color: '#8B949E', cursor: 'pointer', padding: 2, display: 'flex' }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => excluirTemplate(t)}
                    title="Excluir card"
                    style={{ background: 'transparent', border: 'none', color: '#8B949E', cursor: 'pointer', padding: 2, display: 'flex' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}

          <button
            onClick={() => setEditor({ id: 0, titulo: '', checks: '' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
              borderRadius: 10, background: 'transparent', border: '1px dashed rgba(113,0,226,0.6)',
              color: '#B794F6', cursor: 'pointer', fontWeight: 700, fontSize: 13
            }}
          >
            <Plus size={14} />
            Novo card
          </button>
        </div>

        {editor && (
          <div style={{
            marginTop: 14, padding: 14, borderRadius: 10, maxWidth: 420,
            background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)'
          }}>
            <input
              type="text"
              autoFocus
              value={editor.titulo}
              onChange={(e) => setEditor({ ...editor, titulo: e.target.value })}
              placeholder="Título (ex: Follow / Unfollow)"
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <textarea
              value={editor.checks}
              onChange={(e) => setEditor({ ...editor, checks: e.target.value })}
              placeholder={'Um check por linha\nSeguir 30 pessoas\nDeixar de seguir após 7 dias'}
              rows={5}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditor(null)}
                style={{
                  padding: '7px 14px', borderRadius: 8, background: 'transparent',
                  border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                  cursor: 'pointer', fontWeight: 600, fontSize: 13
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarTemplate}
                style={{
                  padding: '7px 14px', borderRadius: 8, background: '#7100E2', border: 'none',
                  color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        )}
      </div>

      {modelosSemVinculo.length > 0 && (
        <div style={{
          marginBottom: 20, padding: 16, borderRadius: 12,
          background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.25)'
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#FFB800', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={14} />
            Modelos sem responsável definido ({modelosSemVinculo.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {modelosSemVinculo.map(p => (
              <div key={p.username} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)'
              }}>
                {p.foto_url ? (
                  <img src={p.foto_url} alt={p.username} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#30363D' }} />
                )}
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>@{p.username}</span>
                {(isMaster2802 ? SENHAS : [userRole || viewSenha]).map(s => (
                  <button
                    key={s}
                    onClick={() => vincular(p.username, s)}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
                      background: 'rgba(0,240,255,0.12)', border: '1px solid rgba(0,240,255,0.3)',
                      color: '#00F0FF', cursor: 'pointer'
                    }}
                  >
                    + {s}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Carregando...</div>
      ) : modelosDaLista.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--text-secondary)',
          border: '1px dashed var(--border-color)', borderRadius: 12
        }}>
          Nenhuma modelo vinculada à lista {viewSenha} ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 12 }}>
          {modelosDaLista.map(p => {
            const cardsModelo = cardsPorUsername[p.username] || [];
            const todosChecks = cardsModelo.flatMap(c => c.checks.map((k, i) => checkFeito(c, k, i)));
            const feitos = todosChecks.filter(Boolean).length;
            const total = todosChecks.length;
            const tudoFeito = total > 0 && feitos === total;
            const alvo = colunaAlvo === p.username;

            return (
              <div
                key={p.username}
                onDragOver={(e) => { e.preventDefault(); if (colunaAlvo !== p.username) setColunaAlvo(p.username); }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setColunaAlvo(null);
                }}
                onDrop={(e) => soltarNaColuna(e, p.username)}
                style={{
                  width: 290, flexShrink: 0, borderRadius: 12, padding: 10,
                  background: alvo ? 'rgba(113,0,226,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${alvo ? '#7100E2' : 'var(--border-color)'}`,
                  transition: 'background 0.15s, border-color 0.15s'
                }}
              >
                {/* Título da coluna = modelo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 10px 4px' }}>
                  {p.foto_url ? (
                    <img src={p.foto_url} alt={p.username} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#30363D' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      @{p.username}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: tudoFeito ? '#00FFC8' : 'var(--text-secondary)' }}>
                      {feitos}/{total} hoje
                    </div>
                  </div>
                  <button
                    onClick={() => desvincular(p.username)}
                    title={`Remover @${p.username} da lista ${viewSenha}`}
                    style={{ background: 'transparent', border: 'none', color: '#8B949E', cursor: 'pointer', padding: 4, display: 'flex' }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
                  {cardsModelo.map(card => {
                    const ok = card.checks.length > 0 && card.checks.every((k, i) => checkFeito(card, k, i));
                    const ehFollow = card.tipo === TIPO_FOLLOW;
                    const st = followStats[card.username];
                    const pct = st ? Math.min(100, Math.round((st.follows / (st.meta || 1)) * 100)) : 0;
                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(MIME_CARD, String(card.id));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setColunaAlvo(null)}
                        style={{
                          padding: '10px 12px', borderRadius: 10, cursor: 'grab',
                          background: 'var(--bg-card, rgba(255,255,255,0.06))',
                          border: `1px solid ${ok ? 'rgba(0,255,200,0.35)' : 'var(--border-color)'}`
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{
                            flex: 1, fontSize: 13, fontWeight: 700,
                            color: ok ? '#00FFC8' : 'var(--text-primary)'
                          }}>
                            {card.titulo}
                          </span>
                          <button
                            onClick={() => excluirCard(card)}
                            title="Remover card"
                            style={{ background: 'transparent', border: 'none', color: '#8B949E', cursor: 'pointer', padding: 2, display: 'flex' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {card.checks.map((k, i) => {
                          const feito = checkFeito(card, k, i);
                          const auto = ehFollow && i === 0;
                          return (
                            <div key={k.id}>
                              <div
                                role="button"
                                onClick={() => { if (!auto) alternarCheck(card, k); }}
                                title={auto ? 'Conclui sozinho ao bater a meta do dia' : undefined}
                                style={{
                                  display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
                                  cursor: auto ? 'default' : 'pointer', padding: '4px 0', textAlign: 'left'
                                }}
                              >
                                {feito
                                  ? <CheckCircle2 size={17} color="#00FFC8" style={{ flexShrink: 0 }} />
                                  : <Circle size={17} color="#8B949E" style={{ flexShrink: 0 }} />}
                                <span style={{
                                  flex: 1, fontSize: 13, lineHeight: 1.35,
                                  color: feito ? 'var(--text-secondary)' : 'var(--text-primary)',
                                  textDecoration: feito ? 'line-through' : 'none'
                                }}>
                                  {ehFollow ? (i === 0 ? 'Seguir' : 'Deixar de seguir') : k.texto}
                                </span>
                                {ehFollow && i === 0 && (
                                  <span style={{ fontSize: 13, fontWeight: 800, color: feito ? '#00FFC8' : '#00F0FF' }}>
                                    {st ? st.follows : '–'}/
                                    {editandoMeta?.username === card.username ? (
                                      <input
                                        type="number"
                                        autoFocus
                                        value={editandoMeta.valor}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => setEditandoMeta({ username: card.username, valor: e.target.value })}
                                        onBlur={() => salvarMeta(card.username)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') salvarMeta(card.username); }}
                                        style={{
                                          width: 44, background: '#0D1117', border: '1px solid #00F0FF',
                                          borderRadius: 4, color: '#fff', fontSize: 12, textAlign: 'center', padding: '1px 3px'
                                        }}
                                      />
                                    ) : (
                                      <span
                                        title="Clique para alterar a meta"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditandoMeta({ username: card.username, valor: String(st?.meta ?? 30) });
                                        }}
                                        style={{ cursor: 'pointer', borderBottom: '1px dashed #8B949E' }}
                                      >
                                        {st?.meta ?? 30}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {ehFollow && i === 1 && (
                                  <span style={{ fontSize: 13, fontWeight: 800, color: '#FFAA00' }}>
                                    {st ? st.unfollows : '–'} hoje
                                  </span>
                                )}
                              </div>
                              {auto && (
                                <div style={{ height: 5, margin: '0 0 4px 25px', background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${pct}%`, height: '100%', borderRadius: 3, transition: 'width 0.3s ease',
                                    background: feito ? '#00FF66' : 'linear-gradient(90deg, #00F0FF, #00FF66)'
                                  }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {cardsModelo.length === 0 && (
                    <div style={{
                      fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: '14px 8px',
                      border: '1px dashed var(--border-color)', borderRadius: 10
                    }}>
                      Solte um card aqui
                    </div>
                  )}
                </div>

                {/* Alternativa ao arrastar (celular/toque) */}
                {templates.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) aplicarTemplate(Number(e.target.value), p.username); }}
                    style={{ ...inputStyle, marginTop: 10, cursor: 'pointer' }}
                  >
                    <option value="">+ Adicionar card...</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.titulo}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
