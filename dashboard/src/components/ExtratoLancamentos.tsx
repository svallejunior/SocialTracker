'use client';
import React from 'react';

interface ExtratoLancamentosProps {
  controleData: any[];
  onSelecionar: (lancamento: any, username: string) => void;
  onNovo: (username: string) => void;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// "AAAA-MM-DD" (com ou sem hora) -> "DD/MM/AAAA"
const fmtData = (s: string) => {
  const partes = String(s || '').split(' ')[0].split('T')[0].split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : s;
};

const ultimaData = (p: any) =>
  (Array.isArray(p.lancamentos) ? p.lancamentos : []).reduce(
    (max: string, l: any) => ((l.data_lancamento || '') > max ? l.data_lancamento : max),
    ''
  );

// Extrato de receitas e despesas por modelo (tabela `lancamentos`), com as vendas do CRM incluídas.
export default function ExtratoLancamentos({ controleData, onSelecionar, onNovo }: ExtratoLancamentosProps) {
  // Perfis com lançamento mais recente primeiro; sem lançamentos vão para o fim
  const perfis = controleData.slice().sort((a: any, b: any) => {
    const maxA = ultimaData(a);
    const maxB = ultimaData(b);
    if (maxA === '' && maxB !== '') return 1;
    if (maxB === '' && maxA !== '') return -1;
    return maxB.localeCompare(maxA);
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {perfis.map((p: any) => {
        const items: any[] = Array.isArray(p.lancamentos) ? p.lancamentos : [];
        const sortedItems = [...items].sort((a, b) => (b.data_lancamento || '').localeCompare(a.data_lancamento || ''));
        const saldo = items.reduce(
          (acc: number, l: any) => acc + (l.tipo === 'despesa' ? -Number(l.valor_brl) : Number(l.valor_brl)),
          0
        );

        return (
          <div key={`extrato-${p.username}`} style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
              <div style={{ fontWeight: 700, color: 'white' }}>@{p.username}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {items.length > 0 && (
                  <span title="Saldo (receitas − despesas)" style={{ fontSize: 12, fontWeight: 700, color: saldo < 0 ? '#FF007A' : '#39FF14' }}>
                    {fmtBRL(saldo)}
                  </span>
                )}
                <button
                  onClick={() => onNovo(p.username)}
                  title={`Novo lançamento para @${p.username}`}
                  style={{ background: 'transparent', border: '1px solid #30363D', color: '#8B949E', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  ＋
                </button>
              </div>
            </div>
            {sortedItems.length === 0 ? (
              <div style={{ color: '#586069', fontSize: 12 }}>Nenhum lançamento ainda.</div>
            ) : (
              <div style={{ maxHeight: '255px', overflowY: 'auto', paddingRight: '6px' }} className="custom-scrollbar">
                {sortedItems.map((l: any, i: number) => (
                  <div
                    key={l.id ?? i}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0',
                      borderBottom: i < sortedItems.length - 1 ? '1px solid #21262D' : 'none', fontSize: 12, cursor: 'pointer'
                    }}
                    onClick={() => onSelecionar(l, p.username)}
                  >
                    <div>
                      <span style={{ color: l.tipo === 'despesa' ? '#FF007A' : '#39FF14', marginRight: 6 }}>
                        {l.tipo === 'despesa' ? '💸' : '💰'}
                      </span>
                      <span style={{ color: '#8B949E' }}>
                        {l.data_lancamento ? fmtData(l.data_lancamento) : ''}
                      </span>
                      {l.rateado === 1 && <span style={{ color: '#7100E2', marginLeft: 6, fontSize: 10, fontWeight: 700 }}>RATEIO</span>}
                      {l.crm_transacao_id != null && <span style={{ color: '#00B4FF', marginLeft: 6, fontSize: 10, fontWeight: 700 }}>CRM</span>}
                      {l.descricao && <div style={{ color: '#586069', fontSize: 11, marginTop: 2 }}>{l.descricao}</div>}
                    </div>
                    <span style={{ fontWeight: 700, color: l.tipo === 'despesa' ? '#FF007A' : '#39FF14' }}>
                      {fmtBRL(l.valor_brl)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
