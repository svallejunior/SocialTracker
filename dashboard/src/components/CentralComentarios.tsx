'use client';
import React, { useState, useEffect } from 'react';
import {
  Heart, MessageSquare, Send, RefreshCw, ExternalLink,
  Sparkles, Check, CheckCheck, Clock, AlertCircle, EyeOff,
  ChevronRight, Play, Film, Layers, Image as ImageIcon, ThumbsUp
} from 'lucide-react';
import AvatarModelo from './AvatarModelo';

interface PostComment {
  id: string;
  media_id: string;
  autor_username: string;
  autor_id?: string;
  texto: string;
  timestamp: string;
  like_count: number;
  curtido: number | boolean;
  respondido: number | boolean;
  resposta_texto?: string | null;
  replies?: any[];
}

interface PostItem {
  id: string;
  caption: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  permalink: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  comments: PostComment[];
}

interface CentralComentariosProps {
  selectedUsername: string;
  onRefreshStats?: () => void;
}

const ATALHOS_RESPOSTAS_COMENTARIOS = [
  'Muito obrigada pelo carinho! ❤️',
  'Oie amor! Um beijão pra você 🥰',
  'Amei o comentário! ✨',
  'O link exclusivo tá fixado na bio! 🔥',
  'Obrigada de coração! 💋'
];

