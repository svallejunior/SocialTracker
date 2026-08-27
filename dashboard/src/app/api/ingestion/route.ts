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
    // DB_PATH sempre absoluto: o processo Python herda o cwd do Next (dashboard/), então um
    // caminho relativo apontaria para um banco vazio dentro de dashboard/.
    const dbPath =
      process.env.DB_PATH && path.isAbsolute(process.env.DB_PATH)
        ? process.env.DB_PATH
        : path.resolve(rootDir, 'instagram_tracker.db');

    let command = `${pythonCmd} "${scriptPath}"`;
    if (username) {
      // Higieniza o username para evitar injeção de comando
      const sanitizedUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '');
      command += ` ${sanitizedUsername}`;
    }

    console.log(`[API Ingestion] Running command: ${command} (DB: ${dbPath})`);

    return new Promise<NextResponse>((resolve) => {
      exec(
        command,
        {
          cwd: rootDir,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, DB_PATH: dbPath }
        },
        (error, stdout, stderr) => {
          // Junta stdout + stderr para análise (o Apify imprime tudo no stderr)
          const fullOutput = [stdout, stderr].filter(Boolean).join('\n');

          const isDataWarning =
            fullOutput.includes('AVISO:') ||
            fullOutput.includes('pulado:') ||
            fullOutput.includes('Nenhum dado');

          // Falha de banco/token/exceção nunca deve ser rebaixada para "aviso"
          const isHardError =
            fullOutput.includes('Traceback (most recent call last)') ||
            fullOutput.includes('ERRO:');

          if (error) {
            if (isDataWarning && !isHardError) {
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
        }
      );
    });
  } catch (error: any) {
    console.error(`[API Ingestion] Exception:`, error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
