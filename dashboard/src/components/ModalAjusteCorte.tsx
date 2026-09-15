'use client';
import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Crop, RotateCw, ZoomIn, ZoomOut, Move, ArrowUp, ArrowDown, AlignCenter } from 'lucide-react';

interface ModalAjusteCorteProps {
  isOpen: boolean;
  file?: File | null;
  imageUrl: string;
  fileName: string;
  onClose: () => void;
  onApplyCrop: (croppedFile: File, newPreviewUrl: string) => void;
}

export default function ModalAjusteCorte({
  isOpen,
  file,
  imageUrl,
  fileName,
  onClose,
  onApplyCrop
}: ModalAjusteCorteProps) {
  const [aspectRatioMode, setAspectRatioMode] = useState<'4:5' | '1:1'>('4:5');
  const [originalDimensions, setOriginalDimensions] = useState<{ width: number; height: number } | null>(null);
  const [offsetPercent, setOffsetPercent] = useState<number>(50); // 0 = topo/esquerda, 50 = centro, 100 = base/direita
  const [isProcessing, setIsProcessing] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Alvo numérico de aspect ratio (largura / altura)
  const targetRatio = aspectRatioMode === '4:5' ? 4 / 5 : 1 / 1;

  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    setOffsetPercent(50); // Reset para o centro ao abrir
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setOriginalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl]);

  if (!isOpen || !imageUrl) return null;

  const origW = originalDimensions?.width || 1;
  const origH = originalDimensions?.height || 1;
  const origRatio = origW / origH;

  // Se a imagem for mais vertical que o alvo (ex: 9:16 ~ 0.56 vs 4:5 = 0.8), precisamos cortar a altura
  const isTooTall = origRatio < targetRatio;
  // Se a imagem for mais horizontal que o alvo, precisamos cortar a largura
  const isTooWide = origRatio > targetRatio;

  // Calcula a caixa de corte nas coordenadas originais da imagem
  let cropWidth = origW;
  let cropHeight = origH;
  let cropX = 0;
  let cropY = 0;

  if (isTooTall) {
    // Mantém a largura total, reduz a altura
    cropWidth = origW;
    cropHeight = Math.round(origW / targetRatio);
    if (cropHeight > origH) cropHeight = origH;
    const maxOffset = origH - cropHeight;
    cropY = Math.round((offsetPercent / 100) * maxOffset);
    cropX = 0;
  } else if (isTooWide) {
    // Mantém a altura total, reduz a largura
    cropHeight = origH;
    cropWidth = Math.round(origH * targetRatio);
    if (cropWidth > origW) cropWidth = origW;
    const maxOffset = origW - cropWidth;
    cropX = Math.round((offsetPercent / 100) * maxOffset);
    cropY = 0;
  }

  // Executa o corte em alta resolução no HTML5 Canvas
  const handleConfirmCrop = async () => {
    if (!originalDimensions) return;
    setIsProcessing(true);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;

      await new Promise((resolve, reject) => {
        if (img.complete) resolve(true);
        else {
          img.onload = () => resolve(true);
          img.onerror = reject;
        }
      });

      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Não foi possível obter contexto 2D do Canvas');

      // Desenha a fatia recortada
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );

      // Converte para Blob JPEG de alta qualidade (95%)
      canvas.toBlob(
        blob => {
          if (!blob) {
            setIsProcessing(false);
            alert('Erro ao processar o corte da imagem.');
            return;
          }

          const cleanBaseName = fileName.replace(/\.[^/.]+$/, '');
          const newName = `${cleanBaseName}_corte_${aspectRatioMode === '4:5' ? '4x5' : '1x1'}.jpg`;
          const croppedFile = new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
          const newPreviewUrl = URL.createObjectURL(blob);

          setIsProcessing(false);
          onApplyCrop(croppedFile, newPreviewUrl);
          onClose();
        },
        'image/jpeg',
        0.95
      );
    } catch (err: any) {
      console.error('Erro no corte:', err);
      setIsProcessing(false);
      alert(`Falha ao cortar imagem: ${err.message}`);
    }
  };

  // Percentual visual da janela de corte para a sobreposição
  const cropPercentTop = origH > 0 ? (cropY / origH) * 100 : 0;
  const cropPercentHeight = origH > 0 ? (cropHeight / origH) * 100 : 100;
  const cropPercentLeft = origW > 0 ? (cropX / origW) * 100 : 0;
  const cropPercentWidth = origW > 0 ? (cropWidth / origW) * 100 : 100;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
    >
      <div
        style={{
          background: '#161B22',
          border: '1px solid #30363D',
          borderRadius: 14,
          width: '100%',
          maxWidth: 620,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 20px rgba(113, 0, 226, 0.25)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #30363D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#0D1117'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'rgba(113, 0, 226, 0.2)',
                border: '1px solid #7100E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#A855F7'
              }}
            >
              <Crop size={16} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'white' }}>
                Ajustar Corte para Feed do Instagram
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: '#8B949E' }}>
                O Feed exige proporção entre 4:5 (vertical) e 1.91:1 (horizontal). Escolha a área de corte:
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            style={{
              background: 'none',
              border: 'none',
              color: '#8B949E',
              cursor: 'pointer',
              padding: 4
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo: Área visual do Crop */}
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            overflowY: 'auto'
          }}
        >
          {/* Seletor de Formato Alvo (4:5 vs 1:1) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
              Proporção Alvo:
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setAspectRatioMode('4:5')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: aspectRatioMode === '4:5' ? '1px solid #7100E2' : '1px solid #30363D',
                  background: aspectRatioMode === '4:5' ? 'rgba(113, 0, 226, 0.25)' : '#0D1117',
                  color: aspectRatioMode === '4:5' ? '#A855F7' : '#8B949E',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: aspectRatioMode === '4:5' ? '0 0 10px rgba(113, 0, 226, 0.3)' : 'none'
                }}
              >
                <span>📱 4:5 (Retrato Oficial)</span>
              </button>
              <button
                type="button"
                onClick={() => setAspectRatioMode('1:1')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: aspectRatioMode === '1:1' ? '1px solid #00F0FF' : '1px solid #30363D',
                  background: aspectRatioMode === '1:1' ? 'rgba(0, 240, 255, 0.2)' : '#0D1117',
                  color: aspectRatioMode === '1:1' ? '#00F0FF' : '#8B949E',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: aspectRatioMode === '1:1' ? '0 0 10px rgba(0, 240, 255, 0.25)' : 'none'
                }}
              >
                <span>⏹️ 1:1 (Quadrado)</span>
              </button>
            </div>
          </div>

          {/* Área de Visualização com Máscara */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 320,
              background: '#0D1117',
              borderRadius: 8,
              border: '1px solid #30363D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              userSelect: 'none'
            }}
          >
            {/* Imagem de Fundo (Base) */}
            <div
              style={{
                position: 'relative',
                maxHeight: '100%',
                maxWidth: '100%',
                display: 'inline-block'
              }}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Para corte"
                style={{
                  display: 'block',
                  maxHeight: 300,
                  maxWidth: '100%',
                  objectFit: 'contain',
                  borderRadius: 4
                }}
              />

              {/* Máscara de Escurecimento com a Janela Ativa Iluminada */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none'
                }}
              >
                {/* Janela de corte em destaque */}
                <div
                  style={{
                    position: 'absolute',
                    top: `${cropPercentTop}%`,
                    left: `${cropPercentLeft}%`,
                    width: `${cropPercentWidth}%`,
                    height: `${cropPercentHeight}%`,
                    border: '2px solid #00F0FF',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <span
                    style={{
                      background: 'rgba(0,0,0,0.7)',
                      color: '#00F0FF',
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: 4,
                      border: '1px solid rgba(0, 240, 255, 0.4)'
                    }}
                  >
                    {aspectRatioMode} ({cropWidth}x{cropHeight}px)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Botões de Posicionamento Rápido (Presets) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' }}>
                {isTooTall ? 'Posição Vertical do Corte:' : 'Posição Horizontal do Corte:'}
              </span>
              <span style={{ fontSize: 10, color: '#00F0FF', fontWeight: 700 }}>
                {offsetPercent === 0
                  ? isTooTall ? 'Topo' : 'Esquerda'
                  : offsetPercent === 50
                  ? 'Centro'
                  : offsetPercent === 100
                  ? isTooTall ? 'Inferior' : 'Direita'
                  : `${offsetPercent}%`}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setOffsetPercent(0)}
                style={{
                  padding: '7px 8px',
                  borderRadius: 6,
                  border: offsetPercent === 0 ? '1px solid #00F0FF' : '1px solid #30363D',
                  background: offsetPercent === 0 ? 'rgba(0, 240, 255, 0.15)' : '#0D1117',
                  color: offsetPercent === 0 ? '#00F0FF' : '#C9D1D9',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <ArrowUp size={13} />
                <span>{isTooTall ? 'Topo' : 'Esquerda'}</span>
              </button>
              <button
                type="button"
                onClick={() => setOffsetPercent(50)}
                style={{
                  padding: '7px 8px',
                  borderRadius: 6,
                  border: offsetPercent === 50 ? '1px solid #00F0FF' : '1px solid #30363D',
                  background: offsetPercent === 50 ? 'rgba(0, 240, 255, 0.15)' : '#0D1117',
                  color: offsetPercent === 50 ? '#00F0FF' : '#C9D1D9',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <AlignCenter size={13} />
                <span>Centro</span>
              </button>
              <button
                type="button"
                onClick={() => setOffsetPercent(100)}
                style={{
                  padding: '7px 8px',
                  borderRadius: 6,
                  border: offsetPercent === 100 ? '1px solid #00F0FF' : '1px solid #30363D',
                  background: offsetPercent === 100 ? 'rgba(0, 240, 255, 0.15)' : '#0D1117',
                  color: offsetPercent === 100 ? '#00F0FF' : '#C9D1D9',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <ArrowDown size={13} />
                <span>{isTooTall ? 'Inferior' : 'Direita'}</span>
              </button>
            </div>

            {/* Slider de Ajuste Fino */}
            <input
              type="range"
              min="0"
              max="100"
              value={offsetPercent}
              onChange={e => setOffsetPercent(Number(e.target.value))}
              style={{
                width: '100%',
                cursor: 'pointer',
                accentColor: '#00F0FF'
              }}
            />
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid #30363D',
            background: '#0D1117',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: 11, color: '#8B949E' }}>
            Resolução original: <strong style={{ color: 'white' }}>{origW}x{origH}px</strong>
            {origRatio && ` (proporção ${(origRatio).toFixed(2)}:1)`}
          </span>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #30363D',
                background: 'transparent',
                color: '#8B949E',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmCrop}
              disabled={isProcessing}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                border: 'none',
                background: 'linear-gradient(135deg, #7100E2, #00F0FF)',
                color: 'white',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 15px rgba(113, 0, 226, 0.4)'
              }}
            >
              {isProcessing ? (
                <span>⏳ Processando corte...</span>
              ) : (
                <>
                  <Check size={14} />
                  <span>Aplicar Corte ({aspectRatioMode})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
