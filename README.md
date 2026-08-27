# SocialTracker 📈

Plataforma de inteligência competitiva, gestão operacional e automação de publicações para perfis do Instagram.

O sistema cobre três frentes:

1. **Coleta & Análise (Python + Apify)** — ingestão diária de seguidores, detecção automática de anomalias de crescimento e identificação do post responsável por cada salto.
2. **Dashboard Web (Next.js 16 + React 19)** — painel escuro premium com benchmark dinâmico, controle financeiro com rateio, curadoria de anomalias e central de automação.
3. **Motor de Automação (Meta Graph API)** — agendamento e publicação automática de Feed, Carrossel, Reels e Stories, via daemon local.

---

## 🏗️ Arquitetura

Tudo roda na mesma máquina, com o SQLite como fonte única de verdade. O dashboard Next.js abre o banco diretamente (pacotes `sqlite`/`sqlite3`) e dispara os scripts Python via `child_process` — não há servidor de API intermediário.

```text
┌──────────────────┐     Apify Actors      ┌─────────────────────┐
│  ingestion.py    │ ────────────────────▶ │                     │
│  buscar_viral.py │                       │ instagram_tracker.db│
└──────────────────┘                       │      (SQLite)       │
        ▲                                  │                     │
        │                                  │                     │
┌───────┴──────────┐   Meta Graph API      │                     │
│ publicador_      │ ◀──────────────────── │                     │
│ instagram.py     │                       └──────────┬──────────┘
└──────────────────┘                                  │
        ▲                                             │ leitura/escrita direta
        │ spawn / exec                                │
        └──────────────────────────────────┬──────────┴──────────┐
                                           │  dashboard/ (Next)  │
                                           │  App Router :3000   │
                                           │  + rotas /api/*     │
                                           └─────────────────────┘
```

Como as rotas do Next.js acessam o arquivo do banco e executam Python locais, o dashboard **precisa rodar na mesma máquina** que os scripts. Hospedagem serverless (Vercel e afins) exigiria uma camada de API remota, que não existe no projeto.

---

## 📂 Estrutura do Repositório

```text
SocialTracker/
├── ingestion.py                     # Coleta diária de seguidores (Apify) + classificação de anomalias
├── buscar_viral.py                  # Localiza o post responsável por um salto de seguidores (janela 72h)
├── escanear_anomalias_historicas.py # Reclassifica todo o histórico de perfis_historico
├── publicador_instagram.py          # Publicador Meta Graph API (Feed/Carrossel/Reels/Stories) + daemon
├── apify.py                         # Sandbox de testes dos actors do Apify
├── sql_projecao.py                  # Benchmark P50 via SQL puro (recursivo + LOCF + window functions)
├── perfis_monitorados.py            # Semeia a lista inicial de perfis-alvo
├── criar_tabelas.py                 # Executa schema_controle.sql no banco
├── migrate_tipo_janela.py           # Migração idempotente das colunas de classificação
├── schema_controle.sql              # Schema da tabela de controle operacional
├── instagram_tracker.db             # 🗄️ Banco SQLite principal (fonte única de verdade)
├── app.py                           # Dashboard legado em Streamlit (mantido para consulta)
├── automacao/                       # Mídias de agendamento, uma pasta por conta Meta
│   └── <meta_account_id>/           #   ex: automacao/17841426474727460/
├── database.py, check_db.py, check_data.py, sql_lista.py, fix_reedz_date.py
│                                    # Utilitários pontuais de diagnóstico/correção manual
└── dashboard/                       # Interface principal (Next.js App Router)
    ├── src/app/api/                 # Rotas de API (ver tabela abaixo)
    ├── src/app/page.tsx             # Dashboard com as 7 abas de navegação
    ├── src/app/globals.css          # Design system (SaaS Premium Dark)
    └── src/components/
        ├── CentralAnomalias.tsx     # Curadoria de anomalias + busca de post viral
        ├── CentralAutomatizacao.tsx # Calendário e formulário de agendamentos
        ├── GraficoProjecao.tsx      # Curva de benchmark P25/P50/P75
        └── ModalLancamento.tsx      # Lançamentos financeiros (com rateio)
```

---

## 💾 Modelagem do Banco (`instagram_tracker.db`)

As migrações são **idempotentes e automáticas**: tanto as rotas do Next.js (`getDb()`) quanto o `publicador_instagram.py` (`init_db_schema()`) criam tabelas e adicionam colunas faltantes na primeira conexão.

### Monitoramento

