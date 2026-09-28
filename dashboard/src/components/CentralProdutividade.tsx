'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, ChevronDown, ChevronRight, Plus, Trash2, X,
  CheckCircle2, Circle, Link2, AlertCircle, RefreshCw
} from 'lucide-react';

interface Perfil {
  username: string;
  nome?: string;
  foto_url?: string | null;
  meu_perfil?: number | boolean;
}

interface Tarefa {
  id: number;
  username: string;
  texto: string;
  concluida: boolean;
}

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
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [novaTarefaTexto, setNovaTarefaTexto] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ texto: string; tipo: 'success' | 'error' } | null>(null);

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
      const res = await fetch('/api/produtividade');
      const data = await res.json();
      if (data.success) {
        setVinculos(data.vinculos || []);
        setTarefas(data.tarefas || []);
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

  const senhaPorUsername = useMemo(() => {
    const map: Record<string, string> = {};
    vinculos.forEach(v => { map[v.username] = v.senha; });
    return map;
  }, [vinculos]);

  const tarefasPorUsername = useMemo(() => {
    const map: Record<string, Tarefa[]> = {};
    tarefas.forEach(t => {
      if (!map[t.username]) map[t.username] = [];
      map[t.username].push(t);
    });
    return map;
  }, [tarefas]);

  const modelosDaLista = minhasModelos.filter(p => senhaPorUsername[p.username] === viewSenha);
  const modelosSemVinculo = minhasModelos.filter(p => !senhaPorUsername[p.username]);

  async function vincular(username: string, senha: string) {
    setVinculos(prev => [...prev.filter(v => v.username !== username), { username, senha }]);
    try {
      const res = await fetch('/api/produtividade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vincular', username, senha })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      console.error(err);
      showToast('Erro ao vincular modelo à lista', 'error');
      carregar();
    }
  }

  async function desvincular(username: string) {
    setVinculos(prev => prev.filter(v => v.username !== username));
    try {
      const res = await fetch('/api/produtividade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'desvincular', username })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      console.error(err);
      showToast('Erro ao remover modelo da lista', 'error');
      carregar();
    }
  }

  async function criarTarefa(username: string) {
    const texto = (novaTarefaTexto[username] || '').trim();
    if (!texto) return;
    setNovaTarefaTexto(prev => ({ ...prev, [username]: '' }));
    try {
      const res = await fetch('/api/produtividade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'criar_tarefa', username, texto })
      });
      const data = await res.json();
      if (data.success) {
        setTarefas(prev => [...prev, data.tarefa]);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao adicionar tarefa', 'error');
    }
  }

  async function alternarConclusao(tarefa: Tarefa) {
    const novoEstado = !tarefa.concluida;
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, concluida: novoEstado } : t));
    try {
      const res = await fetch('/api/produtividade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: novoEstado ? 'concluir' : 'desmarcar', tarefa_id: tarefa.id })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      console.error(err);
      showToast('Erro ao atualizar tarefa', 'error');
      setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, concluida: tarefa.concluida } : t));
    }
  }

  async function removerTarefa(tarefa: Tarefa) {
    setTarefas(prev => prev.filter(t => t.id !== tarefa.id));
    try {
      const res = await fetch(`/api/produtividade?id=${tarefa.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      console.error(err);
      showToast('Erro ao remover tarefa', 'error');
      carregar();
    }
  }

  function toggleColapso(username: string) {
    setColapsados(prev => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username); else next.add(username);
      return next;
    });
  }

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
        alignItems: 'center', gap: 16, marginBottom: 24
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardCheck size={28} color="#00F0FF" />
            Produtividade
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Checklist diário de tarefas por modelo, reseta à meia-noite e mantém histórico dos dias anteriores.
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

      {modelosSemVinculo.length > 0 && (
        <div style={{
          marginBottom: 24, padding: 16, borderRadius: 12,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {modelosDaLista.map(p => {
            const tarefasModelo = tarefasPorUsername[p.username] || [];
            const total = tarefasModelo.length;
            const feitas = tarefasModelo.filter(t => t.concluida).length;
            const colapsado = colapsados.has(p.username);
            const tudoFeito = total > 0 && feitas === total;

            return (
              <div key={p.username} style={{
                borderRadius: 12, border: '1px solid var(--border-color)',
                background: 'rgba(255,255,255,0.02)', overflow: 'hidden'
              }}>
                <div
                  onClick={() => toggleColapso(p.username)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    cursor: 'pointer', userSelect: 'none'
                  }}
                >
                  {colapsado ? <ChevronRight size={16} color="#8B949E" /> : <ChevronDown size={16} color="#8B949E" />}
                  {p.foto_url ? (
                    <img src={p.foto_url} alt={p.username} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#30363D' }} />
                  )}
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>@{p.username}</span>

                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                    background: tudoFeito ? 'rgba(0,255,200,0.12)' : 'rgba(255,255,255,0.06)',
                    color: tudoFeito ? '#00FFC8' : 'var(--text-secondary)',
                    border: `1px solid ${tudoFeito ? 'rgba(0,255,200,0.3)' : 'var(--border-color)'}`
                  }}>
                    {feitas}/{total} hoje
                  </span>

                  <button
                    onClick={(e) => { e.stopPropagation(); desvincular(p.username); }}
                    title={`Remover @${p.username} da lista ${viewSenha}`}
                    style={{
                      background: 'transparent', border: 'none', color: '#8B949E',
                      cursor: 'pointer', padding: 4, display: 'flex'
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {!colapsado && (
                  <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid var(--border-color)' }}>
                    {tarefasModelo.length === 0 && (
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>
                        Nenhuma tarefa ainda. Adicione a primeira abaixo.
                      </div>
                    )}
                    {tarefasModelo.map(t => (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)'
                      }}>
                        <button
                          onClick={() => alternarConclusao(t)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                        >
                          {t.concluida
                            ? <CheckCircle2 size={18} color="#00FFC8" />
                            : <Circle size={18} color="#8B949E" />}
                        </button>
                        <span style={{
                          flex: 1, fontSize: 14, color: t.concluida ? 'var(--text-secondary)' : 'var(--text-primary)',
                          textDecoration: t.concluida ? 'line-through' : 'none'
                        }}>
                          {t.texto}
                        </span>
                        <button
                          onClick={() => removerTarefa(t)}
                          title="Remover tarefa"
                          style={{ background: 'transparent', border: 'none', color: '#8B949E', cursor: 'pointer', padding: 4, display: 'flex' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <input
                        type="text"
                        value={novaTarefaTexto[p.username] || ''}
                        onChange={(e) => setNovaTarefaTexto(prev => ({ ...prev, [p.username]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') criarTarefa(p.username); }}
                        placeholder="Nova tarefa..."
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)', fontSize: 13
                        }}
                      />
                      <button
                        onClick={() => criarTarefa(p.username)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                          borderRadius: 8, background: '#7100E2', border: 'none',
                          color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13
                        }}
                      >
                        <Plus size={14} />
                        Adicionar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
