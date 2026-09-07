"use client";

import React, { useEffect, useState } from 'react';

/**
 * Splash com a logo animada (fade/zoom), igual ao que já existia só no pós-login.
 * Usado agora também no boot do dashboard/mobile, mesmo com sessão já ativa —
 * sempre que a página carrega, independente de estar logado ou não.
 */
export default function LogoSplash({ duration = 1200 }: { duration?: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
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
        animation: `logoFadeZoom ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`
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

      <style>{`
        @keyframes fadeInSplash {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes logoFadeZoom {
          0% { opacity: 0; transform: scale(0.85); }
          30% { opacity: 1; transform: scale(1); }
          70% { opacity: 0.8; transform: scale(1.05); }
          100% { opacity: 0; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
