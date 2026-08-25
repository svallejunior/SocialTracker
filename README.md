# SocialTracker 📈

Plataforma de inteligência competitiva, gestão operacional e automação de publicações para perfis do Instagram.

O sistema cobre três frentes:

1. **Coleta & Análise (Python + Apify)** — ingestão diária de seguidores, detecção automática de anomalias de crescimento e identificação do post responsável por cada salto.
2. **Dashboard Web (Next.js 16 + React 19)** — painel escuro premium com benchmark dinâmico, controle financeiro com rateio, curadoria de anomalias e central de automação.
3. **Motor de Automação (Meta Graph API)** — agendamento e publicação automática de Feed, Carrossel, Reels e Stories, com worker rodando em background.

---

## 🏗️ Arquitetura

```text
┌──────────────────┐     Apify Actors      ┌─────────────────────┐
│  ingestion.py    │ ────────────────────▶ │                     │
│  buscar_viral.py │                       │ instagram_tracker.db│
└──────────────────┘                       │      (SQLite)       │
                                           │                     │
┌──────────────────┐   Meta Graph API      │                     │
│ publicador_      │ ◀──────────────────── │                     │
│ instagram.py     │                       └──────────┬──────────┘
└──────────────────┘                                  │
        ▲                                             │ leitura/escrita direta
        │ subprocess                                  │
┌───────┴──────────┐                       ┌──────────┴──────────┐
│  api_server.py   │                       │  dashboard/ (Next)  │
│  Flask :5000     │                       │  App Router :3000   │
│  + worker publish│                       │  + rotas /api/*     │
└──────────────────┘                       └─────────────────────┘
```

**Dois modos de operação:**

| Modo | Como funciona |
| --- | --- |
| **All-in-one (atual)** | O Next.js abre o `instagram_tracker.db` diretamente (pacotes `sqlite`/`sqlite3`) e dispara os scripts Python via `child_process`. É o modo usado em desenvolvimento e no deploy em VPS única. |
| **Vercel + VPS (preparado)** | `api_server.py` expõe os mesmos dados via REST na porta 5000 e `dashboard/src/lib/vps-proxy.ts` contém os helpers de proxy (`vpsGet`/`vpsPost`/`vpsPut`/`vpsDelete`). ⚠️ **Nenhuma rota importa o `vps-proxy` ainda** — o helper e as variáveis `VPS_API_URL`/`VPS_API_KEY` estão prontos, mas a migração das rotas para o proxy ainda não foi feita. |

---

## 📂 Estrutura do Repositório

```text
SocialTracker/
├── api_server.py                    # API REST Flask (:5000) + worker de publicação em background
├── ingestion.py                     # Coleta diária de seguidores (Apify) + classificação de anomalias
├── buscar_viral.py                  # Localiza o post responsável por um salto de seguidores (janela 72h)
├── escanear_anomalias_historicas.py # Reclassifica todo o histórico de perfis_historico
├── publicador_instagram.py          # Publicador Meta Graph API (Feed/Carrossel/Reels/Stories)
├── apify.py                         # Sandbox de testes dos actors do Apify
├── sql_projecao.py                  # Benchmark P50 via SQL puro (recursivo + LOCF + window functions)
├── perfis_monitorados.py            # Semeia a lista inicial de perfis-alvo
├── criar_tabelas.py                 # Executa schema_controle.sql no banco
├── migrate_tipo_janela.py           # Migração idempotente das colunas de classificação
├── schema_controle.sql              # Schema da tabela de controle operacional
├── deploy_socialtracker.sh          # Deploy automatizado em Ubuntu/VPS (PM2 + cron)
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
    ├── src/components/
    │   ├── CentralAnomalias.tsx     # Curadoria de anomalias + busca de post viral
    │   ├── CentralAutomatizacao.tsx # Calendário e formulário de agendamentos
    │   ├── GraficoProjecao.tsx      # Curva de benchmark P25/P50/P75
    │   └── ModalLancamento.tsx      # Lançamentos financeiros (com rateio)
    └── src/lib/vps-proxy.ts         # Helpers de proxy Vercel → VPS (ainda não conectados)
```

---

## 💾 Modelagem do Banco (`instagram_tracker.db`)

As migrações são **idempotentes e automáticas**: tanto `api_server.py` (`run_migrations()`) quanto as rotas do Next.js (`getDb()`) e o `publicador_instagram.py` (`init_db_schema()`) criam tabelas e adicionam colunas faltantes na primeira conexão.

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

> ⚠️ Os endpoints `POST/DELETE /api/controle` do `api_server.py` ainda usam os nomes antigos (`perfil_id`, `rateio`, `perfis_rateio`) e divergem deste schema. As rotas equivalentes do Next.js (`dashboard/src/app/api/controle/route.ts`) estão corretas — use-as como referência.

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
pip install apify-client python-dotenv flask requests pandas plotly streamlit Pillow
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
| `PORT` | `api_server.py` | Porta do Flask (default `5000`) |
| `VPS_API_KEY` | `api_server.py` + dashboard | Bearer token da API. **Vazio desativa a autenticação** |
| `VPS_API_URL` | `vps-proxy.ts` | Base da API na VPS (sem barra final) |
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

