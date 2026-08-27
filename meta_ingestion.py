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
import requests
from datetime import datetime
from dotenv import load_dotenv

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


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
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
    ]
    
    for col_name, col_type in colunas_para_adicionar:
        if col_name not in cols_existentes:
            try:
                c.execute(f"ALTER TABLE posts_historico ADD COLUMN {col_name} {col_type}")
            except Exception as e:
                print(f"Aviso ao adicionar coluna {col_name} em posts_historico: {e}")

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
    url = f"{GRAPH_API_BASE}/{account_id}"
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


def extrair_insights_post(media_id, media_type, media_product_type, token):
    """
    Tenta obter métricas avançadas (insights) de uma postagem específica.
    """
    url = f"{GRAPH_API_BASE}/{media_id}/insights"
    
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
        # Se falhar (ex: post muito antigo ou sem suporte), retorna zeros sem travar o fluxo
    except Exception:
        pass
        
    return insights


def extrair_posts_perfil(account_id, token, limite=50):
    """Obtém as publicações recentes da conta com métricas e paginação."""
    url = f"{GRAPH_API_BASE}/{account_id}/media"
    params = {
        "fields": "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,shortcode",
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


def salvar_dados_no_banco(username, dados_perfil, posts_data, data_carga_str):
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

        # Remove registros anteriores do mesmo dia para manter o dado oficial mais recente
        c.execute("""
            DELETE FROM perfis_historico 
            WHERE LOWER(username) = LOWER(?) AND (data_coleta LIKE ? OR data_coleta = ?)
        """, (username, f"{hoje_prefix}%", hoje_prefix))

        c.execute("""
            INSERT INTO perfis_historico (
                username, data_coleta, seguidores, seguindo, total_posts, inativo, tipo_janela, revisado_manualmente, data_carga
            ) VALUES (?, ?, ?, ?, ?, 0, 'ORGANICO', 1, ?)
        """, (username, data_carga_str, seguidores, seguindo, total_posts, data_carga_str))

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
        # Normaliza timestamp ISO 8601 (ex: 2026-08-26T22:34:01+0000 -> 2026-08-26 22:34:01)
        data_postagem = raw_ts.replace("T", " ").split("+")[0].strip() if raw_ts else data_carga_str
        
        formato = p.get("media_type", "IMAGE")
        product_type = p.get("media_product_type", "FEED")
        legenda = p.get("caption", "")
        permalink = p.get("permalink", "")
        shortcode = p.get("shortcode") or (permalink.rstrip("/").split("/")[-1] if permalink else "")
        
        likes = int(p.get("like_count", 0))
        comentarios = int(p.get("comments_count", 0))
        
        # Insights do post
        insights = p.get("insights", {})
        views = int(insights.get("views", 0))
        reach = int(insights.get("reach", 0))
        saved = int(insights.get("saved", 0))
        shares = int(insights.get("shares", 0))
        total_interactions = int(insights.get("total_interactions", (likes + comentarios + saved + shares)))

        # Taxa de engajamento baseada em seguidores
        taxa_engajamento = 0.0
        if dados_perfil and dados_perfil.get("followers_count", 0) > 0:
            taxa_engajamento = round(((likes + comentarios) / dados_perfil["followers_count"]) * 100, 2)

        # Atualiza tabela consolidada de posts (posts_historico)
        c.execute("""
            INSERT INTO posts_historico (
                post_id, username, data_postagem, formato, legenda,
                likes, comentarios, views, taxa_engajamento, data_atualizacao,
                shortcode, data_carga, permalink, media_product_type, reach, saved, shares, total_interactions
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                shortcode = COALESCE(excluded.shortcode, posts_historico.shortcode)
        """, (
            post_id, username, data_postagem, formato, legenda,
            likes, comentarios, views, taxa_engajamento, data_carga_str,
            shortcode, data_carga_str, permalink, product_type, reach, saved, shares, total_interactions
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
        arquivos_json = json.dumps([{"url": permalink, "tipo": formato}])

        c.execute("""
            INSERT INTO automacao_publicacoes (
                id, agendamento_id, username, meta_account_id, tipo_postagem,
                data_local, hora_local, publicado_em, status, meta_media_id,
                erro_detalhe, arquivos, legenda, origem
            ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'PUBLICADO', ?, '', ?, ?, 'META_API')
            ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                meta_account_id = excluded.meta_account_id,
                tipo_postagem = excluded.tipo_postagem,
                data_local = excluded.data_local,
                hora_local = excluded.hora_local,
                publicado_em = excluded.publicado_em,
                status = 'PUBLICADO',
                meta_media_id = excluded.meta_media_id,
                arquivos = excluded.arquivos,
                legenda = excluded.legenda,
                origem = 'META_API'
        """, (
            pub_id, username, (dados_perfil.get("id") or ""), tipo_pub,
            data_local, hora_local, data_postagem, post_id,
            arquivos_json, legenda
        ))

    conn.commit()
    conn.close()
    return posts_salvos, snapshots_salvos


def rodar_ingestao_meta(username_filtro=None, buscar_insights_posts=True, limite_posts=30):
    """
    Executa a rotina completa de extração para todas as contas configuradas.
    """
    inicializar_estrutura_banco()
    data_carga = datetime.now()
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

        # 3. Extrai insights por post se habilitado
        if buscar_insights_posts and posts:
            for p in posts:
                media_id = p.get("id")
                media_type = p.get("media_type")
                product_type = p.get("media_product_type")
                p["insights"] = extrair_insights_post(media_id, media_type, product_type, token)

        # 4. Salva no banco e grava snapshots
        posts_salvos, snapshots_salvos = salvar_dados_no_banco(username, dados_perfil, posts, data_carga_str)
        print(f"  💾 Banco atualizado: {posts_salvos} posts salvos | {snapshots_salvos} snapshots de evolução registrados.")

        resultados.append({
            "username": username,
            "seguidores": seguidores,
            "total_midias": total_midias,
            "posts_extraidos": len(posts),
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