**`perfis_monitorados`** — perfis em acompanhamento (PK `username`)

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `username` | TEXT PK | Conta do Instagram |
| `status` | TEXT | `ATIVO` · `INATIVO` · `INDISPONIVEL` · `MORREU` |
| `ativo` / `exibir` / `favorito` | INTEGER | Flags de listagem e destaque |
| `meu_perfil` | INTEGER | `1` = perfil próprio, `0` = perfil de benchmark |
| `primeira_postagem` | TEXT | Âncora do dia relativo `D0` usado no benchmark |
| `tipo_conta` | TEXT | Ex.: `HUMANO` |
| `tipo_trafego` | TEXT | `NA` · `ORGANICO` · … |
| `is_verified` | INTEGER | Selo de verificado |
| `criado_em` | TEXT | Timestamp de cadastro |

**`perfis_historico`** — série temporal de seguidores, com `UNIQUE(username, data_coleta)`

| Coluna | Descrição |
| --- | --- |
| `seguidores`, `seguindo`, `total_posts` | Métricas da coleta |
| `data_coleta` | Timestamp da leitura |
| `inativo` | `1` quando a coleta falhou (perfil privado/inexistente) |
| `tipo_janela` | `ORGANICO` · `ADS` · `VIRAL_ORGANICO` · `IGNORAR` |
| `revisado_manualmente` | `0` = pendente de curadoria, `1` = validado |

**`posts_historico`** — publicações raspadas (PK `post_id`): `shortcode`, `data_postagem`, `formato` (`Reels`/`Carrossel`/`Imagem`), `legenda`, `likes`, `comentarios`, `views`, `taxa_engajamento`.

**`seguidores_historico`** e **`instagram_stats`** — tabelas legadas de coletas antigas.

### Controle operacional e financeiro

**`controle_perfis`** — dados manuais da aba *Controle*: `nome`, `nascimento`, `email`, `reserva`, `linktree`, `inicio`, `telegram`, `fotos_estoque`, `status`, `obs`, `foto_url`.

**`controle_perfis_obs`** — histórico de observações por perfil (`username`, `texto`, `criado_em`).

**`lancamentos`** — receitas e despesas

| Coluna | Descrição |
| --- | --- |
| `username` | Perfil dono do lançamento (**não** há `perfil_id`) |
| `tipo` | `despesa` ou `recebido` (CHECK constraint) |
| `valor_brl`, `valor_original`, `moeda`, `taxa_conversao` | Valor em BRL + origem cambial (USD/EUR) |
| `data_lancamento`, `descricao` | Data e descrição |
| `rateado` | `1` quando o lançamento foi dividido entre perfis |
| `grupo_rateio` | UUID que agrupa as parcelas de um mesmo rateio |

### Automação de publicações

**`automacao_config`** — credenciais da Meta por conta (PK `id`, que é o `meta_account_id`, o `username` ou `default_config`): `app_id`, `app_secret`, `access_token`, `public_base_url`.

**`automacao_agendamentos`** — fila de publicações

| Coluna | Valores / Descrição |
| --- | --- |
| `id` | TEXT PK |
| `username`, `meta_account_id` | Conta de destino |
| `tipo_postagem` | `FEED` (foto única ou carrossel) · `REELS` · `STORIES` |
| `arquivos` | JSON com a lista de mídias |
| `ordem_arquivos` | `ORDEM_SELECAO` · `ALEATORIA` · `ALFANUMERICA` |
| `tipo_agendamento` | `DATA_ESPECIFICA` · `RECORRENTE` |
| `data_especifica` | Data única (`YYYY-MM-DD`) |
| `dias_selecionados` | JSON com `SEG`…`DOM` (ou datas específicas) |
| `data_inicio`, `data_fim`, `duracao_recorrencia` | Janela da recorrência (`SEMPRE` · `PERIODO`) |
| `modo_hora` | `FIXA` (usa `hora_fixa`) ou janela (`hora_janela_inicio`/`hora_janela_fim` + `variacao_minutos`) |
| `legenda` | Caption da publicação |
| `status` | `AGENDADO` · `PUBLICADO` · `ERRO` · `PAUSADO` |
| `meta_media_id`, `publicado_em`, `erro_detalhe` | Resultado da execução |

**`automacao_daemon_status`** — linha única (`id = 1`) com `ultima_verificacao`, `status_daemon` e `mensagem`, usada pelo dashboard para mostrar se o worker está vivo.

---

## 🚀 Como Executar (desenvolvimento local)

### 1. Dependências Python

```bash
pip install apify-client python-dotenv requests pandas plotly streamlit Pillow
```

