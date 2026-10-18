"use client";
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Film, Repeat2, Archive, ExternalLink } from 'lucide-react';

type Tatica = {
  icon: typeof Film;
  titulo: string;
  descricao: string;
  detalhes?: string[];
  recomendacao?: string;
};

const TATICAS: Tatica[] = [
  {
    icon: Film,
    titulo: 'Reels de teste',
    descricao: 'Publicar Reels de teste para medir o potencial de alcance de um formato, tema ou gancho antes de investir mais nele.',
    detalhes: [
      'Postar 4 Reels de teste por dia.',
      'Intervalo ideal de no mínimo 2h entre eles.',
      'Aumentar 2 Reels por dia, progressivamente.',
      'Nunca ultrapassar 20 Reels por dia.',
      'Intervalo mínimo obrigatório de 30 minutos entre eles.',
    ],
    recomendacao: 'Usar quando uma conta estiver flopada.',
  },
  {
    icon: Repeat2,
    titulo: 'Reciclagem de Reels',
    descricao: 'Reaproveitar Reels que tiveram bom desempenho, republicando-os para alcançar novamente a audiência.',
    detalhes: [
      'Separar o take validado.',
      'No dia seguinte, postar outro take até validar um novo.',
      'Se der errado, no terceiro dia postar o take validado.',
      'Testar novamente.',
      'Padrão de rotina: reciclar 1 vídeo antigo, 1 vídeo novo, reciclar 1 vídeo antigo (repetir).',
    ],
  },
  {
    icon: Archive,
    titulo: 'Arquivar ou Excluir POST',
    descricao: 'Arquivar ou excluir posts com desempenho ruim para manter o perfil limpo e coerente com o que funciona.',
  },
];

const LINKS = [
  { titulo: 'GERAR VIDEOS DE IMAGEM', url: 'https://bit.ly/4faEdBc' },
  { titulo: 'TRANSFER MOTION +18 // FUNDO DA IMAGEM', url: 'https://bit.ly/4yc0xTX' },
  { titulo: 'TRANSFER ECOMMERCE // FUNDO DO VIDEO', url: 'https://bit.ly/4i0Q9J3' },
  { titulo: 'LIP SYNC', url: 'https://bit.ly/4vhowy9' },
  { titulo: 'ROTAÇÃO 360°', url: 'https://bit.ly/44jxe46' },
  { titulo: 'CLONAR POSES', url: 'https://bit.ly/3R8BksD' },
  { titulo: 'Z IMAGE TURBO - GERAR IMAGENS FOTOREALISTAS', url: 'https://bit.ly/4vWUqRF' },
  { titulo: 'TROCA DE ROUPA E TROCA DE COR', url: 'https://bit.ly/4fuxgMJ' },
  { titulo: 'FACE SWAP', url: 'https://bit.ly/3TepspL' },
  { titulo: 'FICHA PERSONAGEM 8K', url: 'D:/projetos/prompt/CharacterSheet/index.html' },
  { titulo: 'FICHA PERSONAGEM 8K 2', url: 'D:/projetos/prompt/CharacterSheet/ficha-simples.html' },
  { titulo: 'FICHA ROSTO/CORPO', url: 'D:/projetos/prompt/CharacterSheet/fichas-rosto-corpo.html' }
];

type Nicho = { nome: string; descricao?: string; pros?: string; contras?: string };

const NICHOS: Nicho[] = [
  {
    nome: 'FRASES',
    descricao: 'Utilização de fotos ou vídeos com frases apenas... normalmente elas remetem para outro take. A intenção é que o lead fique lendo e aguardando a virada da ação após o tempo de gancho (3s).',
    pros: 'Viralização',
    contras: 'Atrai mais mulheres',
  },
  {
    nome: 'DANCINHA',
    descricao: 'Trata-se de motion control de movimentos de danças de pouca ação, mas sempre usando de atributos sensuais para obter atenção: seja roupa curta, apertada ou até marcando. Utilizar músicas e dancinhas da moda.',
    pros: 'Simples de fazer',
    contras: 'Repetitivo',
  },
  {
    nome: 'SENSUAL',
    descricao: 'Utilização dos mais diversos ganchos, mas sempre com o objetivo de mostrar o corpo e sensualizar. Usam das mais absurdas situações para segurar o público.',
    pros: 'Viraliza bem',
    contras: 'Risco de banimento; público pouco qualificado',
  },
  {
    nome: 'CHARADA',
    descricao: 'Utiliza a brecha de pouco QI do público para segurar a atenção na tentativa de raciocínio do mesmo em entender o que está ali.',
    pros: 'Retém atenção, então reverte em público',
    contras: 'Chato demais e retém inclusive mulheres',
  },
  {
    nome: 'MEME',
    descricao: 'Repete tudo que viraliza, seja trend, meme, etc.',
    pros: 'Alta recomendação',
    contras: 'Atrai mulheres; depende de demanda viral; às vezes é difícil de reproduzir',
  },
  {
    nome: 'BISCOITO',
    descricao: 'Resume-se apenas a mostrar a beleza da modelo... coisas simples, como se filmar em um espelho ou em um momento do dia a dia. O lead acha ela bonita e segue.',
    pros: 'Light, consistente e durador',
    contras: 'Mais difícil de viralizar',
  },
];

