import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const authCookie = req.cookies.get('st_auth');
    const isMaster = Boolean(authCookie && authCookie.value.includes('2802'));

    if (!isMaster) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source') || 'all'; // 'all', 'app', 'pm2', 'daemon'
    const lines = parseInt(searchParams.get('lines') || '200', 10);

    const logs: Record<string, string> = {};
    const baseDir = path.resolve(process.cwd(), '..');

    // 1. Arquivo de log da aplicação / daemon se existir
    const candidates = [
      { name: 'app_log', file: path.join(baseDir, 'app.log') },
      { name: 'publicador_log', file: path.join(baseDir, 'publicador.log') },
      { name: 'daemon_log', file: path.join(baseDir, 'daemon.log') },
      { name: 'pm2_out', file: '/root/.pm2/logs/socialtracker-daemon-out.log' },
      { name: 'pm2_err', file: '/root/.pm2/logs/socialtracker-daemon-error.log' },
      { name: 'pm2_dash_out', file: '/root/.pm2/logs/socialtracker-dashboard-out.log' },
      { name: 'pm2_dash_err', file: '/root/.pm2/logs/socialtracker-dashboard-error.log' },
      { name: 'nginx_error', file: '/var/log/nginx/socialtracker_error.log' }
    ];

    for (const c of candidates) {
      try {
        if (fs.existsSync(c.file)) {
          const stats = fs.statSync(c.file);
          // Lê os últimos 100KB do arquivo para não sobrecarregar
          const readSize = Math.min(stats.size, 100 * 1024);
          const buffer = Buffer.alloc(readSize);
          const fd = fs.openSync(c.file, 'r');
          fs.readSync(fd, buffer, 0, readSize, Math.max(0, stats.size - readSize));
          fs.closeSync(fd);
          logs[c.name] = buffer.toString('utf-8');
        }
      } catch (err: any) {
        logs[c.name] = `Erro ao ler ${c.file}: ${err.message}`;
      }
    }

    // 2. Se estiver em ambiente Linux com PM2, tenta capturar via comando pm2 logs
    if (process.platform !== 'win32') {
      try {
        const { stdout: pm2Output } = await execAsync(`pm2 logs --lines ${lines} --nostream`, { timeout: 4000 });
        if (pm2Output) {
          logs['pm2_realtime'] = pm2Output;
        }
      } catch (e: any) {
        // PM2 pode não estar no PATH global direto
        try {
          const { stdout: pm2List } = await execAsync('pm2 status', { timeout: 3000 });
          if (pm2List) logs['pm2_status'] = pm2List;
        } catch (_) {}
      }
    }

    // 3. Status e histórico recente da automação e do daemon no SQLite
    try {
      const { getDb } = await import('@/lib/db');
      const db = await getDb();

      const daemonStatus = await db.get('SELECT * FROM automacao_daemon_status ORDER BY id DESC LIMIT 1').catch(() => null);
      const ultimasPublicacoes = await db.all('SELECT * FROM automacao_publicacoes ORDER BY id DESC LIMIT 20').catch(() => []);

      logs['db_daemon_status'] = daemonStatus ? JSON.stringify(daemonStatus, null, 2) : 'Nenhum registro de status encontrado';
      logs['db_recent_posts'] = ultimasPublicacoes.length > 0 
        ? ultimasPublicacoes.map(p => `[${p.publicado_em || p.data_local}] @${p.username} (${p.tipo_postagem}) Status: ${p.status} ${p.erro_detalhe ? '| Erro: ' + p.erro_detalhe : ''}`).join('\n')
        : 'Nenhuma publicação recente no banco';
    } catch (dbErr: any) {
      logs['db_error'] = dbErr.message;
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      platform: process.platform,
      logs
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
