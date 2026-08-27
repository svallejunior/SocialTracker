import os
import sys
import json
import sqlite3
import argparse
from datetime import datetime, timedelta

# Força UTF-8 no stdout/stderr no Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

APIFY_TOKEN = os.getenv("APIFY_API_TOKEN") or os.getenv("APIFY_TOKEN")
# DB_PATH relativo é resolvido a partir da pasta do projeto, e não do cwd do processo chamador.
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
DB_PATH = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)


def parse_datetime(val):
    if not val:
        return None
    val_str = str(val).strip().replace('T', ' ')
    if '.' in val_str:
        val_str = val_str.split('.')[0]
    
    # Se for timestamp numérico
    if val_str.replace('.', '', 1).isdigit():
        try:
            ts = float(val_str)
            if ts > 5000000000:
                ts = ts / 1000.0
            return datetime.fromtimestamp(ts)
        except Exception:
            pass

    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y'):
        try:
            return datetime.strptime(val_str, fmt)
        except ValueError:
            continue
    return None


def format_datetime(dt):
    if not dt:
        return None
    return dt.strftime('%Y-%m-%d %H:%M:%S')


def id_to_shortcode(media_id):
    try:
        clean_id = int(str(media_id).split('_')[0])
        alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
        shortcode = ''
        while clean_id > 0:
            remainder = clean_id % 64
            clean_id = clean_id // 64
            shortcode = alphabet[remainder] + shortcode
        return shortcode
    except (ValueError, TypeError):
        return str(media_id)


def get_local_posts(username, data_coleta_dt):
    """Busca posts salvos no banco local para o perfil."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT post_id, username, data_postagem, formato, legenda, likes, comentarios, views, taxa_engajamento, shortcode
        FROM posts_historico
        WHERE username = ?
        ORDER BY data_postagem DESC
    """, (username,))
    rows = cursor.fetchall()
    conn.close()

    posts = []
    for r in rows:
        dt_post = parse_datetime(r["data_postagem"])
        shortcode = r["shortcode"]
        post_id = str(r["post_id"])
        
        # Link do post
        if shortcode and shortcode != 'None' and shortcode != 'null' and any(c.isalpha() for c in shortcode):
            url = f"https://www.instagram.com/p/{shortcode}/"
        elif post_id:
            sc = id_to_shortcode(post_id)
            url = f"https://www.instagram.com/p/{sc}/" if sc else f"https://www.instagram.com/{username}/"
        else:
            url = f"https://www.instagram.com/{username}/"

        posts.append({
            "post_id": post_id,
            "shortcode": shortcode,
            "url": url,
            "data_postagem": format_datetime(dt_post) if dt_post else r["data_postagem"],
            "data_postagem_dt": dt_post,
            "formato": r["formato"] or "Post",
            "legenda": r["legenda"] or "",
            "likes": int(r["likes"] or 0),
            "comentarios": int(r["comentarios"] or 0),
            "views": int(r["views"] or 0),
            "taxa_engajamento": float(r["taxa_engajamento"] or 0)
        })
    return posts


