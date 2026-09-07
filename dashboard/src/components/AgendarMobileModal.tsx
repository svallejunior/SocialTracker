"use client";

import React, { useState, useRef } from 'react';
import { X, Camera, Image as ImageIcon, Clock, Calendar as CalendarIcon, CheckCircle2, Loader2 } from 'lucide-react';

interface PerfilAlvo {
  username: string;
  nome: string;
  meta_account_id?: string;
  foto_url: string | null;
}

interface Props {
  perfil: PerfilAlvo;
  onClose: () => void;
  onCreated: () => void;
}

function hojeIsoLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function horaDaquiPoucoLocal(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function AgendarMobileModal({ perfil, onClose, onCreated }: Props) {
  const [tipo, setTipo] = useState<'FEED' | 'STORIES'>('FEED');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [legenda, setLegenda] = useState('');
  const [data, setData] = useState(hojeIsoLocal());
  const [hora, setHora] = useState(horaDaquiPoucoLocal());
  const [etapa, setEtapa] = useState<'form' | 'enviando' | 'sucesso'>('form');
  const [erro, setErro] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const escolherArquivo = (f: File | null) => {
    setFile(f);
    setErro('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const handleSubmit = async () => {
    if (!file) {
      setErro('Escolha uma foto antes de agendar.');
      return;
    }
    if (!data || !hora) {
      setErro('Escolha data e horário.');
      return;
    }
    if (!perfil.meta_account_id) {
      setErro('Essa conta não tem uma conta Meta vinculada — configure isso no desktop antes.');
      return;
    }

    setEtapa('enviando');
    setErro('');

    try {
      const formData = new FormData();
      formData.append('metaAccountId', perfil.meta_account_id);
      formData.append('files', file);

      const resUpload = await fetch('/api/automacao/upload', { method: 'POST', body: formData });
      const dataUpload = await resUpload.json();

      if (!dataUpload.success || !dataUpload.files?.[0]) {
        throw new Error(dataUpload.error || 'Falha ao subir a foto.');
      }

      const resAg = await fetch('/api/automacao/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: perfil.username,
          meta_account_id: perfil.meta_account_id,
          tipo_postagem: tipo,
          arquivos: [dataUpload.files[0]],
          tipo_agendamento: 'DATA_ESPECIFICA',
          data_especifica: data,
          hora_fixa: hora,
          recorrencia: 'UNICA',
          legenda
        })
      });
      const dataAg = await resAg.json();

      if (!dataAg.success) {
        throw new Error(dataAg.error || 'Falha ao criar o agendamento.');
      }

      setEtapa('sucesso');
      setTimeout(() => {
        onCreated();
        onClose();
      }, 1100);
    } catch (e: any) {
      setErro(e.message || 'Erro inesperado ao agendar.');
      setEtapa('form');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#0D0F12',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          border: '1px solid rgba(255,255,255,0.08)',
          borderBottom: 'none',
          padding: '18px 18px 28px',
          fontFamily: 'var(--font-plus-jakarta, sans-serif)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden',
              background: '#16191E', border: '2px solid #0F172A', flexShrink: 0
            }}>
              {perfil.foto_url ? (
                <img src={perfil.foto_url} alt={perfil.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#F3F4F6' }}>Agendar foto</div>
              <div style={{ fontSize: '11px', color: '#8B949E' }}>@{perfil.username}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '30px', height: '30px', borderRadius: '8px', border: 'none',
              background: 'rgba(255,255,255,0.06)', color: '#8B949E', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {etapa === 'sucesso' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '30px 0' }}>
            <CheckCircle2 size={40} color="#10B981" />
            <p style={{ color: '#F3F4F6', fontWeight: 700, fontSize: '14px' }}>Agendado com sucesso!</p>
          </div>
        ) : (
          <>
            {/* Tipo: Feed ou Stories */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {(['FEED', 'STORIES'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  disabled={etapa === 'enviando'}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: tipo === t ? '1px solid #00F0FF' : '1px solid rgba(255,255,255,0.12)',
                    background: tipo === t ? 'rgba(0, 240, 255, 0.12)' : 'transparent',
                    color: tipo === t ? '#00F0FF' : '#8B949E',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {t === 'FEED' ? '🖼️ Feed' : '📱 Stories'}
                </button>
              ))}
            </div>

            {/* Seletor de foto */}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => escolherArquivo(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={etapa === 'enviando'}
              style={{
                width: '100%',
                borderRadius: '12px',
                border: '1px dashed rgba(0, 240, 255, 0.4)',
                background: 'rgba(0, 240, 255, 0.05)',
                padding: previewUrl ? '0' : '24px 12px',
                marginBottom: '14px',
                cursor: 'pointer',
                overflow: 'hidden'
              }}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', display: 'block', borderRadius: '11px' }} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#00F0FF' }}>
                  <Camera size={26} />
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>Tirar foto ou escolher da galeria</span>
                </div>
              )}
            </button>
            {previewUrl && (
              <button
                onClick={() => inputRef.current?.click()}
                disabled={etapa === 'enviando'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', marginTop: '-8px', marginBottom: '14px',
                  background: 'none', border: 'none', color: '#8B949E', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                <ImageIcon size={12} /> Trocar foto
              </button>
            )}

            {/* Legenda */}
            <textarea
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              placeholder="Legenda (opcional)..."
              disabled={etapa === 'enviando'}
              rows={3}
              style={{
                width: '100%',
                background: '#161B22',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '10px',
                color: '#F3F4F6',
                fontSize: '13px',
                marginBottom: '14px',
                resize: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            />

            {/* Data e hora */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#8B949E', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>
                  <CalendarIcon size={11} /> Data
                </label>
                <input
                  type="date"
                  value={data}
                  min={hojeIsoLocal()}
                  onChange={(e) => setData(e.target.value)}
                  disabled={etapa === 'enviando'}
                  style={{
                    width: '100%', background: '#161B22', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '9px', color: '#F3F4F6', fontSize: '13px', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#8B949E', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>
                  <Clock size={11} /> Horário
                </label>
                <input
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  disabled={etapa === 'enviando'}
                  style={{
                    width: '100%', background: '#161B22', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '9px', color: '#F3F4F6', fontSize: '13px', boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {erro && (
              <p style={{ color: '#FF007A', fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>{erro}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={etapa === 'enviando'}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #7100E2 0%, #00F0FF 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                padding: '14px',
                fontSize: '14px',
                fontWeight: 800,
                cursor: etapa === 'enviando' ? 'not-allowed' : 'pointer',
                opacity: etapa === 'enviando' ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {etapa === 'enviando' ? (
                <>
                  <Loader2 size={16} className="spin-icon" /> Agendando...
                </>
              ) : (
                'Agendar'
              )}
            </button>
            <style>{`.spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </>
        )}
      </div>
    </div>
  );
}
