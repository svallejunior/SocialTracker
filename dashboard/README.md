# SocialTracker Dashboard 📈

Interface web principal da plataforma **SocialTracker**. Para arquitetura geral, schema do banco, scripts de coleta e deploy, consulte o [README da raiz](../README.md).

## 🛠️ Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org/) (App Router) + React 19 |
| Gráficos | [Recharts 3](https://recharts.org/) |
| Banco | SQLite lido diretamente (`sqlite` + `sqlite3`) |
| Storage de mídia | [Supabase Storage](https://supabase.com/storage) (`@supabase/supabase-js`) |
| Ícones | `lucide-react` |
| Estilo | CSS puro em `src/app/globals.css` (paleta SaaS Dark Premium) |

> ⚠️ Esta versão do Next.js tem breaking changes em relação às anteriores. Antes de escrever código, consulte os guias em `node_modules/next/dist/docs/` (ver `AGENTS.md`).

## 🚀 Como Iniciar

Requer [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

```bash
npm run build   # build de produção
npm start       # serve o build
npm run lint    # ESLint
```

## 🗄️ Resolução do Banco de Dados

As rotas resolvem o SQLite nesta ordem (`resolveDbPath()`):

1. `process.env.DB_PATH`, se o arquivo existir
2. `../instagram_tracker.db` (raiz do repositório) — caso padrão
3. `./instagram_tracker.db`

As rotas rodam migrações idempotentes ao abrir a conexão, então colunas e tabelas novas são criadas sozinhas.

## ⚙️ Variáveis de Ambiente

Copie `.env.example` para `.env.local`. As chaves de Supabase e Meta são compartilhadas com o `.env` da raiz — ver a tabela completa no [README principal](../README.md#2-variáveis-de-ambiente).

| Variável | Uso |
| --- | --- |
| `DB_PATH` | Sobrescreve o caminho do SQLite |
| `PYTHON_BIN` | Executável Python usado por `/api/automacao/executar` (default `python`) |
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `NEXT_PUBLIC_SUPABASE_BUCKET` | Upload de mídia dos agendamentos |
| `VPS_API_URL` · `VPS_API_KEY` | Proxy para o `api_server.py` da VPS — helpers prontos em `src/lib/vps-proxy.ts`, **ainda não usados por nenhuma rota** |

`next.config.ts` libera `192.168.0.4` em `allowedDevOrigins` para acesso pela rede local em desenvolvimento.

## 🔌 Rotas de API

| Rota | Métodos | O que faz |
| --- | --- | --- |
| `/api/data` | GET · POST · PUT · DELETE | Perfis monitorados e histórico de seguidores |
| `/api/controle` | GET · POST · PUT · DELETE | Controle operacional, observações e lançamentos financeiros (com rateio via `grupo_rateio`) |
| `/api/projecao` | GET | Benchmark P25/P50/P75 por dia relativo (LOCF + percentis) |
| `/api/anomalias` | GET · POST · PUT | Lista/reclassifica leituras; `POST` varre todo o histórico |
| `/api/anomalias/buscar-viral` | POST | Dispara `buscar_viral.py` na raiz |
| `/api/anomalias/registrar-post-viral` | POST | Grava o post confirmado em `posts_historico` |
| `/api/ingestion` | POST | Dispara `ingestion.py` (opcionalmente para um perfil) |
| `/api/automacao/agendamentos` | GET · POST · PUT · DELETE | CRUD da fila de publicações |
| `/api/automacao/agendamentos/update-meta-id` | POST | Registra o `meta_media_id` retornado pela Meta |
| `/api/automacao/config` | GET · POST | Credenciais da Meta + status do worker |
| `/api/automacao/executar` | POST | Dispara `publicador_instagram.py` (`id`, `force`, `dryRun`) |
| `/api/automacao/upload` | POST | Salva a mídia em `../automacao/<conta>/` e no Supabase Storage |
| `/api/automacao/media/[...path]` | GET | Serve as mídias locais de `../automacao/` |

Rotas que executam Python usam `child_process` e assumem que os scripts estão no diretório pai. Isso só funciona quando o dashboard roda na mesma máquina que os scripts — em deploy separado (ex.: Vercel), é preciso migrar as rotas para o `vps-proxy`.

## 🧩 Componentes

| Componente | Responsabilidade |
| --- | --- |
| `page.tsx` | Shell do dashboard e as 7 abas de navegação |
| `CentralAnomalias.tsx` | Curadoria de anomalias, busca e confirmação do post viral |
| `CentralAutomatizacao.tsx` | Calendário mensal, formulário de agendamento (Feed/Reels/Stories) e configuração da Meta API |
| `GraficoProjecao.tsx` | Curva de benchmark com faixa P25–P75 |
| `ModalLancamento.tsx` | Criação de lançamentos financeiros com rateio entre perfis |