def salvar_posts_no_banco(username, posts_data):
    """Insere ou atualiza posts raspados na tabela posts_historico."""
    if not posts_data:
        return 0

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Garante estrutura
    cursor.execute("""
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

    salvos = 0
    agora = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for p in posts_data:
        try:
            cursor.execute("""
                INSERT INTO posts_historico (
                    post_id, username, data_postagem, formato, legenda,
                    likes, comentarios, views, taxa_engajamento, data_atualizacao, shortcode
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(post_id) DO UPDATE SET
                    likes = excluded.likes,
                    comentarios = excluded.comentarios,
                    views = excluded.views,
                    taxa_engajamento = excluded.taxa_engajamento,
                    data_atualizacao = excluded.data_atualizacao,
                    shortcode = COALESCE(excluded.shortcode, posts_historico.shortcode),
                    legenda = COALESCE(excluded.legenda, posts_historico.legenda)
            """, (
                p["post_id"],
                username,
                p["data_postagem"],
                p["formato"],
                p.get("legenda", ""),
                p.get("likes", 0),
                p.get("comentarios", 0),
                p.get("views", 0),
                p.get("taxa_engajamento", 0.0),
                agora,
                p.get("shortcode")
            ))
            salvos += 1
        except Exception:
            pass

    conn.commit()
    conn.close()
    return salvos


def buscar_reels_apify(username, limit=5):
    """Executa scraping na aba exclusiva de Reels do perfil (/reels/)."""
    try:
        from apify_client import ApifyClient
        client = ApifyClient(APIFY_TOKEN)
        username_clean = username.strip().lstrip("@")

        run_input = {
            "username": [username_clean],
            "resultsLimit": limit
        }

        run = client.actor("apify/instagram-reel-scraper").call(
            run_input=run_input,
            timeout_secs=60
        )

        dataset_items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
        reels_parsed = []
        for item in dataset_items:
            if item.get("error") or not (item.get("id") or item.get("shortCode") or item.get("code") or item.get("url")):
                continue
            parsed = extrair_dados_post(item, username_clean)
            if parsed:
                parsed["formato"] = "Reels"
                reels_parsed.append(parsed)
        return reels_parsed
    except Exception:
        return []


def buscar_posts_apify(username, limit=5):
    """Executa scraping pontual no Apify combinando Feed Principal e Aba de Reels."""
    posts_total = []
    username_clean = username.strip().lstrip("@")

    # 1. Tenta buscar Posts/Feed
    try:
        from apify_client import ApifyClient
        client = ApifyClient(APIFY_TOKEN)

        run_input = {
            "usernames": [username_clean],
            "resultsLimit": limit,
            "scrapePosts": True,
            "scrapeStories": False,
            "scrapeHighlights": False,
            "includeCheckins": False,
            "scrapeComments": False
        }

        run = client.actor("apify/instagram-scraper").call(
            run_input=run_input,
            timeout_secs=60
        )

        dataset_items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
        for item in dataset_items:
            latest_posts = item.get("latestPosts") or []
            if latest_posts:
                for p in latest_posts:
                    parsed = extrair_dados_post(p, username_clean)
                    if parsed:
                        posts_total.append(parsed)
            else:
                parsed = extrair_dados_post(item, username_clean)
                if parsed:
                    posts_total.append(parsed)
    except Exception:
        pass

    # 2. Busca também na aba exclusiva de Reels
    try:
        reels = buscar_reels_apify(username_clean, limit=limit)
        for r in reels:
            if not any(p["post_id"] == r["post_id"] for p in posts_total):
                posts_total.append(r)
    except Exception:
        pass

    return posts_total


def extrair_dados_post(raw, default_username):
    """Extrai e normaliza os dados de um post retornado pelo Apify."""
    post_id = str(raw.get("id") or raw.get("postId") or raw.get("shortCode") or "")
    if not post_id:
        return None

    shortcode = raw.get("shortCode") or raw.get("shortcode") or raw.get("code")
    if not shortcode and post_id:
        shortcode = post_id.split('_')[0] if '_' in post_id else post_id

    # Data
    raw_date = raw.get("timestamp") or raw.get("takenAt") or raw.get("postedAt") or raw.get("takenAtTimestamp")
    dt_post = parse_datetime(raw_date) if raw_date else datetime.now()
    data_postagem_str = format_datetime(dt_post)

    # Formato
    raw_type = str(raw.get("type") or raw.get("productType") or "").lower()
    is_video = raw.get("isVideo", False) or raw.get("videoPlayCount") or raw.get("videoViewCount") or 'video' in raw_type or 'clips' in raw_type
    is_carousel = 'sidecar' in raw_type or 'carousel' in raw_type or raw.get("childPosts") or raw.get("images")
    
    if is_video:
        formato = "Reels"
    elif is_carousel:
        formato = "Carrossel"
    else:
        formato = "Imagem"

    # Métricas
    likes = int(raw.get("likesCount") or raw.get("likes") or 0)
    comments = int(raw.get("commentsCount") or raw.get("comments") or 0)
    views = int(raw.get("videoViewCount") or raw.get("videoPlayCount") or raw.get("viewCount") or 0)
    caption = raw.get("caption") or raw.get("captionText") or raw.get("text") or ""
    
    # URL
    url = raw.get("url") or (f"https://www.instagram.com/p/{shortcode}/" if shortcode else f"https://www.instagram.com/p/{post_id}/")

    return {
        "post_id": post_id,
        "username": default_username,
        "shortcode": shortcode,
        "url": url,
        "data_postagem": data_postagem_str,
        "data_postagem_dt": dt_post,
        "formato": formato,
        "legenda": caption,
        "likes": likes,
        "comentarios": comments,
        "views": views,
        "taxa_engajamento": 0.0
    }


def processar_busca(username, data_coleta_str, force_api=False):
    username_clean = username.strip().lstrip("@").lower()
    data_coleta_dt = parse_datetime(data_coleta_str)
    
    if not data_coleta_dt:
        data_coleta_dt = datetime.now()

    # Janela de até 72 horas anteriores à data da leitura clicada (ampliada para capturar virais)
    janela_inicio = data_coleta_dt - timedelta(hours=72)
    janela_fim = data_coleta_dt

    # 1. Busca primeiro no banco local
    local_posts = get_local_posts(username_clean, data_coleta_dt)
    
    # Filtra posts locais dentro da janela de 48h
    posts_na_janela = [
        p for p in local_posts 
        if p["data_postagem_dt"] and (janela_inicio <= p["data_postagem_dt"] <= janela_fim)
    ]

    origem = "BANCO_LOCAL"

    # 2. Se não encontrar no banco local ou se foi forçado, chama o Apify
    if (not posts_na_janela or force_api):
        # Busca 15 posts para garantir que posts mais antigos (até 72h) sejam encontrados
        apify_posts = buscar_posts_apify(username_clean, limit=15)
        if apify_posts:
            salvar_posts_no_banco(username_clean, apify_posts)
            origem = "APIFY_API"
            # Recarrega do banco local
            local_posts = get_local_posts(username_clean, data_coleta_dt)
            posts_na_janela = [
                p for p in local_posts 
                if p["data_postagem_dt"] and (janela_inicio <= p["data_postagem_dt"] <= janela_fim)
            ]

    # Ordena posts na janela por força de tração: (views + likes*3 + comments*5)
    def calc_score_tracao(p):
        return p["views"] + (p["likes"] * 3) + (p["comentarios"] * 5)

    for p in local_posts:
        p["score_tracao"] = calc_score_tracao(p)
        if p.get("data_postagem_dt"):
            diff_segundos = (data_coleta_dt - p["data_postagem_dt"]).total_seconds()
            p["horas_antes_coleta"] = round(diff_segundos / 3600.0, 1)
        else:
            p["horas_antes_coleta"] = None

    # Ordena posts na janela por tração
    posts_na_janela.sort(key=lambda x: x["score_tracao"], reverse=True)
    top_post = posts_na_janela[0] if posts_na_janela else None

    # Posts recentes fora da janela, ordenados por tração
    outros_posts = [p for p in local_posts if not any(w["post_id"] == p["post_id"] for w in posts_na_janela)]
    outros_posts.sort(key=lambda x: x["score_tracao"], reverse=True)

    # Se não houver post na janela de 72h, mas existir um post recente com tração relevante
    sugestao_viral = None
    if not top_post and outros_posts:
        # Threshold reduzido para funcionar com contas menores
        if outros_posts[0]["score_tracao"] >= 500 or outros_posts[0]["views"] >= 1000 or outros_posts[0]["likes"] >= 50:
            sugestao_viral = outros_posts[0]

    outros_posts_limitados = outros_posts[:5]

    # Remove objeto datetime antes de serializar
    for p in local_posts:
        p.pop("data_postagem_dt", None)

    resultado = {
        "success": True,
        "username": username_clean,
        "data_coleta": format_datetime(data_coleta_dt),
        "janela_inicio": format_datetime(janela_inicio),
        "janela_fim": format_datetime(janela_fim),
        # Mantém chave legada para compatibilidade
        "janela_48h_inicio": format_datetime(janela_inicio),
        "janela_48h_fim": format_datetime(janela_fim),
        "total_posts_janela": len(posts_na_janela),
        "top_post": top_post,
        "sugestao_viral": sugestao_viral,
        "posts_na_janela": posts_na_janela,
        "outros_posts_recentes": outros_posts_limitados,
        "origem": origem
    }

    return resultado


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Busca post viral na janela de 48h antes da coleta.")
    parser.add_argument("--username", required=True, help="Username do perfil")
    parser.add_argument("--data_coleta", required=True, help="Data da coleta (ex: '2026-07-09 09:11:09')")
    parser.add_argument("--force_api", action="store_true", help="Força consulta na API mesmo se houver dados locais")

    args = parser.parse_args()

    try:
        res = processar_busca(args.username, args.data_coleta, args.force_api)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    except Exception as e:
        erro_json = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(erro_json, ensure_ascii=False, indent=2))
        sys.exit(1)
