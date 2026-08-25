import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, force, dryRun } = body;

    const scriptPath = path.resolve(process.cwd(), '..', 'publicador_instagram.py');
    const pythonBin = process.env.PYTHON_BIN || 'python';

    const args = [scriptPath];
    if (id) {
      args.push('--id', id);
    }
    if (force || id) {
      args.push('--force');
    }
    if (dryRun) {
      args.push('--dry-run');
    }

    return new Promise<NextResponse>((resolve) => {
      const child = spawn(pythonBin, args, {
        cwd: path.resolve(process.cwd(), '..'),
        env: {
          ...process.env,
          DB_PATH: path.resolve(process.cwd(), '..', 'instagram_tracker.db')
        }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        try {
          // Tenta fazer o parse do JSON de saída do script
          const lines = stdout.trim().split('\n');
          const jsonLine = lines.reverse().find((l) => l.startsWith('{') && l.endsWith('}'));
          const parsed = jsonLine ? JSON.parse(jsonLine) : { stdout, stderr, code };

          if (code === 0 && parsed.success) {
            resolve(NextResponse.json(parsed));
          } else {
            const errMsg = stderr || stdout || (parsed && (parsed.error || parsed.message)) || 'Erro na execução do publicador';
            console.error(`[API /api/automacao/executar] ❌ Falha ao executar agendamento ID ${id || 'N/A'}:\n`, errMsg);
            resolve(
              NextResponse.json(
                {
                  success: false,
                  error: errMsg,
                  output: parsed
                },
                { status: 500 }
              )
            );
          }
        } catch (e: any) {
          resolve(
            NextResponse.json({
              success: code === 0,
              stdout,
              stderr,
              message: 'Execução finalizada'
            })
          );
        }
      });
    });
  } catch (error: any) {
    console.error('Erro ao acionar publicador:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
