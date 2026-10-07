'use client';
import React from 'react';
import { AlertTriangle, CheckCircle2, Info, Ban } from 'lucide-react';
import { classificarIntervalo, horaParaMinutos, type NivelJanela } from '@/lib/janelasHorario';

interface AvisoJanelaHorarioProps {
  modoHora: 'FIXA' | 'ALEATORIA' | 'VARIAR_MINUTOS';
  horaFixa: string;
  horaJanelaInicio: string;
  horaJanelaFim: string;
  variacaoMinutos: number;
}

const ESTILO: Record<NivelJanela, { cor: string; bg: string; borda: string; Icone: React.ElementType }> = {
  EVITE: { cor: '#F87171', bg: 'rgba(239, 68, 68, 0.10)', borda: 'rgba(239, 68, 68, 0.4)', Icone: Ban },
  CUIDADO: { cor: '#FBBF24', bg: 'rgba(245, 158, 11, 0.10)', borda: 'rgba(245, 158, 11, 0.4)', Icone: AlertTriangle },
  RECOMENDADO: { cor: '#34D399', bg: 'rgba(16, 185, 129, 0.10)', borda: 'rgba(16, 185, 129, 0.4)', Icone: CheckCircle2 },
  MELHOR: { cor: '#34D399', bg: 'rgba(16, 185, 129, 0.14)', borda: 'rgba(16, 185, 129, 0.55)', Icone: CheckCircle2 }
};

const fmt = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export default function AvisoJanelaHorario({
  modoHora,
  horaFixa,
  horaJanelaInicio,
  horaJanelaFim,
  variacaoMinutos
}: AvisoJanelaHorarioProps) {
  let inicio: number | null;
  let fim: number | null;

  if (modoHora === 'ALEATORIA') {
    inicio = horaParaMinutos(horaJanelaInicio);
    fim = horaParaMinutos(horaJanelaFim);
  } else {
    const base = horaParaMinutos(horaFixa);
    const margem = modoHora === 'VARIAR_MINUTOS' ? variacaoMinutos : 0;
    inicio = base === null ? null : (((base - margem) % 1440) + 1440) % 1440;
    fim = base === null ? null : (base + margem) % 1440;
  }

  if (inicio === null || fim === null) return null;

  const ehIntervalo = inicio !== fim;
  const { janelas, principal } = classificarIntervalo(inicio, fim);
  const textoHorario = ehIntervalo ? `${fmt(inicio)} – ${fmt(fim)}` : fmt(inicio);

  if (!principal) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: '7px 10px',
          borderRadius: 6,
          border: '1px solid #30363D',
          background: '#0D1117',
          fontSize: 10,
          color: '#8B949E',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
          lineHeight: 1.4
        }}
      >
        <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          {textoHorario} (Brasília) fica fora das janelas mapeadas — sem recomendação específica para esse horário.
        </span>
      </div>
    );
  }

  const estilo = ESTILO[principal.nivel];
  const Icone = estilo.Icone;

  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 6,
        border: `1px solid ${estilo.borda}`,
        background: estilo.bg,
        fontSize: 10,
        color: estilo.cor,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        lineHeight: 1.45
      }}
    >
      <Icone size={13} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {janelas.map(j => {
          const e = ESTILO[j.nivel];
          return (
            <div key={j.nivel} style={{ color: e.cor }}>
              <strong>
                {j.rotulo} ({j.intervaloBRT} BRT · {j.intervaloIST} Índia)
              </strong>
              {' — '}
              <span style={{ color: '#C9D1D9' }}>{j.impacto}</span>
            </div>
          );
        })}
        {ehIntervalo && janelas.length > 1 && (
          <div style={{ color: '#8B949E' }}>
            O intervalo {textoHorario} toca mais de uma faixa — o disparo pode cair em qualquer uma delas.
          </div>
        )}
        {ehIntervalo && janelas.length === 1 && (
          <div style={{ color: '#8B949E' }}>O intervalo {textoHorario} (Brasília) cai nessa faixa.</div>
        )}
        {!ehIntervalo && <div style={{ color: '#8B949E' }}>Horário {textoHorario} (Brasília).</div>}
      </div>
    </div>
  );
}