`Pillow` é opcional (conversão de imagens no publicador) e `streamlit`/`plotly` só são necessários para o `app.py` legado. Para dividir vídeos longos em partes de Stories o publicador também usa **ffmpeg/ffprobe** no PATH (no Windows ele procura automaticamente na instalação do winget).

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` na raiz e preencha os valores. O `.env` está no `.gitignore` — **nunca** faça commit de tokens.

| Variável | Usada por | Descrição |
| --- | --- | --- |
| `APIFY_API_TOKEN` (ou `APIFY_TOKEN`) | `ingestion.py`, `buscar_viral.py`, `apify.py` | Token da API do Apify |
| `DB_PATH` | todos os scripts e rotas | Caminho do SQLite (default: `./instagram_tracker.db`) |
| `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_ACCOUNT_ID` | `publicador_instagram.py` | Fallback das credenciais da Meta quando não há registro em `automacao_config` |
| `META_TOKEN_<USERNAME>` | `publicador_instagram.py` | Token por conta — username em maiúsculas com `.` → `_`, aceito com ou sem os underscores das pontas (ex.: `META_TOKEN__LUNAVALENTE14` ou `META_TOKEN_LUNAVALENTE14`) |
| `PUBLIC_MEDIA_BASE_URL` / `PUBLIC_BASE_URL` | `publicador_instagram.py` | URL pública que serve `automacao/` para a Meta baixar a mídia |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_BUCKET` | publicador + upload | Storage público das mídias (bucket default `Postagens`) |
| `NEXT_PUBLIC_SUPABASE_*` | rotas do Next.js | Mesmos valores acima, no lado do dashboard |
| `PYTHON_BIN` | `/api/automacao/executar` | Executável Python usado pelo dashboard (default `python`) |

### 3. Coleta de dados

```bash
python perfis_monitorados.py     # semeia os perfis-alvo (primeira execução)
python ingestion.py              # coleta todos os perfis ATIVO
python ingestion.py nome_perfil  # coleta um perfil específico
```

### 4. Dashboard

```bash
cd dashboard && npm install && npm run dev
```

Abra `http://localhost:3000`. O dashboard resolve o banco em `../instagram_tracker.db` automaticamente (ou em `DB_PATH`, se definido).

### 5. Publicador automático (opcional)

```bash
python publicador_instagram.py --daemon
```

Mantenha esse processo vivo em paralelo ao dashboard para que os agendamentos sejam publicados na hora marcada. Cada ciclo do daemon atualiza `automacao_daemon_status`, que a aba **Automatização** consulta para exibir a saúde do worker.

---

## 🔌 Referência de API

### Next.js (`dashboard/src/app/api/`)

| Rota | Métodos | Acesso a dados |
| --- | --- | --- |
| `/api/data` | GET · POST · PUT · DELETE | SQLite direto |
| `/api/controle` | GET · POST · PUT · DELETE | SQLite direto |
| `/api/anomalias` | GET · POST · PUT | SQLite direto (`POST` = varredura completa do histórico) |
| `/api/anomalias/buscar-viral` | POST | `exec` de `buscar_viral.py` |
| `/api/anomalias/registrar-post-viral` | POST | Grava o post confirmado em `posts_historico` |
| `/api/projecao` | GET | SQLite direto (cálculo P25/P50/P75) |
| `/api/ingestion` | POST | `exec` de `ingestion.py` |
| `/api/automacao/agendamentos` | GET · POST · PUT · DELETE | SQLite direto |
| `/api/automacao/agendamentos/update-meta-id` | POST | Grava `meta_media_id` após publicar |
| `/api/automacao/config` | GET · POST | SQLite direto (+ status do daemon) |
| `/api/automacao/executar` | POST | `spawn` de `publicador_instagram.py` |
| `/api/automacao/upload` | POST | Salva em `automacao/<conta>/` **e** no Supabase Storage |
| `/api/automacao/media/[...path]` | GET | Serve as mídias locais |

---

## 🧪 Detecção de Anomalias de Crescimento

Toda coleta é classificada automaticamente comparando-a com a leitura anterior válida do mesmo perfil:

```text
ΔS   = seguidores_atual − seguidores_anterior
%ΔS  = ΔS / seguidores_anterior × 100

%ΔS > 2.0  E  ΔS > 10   →  tipo_janela = 'ADS',      revisado_manualmente = 0  (vai para curadoria)
caso contrário           →  tipo_janela = 'ORGANICO', revisado_manualmente = 1  (validado automaticamente)
```

Os limiares vivem em `LIMIAR_PERCENTUAL_MINIMO` e `LIMIAR_DELTA_S_MINIMO` (`ingestion.py:47-48`) e estão replicados em `escanear_anomalias_historicas.py` e em `POST /api/anomalias`. A primeira coleta de um perfil é sempre marcada como `ORGANICO` validado.

