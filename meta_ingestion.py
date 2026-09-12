"""
meta_ingestion.py — Extrator de Dados e Métricas via Meta Graph API Oficial
SocialTracker Ingestion Engine

Funcionalidades:
- Identifica automaticamente todas as contas configuradas (automacao_config e .env)
- Extrai dados oficiais de perfil (seguidores, seguindo, total_posts, bio)
- Extrai todas as mídias e postagens recentes (Feed, Carrossel, Vídeos, Reels)
- Extrai métricas avançadas/insights por postagem (views, reach, saved, shares, total_interactions)
- Grava os dados consolidados em perfis_historico e posts_historico
- Registra snapshots em posts_metricas_snapshots com data_carga para acompanhamento evolutivo
"""

import os
import sys
import json
import sqlite3
import argparse
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

# Fuso Horário Oficial do Brasil (UTC-3 / Horário de Brasília)
FUSO_BRASIL = timezone(timedelta(hours=-3))

def agora_brasil():
    return datetime.now(FUSO_BRASIL)

def parse_utc_para_brasil_str(val, fallback_str=None):
    """Converte timestamp UTC (ISO 8601, etc) para Horário de Brasília (UTC-3) formato YYYY-MM-DD HH:MM:SS."""
    if not val:
        return fallback_str or agora_brasil().strftime('%Y-%m-%d %H:%M:%S')
    s = str(val).strip()
    try:
        iso_str = s.replace('Z', '+00:00')
        if len(iso_str) >= 5 and iso_str[-5] in ('+', '-') and iso_str[-3] != ':':
            iso_str = iso_str[:-2] + ':' + iso_str[-2:]
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(FUSO_BRASIL).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        pass
    s_clean = s.replace('T', ' ')
    if '.' in s_clean:
        s_clean = s_clean.split('.')[0]
    return s_clean

# Força UTF-8 no stdout/stderr no Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
DB_PATH = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)
GRAPH_API_VERSION = "v20.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

# Tokens obtidos via login direto do Instagram (Instagram API with Instagram
# Login, sem Facebook) começam com "IGAA" e só funcionam em graph.instagram.com
# — graph.facebook.com nem consegue parsear esse formato ("Cannot parse access
# token"). Tokens do fluxo antigo (Facebook Login for Business / Page-linked)
# continuam indo por graph.facebook.com normalmente.
def graph_api_base(access_token):
    if (access_token or "").startswith("IGAA"):
        return f"https://graph.instagram.com/{GRAPH_API_VERSION}"
    return GRAPH_API_BASE


def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA synchronous = NORMAL;')
    conn.execute('PRAGMA busy_timeout = 30000;')
    return conn