export default function ModalTaticas({ onClose }: { onClose: () => void }) {
  const [aba, setAba] = useState<'taticas' | 'links' | 'nicho'>('taticas');
  const [nichoSel, setNichoSel] = useState<string | null>(null);
  const nichoAtual = NICHOS.find((n) => n.nome === nichoSel);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0D1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
          width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', padding: 24,
          boxShadow: '0 0 30px rgba(56,139,253,0.2)', color: '#E6EDF3',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['taticas', 'Táticas'], ['links', 'Links'], ['nicho', 'Nicho']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setAba(id)}
                style={{
                  padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: aba === id ? '#388BFD' : 'transparent',
                  color: aba === id ? '#fff' : '#8B949E',
                }}
              >
                {label}
              </button>
            ))}
            <a
              href="https://pagamentos.137-131-202-56.sslip.io/admin"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14,
                border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#8B949E',
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              Pagamentos
              <ExternalLink size={13} />
            </a>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>
        {aba === 'nicho' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {NICHOS.map(({ nome }) => (
              <button
                key={nome}
                onClick={() => setNichoSel(nichoSel === nome ? null : nome)}
                style={{
                  padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 700, textAlign: 'left',
                  cursor: 'pointer', color: '#E6EDF3', background: '#161B22',
                  border: `1px solid ${nichoSel === nome ? '#388BFD' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {nome}
              </button>
            ))}
            {nichoAtual && (
              <div
                style={{
                  marginTop: 4, padding: 14, borderRadius: 10, fontSize: 13, lineHeight: 1.6,
                  background: '#161B22', border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {nichoAtual.descricao ? (
                  <>
                    <div style={{ color: '#8B949E' }}>{nichoAtual.descricao}</div>
                    {nichoAtual.pros && (
                      <div style={{ marginTop: 10 }}><strong style={{ color: '#3FB950' }}>PRÓS:</strong> {nichoAtual.pros}</div>
                    )}
                    {nichoAtual.contras && (
                      <div><strong style={{ color: '#F85149' }}>CONTRAS:</strong> {nichoAtual.contras}</div>
                    )}
                  </>
                ) : (
                  <div style={{ color: '#8B949E' }}>Descrição ainda não cadastrada para {nichoAtual.nome}.</div>
                )}
              </div>
            )}
          </div>
        ) : aba === 'links' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LINKS.map(({ titulo, url }) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '12px 14px', borderRadius: 10, textDecoration: 'none', color: '#E6EDF3',
                  background: '#161B22', border: '1px solid rgba(255,255,255,0.08)', fontSize: 13, fontWeight: 600,
                }}
              >
                <span>{titulo}</span>
                <ExternalLink size={16} color="#388BFD" style={{ flexShrink: 0 }} />
              </a>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TATICAS.map(({ icon: Icon, titulo, descricao, detalhes, recomendacao }) => (
              <div
                key={titulo}
                style={{
                  display: 'flex', gap: 14, padding: 14, borderRadius: 10,
                  background: '#161B22', border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Icon size={22} color="#388BFD" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{titulo}</div>
                  <div style={{ fontSize: 13, color: '#8B949E', lineHeight: 1.5 }}>{descricao}</div>
                  {detalhes && (
                    <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                      {detalhes.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  )}
                  {recomendacao && (
                    <div style={{ marginTop: 10, fontSize: 13, color: '#D29922', fontWeight: 600 }}>
                      Recomendação: {recomendacao}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
