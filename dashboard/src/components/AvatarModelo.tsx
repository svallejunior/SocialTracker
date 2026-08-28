'use client';
import React, { useState } from 'react';

export interface AvatarModeloProps {
  src?: string | null;
  alt?: string;
  username?: string;
  size?: number;
  comentariosPendentes?: number;
  mensagensPendentes?: number;
  temPendencias?: boolean;
  showBadge?: boolean;
  showCountInBadge?: boolean;
  badgePosition?: 'top-right' | 'bottom-right' | 'top-left';
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  style?: React.CSSProperties;
  imageStyle?: React.CSSProperties;
  borderColor?: string;
}

export function AvatarModelo({
  src,
  alt = 'Avatar da Modelo',
  username = '',
  size = 36,
  comentariosPendentes = 0,
  mensagensPendentes = 0,
  temPendencias,
  showBadge = true,
  showCountInBadge = false,
  badgePosition = 'top-right',
  onClick,
  className = '',
  style,
  imageStyle,
  borderColor = '#30363D'
}: AvatarModeloProps) {
  const [imgError, setImgError] = useState(false);

  // Calcula se há pendências
  const totalPendencias = (comentariosPendentes || 0) + (mensagensPendentes || 0);
  const temAlerta = temPendencias !== undefined ? temPendencias : totalPendencias > 0;

  // Texto do Tooltip
  let tooltipText = '';
  if (temAlerta) {
    const parts = [];
    if (mensagensPendentes > 0) {
      parts.push(`✉️ ${mensagensPendentes} mensagem${mensagensPendentes > 1 ? 's' : ''}`);
    }
    if (comentariosPendentes > 0) {
      parts.push(`💬 ${comentariosPendentes} comentário${comentariosPendentes > 1 ? 's' : ''}`);
    }
    tooltipText = parts.length > 0
      ? `${parts.join(' e ')} pendente${totalPendencias > 1 ? 's' : ''}`
      : 'Novas mensagens ou comentários pendentes';
  }

  // Posição da bolinha
  const positionStyles: React.CSSProperties = {};
  if (badgePosition === 'top-right') {
    positionStyles.top = size > 40 ? 0 : -2;
    positionStyles.right = size > 40 ? 0 : -2;
  } else if (badgePosition === 'bottom-right') {
    positionStyles.bottom = size > 40 ? 0 : -2;
    positionStyles.right = size > 40 ? 0 : -2;
  } else if (badgePosition === 'top-left') {
    positionStyles.top = size > 40 ? 0 : -2;
    positionStyles.left = size > 40 ? 0 : -2;
  }

  // Determina se é predominantemente DMs ou comentários
  const badgeColorClass = mensagensPendentes > 0 ? 'has-dms' : (comentariosPendentes > 0 ? 'only-comments' : '');

  // Iniciais para fallback
  const displayInitial = (username || alt || '?').replace('@', '').trim().slice(0, size > 45 ? 2 : 1).toUpperCase();

  return (
    <div
      className={`avatar-badge-wrapper ${className}`}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : 'inherit',
        ...style
      }}
      title={tooltipText || `@${username || alt}`}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={alt || username}
          onError={() => setImgError(true)}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            border: `1px solid ${borderColor}`,
            display: 'block',
            ...imageStyle
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #7100E2, #00F0FF)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: Math.max(11, Math.round(size * 0.4)),
            color: '#FFFFFF',
            border: `1px solid ${borderColor}`,
            userSelect: 'none',
            ...imageStyle
          }}
        >
          {displayInitial}
        </div>
      )}

      {/* Indicador de Notificação (Bolinha) */}
      {showBadge && temAlerta && (
        <span
          className={`avatar-badge-dot ${badgeColorClass} ${showCountInBadge && totalPendencias > 0 ? 'has-count' : ''}`}
          style={positionStyles}
          title={tooltipText}
        >
          {showCountInBadge && totalPendencias > 0 ? (totalPendencias > 99 ? '99+' : totalPendencias) : null}
        </span>
      )}
    </div>
  );
}

export default AvatarModelo;