### 5. Publicador (opcional, fora do `api_server.py`)

```bash
python publicador_instagram.py --daemon --interval 60
```

---

## 🖥️ Deploy em VPS (Ubuntu)

```bash
chmod +x deploy_socialtracker.sh
VPS_API_KEY=minha_chave_secreta ./deploy_socialtracker.sh
```

O script:

1. Instala pacotes do sistema (`python3`, `sqlite3`, `build-essential`, `tmux`, …).
2. Instala Node.js 20 LTS e PM2 se ausentes.
3. Instala as dependências Python.
4. Sobe o Flask como processo PM2 `socialtracker-api` na porta 5000.
5. Gera `dashboard/.env.local`, roda `npm install && npm run build` e sobe o PM2 `socialtracker-dashboard` na porta 3000.
6. Registra dois cron jobs de ingestão: **06:00** e **18:00** diariamente, com log em `ingestion.log`.

```bash
pm2 status                          # estado dos processos
pm2 logs socialtracker-api          # logs do Flask
pm2 logs socialtracker-dashboard    # logs do Next.js
tail -f ingestion.log               # logs da coleta
```

> ⚠️ Dois pontos de atenção conhecidos no `deploy_socialtracker.sh`:
> o corpo do script está **duplicado** (a partir da linha 150 repete uma versão anterior de 5 etapas, sem o passo do Flask), e o `pip3 install` **não inclui `python-dotenv` nem `Pillow`**, que o publicador precisa. Instale-os manualmente na VPS até a correção.

---

## 🔌 Referência de API

### Flask (`api_server.py`, porta 5000)

Todos os endpoints aceitam `Authorization: Bearer $VPS_API_KEY` (obrigatório quando a variável está definida) e respondem com CORS liberado.

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/health` | Status do serviço e caminho do banco |
| `GET` | `/api/data` | Perfis ativos e visíveis + histórico completo |
| `POST` `DELETE` | `/api/data` | Ativa (`{username}`) / desativa (`?username=`) um perfil |
| `POST` | `/api/ingestion` | Executa `ingestion.py` (timeout 300 s) |
| `GET` `PUT` | `/api/anomalias` | Lista as 500 leituras mais recentes (filtros `username`, `tipo_janela`) e atualiza `tipo_janela`/`revisado_manualmente` |
| `POST` | `/api/anomalias/buscar-viral` | Executa `buscar_viral.py` (timeout 180 s) |
| `GET` `POST` `DELETE` | `/api/controle` | Perfis e lançamentos financeiros |
| `GET` | `/api/projecao?username=` | Histórico e lançamentos de um perfil |
| `GET` `POST` | `/api/automacao/config` | Lê e grava credenciais da Meta |
| `POST` | `/api/automacao/executar` | Executa `publicador_instagram.py` (`id`, `force`, `dryRun`) |
| `GET` | `/api/automacao/media/<path>` | Serve os arquivos de `automacao/` (sem autenticação) |

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

**Formatos suportados:** foto única e carrossel no Feed, Reels (com espera ativa pelo processamento do vídeo) e Stories de foto ou vídeo. Vídeos acima de **60 s** são divididos automaticamente em partes de Stories via ffmpeg. Vídeos grandes usam o **upload resumável** da Meta.

**Entrega da mídia:** a Meta precisa baixar o arquivo de uma URL pública. Cada upload é gravado em `automacao/<meta_account_id>/` (backup local) e enviado ao **Supabase Storage**; a URL pública do Supabase é o que vai para a API. `PUBLIC_MEDIA_BASE_URL` serve como alternativa quando o próprio servidor expõe a pasta.

**Resolução de credenciais** (`get_meta_config`), na ordem: registro de `automacao_config` do `username` → registro do `meta_account_id` → `default_config` (fallback do token) → registro mais recente → variáveis de ambiente `META_TOKEN_<USERNAME>` / `META_ACCESS_TOKEN`.

**Verificação de horário** (`is_agendamento_no_horario`): `DATA_ESPECIFICA` dispara quando `agora ≥ data_especifica + hora_fixa`; `RECORRENTE` valida `data_inicio`/`data_fim`, checa se o dia da semana está em `dias_selecionados` e então compara com `hora_fixa`.

### CLI

```bash
python publicador_instagram.py --id ABC123 --force   # publica um agendamento agora
python publicador_instagram.py --dry-run             # simula sem chamar a Meta
python publicador_instagram.py --daemon --interval 60
```

| Flag | Efeito |
| --- | --- |
| `--id` | Agendamento específico |
| `--force` | Ignora a checagem de horário |
| `--dry-run` | Simula, sem chamar a API da Meta |
| `--daemon` | Loop contínuo |
| `--interval` | Intervalo do daemon em segundos (default 60) |

### Worker embutido no `api_server.py`

Ao subir, o Flask inicia uma thread `start_background_publisher()` em modo inteligente: calcula o próximo agendamento e **dorme até ele**; se não houver nenhum pendente, revisita em 1 h. Ao chegar a hora, faz polling a cada 5 s por 60 s para garantir a publicação. Cada ciclo atualiza `automacao_daemon_status`, que o dashboard consulta para exibir a saúde do worker.

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
