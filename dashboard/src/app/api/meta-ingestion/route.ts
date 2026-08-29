// app/api/meta-ingestion/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username } = body;

    const rootDir = fs.existsSync(path.resolve(process.cwd(), '..', 'meta_ingestion.py'))
      ? path.resolve(process.cwd(), '..')
      : process.cwd();

    const scriptPath = path.resolve(rootDir, 'meta_ingestion.py');

    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json({
        success: false,
        error: `Script meta_ingestion.py não encontrado em: ${rootDir}`
      }, { status: 404 });
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const dbPath =
      process.env.DB_PATH && path.isAbsolute(process.env.DB_PATH)
        ? process.env.DB_PATH
        : path.resolve(rootDir, 'instagram_tracker.db');

    let command = `${pythonCmd} "${scriptPath}"`;
    if (username) {
      // Sanitiza o username para evitar injeção de comando
      const sanitizedUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '');
      command += ` --username ${sanitizedUsername}`;
    }

    console.log(`[API Meta-Ingestion] Running command: ${command} (DB: ${dbPath})`);

    return new Promise<NextResponse>((resolve) => {
      exec(
        command,
        {
          cwd: rootDir,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, DB_PATH: dbPath }
        },
        (error, stdout, stderr) => {
          const fullOutput = [stdout, stderr].filter(Boolean).join('\n');

          const isNoConta =
            fullOutput.includes('Nenhuma conta') ||
            fullOutput.includes('Nenhuma conta com credenciais');

          const isHardError =
            fullOutput.includes('Traceback (most recent call last)') ||
            fullOutput.includes('ERRO:') ||
            fullOutput.includes('Error:');

          if (error) {
            if (isNoConta && !isHardError) {
              console.warn(`[API Meta-Ingestion] Aviso: nenhuma conta configurada. Output:`, fullOutput);
              resolve(NextResponse.json({
                success: false,
                warning: true,
                message: 'Nenhuma conta com credenciais Meta válidas foi encontrada. Verifique a configuração de meta_account_id e access_token na aba Automação.',
                stdout: fullOutput
              }));
            } else {
              console.error(`[API Meta-Ingestion] Erro no script:`, error.message);
              resolve(NextResponse.json({
                success: false,
                error: error.message,
                stdout: fullOutput
              }, { status: 500 }));
            }
          } else {
            console.log(`[API Meta-Ingestion] Sucesso. Output:`, fullOutput);
            resolve(NextResponse.json({
              success: true,
              targetUsername: username || null,
              stdout: fullOutput
            }));
          }
        }
      );
    });
  } catch (error: any) {
    console.error(`[API Meta-Ingestion] Exception:`, error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
