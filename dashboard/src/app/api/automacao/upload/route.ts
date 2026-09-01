import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://hdycnhouyjpsagondjvb.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_pRMd3suVuGcOUJPIFmPYLw_HMDfyBse';
const SUPABASE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || process.env.SUPABASE_BUCKET || 'Postagens';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const metaAccountId = (formData.get('metaAccountId') as string) || 'geral';
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    // Diretório de destino local de backup: C:\Projetos\SocialTracker\automacao\<ID_CONTA_META>
    // IMPORTANTE: usar o ID sem sanitização agressiva para que o nome da pasta seja
    // idêntico ao usado pelo publicador Python (que usa str(meta_account_id) diretamente).
    // Apenas bloqueamos traversal de diretório por segurança.
    const baseAutomacaoDir = path.resolve(process.cwd(), '..', 'automacao');
    const safeAccountId = (metaAccountId || 'geral').replace(/[/\\\.]/g, '_');
    const targetDir = path.join(baseAutomacaoDir, safeAccountId);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`[Upload] Pasta criada: ${targetDir}`);
    }

    const savedFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = Buffer.from(await file.arrayBuffer());

      // Nome limpo preservando extensão
      const originalName = file.name || `arquivo_${Date.now()}_${i}`;
      const ext = path.extname(originalName);
      const nameWithoutExt = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFileName = `${Date.now()}_${i}_${nameWithoutExt}${ext}`;
      let finalBuffer = buffer;
      let finalSafeFileName = safeFileName;
      let finalMimeType = file.type || 'application/octet-stream';
      const isVideo = ext.toLowerCase() === '.mp4' || ext.toLowerCase() === '.mov' || (file.type && file.type.startsWith('video/'));

      // Se for imagem (PNG, JPG, JPEG, WEBP, etc.), limpa metadados e injeta EXIF de celular real
      if (!isVideo && (ext.toLowerCase() in { '.jpg': 1, '.jpeg': 1, '.png': 1, '.webp': 1 } || (file.type && file.type.startsWith('image/')))) {
        try {
          const { spawnSync } = await import('child_process');
          const pyExe = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
          const scriptProcessar = path.resolve(process.cwd(), '..', 'processar_imagem.py');

          if (fs.existsSync(scriptProcessar)) {
            const pyRes = spawnSync(pyExe, [scriptProcessar, '--stdin'], {
              input: buffer,
              maxBuffer: 50 * 1024 * 1024
            });

            if (pyRes.status === 0 && pyRes.stdout && pyRes.stdout.length > 0) {
              finalBuffer = Buffer.from(pyRes.stdout);
              finalSafeFileName = `${Date.now()}_${i}_${nameWithoutExt}.jpg`;
              finalMimeType = 'image/jpeg';
              console.log(`[Upload] 📸 Imagem sanitizada com EXIF de celular: ${finalSafeFileName}`);
            }
          }
        } catch (procErr) {
          console.warn('[Upload] Falha ao processar EXIF da imagem, mantendo original:', procErr);
        }
      }

      const filePath = path.join(targetDir, finalSafeFileName);

      // 1. Salva arquivo localmente como backup
      fs.writeFileSync(filePath, finalBuffer);

      // 2. Upload para Supabase Storage na pasta/bucket 'postagens'
      let supabaseUrl: string | null = null;
      try {
        const { error: uploadError } = await supabase
          .storage
          .from(SUPABASE_BUCKET)
          .upload(finalSafeFileName, finalBuffer, {
            contentType: finalMimeType,
            upsert: true
          });

        if (uploadError) {
          console.warn(`[Supabase Upload Warning] Falha ao enviar ${finalSafeFileName}:`, uploadError.message);
        } else {
          const { data: publicUrlData } = supabase
            .storage
            .from(SUPABASE_BUCKET)
            .getPublicUrl(finalSafeFileName);

          supabaseUrl = publicUrlData?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${finalSafeFileName}`;
          console.log(`[Supabase Storage] Upload OK! Public URL: ${supabaseUrl}`);
        }
      } catch (supErr: any) {
        console.warn(`[Supabase Upload Error]:`, supErr.message);
      }

      // Base64 preview fallback
      let previewUrl = supabaseUrl || '';
      if (!previewUrl && file.type.startsWith('image/')) {
        previewUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
      }

      savedFiles.push({
        name: originalName,
        savedName: finalSafeFileName,
        path: filePath,
        url: supabaseUrl,
        size: finalBuffer.length,
        type: finalMimeType,
        previewUrl: previewUrl || null
      });
    }

    return NextResponse.json({
      success: true,
      files: savedFiles,
      targetDir,
      message: `${savedFiles.length} arquivo(s) salvos no Supabase Storage (bucket: ${SUPABASE_BUCKET})`
    });
  } catch (error: any) {
    console.error('Erro no upload de arquivos:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
