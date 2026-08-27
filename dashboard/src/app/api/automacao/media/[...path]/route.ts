import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';

const MIME_TYPES: { [ext: string]: string } = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v'
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams.path || [];

    if (pathSegments.length === 0) {
      return new NextResponse('Caminho não especificado', { status: 400 });
    }

    // Previne Directory Traversal
    const safeSegments = pathSegments.map(s => s.replace(/[^a-zA-Z0-9_.-]/g, ''));
    const baseAutomacaoDir = path.resolve(process.cwd(), '..', 'automacao');
    const filePath = path.join(baseAutomacaoDir, ...safeSegments);

    // Fallback: tenta dentro do cwd se não achar no parent
    let targetPath = filePath;
    if (!fs.existsSync(targetPath)) {
      const cwdAutomacao = path.resolve(process.cwd(), 'automacao', ...safeSegments);
      if (fs.existsSync(cwdAutomacao)) {
        targetPath = cwdAutomacao;
      } else {
        return new NextResponse('Arquivo de mídia não encontrado', { status: 404 });
      }
    }

    const ext = path.extname(targetPath).toLowerCase();

    // ─── PNG → JPEG: Instagram não aceita PNG via URL ─────────────────────────
    // Se o arquivo é PNG e o cliente (Meta API) não aceita PNG explicitamente,
    // convertemos para JPEG on-the-fly usando sharp.
    if (ext === '.png') {
      try {
        const jpegBuffer = await sharp(targetPath)
          .flatten({ background: { r: 255, g: 255, b: 255 } }) // remove transparência
          .jpeg({ quality: 95 })
          .toBuffer();

        return new NextResponse(new Uint8Array(jpegBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': jpegBuffer.length.toString(),
            'Cache-Control': 'public, max-age=86400, immutable',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (sharpErr) {
        console.warn('Falha na conversão PNG→JPEG, servindo PNG original:', sharpErr);
        // fallback: serve como PNG
      }
    }

    const stat = fs.statSync(targetPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const fileBuffer = fs.readFileSync(targetPath);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error: any) {
    console.error('Erro ao servir mídia de automação:', error);
    return new NextResponse('Erro interno ao carregar arquivo', { status: 500 });
  }
}
