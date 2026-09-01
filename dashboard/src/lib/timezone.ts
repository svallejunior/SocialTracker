/**
 * timezone.ts — Utilitário de Padronização de Fuso Horário (Horário do Brasil / UTC-3)
 * SocialTracker Engine
 */

export const BRAZIL_TIMEZONE = 'America/Sao_Paulo';

/**
 * Converte qualquer data (Date, timestamp UTC ISO, unix timestamp ou string)
 * para string no formato de banco SQLite 'YYYY-MM-DD HH:MM:SS' no Horário de Brasília (UTC-3).
 */
export function formatToBrazilDateTime(val?: string | number | Date | null): string {
  if (!val) {
    return formatInBrazilTz(new Date());
  }

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '' : formatInBrazilTz(val);
  }

  if (typeof val === 'number') {
    const ts = val > 5000000000 ? val : val * 1000;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '' : formatInBrazilTz(d);
  }

  const s = String(val).trim();
  if (!s) return formatInBrazilTz(new Date());

  // Se for unix timestamp em string
  if (/^\d+(\.\d+)?$/.test(s)) {
    const num = parseFloat(s);
    const ts = num > 5000000000 ? num : num * 1000;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? s : formatInBrazilTz(d);
  }

  // Se já for string ingênua 'YYYY-MM-DD HH:MM:SS' sem fuso explícito
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.replace('T', ' ').substring(0, 19);
  }

  // Se tiver fuso horário ISO (Z, +0000, +00:00, etc.)
  try {
    let iso = s.replace(' ', 'T');
    // Trata +0000 -> +00:00
    if (/[+-]\d{4}$/.test(iso)) {
      iso = iso.slice(0, -2) + ':' + iso.slice(-2);
    }
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return formatInBrazilTz(d);
    }
  } catch {}

  return s.replace('T', ' ').substring(0, 19);
}

/**
 * Retorna apenas a data 'YYYY-MM-DD' no Horário de Brasília.
 */
export function formatToBrazilDate(val?: string | number | Date | null): string {
  const dtStr = formatToBrazilDateTime(val);
  return dtStr ? dtStr.substring(0, 10) : '';
}

/**
 * Formata para exibição em tela: 'DD/MM/YYYY, HH:mm'
 */
export function formatDisplayDateTimeBR(val?: string | number | Date | null): string {
  if (!val) return '—';
  const dtStr = formatToBrazilDateTime(val);
  if (!dtStr || dtStr.length < 10) return String(val);
  
  const [dataPart, horaPart] = dtStr.split(' ');
  const [ano, mes, dia] = dataPart.split('-');
  if (!ano || !mes || !dia) return String(val);

  if (!horaPart) {
    return `${dia}/${mes}/${ano}`;
  }
  const [h, m] = horaPart.split(':');
  return `${dia}/${mes}/${ano}, ${h}:${m}`;
}

/**
 * Formata para exibição em tela apenas a data: 'DD/MM/YYYY'
 */
export function formatDisplayDateBR(val?: string | number | Date | null): string {
  if (!val) return '—';
  const dtStr = formatToBrazilDateTime(val);
  if (!dtStr || dtStr.length < 10) return String(val);
  
  const [dataPart] = dtStr.split(' ');
  const [ano, mes, dia] = dataPart.split('-');
  if (!ano || !mes || !dia) return String(val);
  return `${dia}/${mes}/${ano}`;
}

/**
 * Helper interno para extrair partes com Intl na timezone America/Sao_Paulo.
 */
function formatInBrazilTz(d: Date): string {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
