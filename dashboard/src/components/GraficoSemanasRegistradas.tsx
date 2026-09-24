'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import type { RegistroAnalise } from './QuadroAnalisePerfil';

// Disparado pelo QuadroAnalisePerfil ao salvar/excluir uma semana, para o gráfico recarregar
export const EVENTO_ANALISE_SEMANAL = 'analise-semanal-alterada';

interface Modelo {
  username: string;
  seguidores?: number;
}

const fmtNum = (n: number) => Number(n || 0).toLocaleString('pt-BR');

// "AAAA-MM-DD" -> "DD/MM"
const fmtDia = (iso: string) => {
  const [, m, d] = String(iso || '').split('-');
  return d && m ? `${d}/${m}` : iso;
};

const tooltipStyle = {
  contentStyle: { backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#E6EDF3', fontWeight: 700 },
};

// Rótulo do eixo X = semana (Sáb a Sex); o tooltip mostra o período completo
const labelPeriodo = (_: any, payload: readonly any[]) => {
  const p = payload?.[0]?.payload;
  return p ? `${fmtDia(p.data_inicio)} a ${fmtDia(p.data_fim)}` : '';
};

function Painel({ titulo, cor, children }: { titulo: string; cor: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0D1117', border: '1px solid #21262D', borderRadius: 10, padding: '12px 12px 4px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: cor, marginBottom: 6, paddingLeft: 4 }}>{titulo}</div>
      <div style={{ width: '100%', height: 180 }}>{children}</div>
    </div>
  );
}

// Evolução semana a semana (dados de /api/analise) de uma das minhas contas
export default function GraficoSemanasRegistradas({ modelos }: { modelos: Modelo[] }) {
  const [escolhida, setEscolhida] = useState('');
  // Sem escolha explícita, mostra a primeira modelo da lista
  const username = escolhida || modelos[0]?.username || '';
  const [registros, setRegistros] = useState<RegistroAnalise[]>([]);
  const [loading, setLoading] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const recarregar = () => setVersao(v => v + 1);
    window.addEventListener(EVENTO_ANALISE_SEMANAL, recarregar);
    return () => window.removeEventListener(EVENTO_ANALISE_SEMANAL, recarregar);
  }, []);

  useEffect(() => {
    if (!username) return;
    let cancelado = false;
    setLoading(true);
    fetch(`/api/analise?username=${encodeURIComponent(username)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (!cancelado) setRegistros(json.success ? json.data || [] : []); })
      .catch(() => { if (!cancelado) setRegistros([]); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [username, versao]);

  const dados = useMemo(
    () =>
      registros
        .slice()
        .sort((a, b) => String(a.data_inicio).localeCompare(String(b.data_inicio)))
        .map(r => ({
          semana: fmtDia(r.data_inicio),
          data_inicio: r.data_inicio,
          data_fim: r.data_fim,
          visualizacoes: Number(r.visualizacoes) || 0,
          seguidores: Number(r.seguidores) || 0,
          interacoes: Number(r.interacoes) || 0,
          visitas_perfil: Number(r.visitas_perfil) || 0,
        })),
    [registros]
  );

  const eixoX = <XAxis dataKey="semana" stroke="#586069" tickLine={false} fontSize={11} />;
  const grade = <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>Histórico de Semanas Registradas</h3>
          <p style={{ color: '#8B949E', fontSize: 13, margin: '4px 0 0 0' }}>
            Evolução semana a semana (Sáb a Sex) dos dados registrados na Análise do Perfil.
          </p>
        </div>
        <select
          className="profile-select"
          value={username}
          onChange={e => setEscolhida(e.target.value)}
          style={{ margin: 0 }}
        >
          {modelos.map(m => (
            <option key={m.username} value={m.username}>@{m.username}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ color: '#8B949E', fontSize: 13, padding: 40, textAlign: 'center' }}>Carregando semanas...</div>
      ) : dados.length === 0 ? (
        <div style={{ color: '#8B949E', fontSize: 13, padding: 40, textAlign: 'center', border: '1px dashed #30363D', borderRadius: 10 }}>
          Nenhuma semana registrada para @{username}. Registre na Análise do Perfil acima.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          <Painel titulo="Visualizações" cor="#00F0FF">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                {grade}
                {eixoX}
                <YAxis stroke="#586069" tickLine={false} fontSize={11} width={56} tickFormatter={fmtNum} />
                <Tooltip {...tooltipStyle} labelFormatter={labelPeriodo} formatter={(v: any) => [fmtNum(v), 'Visualizações']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="visualizacoes" fill="#00F0FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Painel>

          <Painel titulo="Seguidores ganhos na semana" cor="#10B981">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                {grade}
                {eixoX}
                <YAxis stroke="#586069" tickLine={false} fontSize={11} width={56} tickFormatter={fmtNum} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={labelPeriodo}
                  formatter={(v: any) => [Number(v) > 0 ? `+${fmtNum(v)}` : fmtNum(v), 'Seguidores']}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <ReferenceLine y={0} stroke="#484F58" />
                <Bar dataKey="seguidores" radius={[4, 4, 0, 0]}>
                  {dados.map((d, i) => (
                    <Cell key={i} fill={d.seguidores < 0 ? '#F87171' : '#10B981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Painel>

          <Painel titulo="Interações e visitas ao perfil" cor="#FF007A">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                {grade}
                {eixoX}
                <YAxis stroke="#586069" tickLine={false} fontSize={11} width={56} tickFormatter={fmtNum} />
                <Tooltip {...tooltipStyle} labelFormatter={labelPeriodo} formatter={(v: any, name: any) => [fmtNum(v), name]} />
                <Line type="monotone" dataKey="interacoes" name="Interações" stroke="#FF007A" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="visitas_perfil" name="Visitas ao perfil" stroke="#E3B341" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Painel>
        </div>
      )}
    </div>
  );
}