Na aba **Histórico Conta** o operador reclassifica cada pendência entre `ORGANICO`, `VIRAL_ORGANICO` e `ADS`. Ao escolher `VIRAL_ORGANICO`, habilita-se a busca do post responsável.

Para reprocessar todo o histórico (mantendo o que já foi revisado à mão):

```bash
python escanear_anomalias_historicas.py
```

### Busca do post viral (`buscar_viral.py`)

1. Procura em `posts_historico` os posts publicados na **janela de 72 h** anterior à coleta.
2. Se nada for encontrado (ou com `--force_api`), raspa via Apify combinando o **feed** (`apify/instagram-scraper`) e a **aba de Reels** (`apify/instagram-reel-scraper`), grava em `posts_historico` e reconsulta.
3. Ordena por **score de tração** = `views + likes × 3 + comentários × 5` e devolve o `top_post`.
4. Sem candidatos na janela, sugere o post recente mais forte (`score ≥ 500`, ou `views ≥ 1000`, ou `likes ≥ 50`).

Saída em JSON no stdout:

```bash
python buscar_viral.py --username perfil --data_coleta "2026-08-20 09:11:09" [--force_api]
```

---

## 📊 Benchmark Dinâmico (P25 / P50 / P75)

A curva esperada de seguidores por **dia relativo** `D` é 100% derivada dos dados, sem constantes cravadas. Perfis de benchmark são aqueles com `meu_perfil = 0`.

* **Dia relativo:**
  $$D(p, t) = \lfloor \text{data\_coleta}(t) - \text{primeira\_postagem}(p) \rfloor$$
* **Imputação LOCF (série não-decrescente):**
  $$\hat{S}(p, D) = \max_{k \le D} \big( S(p, k) \big)$$
* **Faixa esperada no dia $D$:**
  $$P_q(D) = \text{percentil}_q\Big( \big\{ \hat{S}(p, D) \mid p \in B \big\} \Big), \quad q \in \{25, 50, 75\}$$

Dias sem perfis ativos herdam o último percentil válido (forward fill), mantendo a curva contínua. A implementação em produção é `dashboard/src/app/api/projecao/route.ts`; `sql_projecao.py` traz a mesma lógica em SQL puro (CTE recursiva + window functions) para inspeção via CLI:

```bash
python sql_projecao.py
```

O gráfico exibe a mediana `P50` e a faixa sombreada `P25–P75` em três modos: crescimento diário, total acumulado e variação percentual.

---

## 🤖 Motor de Automação (`publicador_instagram.py`)

Publica via **Meta Graph API v20.0** (`https://graph.facebook.com/v20.0`).

**Formatos suportados:** foto única e carrossel no Feed, Reels (com espera ativa pelo processamento do vídeo) e Stories de foto ou vídeo. Vídeos grandes usam o **upload resumável** da Meta.

**Tratamento de vídeo para Stories** (`split_video_for_stories`): antes de enviar, o arquivo é medido com ffprobe (`get_media_specs`) e comparado com a spec da Meta (`motivos_fora_de_spec_stories`). Se estiver tudo dentro, vai como está; qualquer violação dispara um re-encode via ffmpeg para **H.264/AVC, ≤4,5 Mbps de vídeo, AAC 128 kbps 44,1 kHz estéreo, 30 fps CFR**. As violações verificadas são: codec diferente de H.264 (HEVC é o padrão de exportação do TikTok e do iPhone, e o Instagram recusa), bitrate de vídeo acima de **5 Mbps**, bitrate de áudio acima de 128 kbps (+10% de tolerância), codec de áudio diferente de AAC e mais de 60 fps.

Vídeos acima de **60 s** são divididos em partes de duração **igual** (77 s → 2 × 38,7 s, não 60 s + 17 s), evitando um último trecho curto demais. Cada parte é cortada com **0,5 s de folga** sob o limite: como o AAC só encerra em fronteira de frame (1024 amostras ≈ 23 ms), cortar exatamente em 60 s gera um container de 60,023 s. Após o encode, a duração do container de cada parte é reconferida com ffprobe.

