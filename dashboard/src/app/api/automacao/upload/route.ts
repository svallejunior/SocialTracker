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
      const filePath = path.join(targetDir, safeFileName);

      // 1. Salva arquivo localmente como backup
      fs.writeFileSync(filePath, buffer);

      // 2. Upload para Supabase Storage na pasta/bucket 'postagens'
      let supabaseUrl: string | null = null;
      try {
        const mimeType = file.type || (ext === '.mp4' ? 'video/mp4' : ext === '.png' ? 'image/png' : 'image/jpeg');
        const { error: uploadError } = await supabase
          .storage
          .from(SUPABASE_BUCKET)
          .upload(safeFileName, buffer, {
            contentType: mimeType,
            upsert: true
          });

        if (uploadError) {
          console.warn(`[Supabase Upload Warning] Falha ao enviar ${safeFileName}:`, uploadError.message);
        } else {
          const { data: publicUrlData } = supabase
            .storage
            .from(SUPABASE_BUCKET)
            .getPublicUrl(safeFileName);

          supabaseUrl = publicUrlData?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${safeFileName}`;
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
        savedName: safeFileName,
        path: filePath,
        url: supabaseUrl,
        size: file.size,
        type: file.type || 'application/octet-stream',
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
