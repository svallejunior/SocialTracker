"use client";
import React, { useEffect, useState } from 'react';

/**
 * Aviso global de falha em gravações. Várias telas fazem fetch(POST/PUT/PATCH/DELETE)
 * sem checar o resultado, então um erro (ex.: banco ocupado pela ingestão) só aparecia
 * no log do servidor e o usuário ficava sem saber. Aqui o window.fetch é envolvido uma
 * única vez e qualquer escrita em /api/* que falhe mostra um aviso visível.
 */
const METODOS_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function mensagemAmigavel(status: number, erro: string): string {
  if (/locked|SQLITE_BUSY|busy/i.test(erro)) {
    return 'O banco está ocupado (atualização de dados em andamento). A alteração NÃO foi salva — tente novamente em alguns segundos.';
  }
  if (status === 401 || status === 403) {
    return 'Sessão expirada ou sem permissão. A alteração NÃO foi salva.';
  }
  return `Não foi possível salvar a alteração${erro ? `: ${erro}` : ` (erro ${status})`}.`;
}

export default function AvisoFalhaSalvar() {
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const w = window as any;
    if (w.__avisoFalhaSalvarAtivo) return;
    w.__avisoFalhaSalvarAtivo = true;

    const fetchOriginal = window.fetch.bind(window);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const mostrar = (msg: string) => {
      setAviso(msg);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setAviso(null), 12000);
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const metodo = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const monitorar = METODOS_ESCRITA.has(metodo) && /\/api\//.test(url);

      let res: Response;
      try {
        res = await fetchOriginal(input, init);
      } catch (err) {
        if (monitorar) mostrar('Falha de conexão: a alteração NÃO foi salva. Verifique a internet e tente de novo.');
        throw err;
      }

      if (monitorar) {
        try {
          let erro = '';
          let falhou = !res.ok;
          if ((res.headers.get('content-type') || '').includes('application/json')) {
            const corpo = await res.clone().json().catch(() => null);
            if (corpo && corpo.success === false) falhou = true;
            if (corpo && typeof corpo.error === 'string') erro = corpo.error;
          }
          if (falhou) mostrar(mensagemAmigavel(res.status, erro));
        } catch { /* nunca atrapalhar a resposta original */ }
      }
      return res;
    };

    return () => {
      // Mantém o wrapper durante toda a vida da página (layout raiz não desmonta).
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!aviso) return null;

  return (
    <div
      role="alert"
      onClick={() => setAviso(null)}
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100000,
        width: 'min(560px, calc(100vw - 32px))',
        background: '#2A0F12',
        border: '1px solid #F85149',
        borderRadius: 12,
        color: '#FFE4E1',
        padding: '12px 16px',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.4,
        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
        cursor: 'pointer',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start'
      }}
    >
      <span style={{ fontSize: 16 }}>⚠️</span>
      <span style={{ flex: 1 }}>{aviso}</span>
      <span style={{ opacity: 0.6, fontSize: 12 }}>✕</span>
    </div>
  );
}