def inicializar_estrutura_banco():
    """Garante que as tabelas e colunas necessárias existem no SQLite."""
    conn = get_db_connection()
    c = conn.cursor()

    # 1. Tabela de Snapshots de Métricas de Posts (Evolução Temporal)
    c.execute("""
        CREATE TABLE IF NOT EXISTS posts_metricas_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id TEXT NOT NULL,
            username TEXT NOT NULL,
            likes INTEGER DEFAULT 0,
            comentarios INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            reach INTEGER DEFAULT 0,
            saved INTEGER DEFAULT 0,
            shares INTEGER DEFAULT 0,
            total_interactions INTEGER DEFAULT 0,
            data_carga DATETIME NOT NULL
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_posts_snapshots_post_id ON posts_metricas_snapshots(post_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_posts_snapshots_username ON posts_metricas_snapshots(username)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_posts_snapshots_data_carga ON posts_metricas_snapshots(data_carga)")

    # 2. Tabela de Posts Histórico (Estado Mais Recente)
    c.execute("""
        CREATE TABLE IF NOT EXISTS posts_historico (
            post_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            data_postagem DATETIME NOT NULL,
            formato TEXT NOT NULL,
            legenda TEXT,
            likes INTEGER DEFAULT 0,
            comentarios INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            taxa_engajamento REAL,
            data_atualizacao DATETIME NOT NULL,
            shortcode TEXT
        )
    """)

    # Adiciona colunas extras em posts_historico se não existirem
    c.execute("PRAGMA table_info(posts_historico)")
    cols_existentes = [col["name"] for col in c.fetchall()]
    
    colunas_para_adicionar = [
        ("data_carga", "DATETIME"),
        ("permalink", "TEXT"),
        ("media_product_type", "TEXT"),
        ("reach", "INTEGER DEFAULT 0"),
        ("saved", "INTEGER DEFAULT 0"),
        ("shares", "INTEGER DEFAULT 0"),
        ("total_interactions", "INTEGER DEFAULT 0"),
        ("media_url", "TEXT"),
        ("thumbnail_url", "TEXT"),
        ("is_deleted", "INTEGER DEFAULT 0"),
    ]
    
    for col_name, col_type in colunas_para_adicionar:
        if col_name not in cols_existentes:
            try:
                c.execute(f"ALTER TABLE posts_historico ADD COLUMN {col_name} {col_type}")
            except Exception as e:
                print(f"Aviso ao adicionar coluna {col_name} em posts_historico: {e}")

    c.execute("CREATE INDEX IF NOT EXISTS idx_posts_historico_user_data ON posts_historico(username, data_postagem)")
    # A listagem geral de posts (ex: mobile/resumo) filtra só por is_deleted e
    # ordena por data_postagem, sem username — o índice acima não serve pra isso.
    c.execute("CREATE INDEX IF NOT EXISTS idx_posts_historico_deleted_data ON posts_historico(is_deleted, data_postagem)")

    # Garante coluna is_deleted em automacao_publicacoes se a tabela existir
    c.execute("PRAGMA table_info(automacao_publicacoes)")
    cols_pub = [col["name"] for col in c.fetchall()]
    if cols_pub and "is_deleted" not in cols_pub:
        try:
            c.execute("ALTER TABLE automacao_publicacoes ADD COLUMN is_deleted INTEGER DEFAULT 0")
        except Exception as e:
            print(f"Aviso ao adicionar is_deleted em automacao_publicacoes: {e}")

    # 3. Tabela de Perfis Histórico
    c.execute("""
        CREATE TABLE IF NOT EXISTS perfis_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            data_coleta DATE NOT NULL,
            seguidores INTEGER NOT NULL,
            seguindo INTEGER NOT NULL,
            total_posts INTEGER NOT NULL,
            inativo INTEGER DEFAULT 0,
            tipo_janela TEXT DEFAULT 'ORGANICO',
            revisado_manualmente INTEGER DEFAULT 0
        )
    """)

    c.execute("PRAGMA table_info(perfis_historico)")
    cols_perfis = [col["name"] for col in c.fetchall()]
    if "data_carga" not in cols_perfis:
        try:
            c.execute("ALTER TABLE perfis_historico ADD COLUMN data_carga DATETIME")
        except Exception as e:
            print(f"Aviso ao adicionar data_carga em perfis_historico: {e}")

    c.execute("CREATE INDEX IF NOT EXISTS idx_perfis_historico_user_data ON perfis_historico(username, data_coleta)")
    # Índice por expressão: as consultas do dashboard filtram com LOWER(username) = LOWER(?)
    # (usernames podem vir com case inconsistente da API/Apify) — sem esse índice, o filtro
    # cai em varredura completa mesmo com o índice acima, que é sobre a coluna crua.
    c.execute("CREATE INDEX IF NOT EXISTS idx_perfis_historico_lower_user_inativo_data ON perfis_historico(LOWER(username), inativo, data_coleta)")
    # As consultas de visão geral (todos os perfis) filtram por inativo=0 e
    # particionam/ordenam por username + data_coleta — sem username fixo,
    # então o índice acima (LOWER(username) primeiro) não ajuda; esse cobre
    # o caso "todos os perfis" em vez de "um perfil específico".
    c.execute("CREATE INDEX IF NOT EXISTS idx_perfis_historico_inativo_user_data ON perfis_historico(inativo, username, data_coleta)")

    # 4. Tabela de Seguidores Histórico
    c.execute("""
        CREATE TABLE IF NOT EXISTS seguidores_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            data_coleta TEXT,
            total_seguidores INTEGER
        )
    """)

    # 5. Garantir coluna foto_perfil_meta em perfis_monitorados e controle_perfis
    c.execute("PRAGMA table_info(perfis_monitorados)")
    cols_pm = [col["name"] for col in c.fetchall()]
    if "foto_perfil_meta" not in cols_pm:
        try:
            c.execute("ALTER TABLE perfis_monitorados ADD COLUMN foto_perfil_meta TEXT")
        except Exception as e:
            print(f"Aviso ao adicionar foto_perfil_meta em perfis_monitorados: {e}")

    c.execute("PRAGMA table_info(controle_perfis)")
    cols_cp = [col["name"] for col in c.fetchall()]
    if "foto_perfil_meta" not in cols_cp:
        try:
            c.execute("ALTER TABLE controle_perfis ADD COLUMN foto_perfil_meta TEXT")
        except Exception as e:
            print(f"Aviso ao adicionar foto_perfil_meta em controle_perfis: {e}")

    conn.commit()
    conn.close()


def obter_contas_meta_configuradas(username_filtro=None):
    """
    Retorna lista de dicionários com as contas ativas configuradas para a Meta API.
    Combina registros do banco (automacao_config) e variáveis do .env.
    """
    conn = get_db_connection()
    c = conn.cursor()

    # Busca default_config para fallback de token se necessário
    c.execute("SELECT * FROM automacao_config WHERE id = 'default_config' OR username = '' ORDER BY atualizado_em DESC LIMIT 1")
    row_default = c.fetchone()
    default_config = dict(row_default) if row_default else {}

    # Busca todos os registros com username preenchido
    if username_filtro:
        c.execute("SELECT * FROM automacao_config WHERE LOWER(username) = LOWER(?)", (username_filtro.strip().lstrip("@"),))
    else:
        c.execute("SELECT * FROM automacao_config WHERE username IS NOT NULL AND TRIM(username) != '' AND id != 'default_config'")
    rows = c.fetchall()
    conn.close()

    contas = []
    global_token = os.environ.get("META_ACCESS_TOKEN", "").strip() or (default_config.get("access_token") or "").strip()

    for r in rows:
        cfg = dict(r)
        u = cfg.get("username", "").strip().lstrip("@").lower()
        if not u:
            continue

        account_id = (cfg.get("meta_account_id") or "").strip()
        
        # Resolução de token
        user_env_key = f"META_TOKEN_{u.upper().replace('.', '_')}"
        user_env_key_clean = f"META_TOKEN_{u.upper().replace('.', '_').strip('_')}"
        token_env = os.environ.get(user_env_key) or os.environ.get(user_env_key_clean)

        token = (cfg.get("access_token") or "").strip() or token_env or global_token

        if account_id and token:
            contas.append({
                "username": u,
                "account_id": account_id,
                "token": token
            })

    return contas


def extrair_dados_perfil(account_id, token):
    """Obtém dados básicos da conta via Meta Graph API."""
    url = f"{graph_api_base(token)}/{account_id}"
    params = {
        "fields": "id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website",
        "access_token": token
    }
    try:
        res = requests.get(url, params=params, timeout=15)
        if res.status_code == 200:
            return res.json()
        else:
            print(f"  ❌ Erro ao consultar perfil {account_id}: HTTP {res.status_code} - {res.text}")
            return None
    except Exception as e:
        print(f"  ❌ Exceção na requisição do perfil {account_id}: {e}")
        return None


# Códigos de erro da Graph API que indicam limite de requisições (throttling
# por app/usuário/página), não falha real do post ou da métrica — não devem
# ser tratados como "post sem suporte a essa métrica".
# Ver: https://developers.facebook.com/docs/graph-api/guides/error-handling
_CODIGOS_RATE_LIMIT = (4, 17, 32, 613)


def extrair_insights_post(media_id, media_type, media_product_type, token):
    """
    Tenta obter métricas avançadas (insights) de uma postagem específica.

    Retorna:
    - dict com as métricas (podendo ter zeros legítimos, ex: post antigo sem
      suporte a uma métrica) quando a chamada respondeu normalmente;
    - None quando a falha foi transitória (rate limit da Meta, timeout,
      erro de conexão) — sinal para o chamador tentar de novo mais tarde em
      vez de gravar zeros por cima de valores válidos já salvos.
    """
    url = f"{graph_api_base(token)}/{media_id}/insights"

    # Define as métricas apropriadas para cada tipo de mídia
    metrics = ["reach", "saved", "total_interactions"]
    if media_product_type == "REELS" or media_type == "VIDEO":
        metrics.extend(["shares", "views"])
    else:
        metrics.append("shares")

    params = {
        "metric": ",".join(metrics),
        "access_token": token
    }

    insights = {
        "reach": 0,
        "saved": 0,
        "shares": 0,
        "views": 0,
        "total_interactions": 0
    }

    try:
        res = requests.get(url, params=params, timeout=10)
        if res.status_code == 200:
            data = res.json().get("data", [])
            for item in data:
                name = item.get("name")
                values = item.get("values", [])
                val = values[0].get("value", 0) if values else 0
                if name in insights:
                    insights[name] = int(val)
            return insights

        if res.status_code == 429:
            return None

        try:
            erro = res.json().get("error", {})
        except Exception:
            erro = {}
        if erro.get("code") in _CODIGOS_RATE_LIMIT:
            return None

        # Outro erro (ex: post muito antigo ou métrica sem suporte) — zeros é a resposta real
        return insights
    except requests.exceptions.RequestException:
        # Timeout/erro de conexão: transitório, não "sem suporte à métrica"
        return None
    except Exception:
        return insights


def buscar_insights_em_lote(posts, token, max_workers=6, max_tentativas=3, backoff_base=3):
    """
    Busca os insights de todos os posts em paralelo — são chamadas de rede
    independentes (I/O-bound), então não há motivo pra esperar uma terminar
    para começar a próxima, como o loop sequencial antigo fazia.

    Posts que voltam com falha transitória (rate limit da Meta, timeout) não
    são descartados nem zerados: entram numa fila de retentativa com backoff
    e concorrência reduzida a cada rodada. Os que ainda falharem depois de
    `max_tentativas` ficam com post["insights"] = None — salvar_dados_no_banco
    interpreta isso como "sem novidade" e preserva os valores já gravados no
    banco, e o próprio cron (a cada 15 min) tenta de novo no próximo ciclo.
    """
    pendentes = list(posts)
    workers = max_workers

    for tentativa in range(1, max_tentativas + 1):
        if not pendentes:
            break

        proxima_rodada = []
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futuros = {
                executor.submit(
                    extrair_insights_post,
                    p.get("id"), p.get("media_type"), p.get("media_product_type"), token
                ): p
                for p in pendentes
            }
            for futuro in as_completed(futuros):
                p = futuros[futuro]
                resultado = futuro.result()
                if resultado is None:
                    proxima_rodada.append(p)
                else:
                    p["insights"] = resultado

        pendentes = proxima_rodada
        if pendentes and tentativa < max_tentativas:
            espera = backoff_base * tentativa
            print(f"  ⏳ {len(pendentes)} post(s) com limite de requisições da Meta — nova tentativa em {espera}s...")
            time.sleep(espera)
            workers = max(2, workers // 2)  # reduz concorrência nas próximas tentativas

    if pendentes:
        print(f"  ⚠️ {len(pendentes)} post(s) sem insights atualizados neste ciclo (limite da Meta) — mantendo valores anteriores; nova tentativa no próximo ciclo.")
        for p in pendentes:
            p["insights"] = None


def extrair_posts_perfil(account_id, token, limite=50):
    """Obtém as publicações recentes da conta com métricas e paginação."""
    url = f"{graph_api_base(token)}/{account_id}/media"
    params = {
        "fields": "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,shortcode,media_url,thumbnail_url,children{id,media_type,media_url}",
        "limit": min(limite, 50),
        "access_token": token
    }

    posts = []
    try:
        res = requests.get(url, params=params, timeout=20)
        if res.status_code != 200:
            print(f"  ❌ Erro ao listar mídias da conta {account_id}: HTTP {res.status_code} - {res.text}")
            return posts

        data = res.json()
        itens = data.get("data", [])
        posts.extend(itens)

        # Se houver próxima página e não atingiu o limite
        while "paging" in data and "next" in data["paging"] and len(posts) < limite:
            next_url = data["paging"]["next"]
            res_next = requests.get(next_url, timeout=20)
            if res_next.status_code == 200:
                data = res_next.json()
                novos_itens = data.get("data", [])
                if not novos_itens:
                    break
                posts.extend(novos_itens)
            else:
                break

    except Exception as e:
        print(f"  ❌ Exceção ao extrair postagens da conta {account_id}: {e}")

    return posts[:limite]


def verificar_e_remover_posts_apagados(c, username, account_id, token, active_media_ids):
    """
    Compara os posts recentes armazenados no banco para o perfil com os IDs ativos
    retornados pela Meta API. Se algum post recente não estiver na lista ativa,
    faz uma consulta direta ao ID na Meta API. Se confirmado como deletado/inexistente,
    remove de posts_historico, posts_metricas_snapshots e atualiza automacao_publicacoes
    para status 'DELETADO' e is_deleted = 1 (garantindo que saia da contabilização).
    """
    try:
        active_set = {str(mid).strip() for mid in active_media_ids if mid}

        # Busca posts salvos nos últimos 45 dias no banco para este perfil
        c.execute("""
            SELECT post_id, shortcode, data_postagem
            FROM posts_historico
            WHERE LOWER(username) = LOWER(?)
              AND (is_deleted IS NULL OR is_deleted = 0)
              AND data_postagem >= date('now', 'localtime', '-45 days')
        """, (username,))
        banco_posts = c.fetchall()

        # Também busca identificadores em automacao_publicacoes
        c.execute("""
            SELECT id, meta_media_id, data_local
            FROM automacao_publicacoes
            WHERE LOWER(username) = LOWER(?)
              AND status = 'PUBLICADO'
              AND (is_deleted IS NULL OR is_deleted = 0)
              AND data_local >= date('now', 'localtime', '-45 days')
        """, (username,))
        banco_pubs = c.fetchall()

        candidatos_para_verificar = set()

        for row in banco_posts:
            pid = str(row["post_id"]).strip()
            if pid and pid not in active_set:
                candidatos_para_verificar.add(pid)

        for row in banco_pubs:
            mid = str(row["meta_media_id"] or "").strip()
            if mid and mid not in active_set:
                candidatos_para_verificar.add(mid)

        if not candidatos_para_verificar:
            return 0

        total_removidos = 0
        base_url = graph_api_base(token)

        for media_id in candidatos_para_verificar:
            # Consulta específica na Meta API para confirmar se o post foi apagado
            url = f"{base_url}/{media_id}"
            try:
                res = requests.get(url, params={"fields": "id", "access_token": token}, timeout=10)
                if res.status_code in (400, 404):
                    # Erro 100 com subcode 33 indica que o objeto foi excluído ou não existe
                    err_json = res.json().get("error", {}) if res.content else {}
                    err_code = err_json.get("code")
                    err_msg = str(err_json.get("message", "")).lower()

                    if err_code in (100, 803, 10) or "does not exist" in err_msg or "deleted" in err_msg:
                        print(f"  🗑️ Post {media_id} de @{username} foi APAGADO no Instagram! Removendo da contabilização...")

                        # 1. Marca/remove de posts_historico
                        c.execute("""
                            UPDATE posts_historico
                            SET is_deleted = 1
                            WHERE post_id = ? OR shortcode = ?
                        """, (media_id, media_id))

                        # 2. Exclui de automacao_publicacoes ou marca como DELETADO
                        c.execute("""
                            UPDATE automacao_publicacoes
                            SET status = 'DELETADO', is_deleted = 1
                            WHERE meta_media_id = ? OR id = ? OR id = ?
                        """, (media_id, f"meta_{media_id}", media_id))

                        # 3. Limpa snapshots desse post para zerar visualizações ganhas residuais
                        c.execute("""
                            DELETE FROM posts_metricas_snapshots
                            WHERE post_id = ?
                        """, (media_id,))

                        total_removidos += 1
            except Exception as check_err:
                print(f"  ⚠️ Erro ao verificar exclusão do post {media_id}: {check_err}")

        return total_removidos
    except Exception as e:
        print(f"  ⚠️ Erro no processo de verificação de posts apagados para @{username}: {e}")
        return 0


# --- CONSTANTES DE DETECÇÃO DE ANOMALIAS ---
# Mesmos limiares de ingestion.py:66-67 (pipeline Apify) — duplicados aqui
# porque a coleta via Meta Graph API roda num pipeline separado que grava
# direto em perfis_historico. Perfis próprios não podem pular a curadoria
# de anomalias só por usarem esse pipeline.
LIMIAR_DELTA_S_MINIMO = 10
LIMIAR_PERCENTUAL_MINIMO = 2.0


def classificar_variacao_seguidores(c, registro_id, username, seguidores_atual, hoje_prefix, ja_validado_hoje=False):
    """Classifica o registro recém-inserido como ORGANICO (validado) ou ADS
    (pendente de curadoria), comparando com o fechamento (última leitura) do dia anterior.
    Se já validado no dia de análise (mesmo dia), não altera a classificação/revisão.
    Se a leitura anterior válida já era VIRAL_ORGANICO validada, herda VIRAL_ORGANICO
    e valida automaticamente (conta em processo de viralização contínua).

    Perfis "meu perfil" são coletados a cada ~15 min por este pipeline, então a
    comparação precisa ser sempre com o fechamento do dia anterior — nunca com o
    registro imediatamente anterior (15 min atrás), senão o crescimento acumulado
    do dia nunca ultrapassa os limiares. Ver a mesma comparação (LAG por dia) em
    dashboard/src/app/api/anomalias/route.ts."""
    if ja_validado_hoje:
        return

    c.execute("""
        SELECT seguidores, tipo_janela, revisado_manualmente FROM perfis_historico
        WHERE LOWER(username) = LOWER(?) AND id < ? AND inativo = 0
          AND SUBSTR(data_coleta, 1, 10) < ?
        ORDER BY data_coleta DESC, id DESC
        LIMIT 1
    """, (username, registro_id, hoje_prefix))
    anterior = c.fetchone()

    if not anterior:
        # Primeira coleta do perfil — mantém ORGANICO/validado automaticamente
        return

    seg_anterior = anterior[0] or 0
    tipo_janela_ant = anterior[1] if len(anterior) > 1 else None
    revisado_ant = anterior[2] if len(anterior) > 2 else None

    delta_s = seguidores_atual - seg_anterior
    pct_delta_s = (delta_s / seg_anterior * 100) if seg_anterior > 0 else 0

    if pct_delta_s > LIMIAR_PERCENTUAL_MINIMO and delta_s >= LIMIAR_DELTA_S_MINIMO:
        # Se a conta já estava em viralização confirmada na leitura anterior, herda VIRAL_ORGANICO e valida automaticamente
        if tipo_janela_ant == 'VIRAL_ORGANICO' and revisado_ant == 1:
            c.execute("""
                UPDATE perfis_historico SET tipo_janela = 'VIRAL_ORGANICO', revisado_manualmente = 1 WHERE id = ?
            """, (registro_id,))
            print(f"  🔥 @{username}: conta em viralização ativa (anterior VIRAL_ORGANICO) → mantido VIRAL_ORGANICO e validado automaticamente.")
        else:
            c.execute("""
                UPDATE perfis_historico SET tipo_janela = 'ADS', revisado_manualmente = 0 WHERE id = ?
            """, (registro_id,))
            print(f"  🔴 @{username}: variação > 2% e >= 10 seg (ΔS={delta_s:+d}, %ΔS={pct_delta_s:.1f}%) → enviado para curadoria.")


def salvar_dados_no_banco(username, dados_perfil, posts_data, data_carga_str, account_id=None, token=None):
    """Persiste dados de perfil, posts e snapshots no SQLite com data_carga."""
    conn = get_db_connection()
    c = conn.cursor()
    hoje_data = datetime.now().strftime("%Y-%m-%d")

    # 1. Salvar / Atualizar Perfil no Histórico
    if dados_perfil:
        seguidores = int(dados_perfil.get("followers_count", 0))
        seguindo = int(dados_perfil.get("follows_count", 0))
        total_posts = int(dados_perfil.get("media_count", 0))
        hoje_prefix = data_carga_str.split(" ")[0]

        # 1. Antes de remover ou atualizar, checa se já existia registro para o mesmo dia e se já foi revisado/classificado
        c.execute("""
            SELECT tipo_janela, revisado_manualmente
            FROM perfis_historico 
            WHERE LOWER(username) = LOWER(?) AND (data_coleta LIKE ? OR data_coleta = ?)
            ORDER BY data_coleta DESC, id DESC LIMIT 1
        """, (username, f"{hoje_prefix}%", hoje_prefix))
        reg_hoje = c.fetchone()

        c.execute("SELECT meu_perfil FROM perfis_monitorados WHERE LOWER(username) = LOWER(?)", (username,))
        row_perfil = c.fetchone()
        is_meu_perfil = bool(row_perfil and row_perfil[0] == 1)

        tipo_janela_inicial = 'ORGANICO'
        revisado_inicial = 1
        ja_validado_hoje = False

        if reg_hoje:
            tipo_janela_ant = reg_hoje[0]
            revisado_ant = reg_hoje[1]
            # Preserva como validado apenas se o usuário já classificou explicitamente como VIRAL_ORGANICO, ADS ou IGNORAR
            if tipo_janela_ant in ('VIRAL_ORGANICO', 'ADS', 'IGNORAR') and revisado_ant == 1:
                tipo_janela_inicial = tipo_janela_ant
                revisado_inicial = 1
                ja_validado_hoje = True

        c.execute("""
            INSERT INTO perfis_historico (
                username, data_coleta, seguidores, seguindo, total_posts, inativo, tipo_janela, revisado_manualmente, data_carga
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
        """, (username, data_carga_str, seguidores, seguindo, total_posts, tipo_janela_inicial, revisado_inicial, data_carga_str))
        classificar_variacao_seguidores(c, c.lastrowid, username, seguidores, hoje_prefix, ja_validado_hoje=ja_validado_hoje)

        # Atualiza também seguidores_historico para gráficos legados
        c.execute("""
            INSERT INTO seguidores_historico (username, data_coleta, total_seguidores)
            VALUES (?, ?, ?)
        """, (username, data_carga_str, seguidores))

        # Atualiza status e foto real oficial em perfis_monitorados
        foto_meta = dados_perfil.get("profile_picture_url")
        if foto_meta:
            c.execute("""
                UPDATE perfis_monitorados 
                SET status = 'ATIVO', foto_perfil_meta = ? 
                WHERE LOWER(username) = LOWER(?)
            """, (foto_meta, username))
            c.execute("""
                UPDATE controle_perfis 
                SET foto_perfil_meta = ? 
                WHERE LOWER(username) = LOWER(?)
            """, (foto_meta, username))
        else:
            c.execute("""
                UPDATE perfis_monitorados SET status = 'ATIVO' WHERE LOWER(username) = LOWER(?)
            """, (username,))

    # 2. Salvar Posts e Snapshots
    posts_salvos = 0
    snapshots_salvos = 0

    for p in posts_data:
        post_id = str(p.get("id"))
        raw_ts = p.get("timestamp", "")
        # Converte timestamp UTC da Meta API para Horário de Brasília (UTC-3)
        data_postagem = parse_utc_para_brasil_str(raw_ts, fallback_str=data_carga_str)
        
        raw_formato = (p.get("media_type") or "IMAGE").upper()
        product_type = (p.get("media_product_type") or "FEED").upper()

        # Mapeia formato para os padrões do SocialTracker
        if raw_formato == "VIDEO" or product_type == "REELS":
            formato = "Reels"
        elif raw_formato == "CAROUSEL_ALBUM":
            formato = "Carrossel"
        else:
            formato = "Imagem"
        legenda = p.get("caption", "")
        permalink = p.get("permalink", "")
        shortcode = p.get("shortcode") or (permalink.rstrip("/").split("/")[-1] if permalink else "")
        
        likes = int(p.get("like_count", 0))
        comentarios = int(p.get("comments_count", 0))
        
        # Insights do post
        insights = p.get("insights")

        if insights is None:
            # buscar_insights_em_lote não conseguiu buscar (rate limit/timeout
            # persistente) — preserva TODOS os valores já gravados em vez de
            # zerar; próximo ciclo do cron tenta buscar de novo.
            c.execute("""
                SELECT views, reach, saved, shares, total_interactions
                FROM posts_historico WHERE post_id = ?
            """, (post_id,))
            row_prev = c.fetchone()
            if row_prev:
                views, reach, saved, shares, total_interactions = row_prev
            else:
                views = reach = saved = shares = total_interactions = 0
        else:
            views = int(insights.get("views", 0))
            reach = int(insights.get("reach", 0))
            saved = int(insights.get("saved", 0))
            shares = int(insights.get("shares", 0))
            total_interactions = int(insights.get("total_interactions", (likes + comentarios + saved + shares)))

            # Proteção contra oscilação transitória da Meta API (quando a resposta veio OK mas com valor pontualmente vazio/zero)
            if views == 0:
                c.execute("SELECT views, reach FROM posts_historico WHERE post_id = ?", (post_id,))
                row_prev = c.fetchone()
                if row_prev:
                    prev_v, prev_r = row_prev
                    if prev_v and prev_v > 0:
                        views = prev_v
                    if reach == 0 and prev_r and prev_r > 0:
                        reach = prev_r

        # Taxa de engajamento baseada em seguidores
        taxa_engajamento = 0.0
        if dados_perfil and dados_perfil.get("followers_count", 0) > 0:
            taxa_engajamento = round(((likes + comentarios) / dados_perfil["followers_count"]) * 100, 2)

        # Mídia / Imagem de Capa
        media_url = p.get("media_url") or ""
        thumbnail_url = p.get("thumbnail_url") or media_url or ""

        # Atualiza tabela consolidada de posts (posts_historico)
        c.execute("""
            INSERT INTO posts_historico (
                post_id, username, data_postagem, formato, legenda,
                likes, comentarios, views, taxa_engajamento, data_atualizacao,
                shortcode, data_carga, permalink, media_product_type, reach, saved, shares, total_interactions,
                media_url, thumbnail_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(post_id) DO UPDATE SET
                likes = excluded.likes,
                comentarios = excluded.comentarios,
                views = excluded.views,
                reach = excluded.reach,
                saved = excluded.saved,
                shares = excluded.shares,
                total_interactions = excluded.total_interactions,
                taxa_engajamento = excluded.taxa_engajamento,
                data_atualizacao = excluded.data_atualizacao,
                data_carga = excluded.data_carga,
                permalink = COALESCE(excluded.permalink, posts_historico.permalink),
                media_product_type = COALESCE(excluded.media_product_type, posts_historico.media_product_type),
                legenda = COALESCE(excluded.legenda, posts_historico.legenda),
                shortcode = COALESCE(excluded.shortcode, posts_historico.shortcode),
                media_url = COALESCE(excluded.media_url, posts_historico.media_url),
                thumbnail_url = COALESCE(excluded.thumbnail_url, posts_historico.thumbnail_url)
        """, (
            post_id, username, data_postagem, formato, legenda,
            likes, comentarios, views, taxa_engajamento, data_carga_str,
            shortcode, data_carga_str, permalink, product_type, reach, saved, shares, total_interactions,
            media_url, thumbnail_url
        ))
        posts_salvos += 1

        # Insere Snapshot de Evolução Temporal (posts_metricas_snapshots)
        c.execute("""
            INSERT INTO posts_metricas_snapshots (
                post_id, username, likes, comentarios, views, reach, saved, shares, total_interactions, data_carga
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            post_id, username, likes, comentarios, views, reach, saved, shares, total_interactions, data_carga_str
        ))
        snapshots_salvos += 1

        # Sincroniza com o histórico do Calendário de Automação (automacao_publicacoes)
        partes_dt = data_postagem.split(" ")
        data_local = partes_dt[0]
        hora_local = partes_dt[1] if len(partes_dt) > 1 else "12:00:00"
        tipo_pub = "REELS" if product_type == "REELS" or formato == "VIDEO" else "FEED"
        pub_id = f"meta_{post_id}"
        
        # Se for carrossel com children, extrai todas as fotos/vídeos filhos
        children_data = p.get("children", {}).get("data", [])
        if raw_formato == "CAROUSEL_ALBUM" and children_data:
            carrossel_items = []
            for c_item in children_data:
                c_url = c_item.get("media_url") or ""
                c_tipo = c_item.get("media_type") or "IMAGE"
                carrossel_items.append({
                    "url": permalink,
                    "previewUrl": c_url,
                    "tipo": c_tipo
                })
            arquivos_json = json.dumps(carrossel_items)
        else:
            arquivos_json = json.dumps([{"url": permalink, "tipo": formato, "previewUrl": thumbnail_url or media_url}])

        # Evita duplicação: se a publicação já existe (ex: criada pelo AGENDADOR ou MANUAL com este meta_media_id),
        # atualiza os dados/links oficiais mantendo o registro original.
        row_existente = c.execute("""
            SELECT id, agendamento_id, origem, arquivos
            FROM automacao_publicacoes
            WHERE (meta_media_id = ? AND meta_media_id IS NOT NULL AND meta_media_id != '')
               OR id = ?
            ORDER BY CASE WHEN origem = 'AGENDADOR' THEN 0 WHEN origem = 'MANUAL' THEN 1 ELSE 2 END
            LIMIT 1
        """, (str(post_id), pub_id)).fetchone()

        if row_existente:
            existente_id = row_existente[0]
            arquivos_existentes_str = row_existente[3] if len(row_existente) > 3 else "[]"
            try:
                arqs_existentes = json.loads(arquivos_existentes_str or "[]")
            except Exception:
                arqs_existentes = []

            # Preserva arquivos originais se o registro existente tiver mais de 1 (ex: carrossel pelo agendador)
            arqs_para_salvar = arquivos_json
            if len(arqs_existentes) > 1 and len(json.loads(arquivos_json or "[]")) <= 1:
                arqs_para_salvar = arquivos_existentes_str

            c.execute("""
                UPDATE automacao_publicacoes
                SET username = ?,
                    meta_account_id = ?,
                    tipo_postagem = ?,
                    data_local = COALESCE(NULLIF(data_local, ''), ?),
                    hora_local = COALESCE(NULLIF(hora_local, ''), ?),
                    publicado_em = COALESCE(NULLIF(publicado_em, ''), ?),
                    status = 'PUBLICADO',
                    meta_media_id = ?,
                    arquivos = ?,
                    legenda = CASE WHEN ? != '' THEN ? ELSE legenda END
                WHERE id = ?
            """, (
                username, (dados_perfil.get("id") or ""), tipo_pub,
                data_local, hora_local, data_postagem,
                str(post_id), arqs_para_salvar, legenda, legenda, existente_id
            ))
        else:
            c.execute("""
                INSERT INTO automacao_publicacoes (
                    id, agendamento_id, username, meta_account_id, tipo_postagem,
                    data_local, hora_local, publicado_em, status, meta_media_id,
                    erro_detalhe, arquivos, legenda, origem
                ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'PUBLICADO', ?, '', ?, ?, 'META_API')
            """, (
                pub_id, username, (dados_perfil.get("id") or ""), tipo_pub,
                data_local, hora_local, data_postagem, str(post_id),
                arquivos_json, legenda
            ))

    # 3. Detectar e remover posts de modelo que foram apagados no Instagram
    active_media_ids = [str(p.get("id")) for p in posts_data if p.get("id")]
    removidos = 0
    if account_id and token:
        removidos = verificar_e_remover_posts_apagados(c, username, account_id, token, active_media_ids)

    conn.commit()
    conn.close()
    return posts_salvos, snapshots_salvos, removidos


def rodar_ingestao_meta(username_filtro=None, buscar_insights_posts=True, limite_posts=30):
    """
    Executa a rotina completa de extração para todas as contas configuradas.
    """
    inicializar_estrutura_banco()
    data_carga = agora_brasil()
    data_carga_str = data_carga.strftime("%Y-%m-%d %H:%M:%S")

    print(f"\n==================================================")
    print(f"🚀 Iniciando Extração Meta Graph API Oficial")
    print(f"📅 Timestamp da Carga: {data_carga_str}")
    print(f"==================================================")

    contas = obter_contas_meta_configuradas(username_filtro)
    if not contas:
        print("⚠️ Nenhuma conta com credenciais Meta válidas foi encontrada.")
        return {
            "sucesso": False,
            "mensagem": "Nenhuma conta configurada encontrada",
            "processados": 0
        }

    print(f"Encontradas {len(contas)} conta(s) configurada(s) para extração.")

    resultados = []

    for conta in contas:
        username = conta["username"]
        account_id = conta["account_id"]
        token = conta["token"]

        print(f"\n▶ Processando @{username} (Account ID: {account_id})...")

        # 1. Extrai perfil
        dados_perfil = extrair_dados_perfil(account_id, token)
        if not dados_perfil:
            print(f"  ⚠️ Pulando extração de posts para @{username} devido a erro no perfil.")
            continue

        seguidores = dados_perfil.get("followers_count", 0)
        total_midias = dados_perfil.get("media_count", 0)
        print(f"  👤 Perfil: {dados_perfil.get('name')} | {seguidores} seguidores | {total_midias} publicações")

        # 2. Extrai posts
        posts = extrair_posts_perfil(account_id, token, limite=limite_posts)
        print(f"  📸 {len(posts)} publicações baixadas.")

        # 3. Extrai insights por post se habilitado (em paralelo — ver buscar_insights_em_lote)
        if buscar_insights_posts and posts:
            buscar_insights_em_lote(posts, token)

        # 4. Salva no banco e grava snapshots
        posts_salvos, snapshots_salvos, posts_removidos = salvar_dados_no_banco(username, dados_perfil, posts, data_carga_str, account_id=account_id, token=token)
        msg_removidos = f" | 🗑️ {posts_removidos} post(s) apagado(s) desconsiderado(s)" if posts_removidos > 0 else ""
        print(f"  💾 Banco atualizado: {posts_salvos} posts salvos | {snapshots_salvos} snapshots registrados{msg_removidos}.")

        resultados.append({
            "username": username,
            "seguidores": seguidores,
            "total_midias": total_midias,
            "posts_extraidos": len(posts),
            "posts_removidos": posts_removidos,
            "data_carga": data_carga_str
        })

    print(f"\n==================================================")
    print(f"✨ Extração Meta concluída! {len(resultados)} perfis atualizados.")
    print(f"==================================================\n")

    return {
        "sucesso": True,
        "data_carga": data_carga_str,
        "processados": len(resultados),
        "detalhes": resultados
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extrator de dados da Meta Graph API para o SocialTracker")
    parser.add_argument("--username", type=str, default=None, help="Filtrar por username específico")
    parser.add_argument("--limite-posts", type=int, default=30, help="Limite de postagens a extrair por perfil")
    parser.add_argument("--sem-insights", action="store_true", help="Desativar busca de insights por post")
    args = parser.parse_args()

    rodar_ingestao_meta(
        username_filtro=args.username,
        buscar_insights_posts=not args.sem_insights,
        limite_posts=args.limite_posts
    )
