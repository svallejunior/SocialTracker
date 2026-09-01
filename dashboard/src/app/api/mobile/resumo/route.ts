import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();

    // 1. Data e Hora da Última Atualização Geral
    const lastUpdateRow = await db.get(`
      SELECT MAX(data_coleta) as ultima_coleta FROM perfis_historico
    `);
    const ultimaAtualizacao = lastUpdateRow?.ultima_coleta || null;

    // 2. Apenas Minhas Modelos ATIVAS (meu_perfil = 1 ou com Meta ID configurado)
    const perfis = await db.all(`
      SELECT 
        p.username,
        p.status,
        p.meu_perfil,
        p.foto_perfil_meta,
        ac.meta_account_id,
        cp.nome,
        cp.foto_url,
        cp.status as status_controle,
        cp.inicio
      FROM perfis_monitorados p
      LEFT JOIN automacao_config ac ON (LOWER(p.username) = LOWER(ac.username) AND ac.id != 'default_config')
      LEFT JOIN controle_perfis cp ON LOWER(p.username) = LOWER(cp.username)
      WHERE UPPER(COALESCE(p.status, 'ATIVO')) = 'ATIVO'
        AND (p.meu_perfil = 1 OR LENGTH(TRIM(COALESCE(ac.meta_account_id, ''))) > 0)
      ORDER BY p.username ASC
    `);

    // 3. Histórico dos Perfis (apenas coletas válidas) para calcular evoluções:
    const historico = await db.all(`
      SELECT id, username, data_coleta, seguidores, total_posts, data_carga, inativo
      FROM perfis_historico
      WHERE seguidores > 0 AND COALESCE(inativo, 0) = 0
      ORDER BY datetime(data_coleta) ASC, id ASC
    `);

    // Agrupa histórico por username
    const histByUser: Record<string, any[]> = {};
    for (const h of historico) {
      const u = (h.username || '').toLowerCase();
      if (!histByUser[u]) histByUser[u] = [];
      histByUser[u].push(h);
    }

    // 4. Posts Históricos para calcular médias por formato e posts do dia
    const rawPosts = await db.all(`
      SELECT post_id, username, data_postagem, formato, views, likes, comentarios, reach, shortcode, permalink
      FROM posts_historico
      ORDER BY data_postagem DESC
    `);

    // Calcula médias de visualizações/engajamento por (username, formato)
    const mediasFormato: Record<string, number[]> = {};
    const postsByUser: Record<string, any[]> = {};

    for (const p of rawPosts) {
      const u = (p.username || '').toLowerCase();
      if (!postsByUser[u]) postsByUser[u] = [];
      postsByUser[u].push(p);

      let fmt = p.formato || 'Imagem';
      const fUpper = fmt.toUpperCase();
      if (fUpper === 'VIDEO' || fUpper === 'REELS') fmt = 'Reels';
      else if (fUpper === 'CAROUSEL_ALBUM' || fUpper === 'CARROSSEL' || fUpper === 'ALBUM') fmt = 'Carrossel';
      else fmt = 'Imagem';

      const views = Number(p.views) || 0;
      const reach = Number(p.reach) || 0;
      const likes = Number(p.likes) || 0;
      const coms = Number(p.comentarios) || 0;
      const val = views > 0 ? views : (reach > 0 ? reach : (likes + coms));

      const key = `${u}_${fmt.toLowerCase()}`;
      if (!mediasFormato[key]) mediasFormato[key] = [];
      mediasFormato[key].push(val);
    }

    const mediaCalculada: Record<string, number> = {};
    for (const [key, vals] of Object.entries(mediasFormato)) {
      mediaCalculada[key] = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 1;
    }

    const perfisProcessados = perfis.map((p: any) => {
      const u = (p.username || '').toLowerCase();
      const userHistory = histByUser[u] || [];
      const totalColetas = userHistory.length;

      const atual = totalColetas > 0 ? userHistory[totalColetas - 1] : null;
      const penultimo = totalColetas > 1 ? userHistory[totalColetas - 2] : null;

      const seguidoresAtuais = atual ? Number(atual.seguidores) : 0;
      const postsAtuais = atual ? Number(atual.total_posts) : 0;

      // 1) Variação na Última Coleta (diferença entre a última leitura e a leitura imediatamente anterior)
      let variacaoUltima = 0;
      if (atual && penultimo) {
        variacaoUltima = seguidoresAtuais - Number(penultimo.seguidores);
      }

      // 2) Variação no Dia (crescimento acumulado desde a zero hora / 00:00 do dia da última leitura)
      let variacaoDia = 0;
      let postsDia = 0;
      let diaRef = '';

      if (atual && atual.data_coleta) {
        diaRef = String(atual.data_coleta).substring(0, 10); // 'YYYY-MM-DD'
        const limiteZeroHora = `${diaRef} 00:00:00`;

        // Busca a leitura de referência na virada da meia-noite
        const leiturasAntes00h = userHistory.filter((h: any) => String(h.data_coleta) < limiteZeroHora);
        const leiturasDeHoje = userHistory.filter((h: any) => String(h.data_coleta) >= limiteZeroHora);

        let baseDia: any = null;
        if (leiturasAntes00h.length > 0) {
          // Última leitura realizada antes das 00:00 (ex: 23:28 da noite anterior)
          baseDia = leiturasAntes00h[leiturasAntes00h.length - 1];
        } else if (leiturasDeHoje.length > 0) {
          // Primeira leitura realizada hoje
          baseDia = leiturasDeHoje[0];
        } else {
          baseDia = atual;
        }

        if (baseDia) {
          variacaoDia = seguidoresAtuais - Number(baseDia.seguidores);
          const diffPosts = postsAtuais - Number(baseDia.total_posts || 0);
          postsDia = diffPosts > 0 ? diffPosts : 0;
        }
      }

      // 3) Postagens da Modelo no Dia
      const userPosts = postsByUser[u] || [];
      const postsHojeList = userPosts
        .filter((post: any) => diaRef ? String(post.data_postagem || '').startsWith(diaRef) : false)
        .map((post: any) => {
          let fmt = post.formato || 'Imagem';
          const fUpper = fmt.toUpperCase();
          if (fUpper === 'VIDEO' || fUpper === 'REELS') fmt = 'Reels';
          else if (fUpper === 'CAROUSEL_ALBUM' || fUpper === 'CARROSSEL' || fUpper === 'ALBUM') fmt = 'Carrossel';
          else fmt = 'Imagem';

          const views = Number(post.views) || 0;
          const reach = Number(post.reach) || 0;
          const likes = Number(post.likes) || 0;
          const coms = Number(post.comentarios) || 0;
          const val = views > 0 ? views : (reach > 0 ? reach : (likes + coms));

          const media = mediaCalculada[`${u}_${fmt.toLowerCase()}`] || (val > 0 ? val : 1);
          const mult = media > 0 ? (val / media) : 1.0;
          const multStr = mult.toFixed(1).replace('.', ',') + 'x';

          const url = post.permalink || (post.shortcode ? `https://www.instagram.com/p/${post.shortcode}/` : `https://www.instagram.com/${p.username}/`);

          return {
            post_id: post.post_id,
            formato: fmt,
            visualizacoes: val,
            multiplicador: mult,
            multiplicador_str: multStr,
            destaque: mult >= 1.5,
            data_postagem: post.data_postagem,
            hora: post.data_postagem ? post.data_postagem.substring(11, 16) : '',
            url: url
          };
        });

      const foto = (p.foto_perfil_meta && String(p.foto_perfil_meta).trim().length > 0)
        ? p.foto_perfil_meta
        : (p.foto_url || null);

      return {
        username: p.username,
        nome: p.nome || p.username,
        foto_url: foto,
        seguidores: seguidoresAtuais,
        total_posts: postsAtuais,
        variacao_ultima: variacaoUltima,
        variacao_dia: variacaoDia,
        posts_dia: postsDia,
        posts_hoje: postsHojeList,
        meu_perfil: true,
        ultima_coleta: atual ? atual.data_coleta : null
      };
    });

    // 4. Agendamentos: "O que tem pra fazer" vs "O que foi feito"
    // "O que tem pra fazer": automacao_agendamentos com status AGENDADO ou PUBLICANDO
    let aFazer: any[] = [];
    try {
      const rowsAFazer = await db.all(`
        SELECT 
          id, username, tipo_postagem, tipo_agendamento, data_especifica,
          data_inicio, data_fim, dias_selecionados, modo_hora, hora_fixa,
          hora_janela_inicio, hora_janela_fim, legenda, status, criado_em, arquivos
        FROM automacao_agendamentos
        WHERE status IN ('AGENDADO', 'PUBLICANDO')
        ORDER BY criado_em DESC
      `);

      aFazer = rowsAFazer.map((item: any) => ({
        ...item,
        arquivos: (() => {
          try { return JSON.parse(item.arquivos || '[]'); } catch { return []; }
        })(),
        dias_selecionados: (() => {
          try { return JSON.parse(item.dias_selecionados || '[]'); } catch { return []; }
        })()
      }));
    } catch (e) {
      aFazer = [];
    }

    // "O que foi feito": automacao_publicacoes recentes ou agendamentos PUBLICADOS
    let concluidos: any[] = [];
    try {
      const rowsFeitos = await db.all(`
        SELECT 
          id, agendamento_id, username, tipo_postagem, data_local, hora_local,
          publicado_em, status, meta_media_id, arquivos, legenda
        FROM automacao_publicacoes
        ORDER BY publicado_em DESC, data_local DESC, hora_local DESC
        LIMIT 15
      `);

      concluidos = rowsFeitos.map((item: any) => ({
        ...item,
        arquivos: (() => {
          try { return JSON.parse(item.arquivos || '[]'); } catch { return []; }
        })()
      }));
    } catch (e) {
      concluidos = [];
    }

    return NextResponse.json({
      success: true,
      ultima_atualizacao: ultimaAtualizacao,
      perfis: perfisProcessados,
      agendamentos: {
        a_fazer: aFazer,
        concluidos: concluidos
      }
    });

  } catch (error: any) {
    console.error('Erro no /api/mobile/resumo:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
