// Janelas de horário (Brasília) e o impacto esperado na distribuição, considerando que o
// algoritmo pode testar a entrega em outros fusos (ex.: Índia) quando o post sai fora do pico
// brasileiro. Horários em minutos desde 00:00 (BRT). Janela que cruza a meia-noite tem fim < início.

export type NivelJanela = 'MELHOR' | 'RECOMENDADO' | 'CUIDADO' | 'EVITE';

export interface JanelaHorario {
  nivel: NivelJanela;
  rotulo: string;
  inicio: number;
  fim: number;
  intervaloBRT: string;
  intervaloIST: string;
  impacto: string;
}

const hm = (h: number, m = 0) => h * 60 + m;

export const JANELAS_HORARIO: JanelaHorario[] = [
  {
    nivel: 'EVITE',
    rotulo: 'Evite',
    inicio: hm(5),
    fim: hm(9),
    intervaloBRT: '05h00 – 09h00',
    intervaloIST: '13h30 – 17h30',
    impacto: 'Pior momento: tarde cheia na Índia, grande risco de entrega precoce lá.'
  },
  {
    nivel: 'RECOMENDADO',
    rotulo: 'Recomendado',
    inicio: hm(12),
    fim: hm(14),
    intervaloBRT: '12h00 – 14h00',
    intervaloIST: '20h30 – 22h30',
    impacto: 'Horário de almoço no Brasil; a Índia já está encerrando o dia.'
  },
  {
    nivel: 'MELHOR',
    rotulo: 'Melhor opção',
    inicio: hm(18),
    fim: hm(21),
    intervaloBRT: '18h00 – 21h00',
    intervaloIST: '02h30 – 05h30',
    impacto: 'Pico no Brasil e madrugada profunda na Índia: quase zero engajamento indiano nas primeiras 2 horas.'
  },
  {
    nivel: 'CUIDADO',
    rotulo: 'Cuidado',
    inicio: hm(22),
    fim: hm(1),
    intervaloBRT: '22h00 – 01h00',
    intervaloIST: '06h30 – 09h30',
    impacto: 'Início da manhã na Índia; o algoritmo pode testar a entrega lá enquanto o Brasil dorme.'
  }
];

// Ordem de severidade usada para escolher qual aviso destacar quando um intervalo toca várias janelas.
const PRIORIDADE: Record<NivelJanela, number> = { EVITE: 0, CUIDADO: 1, RECOMENDADO: 2, MELHOR: 3 };

export function horaParaMinutos(hhmm: string | undefined | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Intervalo [a, b] (inclusive, em minutos 0..1439, pode cruzar a meia-noite se b < a) toca a janela?
function intervalosSeTocam(a1: number, a2: number, b1: number, b2: number): boolean {
  const partes = (ini: number, fim: number): Array<[number, number]> =>
    fim >= ini ? [[ini, fim]] : [[ini, 1439], [0, fim]];
  for (const [x1, x2] of partes(a1, a2)) {
    for (const [y1, y2] of partes(b1, b2)) {
      if (x1 <= y2 && y1 <= x2) return true;
    }
  }
  return false;
}

export interface ResultadoJanela {
  // Janelas tocadas pelo horário/intervalo, da mais crítica para a menos crítica.
  janelas: JanelaHorario[];
  // Janela mais crítica (define a cor do aviso) ou null se cair fora de todas as janelas mapeadas.
  principal: JanelaHorario | null;
}

// inicio/fim em minutos; para horário fixo, passe o mesmo valor nos dois.
export function classificarIntervalo(inicio: number, fim: number): ResultadoJanela {
  const tocadas = JANELAS_HORARIO.filter(j => intervalosSeTocam(inicio, fim, j.inicio, j.fim)).sort(
    (a, b) => PRIORIDADE[a.nivel] - PRIORIDADE[b.nivel]
  );
  return { janelas: tocadas, principal: tocadas[0] ?? null };
}