> 🚫 **Publicação de vídeo está bloqueada no lado da Meta (verificado em 25/08/2026).** Todo `media_publish` de vídeo desta app é recusado com `message: "Fatal"`, `code: -1`, `is_transient: false` e o subcode **não documentado** `2207085`; toda publicação de imagem passa. Foi descartado por teste direto: arquivo, codec, bitrate e duração (um clipe gerado de 5 s, 19 KB, 1080×1920, H.264, áudio silencioso, 100% dentro da spec falha igual), `media_type` (STORIES e REELS falham), modo de ingestão (`video_url` e upload resumável falham), conta (as duas falham, com o mesmo token) e versão da API (v20 auto-upgraded e v26 explícita falham). Em todos os casos o container chega a `FINISHED`, *"ready to be published"*. **Reprocessar o vídeo não resolve** — o subcode entrou em `SUBCODES_PERMANENTES` justamente para não gastar 3 tentativas numa recusa garantida. Resolver depende da Meta (revisão da app / suporte), não do repositório.

> ℹ️ A `v20.0` do código é nominal: a Meta **auto-upgrada** qualquer chamada de v18 a v25 para a **v26.0** (o `Location` do upload resumável volta como `rupload.facebook.com/ig-api-upload/v26.0/`). Ou seja, o comportamento em produção é o da v26.0, não o da versão escrita na URL.

Para STORIES o publicador usa apenas o **primeiro** arquivo de `arquivos`; enviar vários não gera vários Stories.

**Entrega da mídia:** a Meta precisa baixar o arquivo de uma URL pública. Cada upload é gravado em `automacao/<meta_account_id>/` (backup local) e enviado ao **Supabase Storage**; a URL pública do Supabase é o que vai para a API. `PUBLIC_MEDIA_BASE_URL` serve como alternativa quando o próprio servidor expõe a pasta.

**Resolução de credenciais** (`get_meta_config`), na ordem: registro de `automacao_config` do `username` → registro do `meta_account_id` → `default_config` (fallback do token) → registro mais recente → variáveis de ambiente `META_TOKEN_<USERNAME>` / `META_ACCESS_TOKEN`.

**Verificação de horário** (`is_agendamento_no_horario`): `DATA_ESPECIFICA` dispara quando `agora ≥ data_especifica + hora_fixa`; `RECORRENTE` valida `data_inicio`/`data_fim`, checa se o dia da semana está em `dias_selecionados` e então compara com `hora_fixa`.

### CLI

```bash
python publicador_instagram.py --id ABC123 --force   # publica um agendamento agora
python publicador_instagram.py --dry-run             # simula sem chamar a Meta
python publicador_instagram.py --daemon              # loop contínuo (modo inteligente)
```

| Flag | Efeito |
| --- | --- |
| `--id` | Agendamento específico |
| `--force` | Ignora a checagem de horário |
| `--dry-run` | Simula, sem chamar a API da Meta |
| `--daemon` | Loop contínuo |
| `--interval` | Aceito, mas **sem efeito**: `run_daemon()` recebe o valor e o ignora (o modo inteligente calcula o próprio tempo de espera) |

No modo `--daemon` o publicador calcula o próximo agendamento e **dorme até 30 s antes dele**; se não houver nenhum pendente, revisita em 1 h (`MAX_IDLE_SLEEP`). Ao chegar a hora, faz polling a cada 5 s por 60 s (`POLL_AFTER_DUE`) para garantir a entrega. A cada ciclo grava `automacao_daemon_status`, que o dashboard lê para mostrar se o worker está vivo.

---

## 🖼️ Abas do Dashboard

| Aba | Conteúdo |
| --- | --- |
| 🎛️ **Controle** | Cadastro operacional, lançamentos financeiros com rateio, gráficos financeiro/seguidores/correlação |
| ❤️ **Acompanhando** | Perfis monitorados com métricas consolidadas |
| 👥 **Seguidores** | Séries temporais + curva de benchmark P25/P50/P75 |
| 📊 **Posts Virais** | Cards dos posts de maior tração |
| 🧱 **Feed Geral** | Tabela completa de `posts_historico` |
| 🕓 **Histórico Conta** | Curadoria de anomalias (badge com o total de pendências) |
| 🤖 **Automatização** | Calendário de agendamentos, upload de mídia e credenciais da Meta |

---

## 🧰 Utilitários

| Script | Uso |
| --- | --- |
| `check_db.py` | Lista tabelas e as 5 últimas coletas |
| `sql_lista.py` | Lista tabelas e conteúdo do banco |
| `criar_tabelas.py` | Aplica `schema_controle.sql` |
| `migrate_tipo_janela.py` | Migração idempotente das colunas de classificação |
| `apify.py` | Testa os actors do Apify isoladamente |
| `app.py` | Dashboard legado em Streamlit (`streamlit run app.py`) |
| `database.py`, `fix_reedz_date.py`, `check_data.py` | Correções pontuais feitas à mão (contêm caminhos absolutos fixos) |
