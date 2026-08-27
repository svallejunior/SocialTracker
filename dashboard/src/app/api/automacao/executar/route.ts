import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

type ResultadoPublicacao = {
  id?: string;
  status?: 'PUBLICADO' | 'ERRO' | string;
  meta_media_id?: string;
  error?: string;
};

type SaidaPublicador = {
  success?: boolean;
  results?: ResultadoPublicacao[];
  error?: string;
  message?: string;
};

/**
 * O publicador imprime o resultado com json.dumps(..., indent=2), ou seja, um
 * JSON de várias linhas. Os logs vão para o stderr, então o stdout normalmente
 * é só o JSON — mas o fallback recorta do primeiro '{' ao último '}' caso algo
 * mais escape para o stdout.
 */
function extrairJson(saida: string): SaidaPublicador | null {
  const texto = saida.trim();
  if (!texto) return null;

  try {
    return JSON.parse(texto);
  } catch {
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (inicio === -1 || fim <= inicio) return null;
    try {
      return JSON.parse(texto.slice(inicio, fim + 1));
    } catch {
      return null;
    }
  }
}

/** Evita despejar o log inteiro no alert do dashboard. */
function ultimasLinhas(texto: string, quantidade = 5): string {
  return texto
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-quantidade)
    .join('\n');
}

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
          DB_PATH: path.resolve(process.cwd(), '..', 'instagram_tracker.db'),
          // Sem isso os acentos e emojis do log chegam corrompidos no Windows
          PYTHONIOENCODING: 'utf-8'
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

      child.on('error', (err) => {
        console.error('[API /api/automacao/executar] ❌ Falha ao iniciar o publicador:', err);
        resolve(
          NextResponse.json(
            { success: false, error: `Não foi possível executar "${pythonBin}": ${err.message}` },
            { status: 500 }
          )
        );
      });

      child.on('close', (code) => {
        const parsed = extrairJson(stdout);
        const resultados: ResultadoPublicacao[] = Array.isArray(parsed?.results) ? parsed.results : [];
        const comErro = resultados.filter((r) => r?.status === 'ERRO');
        const publicados = resultados.filter((r) => r?.status === 'PUBLICADO');

        const falhar = (error: string, status = 500) => {
          console.error(
            `[API /api/automacao/executar] ❌ Falha ao executar agendamento ID ${id || 'N/A'}: ${error}`
          );
          resolve(
            NextResponse.json(
              { success: false, error, results: resultados, exitCode: code, stderr },
              { status }
            )
          );
        };

        // 1. O processo morreu ou o script sinalizou falha global
        if (code !== 0 || !parsed?.success) {
          return falhar(
            parsed?.error ||
              parsed?.message ||
              ultimasLinhas(stderr) ||
              ultimasLinhas(stdout) ||
              `O publicador terminou com código ${code} e sem saída JSON.`
          );
        }

        // 2. O script rodou, mas o agendamento em si falhou
        if (comErro.length > 0) {
          return falhar(comErro.map((r) => r.error || 'Erro não detalhado').join(' | '));
        }

        // 3. Pediram um id específico e nada foi processado
        if (id && resultados.length === 0) {
          return falhar(`Agendamento ${id} não foi encontrado no banco.`, 404);
        }

        resolve(
          NextResponse.json({
            success: true,
            results: resultados,
            publicados: publicados.length,
            message:
              resultados.length === 0
                ? 'Nenhum agendamento pendente no horário.'
                : `${publicados.length} publicação(ões) concluída(s).`
          })
        );
      });
    });
  } catch (error: any) {
    console.error('Erro ao acionar publicador:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
