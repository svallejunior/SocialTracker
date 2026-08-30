"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || success) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() })
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        // Aguarda 1.2 segundos mostrando a logo com o efeito de fade/zoom suave antes de redirecionar
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.innerWidth <= 768) {
            router.push('/mobile');
          } else {
            router.push('/');
          }
          router.refresh();
        }, 1200);
      } else {
        setError('Senha incorreta.');
        setPin('');
      }
    } catch (err: any) {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at center, #161B22 0%, #090A0F 100%)',
      padding: '20px',
      fontFamily: 'var(--font-plus-jakarta, sans-serif)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 🌟 OVERLAY DE TRANSIÇÃO COM LOGO (FADE OUT DEVAGAR) 🌟 */}
      {success && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: '#090A0F',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeInSplash 0.3s ease-out forwards'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            animation: 'logoFadeZoom 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards'
          }}>
            <div style={{
              width: '100px',
              height: '100px',
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: '0 0 50px rgba(0, 240, 255, 0.4), 0 0 100px rgba(113, 0, 226, 0.3)',
              border: '2px solid rgba(0, 240, 255, 0.5)',
              background: '#161B22',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                src="/img/logo.jpeg"
                alt="SocialTracker Logo"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  // Fallback visual caso a imagem não exista
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <span style={{
              fontSize: '24px',
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #FFFFFF 0%, #8B949E 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              SocialTracker
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInSplash {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes logoFadeZoom {
          0% {
            opacity: 0;
            transform: scale(0.85);
          }
          30% {
            opacity: 1;
            transform: scale(1);
          }
          70% {
            opacity: 0.8;
            transform: scale(1.05);
          }
          100% {
            opacity: 0;
            transform: scale(1.15);
          }
        }
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: '380px',
        background: 'rgba(22, 27, 34, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(240, 246, 252, 0.1)',
        borderRadius: '20px',
        padding: '36px 28px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 30px rgba(113, 0, 226, 0.15)',
        textAlign: 'center',
        opacity: success ? 0 : 1,
        transition: 'opacity 0.3s ease-out'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #7100E2 0%, #00F0FF 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          boxShadow: '0 8px 24px rgba(113, 0, 226, 0.4)'
        }}>
          <Lock size={30} color="#FFFFFF" />
        </div>

        <h1 style={{
          color: '#FFFFFF',
          fontSize: '22px',
          fontWeight: '700',
          marginBottom: '8px',
          letterSpacing: '-0.02em'
        }}>
          SocialTracker
        </h1>

        <p style={{
          color: '#8B949E',
          fontSize: '14px',
          marginBottom: '28px'
        }}>
          Digite a senha de acesso para continuar
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
              placeholder="Digite a senha..."
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError('');
              }}
              style={{
                width: '100%',
                background: '#0D1117',
                border: error ? '1px solid #FF007A' : '1px solid rgba(240, 246, 252, 0.15)',
                borderRadius: '12px',
                padding: '16px',
                color: '#FFFFFF',
                fontSize: '20px',
                textAlign: 'center',
                letterSpacing: '6px',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
            />
            {error && (
              <p style={{
                color: '#FF007A',
                fontSize: '13px',
                marginTop: '10px',
                fontWeight: '500'
              }}>
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || success || !pin.trim()}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #7100E2 0%, #00F0FF 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              padding: '15px',
              fontSize: '15px',
              fontWeight: '700',
              cursor: loading || success ? 'not-allowed' : 'pointer',
              opacity: loading || success || !pin.trim() ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 8px 20px rgba(113, 0, 226, 0.3)',
              transition: 'transform 0.1s'
            }}
          >
            {loading || success ? 'Acessando...' : (
              <>
                Entrar <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
