import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json().catch(() => ({}));

    const rootDir = fs.existsSync(path.resolve(process.cwd(), '..', 'ingestion.py'))
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
    const scriptPath = path.resolve(rootDir, 'ingestion.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    let command = `${pythonCmd} "${scriptPath}"`;
    if (username) {
      // Higieniza o username para evitar injeção de comando
      const sanitizedUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '');
      command += ` ${sanitizedUsername}`;
    }

    console.log(`[API Ingestion] Running command: ${command}`);

    return new Promise<NextResponse>((resolve) => {
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        // Junta stdout + stderr para análise (o Apify imprime tudo no stderr)
        const fullOutput = [stdout, stderr].filter(Boolean).join('\n');

        const isDataWarning =
          fullOutput.includes('AVISO:') ||
          fullOutput.includes('pulado:') ||
          fullOutput.includes('Nenhum dado');

        if (error) {
          if (isDataWarning) {
            console.warn(`[API Ingestion] Aviso: script terminou sem dados. Output:`, fullOutput);
            resolve(NextResponse.json({
              success: true,
              warning: true,
              targetUsername: username,
              message: 'Ingestão executada, mas nenhum dado disponível para este perfil (perfil restrito ou privado).',
              stdout: fullOutput
            }));
          } else {
            console.error(`[API Ingestion] Erro real no script:`, error.message);
            resolve(NextResponse.json({
              success: false,
              error: error.message,
              stdout: fullOutput
            }, { status: 500 }));
          }
        } else {
          console.log(`[API Ingestion] Sucesso. Output:`, fullOutput);
          resolve(NextResponse.json({
            success: true,
            warning: isDataWarning,
            targetUsername: username,
            stdout: fullOutput
          }));
        }
      });
    });
  } catch (error: any) {
    console.error(`[API Ingestion] Exception:`, error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
