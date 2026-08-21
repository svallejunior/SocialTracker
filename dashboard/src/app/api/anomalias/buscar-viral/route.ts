import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, data_coleta, force_api } = body;

    if (!username) {
      return NextResponse.json({ success: false, error: 'Username é obrigatório' }, { status: 400 });
    }

    const sanitizedUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '');
    const sanitizedData = (data_coleta || '').replace(/['"\\]/g, '');

    const rootDir = fs.existsSync(path.resolve(process.cwd(), '..', 'buscar_viral.py'))
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
    const scriptPath = path.resolve(rootDir, 'buscar_viral.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    let command = `${pythonCmd} "${scriptPath}" --username "${sanitizedUsername}"`;
    if (sanitizedData) {
      command += ` --data_coleta "${sanitizedData}"`;
    }
    if (force_api) {
      command += ` --force_api`;
    }

    console.log(`[API Buscar Viral] Executando: ${command}`);

    return new Promise<NextResponse>((resolve) => {
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[API Buscar Viral] Erro:`, error.message, stderr);
          try {
            const errJson = JSON.parse(stdout);
            resolve(NextResponse.json(errJson, { status: 500 }));
          } catch {
            resolve(NextResponse.json({
              success: false,
              error: error.message,
              stderr
            }, { status: 500 }));
          }
          return;
        }

        try {
          const resultJson = JSON.parse(stdout);
          resolve(NextResponse.json(resultJson));
        } catch (parseErr: any) {
          console.error(`[API Buscar Viral] Falha ao fazer parse do JSON:`, stdout);
          resolve(NextResponse.json({
            success: false,
            error: 'Resposta inválida do script de busca viral',
            raw: stdout
          }, { status: 500 }));
        }
      });
    });
  } catch (error: any) {
    console.error(`[API Buscar Viral] Exception:`, error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
