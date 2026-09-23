'use client';
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Eye } from 'lucide-react';

interface PontoViews {
  dia: string;
  views: number | null;
  seguidores: number | null;
}

const fmtDia = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const fmtNum = (n: number) => n.toLocaleString('pt-BR');

// Visualizações ganhas por dia do perfil, do primeiro dia coletado até hoje.
export default function GraficoViewsDiarias({ username }: { username: string }) {
  const [serie, setSerie] = useState<PontoViews[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setErro(null);
    fetch(`/api/anomalias/views-diarias?username=${encodeURIComponent(username)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (cancelado) return;
        if (!json.success) throw new Error(json.error || 'Falha ao carregar');
        setSerie(json.serie || []);
      })
      .catch(err => { if (!cancelado) setErro(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [username]);

  const comDado = serie.filter(p => p.views !== null) as { dia: string; views: number }[];
  const total = comDado.reduce((acc, p) => acc + p.views, 0);
  const media = comDado.length > 0 ? Math.round(total / comDado.length) : 0;
  const pico = comDado.reduce<{ dia: string; views: number } | null>((best, p) => (!best || p.views > best.views ? p : best), null);

  return (
    <div style={{ marginTop: 20, padding: 16, borderRadius: 12, border: '1px solid #30363D', background: 'rgba(13, 17, 23, 0.6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={16} color="#00F0FF" />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#E6EDF3', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Visualizações e seguidores por dia
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#8B949E' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#00F0FF', opacity: 0.6 }} /> Visualizações
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#F85149', opacity: 0.6 }} /> Seguidores
            </span>
          </span>
          {serie.length > 0 && (
            <span style={{ fontSize: 11, color: '#8B949E' }}>
              {fmtDia(serie[0].dia)} → {fmtDia(serie[serie.length - 1].dia)}
            </span>
          )}
        </div>
        {comDado.length > 0 && (
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#8B949E' }}>
            <span>Total <strong style={{ color: '#E6EDF3' }}>{fmtNum(total)}</strong></span>
            <span>Média/dia <strong style={{ color: '#E6EDF3' }}>{fmtNum(media)}</strong></span>
            {pico && <span>Pico <strong style={{ color: '#00F0FF' }}>{fmtNum(pico.views)}</strong> em {fmtDia(pico.dia)}</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E', fontSize: 12 }}>
          Carregando visualizações...
        </div>
      ) : erro ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171', fontSize: 12 }}>
          Erro ao carregar: {erro}
        </div>
      ) : comDado.length === 0 ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E', fontSize: 12, textAlign: 'center' }}>
          Sem dados de visualizações para este perfil.<br />
          (só perfis conectados via Meta API têm métricas diárias dos posts)
        </div>
      ) : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            {/* barGap -100%: as duas barras ocupam a mesma coluna, sobrepostas e semitransparentes */}
            <BarChart data={serie} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barGap="-100%">
              <CartesianGrid stroke="#21262D" vertical={false} />
              <XAxis dataKey="dia" tickFormatter={fmtDia} tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={false} minTickGap={12} />
              {/* Mesma escala para visualizações e seguidores (proposital, para comparar grandezas) */}
              <YAxis tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => fmtNum(v)} />
              <Tooltip
                cursor={{ fill: 'rgba(0, 240, 255, 0.06)' }}
                contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#E6EDF3', fontWeight: 700 }}
                labelFormatter={(l: any) => fmtDia(String(l))}
                formatter={(v: any, name: any) => [v === null || v === undefined ? 'sem coleta' : fmtNum(Number(v)), name]}
              />
              <Bar dataKey="views" name="Visualizações" fill="#00F0FF" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="seguidores" name="Seguidores" fill="#F85149" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
