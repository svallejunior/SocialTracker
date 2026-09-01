import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseDateOnly(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const str = dateStr.trim();

  const matchYMD = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (matchYMD) {
    const year = parseInt(matchYMD[1], 10);
    const validYear = year > 2000 && year < 2100 ? year : parseInt(matchYMD[1].slice(-4), 10);
    return new Date(`${validYear}-${matchYMD[2]}-${matchYMD[3]}T00:00:00`);
  }

  const matchDMY = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchDMY) {
    return new Date(`${matchDMY[3]}-${matchDMY[2]}-${matchDMY[1]}T00:00:00`);
  }

  return null;
}

function getPercentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * (p / 100);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tipoTrafegoFiltro = searchParams.get('tipo_trafego') || 'GERAL';
    const targetUsername = searchParams.get('username') || '';
    const meusPerfisParam = searchParams.get('meus_perfis');
    let customMeusPerfisUsernames: string[] | null = null;
    if (meusPerfisParam !== null) {
      customMeusPerfisUsernames = meusPerfisParam ? meusPerfisParam.split(',').map(s => s.trim()).filter(Boolean) : [];
    }

    const db = await getDb();

    // 1. Busca todos os perfis monitorados incluindo status
    const profiles = await db.all(`
      SELECT 
        pm.username, 
        pm.primeira_postagem, 
        pm.meu_perfil, 
        COALESCE(pm.tipo_trafego, 'NA') AS tipo_trafego, 
        COALESCE(pm.tipo_conta, 'IA') AS tipo_conta,
        COALESCE(pm.status, cp.status, 'ATIVO') AS status
      FROM perfis_monitorados pm
      LEFT JOIN controle_perfis cp ON pm.username = cp.username
    `);

    // 2. Busca todo o histórico de seguidores (excluindo janelas marcadas como ADS/IGNORAR)
    const historyRows = await db.all(`
      SELECT username, data_coleta, seguidores
      FROM perfis_historico
      WHERE seguidores IS NOT NULL
        AND (tipo_janela IS NULL OR tipo_janela IN ('ORGANICO', 'VIRAL_ORGANICO'))
      ORDER BY data_coleta ASC
    `);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const historyByUser: { [username: string]: { date: Date; dateStr: string; seguidores: number }[] } = {};
    historyRows.forEach(row => {
      const u = row.username;
      const cDate = parseDateOnly(row.data_coleta);
      if (!cDate || row.seguidores === null) return;
      if (!historyByUser[u]) historyByUser[u] = [];

      const dateStr = cDate.toISOString().split('T')[0];
      const existing = historyByUser[u].find(h => h.dateStr === dateStr);
      if (existing) {
        if (row.seguidores > existing.seguidores) existing.seguidores = row.seguidores;
      } else {
        historyByUser[u].push({ date: cDate, dateStr, seguidores: row.seguidores });
      }
    });

    Object.keys(historyByUser).forEach(u => {
      historyByUser[u].sort((a, b) => a.date.getTime() - b.date.getTime());
    });

    const targetProfileObj = targetUsername ? profiles.find(p => p.username === targetUsername) : null;
    const targetTipoConta = targetProfileObj ? targetProfileObj.tipo_conta : null;

    // 3. Processa cada perfil para determinar D0 e calcular Ganho Líquido (Delta S) e Percentual por dia
    interface ProfileData {
      username: string;
      meu_perfil: number;
      tipo_trafego: string;
      tipo_conta: string;
      status: string;
      isMorreu: boolean;
      startDate: Date;
      baseFollowers: number;
      firstCollectedDay: number;
      maxRelativeDay: number;
      reaisDelta: { [day: number]: number };
    }

    const profileDataMap: { [username: string]: ProfileData } = {};

    profiles.forEach(p => {
      const uHistory = historyByUser[p.username] || [];

      let pDate = parseDateOnly(p.primeira_postagem);
      // Se a data configurada for no futuro (erro de digitação de ano), usa a primeira coleta disponível
      if (pDate && pDate.getTime() > today.getTime()) {
        if (uHistory.length > 0) pDate = uHistory[0].date;
        else pDate = today;
      }
      if (!pDate) {
        if (uHistory.length > 0) pDate = uHistory[0].date;
      }
      if (!pDate) return;

      const beforeD0 = uHistory.filter(h => h.date.getTime() <= pDate!.getTime());
      const baseFollowers = beforeD0.length > 0 ? beforeD0[beforeD0.length - 1].seguidores : (uHistory.length > 0 ? uHistory[0].seguidores : 0);

      const validHistory = uHistory.filter(h => h.date.getTime() >= pDate!.getTime());

      let firstCollectedDay = 999;
      if (beforeD0.length > 0) {
        firstCollectedDay = 0;
      } else if (validHistory.length > 0) {
        firstCollectedDay = Math.floor((validHistory[0].date.getTime() - pDate!.getTime()) / (1000 * 60 * 60 * 24));
      }

      const statusUpper = (p.status || '').toUpperCase();
      // Considera morto: MORREU, MORTO, FALECIDO ou INATIVO
      const isMorreu =
        statusUpper.includes('MORREU') ||
        statusUpper.includes('MORTO') ||
        statusUpper.includes('FALECID') ||
        statusUpper.includes('INATIVO');

      // Se a conta está marcada como morta, a última coleta real é o limite — não projeta até hoje
      const daysToToday = Math.max(0, Math.floor((today.getTime() - pDate.getTime()) / (1000 * 60 * 60 * 24)));
      let maxRelativeDay = (Number(p.meu_perfil) === 1 && !isMorreu) ? daysToToday : 0;
      const reaisDelta: { [day: number]: number } = {};

      validHistory.forEach(h => {
        const diffDays = Math.floor((h.date.getTime() - pDate!.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 90) {
          const deltaS = Math.max(0, h.seguidores - baseFollowers);
          const curr = reaisDelta[diffDays];
          if (curr === undefined || deltaS > curr) {
            reaisDelta[diffDays] = deltaS;
          }
          if (diffDays > maxRelativeDay) {
            maxRelativeDay = diffDays;
          }
        }
      });

      if (reaisDelta[0] === undefined && Number(p.meu_perfil) === 1 && (!isMorreu || maxRelativeDay >= 0)) {
        reaisDelta[0] = 0;
        firstCollectedDay = 0;
      }

      const MAX_INTERP_GAP = 14;
      const knownDays = Object.keys(reaisDelta).map(Number).sort((a, b) => a - b);
      for (let ki = 0; ki < knownDays.length - 1; ki++) {
        const d1 = knownDays[ki];
        const d2 = knownDays[ki + 1];
        const gap = d2 - d1;
        if (gap <= 1) continue;
        if (Number(p.meu_perfil) === 0 && gap > MAX_INTERP_GAP) continue;
        const v1 = reaisDelta[d1];
        const v2 = reaisDelta[d2];
        for (let gapDay = d1 + 1; gapDay < d2; gapDay++) {
          const t = (gapDay - d1) / (d2 - d1);
          reaisDelta[gapDay] = Math.round(v1 + t * (v2 - v1));
        }
      }

      profileDataMap[p.username] = {
        username: p.username,
        meu_perfil: Number(p.meu_perfil) === 1 ? 1 : 0,
        tipo_trafego: p.tipo_trafego || 'NA',
        tipo_conta: p.tipo_conta || 'IA',
        status: p.status || 'ATIVO',
        isMorreu,
        startDate: pDate,
        baseFollowers,
        firstCollectedDay,
        maxRelativeDay: Math.min(maxRelativeDay, 90),
        reaisDelta
      };
    });

    // 4. Imputação por Forward Fill (LOCF)
    interface ImputedProfileData {
      username: string;
      meu_perfil: number;
      tipo_trafego: string;
      tipo_conta: string;
      status: string;
      isMorreu: boolean;
      baseFollowers: number;
      firstCollectedDay: number;
      maxRelativeDay: number;
      deltasAcumulados: number[];
      totalAcumulado: number[];
      pctDeltasAcumulados: number[];
      imputado: boolean[];
    }

    const imputedProfiles: { [username: string]: ImputedProfileData } = {};

    Object.values(profileDataMap).forEach(pData => {
      const maxDay = pData.maxRelativeDay;
      const deltasAcumulados: number[] = [];
      const totalAcumulado: number[] = [];
      const pctDeltasAcumulados: number[] = [];
      const imputado: boolean[] = [];

      let lastDelta = 0;
      const baseS = pData.baseFollowers > 0 ? pData.baseFollowers : 1;

      for (let d = 0; d <= maxDay; d++) {
        if (pData.reaisDelta[d] !== undefined) {
          lastDelta = Math.max(lastDelta, pData.reaisDelta[d]);
          deltasAcumulados[d] = lastDelta;
          totalAcumulado[d] = pData.baseFollowers + lastDelta;
          pctDeltasAcumulados[d] = Math.round((lastDelta / baseS) * 1000) / 10;
          imputado[d] = false;
        } else {
          deltasAcumulados[d] = lastDelta;
          totalAcumulado[d] = pData.baseFollowers + lastDelta;
          pctDeltasAcumulados[d] = Math.round((lastDelta / baseS) * 1000) / 10;
          imputado[d] = true;
        }
      }

      imputedProfiles[pData.username] = {
        username: pData.username,
        meu_perfil: pData.meu_perfil,
        tipo_trafego: pData.tipo_trafego,
        tipo_conta: pData.tipo_conta,
        status: pData.status,
        isMorreu: pData.isMorreu,
        baseFollowers: pData.baseFollowers,
        firstCollectedDay: pData.firstCollectedDay,
        maxRelativeDay: maxDay,
        deltasAcumulados,
        totalAcumulado,
        pctDeltasAcumulados,
        imputado
      };
    });

    // 5. Separa o BENCHMARK (INCLUI "meus perfis" conforme solicitado pelo usuário — removida a trava meu_perfil !== 0)
    const benchmarkProfiles = Object.values(imputedProfiles).filter(p => {
      if (targetTipoConta && p.tipo_conta !== targetTipoConta) return false;
      if (tipoTrafegoFiltro === 'ORGANICO' || tipoTrafegoFiltro === 'ADS') {
        if (p.tipo_trafego !== tipoTrafegoFiltro) return false;
      }
      return true;
    });

    const meusPerfisList = Object.values(imputedProfiles).filter(p => {
      if (customMeusPerfisUsernames !== null) {
        return customMeusPerfisUsernames.includes(p.username);
      }
      if (p.meu_perfil === 1) {
        if (tipoTrafegoFiltro !== 'GERAL' && tipoTrafegoFiltro) {
          return p.tipo_trafego === tipoTrafegoFiltro;
        }
        return true;
      }
      return false;
    });

    if (targetUsername && imputedProfiles[targetUsername]) {
      if (!meusPerfisList.some(p => p.username === targetUsername)) {
        meusPerfisList.push(imputedProfiles[targetUsername]);
      }
    }

    let globalMaxDay = 0;
    if (targetUsername && imputedProfiles[targetUsername]) {
      globalMaxDay = imputedProfiles[targetUsername].maxRelativeDay;
    } else {
      Object.values(imputedProfiles).forEach(p => {
        if (p.maxRelativeDay > globalMaxDay) globalMaxDay = p.maxRelativeDay;
      });
    }

    globalMaxDay = Math.min(globalMaxDay, 90);
    if (globalMaxDay < 7) globalMaxDay = 7;

    // 6. Para cada dia relativo D, calcula os Percentis Absolutos (Ganho e Total) E Percentuais
    const resultData: any[] = [];
    let lastValidP25 = 0;
    let lastValidP50 = 0;
    let lastValidP75 = 0;

    let lastValidTotalP25 = 0;
    let lastValidTotalP50 = 0;
    let lastValidTotalP75 = 0;

    let lastValidPctP25 = 0;
    let lastValidPctP50 = 0;
    let lastValidPctP75 = 0;

    let hasValidSample = false;

    for (let d = 0; d <= globalMaxDay; d++) {
      const activeBenchmarkDeltas: number[] = [];
      const activeBenchmarkTotals: number[] = [];
      const activeBenchmarkPctDeltas: number[] = [];

      benchmarkProfiles.forEach(p => {
        if (d >= p.firstCollectedDay && d <= p.maxRelativeDay && p.deltasAcumulados[d] !== undefined && !p.imputado[d]) {
          activeBenchmarkDeltas.push(p.deltasAcumulados[d]);
          activeBenchmarkTotals.push(p.totalAcumulado[d]);
          activeBenchmarkPctDeltas.push(p.pctDeltasAcumulados[d]);
        }
      });

      activeBenchmarkDeltas.sort((a, b) => a - b);
      activeBenchmarkTotals.sort((a, b) => a - b);
      activeBenchmarkPctDeltas.sort((a, b) => a - b);
      const sampleCount = activeBenchmarkDeltas.length;

      let p25 = 0, p50 = 0, p75 = 0;
      let totalP25 = 0, totalP50 = 0, totalP75 = 0;
      let pctP25 = 0, pctP50 = 0, pctP75 = 0;
      let amostraInsuficiente = false;

      if (sampleCount >= 1) {
        p25 = Math.round(getPercentile(activeBenchmarkDeltas, 25));
        p50 = Math.round(getPercentile(activeBenchmarkDeltas, 50));
        p75 = Math.round(getPercentile(activeBenchmarkDeltas, 75));

        totalP25 = Math.round(getPercentile(activeBenchmarkTotals, 25));
        totalP50 = Math.round(getPercentile(activeBenchmarkTotals, 50));
        totalP75 = Math.round(getPercentile(activeBenchmarkTotals, 75));

        pctP25 = Math.round(getPercentile(activeBenchmarkPctDeltas, 25) * 10) / 10;
        pctP50 = Math.round(getPercentile(activeBenchmarkPctDeltas, 50) * 10) / 10;
        pctP75 = Math.round(getPercentile(activeBenchmarkPctDeltas, 75) * 10) / 10;

        lastValidP25 = p25;
        lastValidP50 = p50;
        lastValidP75 = p75;

        lastValidTotalP25 = totalP25;
        lastValidTotalP50 = totalP50;
        lastValidTotalP75 = totalP75;

        lastValidPctP25 = pctP25;
        lastValidPctP50 = pctP50;
        lastValidPctP75 = pctP75;

        hasValidSample = true;
        amostraInsuficiente = sampleCount < 3;
      } else {
        amostraInsuficiente = true;
        if (hasValidSample) {
          p25 = lastValidP25;
          p50 = lastValidP50;
          p75 = lastValidP75;

          totalP25 = lastValidTotalP25;
          totalP50 = lastValidTotalP50;
          totalP75 = lastValidTotalP75;

          pctP25 = lastValidPctP25;
          pctP50 = lastValidPctP50;
          pctP75 = lastValidPctP75;
        }
      }

      if (d === 0) {
        p25 = 0;
        p50 = 0;
        p75 = 0;
        pctP25 = 0;
        pctP50 = 0;
        pctP75 = 0;
      }

      const item: any = {
        dia_relativo: `Dia ${d}`,
        dia_num: d,
        p25_min: p25,
        p50_mediana: p50,
        p75_max: p75,
        total_p25_min: totalP25,
        total_p50_mediana: totalP50,
        total_p75_max: totalP75,
        pct_p25_min: pctP25,
        pct_p50_mediana: pctP50,
        pct_p75_max: pctP75,
        amostra_count: sampleCount,
        amostra_insuficiente: amostraInsuficiente,
        meus_perfis_detalhes: {}
      };

      meusPerfisList.forEach(mp => {
        if (d <= mp.maxRelativeDay && mp.deltasAcumulados[d] !== undefined) {
          const isDia0 = d === 0;
          item[`real_${mp.username}`] = isDia0 ? 0 : mp.deltasAcumulados[d];
          item[`total_real_${mp.username}`] = mp.totalAcumulado[d];
          item[`pct_real_${mp.username}`] = isDia0 ? 0 : mp.pctDeltasAcumulados[d];
          item.meus_perfis_detalhes[mp.username] = {
            ganho: isDia0 ? 0 : mp.deltasAcumulados[d],
            total: mp.totalAcumulado[d],
            base: mp.baseFollowers,
            pct_ganho: isDia0 ? 0 : mp.pctDeltasAcumulados[d],
            imputado: mp.imputado[d]
          };
        }
      });

      resultData.push(item);
    }

    return NextResponse.json({
      success: true,
      tipo_trafego: tipoTrafegoFiltro,
      username: targetUsername,
      tipo_conta_benchmark: targetTipoConta,
      meus_perfis: meusPerfisList.map(m => m.username),
      todos_perfis: Object.values(imputedProfiles).map(p => ({ 
        username: p.username, 
        meu_perfil: p.meu_perfil,
        status: p.status,
        is_morreu: p.isMorreu,
        max_dia: p.maxRelativeDay
      })),
      data: resultData
    });

  } catch (error: any) {
    console.error("Erro no GET /api/projecao:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
