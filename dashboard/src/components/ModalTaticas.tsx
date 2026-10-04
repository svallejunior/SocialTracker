"use client";
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Film, Repeat2, Archive } from 'lucide-react';

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
  },
  {
    icon: Archive,
    titulo: 'Arquivar ou Excluir POST',
    descricao: 'Arquivar ou excluir posts com desempenho ruim para manter o perfil limpo e coerente com o que funciona.',
  },
];

export default function ModalTaticas({ onClose }: { onClose: () => void }) {
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
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Táticas</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>
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
      </div>
    </div>,
    document.body
  );
}