export default function CentralComentarios({ selectedUsername, onRefreshStats }: CentralComentariosProps) {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [replyingMap, setReplyingMap] = useState<Record<string, boolean>>({});
  const [likingMap, setLikingMap] = useState<Record<string, boolean>>({});
  const [dismissingMap, setDismissingMap] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authLink, setAuthLink] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Carrega posts e comentários da Meta API
  const carregarPostsComentarios = async (username: string) => {
    if (!username) return;
    setLoading(true);
    setErrorMsg(null);
    setAuthLink(null);
    try {
      const res = await fetch(`/api/comentarios?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (data.success) {
        const fetchedPosts = data.posts || [];
        setPosts(fetchedPosts);
        if (fetchedPosts.length > 0) {
          const existe = fetchedPosts.some((p: PostItem) => p.id === selectedPostId);
          if (!existe || !selectedPostId) {
            setSelectedPostId(fetchedPosts[0].id);
          }
        } else {
          setSelectedPostId(null);
        }
      } else {
        setErrorMsg(data.error || 'Falha ao buscar posts e comentários');
        if (data.auth_required && data.auth_link) {
          setAuthLink(data.auth_link);
        }
      }
    } catch (err: any) {
      setErrorMsg(`Erro de conexão: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUsername) {
      carregarPostsComentarios(selectedUsername);
    }
  }, [selectedUsername]);

  const selectedPost = posts.find(p => p.id === selectedPostId) || posts[0];

  // Curtir / Descurtir Comentário
  const handleToggleLike = async (com: PostComment) => {
    const isLiked = Boolean(com.curtido);
    const action = isLiked ? 'unlike' : 'like';

    setLikingMap(prev => ({ ...prev, [com.id]: true }));

    // Atualização otimista
    setPosts(prevPosts =>
      prevPosts.map(p => {
        if (p.id !== com.media_id) return p;
        return {
          ...p,
          comments: p.comments.map(c => {
            if (c.id !== com.id) return c;
            return {
              ...c,
              curtido: !isLiked,
              like_count: isLiked ? Math.max(0, c.like_count - 1) : c.like_count + 1
            };
          })
        };
      })
    );

    try {
      await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          comment_id: com.id,
          modelo_username: selectedUsername
        })
      });
    } catch (err) {
      console.error('Erro ao curtir comentário:', err);
    } finally {
      setLikingMap(prev => ({ ...prev, [com.id]: false }));
    }
  };

  // Enviar Resposta a um Comentário
  const handleEnviarResposta = async (com: PostComment) => {
    const texto = (replyTextMap[com.id] || '').trim();
    if (!texto) return;

    setReplyingMap(prev => ({ ...prev, [com.id]: true }));

    try {
      const res = await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reply',
          comment_id: com.id,
          media_id: com.media_id,
          modelo_username: selectedUsername,
          message: texto
        })
      });
      const data = await res.json();

      if (data.success) {
        setSuccessToast(`Resposta enviada com sucesso para @${com.autor_username}!`);
        setTimeout(() => setSuccessToast(null), 4000);

        // Limpa campo de texto
        setReplyTextMap(prev => ({ ...prev, [com.id]: '' }));

        // Atualiza post localmente
        setPosts(prevPosts =>
          prevPosts.map(p => {
            if (p.id !== com.media_id) return p;
            return {
              ...p,
              comments: p.comments.map(c => {
                if (c.id !== com.id) return c;
                return {
                  ...c,
                  respondido: true,
                  resposta_texto: texto
                };
              })
            };
          })
        );
      } else {
        alert(`Erro ao responder: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Falha na requisição: ${err.message}`);
    } finally {
      setReplyingMap(prev => ({ ...prev, [com.id]: false }));
    }
  };

  // Dispensar comentário (Não quero responder / Baixar pendência)
  const handleDispensarComentario = async (com: PostComment) => {
    setDismissingMap(prev => ({ ...prev, [com.id]: true }));

    // Atualização otimista
    setPosts(prevPosts =>
      prevPosts.map(p => {
        if (p.id !== com.media_id) return p;
        return {
          ...p,
          comments: p.comments.map(c => {
            if (c.id !== com.id) return c;
            return {
              ...c,
              respondido: true,
              resposta_texto: c.resposta_texto || '[Dispensado]'
            };
          })
        };
      })
    );

    try {
      const res = await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dismiss',
          comment_id: com.id,
          modelo_username: selectedUsername
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessToast(`Comentário de @${com.autor_username} dispensado! Pendência baixada.`);
        setTimeout(() => setSuccessToast(null), 3000);
      }
    } catch (err) {
      console.error('Erro ao dispensar comentário:', err);
    } finally {
      setDismissingMap(prev => ({ ...prev, [com.id]: false }));
    }
  };

  // Reabrir comentário (desfazer dispensar)
  const handleReabrirComentario = async (com: PostComment) => {
    setDismissingMap(prev => ({ ...prev, [com.id]: true }));

    // Atualização otimista
    setPosts(prevPosts =>
      prevPosts.map(p => {
        if (p.id !== com.media_id) return p;
        return {
          ...p,
          comments: p.comments.map(c => {
            if (c.id !== com.id) return c;
            return {
              ...c,
              respondido: false,
              resposta_texto: null
            };
          })
        };
      })
    );

    try {
      const res = await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'undismiss',
          comment_id: com.id,
          modelo_username: selectedUsername
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessToast(`Pendência de @${com.autor_username} reaberta!`);
        setTimeout(() => setSuccessToast(null), 3000);
      }
    } catch (err) {
      console.error('Erro ao reabrir comentário:', err);
    } finally {
      setDismissingMap(prev => ({ ...prev, [com.id]: false }));
    }
  };

  // Dispensar todos os comentários pendentes de uma publicação
  const handleDispensarTodosPost = async (post: PostItem) => {
    const pendentesCount = post.comments.filter(c => !c.respondido).length;
    if (pendentesCount === 0) return;

    if (!confirm(`Deseja marcar todos os ${pendentesCount} comentários pendentes deste post como não responder/resolvidos?`)) return;

    // Atualização otimista
    setPosts(prevPosts =>
      prevPosts.map(p => {
        if (p.id !== post.id) return p;
        return {
          ...p,
          comments: p.comments.map(c => ({
            ...c,
            respondido: true,
            resposta_texto: c.resposta_texto || '[Dispensado]'
          }))
        };
      })
    );

    try {
      const res = await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dismiss_post',
          media_id: post.id,
          modelo_username: selectedUsername
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessToast('Todos os comentários desta publicação foram dispensados!');
        setTimeout(() => setSuccessToast(null), 3500);
      }
    } catch (err) {
      console.error('Erro ao dispensar todos do post:', err);
    }
  };

  // Formata hora relativa
  const formatHoraRelativa = (timestampStr: string) => {
    if (!timestampStr) return '';
    try {
      const s = timestampStr.includes('T') ? timestampStr : timestampStr.replace(' ', 'T');
      const data = new Date(s);
      if (isNaN(data.getTime())) return '';
      const agora = new Date();
      const diffMs = agora.getTime() - data.getTime();
      const diffHoras = Math.floor(diffMs / 3600000);
      const diffDias = Math.floor(diffHoras / 24);

      if (diffHoras < 1) return 'Há pouco';
      if (diffHoras < 24) return `Há ${diffHoras}h`;
      if (diffDias === 1) return 'Ontem';
      if (diffDias < 7) return `Há ${diffDias}d`;
      return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* Toast de Sucesso */}
      {successToast && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0, 255, 200, 0.15), rgba(0, 240, 255, 0.2))',
          border: '1px solid #00FFC8',
          color: '#00FFC8',
          padding: '10px 16px',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 0 16px rgba(0, 255, 200, 0.2)',
          animation: 'fadeIn 0.2s ease'
        }}>
          <Check size={16} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Alerta de Erro */}
      {errorMsg && (
        <div style={{
          background: 'rgba(255, 0, 122, 0.08)',
          border: '1px solid rgba(255, 0, 122, 0.3)',
          color: '#FF6B9D',
          padding: '14px 16px',
          borderRadius: 10,
          fontSize: 13,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => carregarPostsComentarios(selectedUsername)}
              style={{
                background: 'rgba(255, 0, 122, 0.2)',
                border: 'none',
                color: 'white',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              Tentar Novamente
            </button>
          </div>
          {authLink && (
            <div style={{
              background: 'rgba(255, 165, 0, 0.08)',
              border: '1px solid rgba(255, 165, 0, 0.3)',
              borderRadius: 8,
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ color: '#FFB347', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ExternalLink size={13} />
                Autorização necessária — envie este link para @{selectedUsername}:
              </div>
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 10,
                color: '#aaa',
                wordBreak: 'break-all',
                fontFamily: 'monospace'
              }}>
                {authLink}
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(authLink); setSuccessToast('Link copiado!'); setTimeout(() => setSuccessToast(null), 2500); }}
                style={{
                  background: 'rgba(255, 165, 0, 0.25)',
                  border: '1px solid rgba(255, 165, 0, 0.4)',
                  color: '#FFB347',
                  borderRadius: 6,
                  padding: '5px 14px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  alignSelf: 'flex-start'
                }}
              >
                📋 Copiar Link de Autorização
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── SPLIT SCREEN: LISTA DE POSTS À ESQUERDA + COMENTÁRIOS À DIREITA ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '380px 1fr',
        gap: 20,
        minHeight: 650,
        height: 'calc(100vh - 340px)'
      }}>
        
        {/* ═══ COLUNA ESQUERDA: LISTA DE PUBLICAÇÕES ═══ */}
        <div style={{
          background: 'rgba(22, 27, 34, 0.7)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(240, 246, 252, 0.1)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(240, 246, 252, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>📸</span>
              <span style={{ fontWeight: 800, fontSize: 13, color: 'white' }}>
                Posts Recentes ({posts.length})
              </span>
            </div>
            <button
              onClick={() => carregarPostsComentarios(selectedUsername)}
              style={{
                background: 'none',
                border: 'none',
                color: '#8B949E',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11
              }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Recarregar
            </button>
          </div>

          {/* Lista de Posts */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {loading && posts.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
                Carregando publicações e comentários...
              </div>
            ) : posts.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
                Nenhuma publicação encontrada para @{selectedUsername}.
              </div>
            ) : (
              posts.map(post => {
                const isSelected = selectedPost?.id === post.id;
                const comentariosNaoRespondidos = post.comments.filter(c => !c.respondido).length;

                return (
                  <div
                    key={post.id}
                    onClick={() => setSelectedPostId(post.id)}
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg, rgba(113, 0, 226, 0.25), rgba(0, 240, 255, 0.12))'
                        : 'rgba(13, 17, 23, 0.4)',
                      border: isSelected ? '1.5px solid #00F0FF' : '1px solid rgba(240, 246, 252, 0.08)',
                      borderRadius: 12,
                      padding: '10px 12px',
                      marginBottom: 8,
                      display: 'flex',
                      gap: 12,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 12px rgba(0, 240, 255, 0.2)' : 'none'
                    }}
                  >
                    {/* Thumbnail da Postagem */}
                    <div style={{
                      width: 60,
                      height: 60,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#090A0F',
                      border: '1px solid #30363D',
                      flexShrink: 0,
                      position: 'relative'
                    }}>
                      {post.thumbnail_url || post.media_url ? (
                        <img
                          src={post.thumbnail_url || post.media_url || ''}
                          alt="Post thumbnail"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#586069' }}>
                          <ImageIcon size={20} />
                        </div>
                      )}
                      {post.media_type === 'VIDEO' && (
                        <div style={{ position: 'absolute', bottom: 3, right: 3, background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '1px 3px' }}>
                          <Film size={10} color="white" />
                        </div>
                      )}
                    </div>

                    {/* Informações do Post */}
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div style={{
                        fontSize: 12,
                        color: isSelected ? '#FFFFFF' : '#C9D1D9',
                        fontWeight: isSelected ? 600 : 400,
                        lineHeight: 1.4,
                        maxHeight: 34,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {post.caption || '(Sem legenda)'}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#8B949E', marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>❤️ {post.like_count}</span>
                          <span>💬 {post.comments.length}</span>
                        </div>
                        {comentariosNaoRespondidos > 0 && (
                          <span style={{
                            background: 'linear-gradient(135deg, #FF007A, #FF4500)',
                            color: 'white',
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 10
                          }}>
                            {comentariosNaoRespondidos} pendente{comentariosNaoRespondidos > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ COLUNA DIREITA: COMENTÁRIOS DO POST SELECIONADO ═══ */}
        <div style={{
          background: 'rgba(22, 27, 34, 0.7)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(240, 246, 252, 0.1)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {selectedPost ? (
            <>
              {/* Header do Post Selecionado */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid rgba(240, 246, 252, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(13, 17, 23, 0.5)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#090A0F',
                    border: '1px solid #30363D',
                    flexShrink: 0
                  }}>
                    {selectedPost.thumbnail_url || selectedPost.media_url ? (
                      <img
                        src={selectedPost.thumbnail_url || selectedPost.media_url || ''}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <ImageIcon size={24} color="#586069" />
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: 'white' }}>
                        Post de @{selectedUsername}
                      </span>
                      <a
                        href={selectedPost.permalink}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#00F0FF', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, textDecoration: 'none' }}
                      >
                        <span>Abrir no Instagram</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    <div style={{ fontSize: 11, color: '#8B949E', display: 'flex', gap: 10, marginTop: 2 }}>
                      <span>❤️ {selectedPost.like_count} curtidas</span>
                      <span>💬 {selectedPost.comments.length} comentários</span>
                      <span>📅 {formatHoraRelativa(selectedPost.timestamp)}</span>
                    </div>
                  </div>
                </div>

                {/* Botão Dispensar Todas as Pendências do Post */}
                {selectedPost.comments.filter(c => !c.respondido).length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDispensarTodosPost(selectedPost)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
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
                    onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#FF007A'; e.currentTarget.style.background = 'rgba(255, 0, 122, 0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = 'rgba(240, 246, 252, 0.15)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                    title="Marcar todos os comentários pendentes deste post como resolvidos/não responder"
                  >
                    <EyeOff size={13} />
                    <span>Dispensar todos ({selectedPost.comments.filter(c => !c.respondido).length})</span>
                  </button>
                )}
              </div>

              {/* Lista de Comentários do Post */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16
              }}>
                {selectedPost.comments.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', padding: 40, color: '#8B949E' }}>
                    <MessageSquare size={36} style={{ margin: '0 auto 12px auto', opacity: 0.3 }} />
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 4 }}>
                      Nenhum comentário nesta publicação
                    </h3>
                    <p style={{ fontSize: 12 }}>Os comentários de fãs aparecerão aqui assim que forem postados.</p>
                  </div>
                ) : (
                  selectedPost.comments.map(com => {
                    const isCurtido = Boolean(com.curtido);
                    const isRespondido = Boolean(com.respondido);
                    const isDispensado = isRespondido && (
                      com.resposta_texto === '[Dispensado]' ||
                      com.resposta_texto === '[Não responder]' ||
                      com.resposta_texto?.startsWith('[Dispensado')
                    );
                    const currentReply = replyTextMap[com.id] || '';

                    return (
                      <div
                        key={com.id}
                        style={{
                          background: 'rgba(13, 17, 23, 0.6)',
                          border: isRespondido
                            ? (isDispensado ? '1px solid rgba(139, 148, 158, 0.2)' : '1px solid rgba(0, 255, 200, 0.2)')
                            : '1px solid #30363D',
                          borderRadius: 14,
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          transition: 'all 0.2s',
                          opacity: isDispensado ? 0.75 : 1
                        }}
                      >
                        {/* Header do Comentário */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: isDispensado
                                ? 'linear-gradient(135deg, #484F58, #30363D)'
                                : 'linear-gradient(135deg, #7100E2, #00F0FF)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: 12,
                              color: 'white'
                            }}>
                              {com.autor_username.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: 'white' }}>
                                  @{com.autor_username}
                                </span>
                                {isRespondido && (
                                  isDispensado ? (
                                    <span style={{
                                      background: 'rgba(139, 148, 158, 0.15)',
                                      border: '1px solid rgba(139, 148, 158, 0.3)',
                                      color: '#8B949E',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: '1px 6px',
                                      borderRadius: 10
                                    }}>
                                      ✓ Não respondido (Dispensado)
                                    </span>
                                  ) : (
                                    <span style={{
                                      background: 'rgba(0, 255, 200, 0.15)',
                                      border: '1px solid rgba(0, 255, 200, 0.3)',
                                      color: '#00FFC8',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: '1px 6px',
                                      borderRadius: 10
                                    }}>
                                      ✓ Respondido
                                    </span>
                                  )
                                )}
                              </div>
                              <span style={{ fontSize: 10, color: '#8B949E' }}>
                                {formatHoraRelativa(com.timestamp)}
                              </span>
                            </div>
                          </div>

                          {/* Botão de Curtir com 1 Clique */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleLike(com);
                            }}
                            disabled={likingMap[com.id]}
                            style={{
                              background: isCurtido ? 'rgba(255, 0, 122, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                              border: isCurtido ? '1px solid #FF007A' : '1px solid rgba(240, 246, 252, 0.1)',
                              color: isCurtido ? '#FF007A' : '#8B949E',
                              borderRadius: 20,
                              padding: '5px 12px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all 0.15s'
                            }}
                            title={isCurtido ? 'Você curtiu este comentário' : 'Curtir comentário com a conta da modelo'}
                          >
                            <Heart size={14} fill={isCurtido ? '#FF007A' : 'none'} />
                            <span>{com.like_count > 0 ? com.like_count : (isCurtido ? 1 : 0)}</span>
                          </button>
                        </div>

                        {/* Texto do Comentário do Fã */}
                        <div style={{
                          fontSize: 13,
                          color: '#E6EDF3',
                          lineHeight: 1.5,
                          paddingLeft: 42
                        }}>
                          {com.texto}
                        </div>

                        {/* Resposta Existente (se houver e não for apenas dispensado) */}
                        {com.resposta_texto && !isDispensado && (
                          <div style={{
                            marginLeft: 42,
                            background: 'rgba(113, 0, 226, 0.15)',
                            borderLeft: '3px solid #7100E2',
                            padding: '8px 12px',
                            borderRadius: '0 8px 8px 0',
                            fontSize: 12,
                            color: '#FFFFFF'
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#00F0FF', marginBottom: 2 }}>
                              Resposta de @{selectedUsername}:
                            </div>
                            <div>{com.resposta_texto}</div>
                          </div>
                        )}

                        {/* Campo de Resposta Rápida e Ações */}
                        <div style={{ marginLeft: 42, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {/* Atalhos Rápidos */}
                          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                            {ATALHOS_RESPOSTAS_COMENTARIOS.map((tpl, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setReplyTextMap(prev => ({ ...prev, [com.id]: tpl }));
                                }}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.04)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  color: '#8B949E',
                                  borderRadius: 10,
                                  padding: '2px 8px',
                                  fontSize: 10,
                                  whiteSpace: 'nowrap',
                                  cursor: 'pointer'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#00F0FF'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
                              >
                                {tpl}
                              </button>
                            ))}
                          </div>

                          {/* Input e Botões de Ação */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder={`Responder @${com.autor_username}...`}
                              value={currentReply}
                              onChange={e => setReplyTextMap(prev => ({ ...prev, [com.id]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleEnviarResposta(com);
                                }
                              }}
                              style={{
                                flex: 1,
                                background: '#090A0F',
                                border: '1px solid #30363D',
                                borderRadius: 8,
                                padding: '8px 12px',
                                color: 'white',
                                fontSize: 12,
                                outline: 'none'
                              }}
                              onFocus={e => { e.currentTarget.style.borderColor = '#00F0FF'; }}
                              onBlur={e => { e.currentTarget.style.borderColor = '#30363D'; }}
                            />

                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleEnviarResposta(com);
                              }}
                              disabled={!currentReply.trim() || replyingMap[com.id]}
                              style={{
                                background: currentReply.trim()
                                  ? 'linear-gradient(135deg, #7100E2, #00F0FF)'
                                  : 'rgba(255, 255, 255, 0.05)',
                                border: 'none',
                                borderRadius: 8,
                                padding: '8px 14px',
                                color: currentReply.trim() ? 'white' : '#586069',
                                fontWeight: 700,
                                fontSize: 12,
                                cursor: currentReply.trim() ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s'
                              }}
                            >
                              {replyingMap[com.id] ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : (
                                <>
                                  <Send size={12} />
                                  <span>Responder</span>
                                </>
                              )}
                            </button>

                            {/* Botão de Não Responder / Dispensar Pendência */}
                            {!isRespondido ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDispensarComentario(com);
                                }}
                                disabled={dismissingMap[com.id]}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.04)',
                                  border: '1px solid rgba(240, 246, 252, 0.15)',
                                  borderRadius: 8,
                                  padding: '8px 12px',
                                  color: '#8B949E',
                                  fontWeight: 600,
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.15s'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.color = '#FFFFFF';
                                  e.currentTarget.style.borderColor = 'rgba(255, 0, 122, 0.5)';
                                  e.currentTarget.style.background = 'rgba(255, 0, 122, 0.12)';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.color = '#8B949E';
                                  e.currentTarget.style.borderColor = 'rgba(240, 246, 252, 0.15)';
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                }}
                                title="Informar que não quer responder e baixar a pendência"
                              >
                                {dismissingMap[com.id] ? (
                                  <RefreshCw size={11} className="animate-spin" />
                                ) : (
                                  <EyeOff size={12} />
                                )}
                                <span>Não responder</span>
                              </button>
                            ) : (
                              isDispensado && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleReabrirComentario(com);
                                  }}
                                  disabled={dismissingMap[com.id]}
                                  style={{
                                    background: 'none',
                                    border: '1px solid rgba(139, 148, 158, 0.3)',
                                    borderRadius: 8,
                                    padding: '8px 10px',
                                    color: '#8B949E',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.15s'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.color = '#00F0FF';
                                    e.currentTarget.style.borderColor = '#00F0FF';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.color = '#8B949E';
                                    e.currentTarget.style.borderColor = 'rgba(139, 148, 158, 0.3)';
                                  }}
                                  title="Reabrir comentário como pendente"
                                >
                                  {dismissingMap[com.id] ? (
                                    <RefreshCw size={11} className="animate-spin" />
                                  ) : (
                                    <Clock size={12} />
                                  )}
                                  <span>Reabrir pendência</span>
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', padding: 40, color: '#8B949E' }}>
              Selecione uma publicação à esquerda para ver os comentários.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
