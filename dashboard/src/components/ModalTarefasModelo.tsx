"use client";

import React, { useState, useEffect } from 'react';
import {
  X, CheckSquare, Square, Flame, Zap, Wine, ShieldAlert,
  Smartphone, Calendar, CheckCircle2, Copy, Check, ArrowRight,
  RotateCcw, Sparkles, AlertTriangle, Layers,
  UserPlus, UserMinus, Users, Target, ChevronDown, ChevronUp, RefreshCw, Edit3,
  Clock, ExternalLink, ShieldCheck, Video, HelpCircle, AlertOctagon
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
    meta_follows_dia?: number;
    follows_dia?: number;
    unfollows_dia?: number;
    seguindo_atual?: number;
    leituras_seguindo?: any[];
  } | null;
  onSaveConfig: (username: string, situacao: string, esteira?: string | null) => Promise<void>;
}

export default function ModalTarefasModelo({ isOpen, onClose, modelo, onSaveConfig }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [etapaManual, setEtapaManual] = useState<'AUTO' | 'PERGUNTAR_SITUACAO' | 'ESCOLHER_ESTEIRA' | 'VER_TAREFAS'>('AUTO');
  const [tarefasConcluidas, setTarefasConcluidas] = useState<Record<string, boolean>>({});

  // Estado para Contabilidade de Follows & Unfollows do Dia
  const [followStats, setFollowStats] = useState<{
    follows_dia: number;
    unfollows_dia: number;
    meta_dia: number;
    seguindo_atual: number;
    seguindo_baseline: number;
    historico_hoje: any[];
    loading: boolean;
  }>({
    follows_dia: Number(modelo?.follows_dia) || 0,
    unfollows_dia: Number(modelo?.unfollows_dia) || 0,
    meta_dia: Number(modelo?.meta_follows_dia) || 30,
    seguindo_atual: Number(modelo?.seguindo_atual) || 0,
    seguindo_baseline: 0,
    historico_hoje: modelo?.leituras_seguindo || [],
    loading: false
  });

  const [editandoMeta, setEditandoMeta] = useState(false);
  const [novaMetaInput, setNovaMetaInput] = useState('30');
  const [mostrarHistoricoLeituras, setMostrarHistoricoLeituras] = useState(false);

  const carregarFollowStats = async () => {
    if (!modelo?.username) return;
    try {
      setFollowStats(prev => ({ ...prev, loading: true }));
      const res = await fetch(`/api/controle/follow-stats?username=${encodeURIComponent(modelo.username)}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setFollowStats({
          follows_dia: Number(data.follows_dia) || 0,
          unfollows_dia: Number(data.unfollows_dia) || 0,
          meta_dia: Number(data.meta_dia) || 30,
          seguindo_atual: Number(data.seguindo_atual) || 0,
          seguindo_baseline: Number(data.seguindo_baseline) || 0,
          historico_hoje: data.historico_hoje || [],
          loading: false
        });
        setNovaMetaInput(String(data.meta_dia || 30));
      } else {
        setFollowStats(prev => ({ ...prev, loading: false }));
      }
    } catch (e) {
      console.warn("Erro ao buscar follow stats:", e);
      setFollowStats(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    if (isOpen && modelo?.username) {
      // Inicia com os dados passados pelo pai
      setFollowStats({
        follows_dia: Number(modelo?.follows_dia) || 0,
        unfollows_dia: Number(modelo?.unfollows_dia) || 0,
        meta_dia: Number(modelo?.meta_follows_dia) || 30,
        seguindo_atual: Number(modelo?.seguindo_atual) || 0,
        seguindo_baseline: 0,
        historico_hoje: modelo?.leituras_seguindo || [],
        loading: false
      });
      setNovaMetaInput(String(modelo?.meta_follows_dia || 30));
      carregarFollowStats();
    }
  }, [isOpen, modelo?.username]);

  const handleSalvarMeta = async (novoValor: number) => {
    if (!modelo?.username || isNaN(novoValor) || novoValor < 1) {
      setEditandoMeta(false);
      return;
    }
    try {
      setFollowStats(prev => ({ ...prev, meta_dia: novoValor }));
      setEditandoMeta(false);
      await fetch('/api/controle/follow-stats', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: modelo.username, meta_dia: novoValor })
      });
    } catch (e) {
      console.error("Erro ao salvar meta:", e);
    }
  };

  // Utilitários de Data no fuso de Brasília (UTC-3)
  const getTodayDateString = (): string => {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(new Date()); // "YYYY-MM-DD"
    } catch {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  };

  const getTodayDisplay = (): string => {
    try {
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit'
      });
      return formatter.format(new Date());
    } catch {
      const d = new Date();
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  };

  // Identifica quais tarefas são operacionais diárias (rotina diária que deve zerar a cada dia)
  const isDailyTask = (id: string): boolean => {
    return id.startsWith('aq_') || id.startsWith('d4_');
  };

  // Carrega estado de checkboxes salvo em localStorage por modelo com controle de data diária
  useEffect(() => {
    if (!isOpen || !modelo?.username) return;

    try {
      const hoje = getTodayDateString();
      const key = `st_tarefas_${modelo.username.toLowerCase()}`;
      const saved = localStorage.getItem(key);

      if (saved) {
        const parsed = JSON.parse(saved);

        // Se for o formato novo estruturado com campo data
        if (parsed && typeof parsed === 'object' && ('data' in parsed || 'tarefas' in parsed)) {
          const savedDate = parsed.data;
          const tarefasSalvas = (parsed.tarefas || {}) as Record<string, boolean>;

          if (savedDate === hoje) {
            // Mesmo dia: mantém o status das tarefas
            setTarefasConcluidas(tarefasSalvas);
          } else {
            // NOVO DIA: Zera automaticamente todas as tarefas diárias! Preserva tarefas permanentes de onboarding
            const mantidas: Record<string, boolean> = {};
            for (const [taskId, checked] of Object.entries(tarefasSalvas)) {
              if (!isDailyTask(taskId) && checked) {
                mantidas[taskId] = true;
              }
            }
            setTarefasConcluidas(mantidas);
            localStorage.setItem(key, JSON.stringify({
              data: hoje,
              tarefas: mantidas
            }));
          }
        } else if (parsed && typeof parsed === 'object') {
          // Formato legado antigo (sem campo data):
          // Como era anterior ao controle de data diária, reseta tarefas diárias e preserva apenas permanentes
          const mantidas: Record<string, boolean> = {};
          for (const [taskId, checked] of Object.entries(parsed)) {
            if (!isDailyTask(taskId) && Boolean(checked)) {
              mantidas[taskId] = true;
            }
          }
          setTarefasConcluidas(mantidas);
          localStorage.setItem(key, JSON.stringify({
            data: hoje,
            tarefas: mantidas
          }));
        } else {
          setTarefasConcluidas({});
        }
      } else {
        setTarefasConcluidas({});
      }
    } catch (e) {
      console.warn("Erro ao carregar tarefas da modelo:", e);
      setTarefasConcluidas({});
    }
  }, [isOpen, modelo?.username]);

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
    if (!modelo?.username) return;
    const hoje = getTodayDateString();
    const key = `st_tarefas_${modelo.username.toLowerCase()}`;

    setTarefasConcluidas(prev => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      try {
        localStorage.setItem(key, JSON.stringify({
          data: hoje,
          tarefas: next
        }));
      } catch (e) {}
      return next;
    });
  };

  const handleZerarTarefasDiarias = () => {
    if (!modelo?.username) return;
    const hoje = getTodayDateString();
    const key = `st_tarefas_${modelo.username.toLowerCase()}`;

    setTarefasConcluidas(prev => {
      const mantidas: Record<string, boolean> = {};
      for (const [taskId, checked] of Object.entries(prev)) {
        if (!isDailyTask(taskId) && checked) {
          mantidas[taskId] = true;
        }
      }
      try {
        localStorage.setItem(key, JSON.stringify({
          data: hoje,
          tarefas: mantidas
        }));
      } catch (e) {}
      return mantidas;
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

  const textoRoteiroTorreChampagne = `================= ESTEIRA COM TORRE DE CHAMPAGNE ==================
FASE 1(DIA 1): 
* Cria a conta com e-mail
* Insere foto do perfil (de preferência foto de cor ou anime/caricatura com IA)
* Poste uma foto sua no feed: 10 a 30 min depois de postar, arquive.
* Insere a BIO - bio deve ser totalmente minamalista e NÃO apelativa.
* Siga 5 contas de modelo HOT
* Use a conta por pelo menos 5 minutos na aba reels de forma HUMANIZADA(Você precisa treinar seu algoritmo, mostre que tem interesse em modelos)
* faça o mesmo treinamento na aba explorar

FASE 2: 
* Você deve ter pelo menos 9 feeds e de preferência 80% deles carrosséis
* poste de 1 ao no máximo 2 por dia.
* evite imagens com muita pele ou sedutoras ou roupas cor de pele
* evite imagens escuras
* jamais mostre muito de sua modelo
* modelo linda, beleza que gere desejo sem mostrar nada.
* fixe os 3 melhores feeds que tenham uma identidade visual congruente.
* POST FEEDS ate alcançar 9 e então pode parar.
* USE a conta HUMANIZADA de 5 a 15 minutos por dia a partir do dia 2, TODOS OS DIAS.
* Siga 5 contas de modelo e 2 contas de leads qualificados (possíveis comrpadores, pessoas com dinheiro e que seguem poucas modelos, procure lead que tenham story)
* Aplique isso até que você siga pelo menos 100 modelos
* a cada dia que passar você poderá aumentar o numero de contas que segue em 2(se seguiu 7.. hoje pode seguir 9). NUNCA passe de 12 contas por dia.
* Interessante fazer pausas... deixar 1 dia nesse intervalo sem seguir ninguém

FASE 3: (criar torre de champagne)
* seu perfil precisa estar privado!!!
* Alcançar entre 1k e 1.5k é o ponto de tração.
* Seus seguidores tem de ser qualificados (homens que se encaixam no nisso que vc quer)
	- Utilizando outras contas de instagram caso você tenha
	- Usar TIK-TOK`;

  const textoRoteiroNormal = `================= ESTEIRA DE AQUECIMENTO NORMAL ==================

1. CRIAÇÃO E AQUECIMENTO DE PERFIL (INSTAGRAM)
* Pré-requisito inicial: Deixar a conta durante pelo menos 24 horas "de molho" logo após a criação.

CRONOGRAMA DIÁRIO:
* Dia 1 – Foto de perfil e Biografia (SEM LINK NA BIO):
  - Indicar na biografia que é brasileira e mora no país pretendido.
  - Indicar a idade da modelo.
  - Inserir uma "frase de criadora de conteúdo/blogueira".

* Dia 2 – 2 a 3 publicações no Feed para criar relacionamento com a plataforma:
  - Dar prioridade ao formato de carrossel COM MÚSICA do país de destino.
  - Vantagens: Os carrosséis têm a 2ª maior recomendação da plataforma (apenas atrás dos Reels) e contam com rotação automática de imagem caso o usuário não interaja na primeira exibição.

* Dia 3 – 2 a 3 publicações no Feed + Interações:
  - Interagir em publicações de páginas ou criadores do país pretendido.
  - Identificar páginas com público-alvo qualificado (modelos com estética semelhante quanto a idade, tom de pele, etc.).
  - Prestar atenção ao fuso horário do país selecionado no momento de agendar ou publicar.

* Dia 4 – 2 a 3 publicações no Feed + Interações + Follow/Unfollow:
  - Seguir exclusivamente perfis humanizados e com histórias (Stories) ativas.

* Dia 5 – 2 a 3 publicações no Feed + Interações + Follow/Unfollow + Story Lifestyle + 1 Reels:
  - Dica Opcional: Promover 3 publicações do feed com R$ 30,00 cada durante 3 dias (sem Reels), segmentando para o país pretendido para impulsionar o envolvimento inicial (com foco em tração e não em vendas diretas).

* Dia 6 – 2 a 3 publicações no Feed + Interações + Follow/Unfollow + 1 Reels + Story Lifestyle:
  - O intuito desta fase é consolidar uma grelha inicial de 9 a 12 publicações no feed.

* Dia 7 – Interações + Follow/Unfollow + 1 Reels + Story Lifestyle.

* Dia 8 – Interações + Follow/Unfollow + 2 a 3 Reels + Story Lifestyle:
  - Não exagerar no número de Reels por dia; agir de forma natural como uma influenciadora real.
  - Publicações em massa ativam alertas de segurança e filtros de SPAM, prejudicando o perfil.

* Dia 9 em diante – Repetição contínua do ciclo:
  - Possibilidade de parar com as publicações no feed e concentrar esforços exclusivamente em Reels, Stories e interações.

2. PRODUÇÃO DE CONTEÚDO
* Ferramentas de IA recomendadas:
  - Kling AI: https://klingai.com/
  - Pixverse: https://app.pixverse.ai/
  - Remaker AI (Face Swap): https://remaker.ai/face-swap-free/
  - Nota: É viável utilizar os planos gratuitos destas plataformas, desde que seja SEMPRE removida a marca de água dos conteúdos gerados.
* Horários de publicação: Respeitar com rigor as janelas temporais de acordo com o país pretendido.
* Contextualização visual: Incluir nos vídeos elementos visuais como a bandeira do país de destino (em roupas, acessórios ou cenário) para acelerar o mapeamento de relevância geográfica pelo algoritmo.
* Métrica de diagnóstico: Se o alcance dos Reels ficar estagnado entre 100 e 500 visualizações, ou o conteúdo carece de qualidade ou a conta não foi devidamente preparada.

3. DICAS BÔNUS
* Constância horária: Definir um horário padrão para publicar os Reels e manter essa regularidade diária.
* Picos de tráfego: Compreender os horários com maior volume de usuários online na plataforma no país pretendido.
* Áudios contextuais: Usar áudios e faixas que estejam em sintonia com a temática do conteúdo.
* Modelagem estratégica: Identificar formatos e estilos de vídeos já validados que funcionem em perfis de modelos de referência desse mercado.
* Variação de texto: Alterar sempre a legenda de uma publicação para a seguinte, NUNCA repetindo descrições idênticas.
* Canal complementar: Integrar a atividade da conta com a rede Threads para reforçar o alcance.

4. DIRETRIZES E REGRAS DE SEGURANÇA
* Hashtags: Não é necessário nem aconselhável utilizar.
* Compra de audiência: NUNCA comprar seguidores.
* Vendas por DM: Não responder a mensagens diretas tentando forçar conversões imediatas de venda.
* Cuidado com a linguagem: Vigiar atentamente o vocabulário empregue em legendas e conversas para prevenir suspensões.`;

  const handleCopiarRoteiro = (customTexto?: string | any) => {
    const texto = (typeof customTexto === 'string' && customTexto) 
      ? customTexto 
      : (esteiraEfetiva === 'TORRE_CHAMPAGNE' 
          ? textoRoteiroTorreChampagne 
          : (esteiraEfetiva === 'NORMAL' 
              ? textoRoteiroNormal 
              : textoRoteiroAcelerado));
    navigator.clipboard.writeText(texto);
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
                  {/* Banner de Status */}
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
                        A conta de <strong>@{modelo.username}</strong> já passou pelo período crítico de maturação. Siga a rotina operacional regular de publicações, follow/unfollow e engajamento:
                      </p>
                    </div>
                  </div>

                  {/* PAINEL DE CONTABILIDADE: FOLLOW & UNFOLLOW DO DIA */}
                  <div style={{
                    background: 'linear-gradient(180deg, #161B22 0%, #0F1318 100%)',
                    border: '1px solid #30363D',
                    borderRadius: 14,
                    padding: '18px 20px',
                    marginBottom: 20,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                      flexWrap: 'wrap',
                      gap: 10
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          background: 'rgba(0, 240, 255, 0.12)',
                          border: '1px solid rgba(0, 240, 255, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#00F0FF'
                        }}>
                          <UserPlus size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#F0F6FC' }}>
                            Controle de Follow & Unfollow de Hoje
                          </div>
                          <div style={{ fontSize: 11, color: '#8B949E' }}>
                            Calculado automaticamente a cada ciclo de 15 min da Meta API
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={carregarFollowStats}
                        disabled={followStats.loading}
                        title="Atualizar leituras de hoje"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid #30363D',
                          borderRadius: 6,
                          padding: '4px 10px',
                          color: '#8B949E',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <RefreshCw size={12} className={followStats.loading ? 'animate-spin' : ''} />
                        {followStats.loading ? 'Atualizando...' : 'Atualizar'}
                      </button>
                    </div>

                    {/* GRID DE CARDS COM AS MÉTRICAS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                      {/* Bloco Follows Hoje */}
                      <div style={{
                        background: 'rgba(0, 255, 102, 0.05)',
                        border: '1px solid rgba(0, 255, 102, 0.25)',
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#00FF66', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Follows Realizados
                          </span>
                          <UserPlus size={14} color="#00FF66" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 26, fontWeight: 900, color: '#F0F6FC' }}>
                            {followStats.follows_dia}
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#8B949E', display: 'flex', alignItems: 'center', gap: 4 }}>
                            /
                            {editandoMeta ? (
                              <input
                                type="number"
                                value={novaMetaInput}
                                onChange={e => setNovaMetaInput(e.target.value)}
                                onBlur={() => handleSalvarMeta(Number(novaMetaInput))}
                                onKeyDown={e => { if (e.key === 'Enter') handleSalvarMeta(Number(novaMetaInput)); }}
                                style={{
                                  width: 44,
                                  background: '#0D1117',
                                  border: '1px solid #00F0FF',
                                  borderRadius: 4,
                                  color: '#fff',
                                  fontSize: 13,
                                  textAlign: 'center',
                                  padding: '2px 4px'
                                }}
                                autoFocus
                              />
                            ) : (
                              <span
                                onClick={() => setEditandoMeta(true)}
                                title="Clique para alterar a meta"
                                style={{ cursor: 'pointer', borderBottom: '1px dashed #8B949E' }}
                              >
                                {followStats.meta_dia}
                              </span>
                            )}
                          </span>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <div style={{
                            width: '100%',
                            height: 6,
                            background: 'rgba(255, 255, 255, 0.08)',
                            borderRadius: 3,
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${Math.min(100, (followStats.follows_dia / (followStats.meta_dia || 1)) * 100)}%`,
                              height: '100%',
                              background: followStats.follows_dia >= followStats.meta_dia ? '#00FF66' : 'linear-gradient(90deg, #00F0FF, #00FF66)',
                              borderRadius: 3,
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#8B949E' }}>
                            <span>
                              {followStats.follows_dia >= followStats.meta_dia
                                ? '🎯 Meta atingida!'
                                : `Faltam ${Math.max(0, followStats.meta_dia - followStats.follows_dia)}`}
                            </span>
                            <span style={{ fontWeight: 700, color: followStats.follows_dia >= followStats.meta_dia ? '#00FF66' : '#00F0FF' }}>
                              {Math.round((followStats.follows_dia / (followStats.meta_dia || 1)) * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bloco Unfollows Hoje */}
                      <div style={{
                        background: 'rgba(255, 170, 0, 0.05)',
                        border: '1px solid rgba(255, 170, 0, 0.25)',
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#FFAA00', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Unfollows Detectados
                          </span>
                          <UserMinus size={14} color="#FFAA00" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 26, fontWeight: 900, color: '#F0F6FC' }}>
                            {followStats.unfollows_dia}
                          </span>
                          <span style={{ fontSize: 12, color: '#8B949E' }}>
                            contas
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#8B949E', marginTop: 8 }}>
                          {followStats.unfollows_dia > 0
                            ? `📉 ${followStats.unfollows_dia} unfollow(s) contabilizado(s) hoje`
                            : 'Nenhum unfollow registrado hoje'}
                        </div>
                      </div>

                      {/* Bloco Seguindo Atual */}
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid #30363D',
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Seguindo Atual
                          </span>
                          <Users size={14} color="#8B949E" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 26, fontWeight: 900, color: '#F0F6FC' }}>
                            {followStats.seguindo_atual}
                          </span>
                          <span style={{ fontSize: 12, color: '#8B949E' }}>
                            seguindo
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#8B949E', marginTop: 8 }}>
                          Base às 00h: {followStats.seguindo_baseline} contas
                        </div>
                      </div>
                    </div>

                    {/* BOTÃO E LISTA DE HISTÓRICO DE LEITURAS DE HOJE */}
                    {followStats.historico_hoje && followStats.historico_hoje.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setMostrarHistoricoLeituras(!mostrarHistoricoLeituras)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#00F0FF',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: 0
                          }}
                        >
                          {mostrarHistoricoLeituras ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {mostrarHistoricoLeituras ? 'Ocultar leituras de hoje' : `Ver histórico de leituras de hoje (${followStats.historico_hoje.length} registros)`}
                        </button>

                        {mostrarHistoricoLeituras && (
                          <div style={{
                            marginTop: 10,
                            maxHeight: 180,
                            overflowY: 'auto',
                            background: '#0D1117',
                            border: '1px solid #21262D',
                            borderRadius: 8,
                            padding: '8px 12px'
                          }}>
                            {followStats.historico_hoje.map((h: any, idx: number) => {
                              const isPos = h.delta > 0;
                              const isNeg = h.delta < 0;
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '5px 0',
                                    borderBottom: idx < followStats.historico_hoje.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                                    fontSize: 11
                                  }}
                                >
                                  <span style={{ color: '#8B949E', fontFamily: 'monospace' }}>
                                    {h.hora} {h.tipo === 'baseline' ? '(Base Inicial)' : ''}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ color: '#F0F6FC' }}>
                                      {h.seguindo} seguindo
                                    </span>
                                    {h.tipo !== 'baseline' && (
                                      <span style={{
                                        fontWeight: 700,
                                        color: isPos ? '#00FF66' : isNeg ? '#FFAA00' : '#8B949E',
                                        minWidth: 70,
                                        textAlign: 'right'
                                      }}>
                                        {isPos ? `+${h.delta} follow` : isNeg ? `${h.delta} unfollow` : 'sem variação'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* LISTA DE TAREFAS DIÁRIAS (COM FOLLOW & UNFOLLOW INCLUSOS) */}
                  {(() => {
                    const tarefasDiarias = [
                      {
                        id: 'aq_follow',
                        titulo: `Follow Diário de Leads (${followStats.follows_dia}/${followStats.meta_dia})`,
                        desc: `Seguir perfis de leads qualificados do nicho. Marcador atual: ${followStats.follows_dia} seguidos de ${followStats.meta_dia} planejados hoje.`,
                        badge: `${followStats.follows_dia}/${followStats.meta_dia}`,
                        destaqueFollow: true
                      },
                      {
                        id: 'aq_unfollow',
                        titulo: `Unfollow / Limpeza de Contas (${followStats.unfollows_dia} hoje)`,
                        desc: `Deixar de seguir contas inativas ou que não interagiram para manter a proporção da conta limpa.`,
                        badge: followStats.unfollows_dia > 0 ? `${followStats.unfollows_dia} unfollows` : undefined,
                        destaqueUnfollow: true
                      },
                      { id: 'aq_1', titulo: 'Verificar Comentários e Directs', desc: 'Responder leads pendentes na Central de Respostas para manter o índice de resposta alto.' },
                      { id: 'aq_2', titulo: 'Conferir Agendamentos de Posts & Reels', desc: 'Garantir pelo menos 1 a 2 Reels e 1 Feed programados para os horários de pico.' },
                      { id: 'aq_3', titulo: 'Publicação de Stories Diários', desc: 'Postar sequência de Stories (enquetes, bastidores e chamadas para ação).' },
                      { id: 'aq_4', titulo: 'Interação Orgânica do Dia', desc: 'Consumir conteúdo por 15 minutos e interagir organicamente no nicho.' },
                      { id: 'aq_5', titulo: 'Acompanhar Tração e Métricas', desc: 'Verificar a aba Análise para acompanhar views e novos seguidores.' },
                    ];

                    const concluidasCount = tarefasDiarias.filter(t => Boolean(tarefasConcluidas[t.id])).length;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Barra de Status e Ações do Ciclo Diário */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 10,
                          padding: '0 2px',
                          marginTop: 4
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Calendar size={15} color="#00F0FF" />
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#C9D1D9' }}>
                              Tarefas Diárias de Hoje <span style={{ color: '#00F0FF', fontWeight: 800 }}>({getTodayDisplay()})</span>
                            </span>
                            <span style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 10,
                              background: concluidasCount === tarefasDiarias.length ? 'rgba(0, 255, 102, 0.2)' : 'rgba(0, 255, 102, 0.08)',
                              border: `1px solid ${concluidasCount === tarefasDiarias.length ? 'rgba(0, 255, 102, 0.5)' : 'rgba(0, 255, 102, 0.25)'}`,
                              color: '#00FF66',
                              fontWeight: 700
                            }}>
                              {concluidasCount}/{tarefasDiarias.length} concluídas
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={handleZerarTarefasDiarias}
                            title="Zerar status das tarefas diárias de hoje"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '5px 11px',
                              background: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid #30363D',
                              borderRadius: 6,
                              color: '#8B949E',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.color = '#F85149';
                              e.currentTarget.style.borderColor = 'rgba(248, 81, 73, 0.4)';
                              e.currentTarget.style.background = 'rgba(248, 81, 73, 0.1)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.color = '#8B949E';
                              e.currentTarget.style.borderColor = '#30363D';
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                            }}
                          >
                            <RotateCcw size={12} />
                            Zerar tarefas de hoje
                          </button>
                        </div>

                        {tarefasDiarias.map(t => {
                          const checked = Boolean(tarefasConcluidas[t.id]);
                          return (
                            <div
                              key={t.id}
                              onClick={() => toggleCheck(t.id)}
                              style={{
                                background: checked
                                  ? 'rgba(0, 255, 102, 0.05)'
                                  : t.destaqueFollow
                                  ? 'rgba(0, 240, 255, 0.03)'
                                  : '#161B22',
                                border: `1px solid ${
                                  checked
                                    ? 'rgba(0, 255, 102, 0.35)'
                                    : t.destaqueFollow
                                    ? 'rgba(0, 240, 255, 0.25)'
                                    : '#30363D'
                                }`,
                                borderRadius: 10,
                                padding: '14px 18px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: 14,
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
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

                              {t.badge && (
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  background: t.destaqueFollow ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 170, 0, 0.15)',
                                  border: `1px solid ${t.destaqueFollow ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 170, 0, 0.4)'}`,
                                  color: t.destaqueFollow ? '#00F0FF' : '#FFAA00',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {t.badge}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
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
                      onClick={() => handleCopiarRoteiro(textoRoteiroAcelerado)}
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
                <div>
                  {/* Banner de Título com Botão de Copiar */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(88, 166, 255, 0.12), rgba(0, 240, 255, 0.15))',
                    border: '1px solid rgba(88, 166, 255, 0.35)',
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
                        <Layers size={18} color="#58A6FF" />
                        <h4 style={{ fontSize: 16, fontWeight: 800, color: '#58A6FF', margin: 0 }}>
                          ESTEIRA DE AQUECIMENTO NORMAL (CRONOGRAMA PROGRESSIVO)
                        </h4>
                      </div>
                      <p style={{ fontSize: 12, color: '#C9D1D9', margin: '4px 0 0 0' }}>
                        Cronograma diário de 9+ dias, produção com IA e diretrizes algorítmicas para @{modelo.username}.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopiarRoteiro(textoRoteiroNormal)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 14px',
                        background: copiado ? '#238636' : 'rgba(88, 166, 255, 0.15)',
                        border: `1px solid ${copiado ? '#2ea043' : 'rgba(88, 166, 255, 0.4)'}`,
                        borderRadius: 8,
                        color: copiado ? '#fff' : '#58A6FF',
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

                  {/* PRÉ-REQUISITO INICIAL CRÍTICO */}
                  <div style={{
                    background: 'rgba(255, 170, 0, 0.08)',
                    border: '1px solid rgba(255, 170, 0, 0.35)',
                    borderRadius: 12,
                    padding: '16px 20px',
                    marginBottom: 18
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Clock size={16} color="#FFAA00" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#FFAA00', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        PRÉ-REQUISITO INICIAL (SETUP DE CRIAÇÃO)
                      </span>
                    </div>

                    {(() => {
                      const id = 'an_pre_molho';
                      const checked = Boolean(tarefasConcluidas[id]);
                      return (
                        <div
                          onClick={() => toggleCheck(id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            background: checked ? 'rgba(0, 255, 102, 0.08)' : 'rgba(0, 0, 0, 0.25)',
                            border: `1px solid ${checked ? 'rgba(0, 255, 102, 0.35)' : 'rgba(255, 170, 0, 0.25)'}`,
                            borderRadius: 8,
                            padding: '10px 14px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          <span style={{ color: checked ? '#00FF66' : '#FFAA00' }}>
                            {checked ? <CheckSquare size={18} /> : <Square size={18} />}
                          </span>
                          <div>
                            <span style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: checked ? '#00FF66' : '#F0F6FC',
                              textDecoration: checked ? 'line-through' : 'none'
                            }}>
                              Deixar a conta durante pelo menos 24 horas "de molho" logo após a criação
                            </span>
                            <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>
                              Não realizar disparos, edições massivas ou ações agressivas nas primeiras 24h para evitar flag do algoritmo.
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* BLOCO 1: CRONOGRAMA DIÁRIO (DIAS 1 A 9+) */}
                  <div style={{
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: 12,
                    padding: '18px 20px',
                    marginBottom: 18
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <Calendar size={16} color="#58A6FF" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#58A6FF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        1. CRONOGRAMA DIÁRIO DE AQUECIMENTO (INSTAGRAM)
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        {
                          dia: 'Dia 1',
                          titulo: 'Foto de perfil e Biografia (SEM LINK NA BIO)',
                          sub: 'Configuração dos pilares de identidade da modelo',
                          itens: [
                            { id: 'an_d1_1', texto: 'Indicar na biografia que é brasileira e mora no país pretendido' },
                            { id: 'an_d1_2', texto: 'Indicar a idade da modelo' },
                            { id: 'an_d1_3', texto: 'Inserir uma "frase de criadora de conteúdo/blogueira"' },
                            { id: 'an_d1_4', texto: 'NÃO colocar nenhum link na bio nesta fase inicial' },
                          ]
                        },
                        {
                          dia: 'Dia 2',
                          titulo: '2 a 3 publicações no Feed (Carrossel com Música)',
                          sub: 'Criar relacionamento com a plataforma e ativar recomendação algorítmica',
                          destaque: 'Carrosséis têm a 2ª maior recomendação da plataforma (apenas atrás dos Reels) e contam com rotação automática de imagem caso o usuário não interaja na primeira exibição.',
                          itens: [
                            { id: 'an_d2_1', texto: 'Publicar 2 a 3 posts no Feed priorizando formato de carrossel COM MÚSICA do país de destino' }
                          ]
                        },
                        {
                          dia: 'Dia 3',
                          titulo: '2 a 3 publicações no Feed + Interações Qualificadas',
                          sub: 'Treinar o algoritmo com páginas e público do nicho',
                          itens: [
                            { id: 'an_d3_1', texto: 'Publicar 2 a 3 posts no Feed' },
                            { id: 'an_d3_2', texto: 'Interagir em publicações de páginas ou criadores do país pretendido (estética/idade semelhante)' },
                            { id: 'an_d3_3', texto: 'Prestar atenção rigorosa ao fuso horário do país selecionado ao agendar ou publicar' }
                          ]
                        },
                        {
                          dia: 'Dia 4',
                          titulo: '2 a 3 publicações no Feed + Interações + Início de Follow/Unfollow',
                          sub: 'Primeiras conexões ativas humanizadas',
                          itens: [
                            { id: 'an_d4_1', texto: 'Publicar 2 a 3 posts no Feed + continuar interações' },
                            { id: 'an_d4_2', texto: 'Follow seletivo: Seguir exclusivamente perfis humanizados e com Stories ativos' }
                          ]
                        },
                        {
                          dia: 'Dia 5',
                          titulo: 'Feed + Interações + Follow/Unfollow + Story Lifestyle + 1 Reels',
                          sub: 'Primeiro Reels publicado e início dos Stories diários',
                          destaque: 'Dica Opcional: Promover 3 publicações do feed com R$ 30,00 cada durante 3 dias (sem Reels), segmentando para o país pretendido para impulsionar o envolvimento inicial (foco em tração e não em vendas diretas).',
                          itens: [
                            { id: 'an_d5_1', texto: 'Publicar 2 a 3 posts no Feed + interações + follow/unfollow' },
                            { id: 'an_d5_2', texto: 'Publicar 1 Reels + 1 Story Lifestyle' },
                            { id: 'an_d5_3', texto: '(Opcional) Promover 3 publicações do feed (R$ 30/dia por 3 dias segmentado no país)' }
                          ]
                        },
                        {
                          dia: 'Dia 6',
                          titulo: 'Feed + Interações + Follow/Unfollow + 1 Reels + Story Lifestyle',
                          sub: 'Consolidação da grelha inicial de 9 a 12 publicações no Feed',
                          itens: [
                            { id: 'an_d6_1', texto: 'Alcançar e consolidar grelha inicial de 9 a 12 publicações no Feed' },
                            { id: 'an_d6_2', texto: 'Publicar 1 Reels + Story Lifestyle + interações e follow' }
                          ]
                        },
                        {
                          dia: 'Dia 7',
                          titulo: 'Interações + Follow/Unfollow + 1 Reels + Story Lifestyle',
                          sub: 'Ritmo contínuo e consolidação de relevância orgânica',
                          itens: [
                            { id: 'an_d7_1', texto: 'Publicar 1 Reels diário + Story Lifestyle + interações e follow seletivo' }
                          ]
                        },
                        {
                          dia: 'Dia 8',
                          titulo: 'Interações + Follow/Unfollow + 2 a 3 Reels + Story Lifestyle',
                          sub: 'Intensificação cuidadosa sem acionar filtros de SPAM',
                          destaque: 'Não exagerar no número de Reels por dia; agir de forma natural como uma influenciadora real. Publicações em massa ativam alertas de segurança e filtros de SPAM, prejudicando o perfil.',
                          itens: [
                            { id: 'an_d8_1', texto: 'Publicar de 2 a 3 Reels no dia + Story Lifestyle + interações + follow/unfollow' }
                          ]
                        },
                        {
                          dia: 'Dia 9+',
                          titulo: 'Dia 9 em diante – Repetição Contínua do Ciclo',
                          sub: 'Transição estratégica de Feed para Reels e Stories',
                          itens: [
                            { id: 'an_d9_1', texto: 'Possibilidade de parar com publicações no Feed e concentrar esforços exclusivamente em Reels, Stories e interações' }
                          ]
                        }
                      ].map(bloco => (
                        <div
                          key={bloco.dia}
                          style={{
                            background: 'rgba(0, 0, 0, 0.2)',
                            border: '1px solid #21262D',
                            borderRadius: 10,
                            padding: '12px 14px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 800,
                                background: 'rgba(88, 166, 255, 0.15)',
                                color: '#58A6FF',
                                padding: '2px 7px',
                                borderRadius: 5,
                                border: '1px solid rgba(88, 166, 255, 0.3)'
                              }}>
                                {bloco.dia}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#F0F6FC' }}>
                                {bloco.titulo}
                              </span>
                            </div>
                          </div>

                          {bloco.destaque && (
                            <div style={{
                              fontSize: 11,
                              color: '#79C0FF',
                              background: 'rgba(56, 139, 253, 0.1)',
                              borderLeft: '3px solid #58A6FF',
                              padding: '6px 10px',
                              borderRadius: '0 6px 6px 0',
                              margin: '6px 0 8px 0',
                              lineHeight: 1.4
                            }}>
                              💡 {bloco.destaque}
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                            {bloco.itens.map(subItem => {
                              const checked = Boolean(tarefasConcluidas[subItem.id]);
                              return (
                                <div
                                  key={subItem.id}
                                  onClick={() => toggleCheck(subItem.id)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    background: checked ? 'rgba(0, 255, 102, 0.05)' : 'transparent',
                                    padding: '5px 8px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                  }}
                                >
                                  <span style={{ color: checked ? '#00FF66' : '#8B949E' }}>
                                    {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                                  </span>
                                  <span style={{
                                    fontSize: 12,
                                    color: checked ? '#00FF66' : '#C9D1D9',
                                    textDecoration: checked ? 'line-through' : 'none',
                                    lineHeight: 1.35
                                  }}>
                                    {subItem.texto}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* BLOCO 2: PRODUÇÃO DE CONTEÚDO & FERRAMENTAS DE IA */}
                  <div style={{
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: 12,
                    padding: '18px 20px',
                    marginBottom: 18
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Video size={16} color="#A371F7" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#A371F7', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        2. PRODUÇÃO DE CONTEÚDO & FERRAMENTAS DE IA
                      </span>
                    </div>

                    {/* BOTÕES DE ACESSO RÁPIDO ÀS FERRAMENTAS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
                      {[
                        { nome: 'Kling AI', url: 'https://klingai.com/', desc: 'Geração de vídeos ultrarrealistas' },
                        { nome: 'Pixverse AI', url: 'https://app.pixverse.ai/', desc: 'Vídeos estilizados & lifestyle' },
                        { nome: 'Remaker AI (Face Swap)', url: 'https://remaker.ai/face-swap-free/'.replace('.ai/face-swap-free/', '.ai/face-swap-free'), desc: 'Troca de rosto gratuita' },
                      ].map(f => (
                        <a
                          key={f.nome}
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: 'rgba(163, 113, 247, 0.08)',
                            border: '1px solid rgba(163, 113, 247, 0.3)',
                            borderRadius: 8,
                            padding: '10px 12px',
                            textDecoration: 'none',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#A371F7';
                            e.currentTarget.style.background = 'rgba(163, 113, 247, 0.15)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgba(163, 113, 247, 0.3)';
                            e.currentTarget.style.background = 'rgba(163, 113, 247, 0.08)';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#A371F7' }}>{f.nome}</span>
                            <ExternalLink size={12} color="#A371F7" />
                          </div>
                          <span style={{ fontSize: 10, color: '#8B949E', marginTop: 4 }}>{f.desc}</span>
                        </a>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { id: 'an_prod_1', texto: 'Remoção de marca d’água: Planos gratuitos são viáveis, desde que SEMPRE seja removida a marca d\'água de todos os conteúdos.' },
                        { id: 'an_prod_2', texto: 'Horários de publicação: Respeitar com rigor as janelas temporais de acordo com o país pretendido.' },
                        { id: 'an_prod_3', texto: 'Contextualização visual: Incluir elementos visuais como a bandeira do país de destino (roupas, acessórios ou cenário) para acelerar relevância geográfica.' },
                        { id: 'an_prod_4', texto: 'Métrica de diagnóstico: Se o alcance dos Reels estagnar entre 100 e 500 visualizações, ou o conteúdo carece de qualidade ou a conta não foi devidamente preparada.' },
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
                              background: checked ? 'rgba(0, 255, 102, 0.05)' : 'rgba(0, 0, 0, 0.2)',
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
                              color: checked ? '#00FF66' : '#C9D1D9',
                              textDecoration: checked ? 'line-through' : 'none',
                              lineHeight: 1.35
                            }}>
                              {item.texto}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* BLOCO 3: DICAS BÔNUS ESTRATÉGICAS */}
                  <div style={{
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: 12,
                    padding: '18px 20px',
                    marginBottom: 18
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Sparkles size={16} color="#E3B341" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#E3B341', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        3. DICAS BÔNUS DE ALTA PERFORMANCE
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
                      {[
                        { id: 'an_b1', titulo: 'Constância horária', desc: 'Definir um horário padrão para publicar os Reels e manter essa regularidade diária.' },
                        { id: 'an_b2', titulo: 'Picos de tráfego', desc: 'Compreender os horários com maior volume de usuários online na plataforma no país pretendido.' },
                        { id: 'an_b3', titulo: 'Áudios contextuais', desc: 'Usar áudios e faixas que estejam em sintonia com a temática do conteúdo.' },
                        { id: 'an_b4', titulo: 'Modelagem estratégica', desc: 'Identificar formatos e estilos de vídeos já validados em perfis de modelos de referência.' },
                        { id: 'an_b5', titulo: 'Variação de texto', desc: 'Alterar sempre a legenda de uma publicação para a seguinte, NUNCA repetindo descrições idênticas.' },
                        { id: 'an_b6', titulo: 'Canal complementar (Threads)', desc: 'Integrar a atividade da conta com a rede Threads para reforçar o alcance.' },
                      ].map(item => {
                        const checked = Boolean(tarefasConcluidas[item.id]);
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleCheck(item.id)}
                            style={{
                              background: checked ? 'rgba(0, 255, 102, 0.05)' : 'rgba(0, 0, 0, 0.2)',
                              border: `1px solid ${checked ? 'rgba(0, 255, 102, 0.3)' : '#21262D'}`,
                              borderRadius: 8,
                              padding: '10px 12px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ color: checked ? '#00FF66' : '#8B949E' }}>
                                {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                              </span>
                              <span style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: checked ? '#00FF66' : '#F0F6FC',
                                textDecoration: checked ? 'line-through' : 'none'
                              }}>
                                {item.titulo}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#8B949E', paddingLeft: 24, lineHeight: 1.35 }}>
                              {item.desc}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* BLOCO 4: DIRETRIZES E REGRAS DE SEGURANÇA (BLINDAGEM CONTRA BAN) */}
                  <div style={{
                    background: 'linear-gradient(180deg, rgba(248, 81, 73, 0.08) 0%, rgba(22, 27, 34, 0.9) 100%)',
                    border: '1.5px solid rgba(248, 81, 73, 0.4)',
                    borderRadius: 12,
                    padding: '18px 20px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <AlertOctagon size={18} color="#F85149" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#F85149', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        4. DIRETRIZES E REGRAS DE SEGURANÇA (BLINDAGEM CONTRA BAN)
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                      {[
                        { id: 'an_s1', titulo: '🚫 Hashtags', desc: 'Não é necessário nem aconselhável utilizar. Evite poluir legendas com tags genéricas.' },
                        { id: 'an_s2', titulo: '🚫 Compra de audiência', desc: 'NUNCA comprar seguidores. Destrói o engajamento e ativa penalidades algorítmicas permanentes.' },
                        { id: 'an_s3', titulo: '🚫 Vendas por DM direta', desc: 'Não responder a mensagens diretas tentando forçar conversões imediatas de venda.' },
                        { id: 'an_s4', titulo: '⚠️ Cuidado com vocabulário', desc: 'Vigiar atentamente o vocabulário empregue em legendas e conversas para prevenir suspensões.' },
                      ].map(item => {
                        const checked = Boolean(tarefasConcluidas[item.id]);
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleCheck(item.id)}
                            style={{
                              background: checked ? 'rgba(0, 255, 102, 0.06)' : 'rgba(0, 0, 0, 0.3)',
                              border: `1px solid ${checked ? 'rgba(0, 255, 102, 0.3)' : 'rgba(248, 81, 73, 0.25)'}`,
                              borderRadius: 8,
                              padding: '10px 12px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ color: checked ? '#00FF66' : '#F85149' }}>
                                {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                              </span>
                              <span style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: checked ? '#00FF66' : '#F0F6FC',
                                textDecoration: checked ? 'line-through' : 'none'
                              }}>
                                {item.titulo}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#8B949E', paddingLeft: 24, lineHeight: 1.35 }}>
                              {item.desc}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* CASO: AQUECIMENTO TORRE DE CHAMPAGNE */}
              {situacaoEfetiva === 'EM_AQUECIMENTO' && esteiraEfetiva === 'TORRE_CHAMPAGNE' && (
                <div>
                  {/* Banner de Título com Botão de Copiar */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(227, 179, 65, 0.12), rgba(245, 158, 11, 0.15))',
                    border: '1px solid rgba(227, 179, 65, 0.35)',
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
                        <Wine size={18} color="#E3B341" />
                        <h4 style={{ fontSize: 16, fontWeight: 800, color: '#E3B341', margin: 0 }}>
                          ESTEIRA COM TORRE DE CHAMPAGNE
                        </h4>
                      </div>
                      <p style={{ fontSize: 12, color: '#C9D1D9', margin: '4px 0 0 0' }}>
                        Estratégia de 3 Fases: criação, maturação de 9 feeds e transbordo de tráfego qualificado para @{modelo.username}.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopiarRoteiro(textoRoteiroTorreChampagne)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 14px',
                        background: copiado ? '#238636' : 'rgba(227, 179, 65, 0.15)',
                        border: `1px solid ${copiado ? '#2ea043' : 'rgba(227, 179, 65, 0.4)'}`,
                        borderRadius: 8,
                        color: copiado ? '#fff' : '#E3B341',
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

                  {/* FASE 1 (DIA 1) */}
                  <div style={{
                    background: '#161B22',
                    border: '1px solid rgba(227, 179, 65, 0.3)',
                    borderRadius: 12,
                    padding: '18px 20px',
                    marginBottom: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Calendar size={16} color="#E3B341" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#E3B341', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        FASE 1 (DIA 1): CRIAÇÃO & CALIBRAÇÃO INICIAL
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { id: 'tc_f1_1', texto: 'Cria a conta com e-mail' },
                        { id: 'tc_f1_2', texto: 'Insere foto do perfil (de preferência foto de cor ou anime/caricatura com IA)' },
                        { id: 'tc_f1_3', texto: 'Poste uma foto sua no feed: 10 a 30 min depois de postar, arquive.' },
                        { id: 'tc_f1_4', texto: 'Insere a BIO - bio deve ser totalmente minimalista e NÃO apelativa.' },
                        { id: 'tc_f1_5', texto: 'Siga 5 contas de modelo HOT' },
                        { id: 'tc_f1_6', texto: 'Use a conta por pelo menos 5 minutos na aba reels de forma HUMANIZADA (treine seu algoritmo, mostre interesse em modelos)' },
                        { id: 'tc_f1_7', texto: 'Faça o mesmo treinamento na aba explorar' },
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

                  {/* FASE 2 */}
                  <div style={{
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: 12,
                    padding: '18px 20px',
                    marginBottom: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Layers size={16} color="#00F0FF" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#00F0FF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        FASE 2: CONSTRUÇÃO DOS 9 FEEDS & ROTINA QUALIFICADA
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { id: 'tc_f2_1', texto: 'Você deve ter pelo menos 9 feeds e de preferência 80% deles carrosséis' },
                        { id: 'tc_f2_2', texto: 'Poste de 1 ao no máximo 2 por dia' },
                        { id: 'tc_f2_3', texto: 'Evite imagens com muita pele ou sedutoras ou roupas cor de pele' },
                        { id: 'tc_f2_4', texto: 'Evite imagens escuras' },
                        { id: 'tc_f2_5', texto: 'Jamais mostre muito de sua modelo (modelo linda, beleza que gere desejo sem mostrar nada)' },
                        { id: 'tc_f2_6', texto: 'Fixe os 3 melhores feeds que tenham uma identidade visual congruente' },
                        { id: 'tc_f2_7', texto: 'POST FEEDS até alcançar 9 e então pode parar' },
                        { id: 'tc_f2_8', texto: 'USE a conta HUMANIZADA de 5 a 15 minutos por dia a partir do dia 2, TODOS OS DIAS' },
                        { id: 'tc_f2_9', texto: 'Siga 5 contas de modelo e 2 contas de leads qualificados (possíveis compradores, com dinheiro, seguem poucas modelos e com story)' },
                        { id: 'tc_f2_10', texto: 'Aplique isso até que você siga pelo menos 100 modelos' },
                        { id: 'tc_f2_11', texto: 'A cada dia que passar aumente as contas que segue em 2 (ex: se seguiu 7, hoje pode 9). NUNCA passe de 12 contas por dia' },
                        { id: 'tc_f2_12', texto: 'Interessante fazer pausas... deixar 1 dia nesse intervalo sem seguir ninguém' },
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

                  {/* FASE 3 */}
                  <div style={{
                    background: 'linear-gradient(180deg, #161B22 0%, rgba(22, 27, 34, 0.7) 100%)',
                    border: '1.5px solid rgba(227, 179, 65, 0.4)',
                    borderRadius: 12,
                    padding: '18px 20px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Wine size={16} color="#E3B341" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#E3B341', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        FASE 3: CRIAR TORRE DE CHAMPAGNE (PONTO DE TRAÇÃO & TRANSBORDO)
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { id: 'tc_f3_1', texto: '🔒 Seu perfil precisa estar PRIVADO!!!' },
                        { id: 'tc_f3_2', texto: '📈 Alcançar entre 1k e 1.5k é o ponto de tração.' },
                        { id: 'tc_f3_3', texto: '🎯 Seus seguidores têm de ser qualificados (homens que se encaixam no nicho desejado):' },
                        { id: 'tc_f3_4', texto: '   ↳ Utilizando outras contas de Instagram caso você tenha' },
                        { id: 'tc_f3_5', texto: '   ↳ Usar TIK-TOK para transbordo e atração de leads qualificados' },
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
                              color: checked ? '#00FF66' : (item.id === 'tc_f3_1' ? '#FFAA00' : '#C9D1D9'),
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
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
