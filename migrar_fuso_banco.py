"""
migrar_fuso_banco.py — Script de Migração para Padronização de Fuso Horário (UTC-3 / Horário de Brasília)
SocialTracker Engine
"""

import os
import sys
import sqlite3
from datetime import datetime, timezone, timedelta

# Força UTF-8 no stdout/stderr no Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
DB_PATH = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)

FUSO_BRASIL = timezone(timedelta(hours=-3))


def parse_para_brasil_str(val):
    if not val:
        return None
    s = str(val).strip()
    try:
        iso_str = s.replace('Z', '+00:00')
        if len(iso_str) >= 5 and iso_str[-5] in ('+', '-') and iso_str[-3] != ':':
            iso_str = iso_str[:-2] + ':' + iso_str[-2:]
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is not None:
            return dt.astimezone(FUSO_BRASIL).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        pass

    s_clean = s.replace('T', ' ')
    if '.' in s_clean:
        s_clean = s_clean.split('.')[0]
    return s_clean


def migrar():
    print("=" * 60)
    print("🕒 SocialTracker — Migração de Fuso Horário para Horário de Brasília (UTC-3)")
    print(f"📁 Banco de Dados: {DB_PATH}")
    print("=" * 60)

    if not os.path.exists(DB_PATH):
        print(f"❌ Banco não encontrado: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # 1. Migrar instagram_comentarios
    try:
        c.execute("SELECT id, timestamp FROM instagram_comentarios")
        comentarios = c.fetchall()
        com_ajustados = 0
        for cid, ts in comentarios:
            if ts and ('T' in ts or '+' in ts or 'Z' in ts):
                novo_ts = parse_para_brasil_str(ts)
                if novo_ts and novo_ts != ts:
                    c.execute("UPDATE instagram_comentarios SET timestamp = ? WHERE id = ?", (novo_ts, cid))
                    com_ajustados += 1
        print(f"✅ instagram_comentarios: {com_ajustados} timestamp(s) convertidos para Horário de Brasília.")
    except Exception as e:
        print(f"⚠️ Erro ao migrar instagram_comentarios: {e}")

    # 2. Migrar instagram_mensagens
    try:
        c.execute("SELECT id, timestamp FROM instagram_mensagens")
        mensagens = c.fetchall()
        msg_ajustadas = 0
        for mid, ts in mensagens:
            if ts and ('T' in ts or '+' in ts or 'Z' in ts):
                novo_ts = parse_para_brasil_str(ts)
                if novo_ts and novo_ts != ts:
                    c.execute("UPDATE instagram_mensagens SET timestamp = ? WHERE id = ?", (novo_ts, mid))
                    msg_ajustadas += 1
        print(f"✅ instagram_mensagens: {msg_ajustadas} timestamp(s) convertidos para Horário de Brasília.")
    except Exception as e:
        print(f"⚠️ Erro ao migrar instagram_mensagens: {e}")

    # 3. Migrar posts_historico (posts que vieram da Meta API em UTC puro)
    try:
        # Posts da Meta têm permalink ou media_product_type preenchidos
        c.execute("""
            SELECT post_id, data_postagem, data_carga 
            FROM posts_historico 
            WHERE permalink IS NOT NULL AND permalink != ''
        """)
        posts = c.fetchall()
        posts_ajustados = 0
        for pid, dt_post, dt_carga in posts:
            if not dt_post:
                continue
            # Se tiver 'T' ou '+', converte ISO
            if 'T' in dt_post or '+' in dt_post or 'Z' in dt_post:
                novo_dt = parse_para_brasil_str(dt_post)
                c.execute("UPDATE posts_historico SET data_postagem = ? WHERE post_id = ?", (novo_dt, pid))
                posts_ajustados += 1
            else:
                # Se foi gravado sem timezone mas veio da Meta API como UTC puro:
                # Se data_postagem > data_carga ou se data_postagem foi gravada como UTC puro
                # Subtrai 3 horas apenas se ainda não foi ajustado
                try:
                    dt = datetime.strptime(dt_post, '%Y-%m-%d %H:%M:%S')
                    # Ajusta -3h para converter de UTC para Horário de Brasília
                    dt_brasil = dt - timedelta(hours=3)
                    dt_brasil_str = dt_brasil.strftime('%Y-%m-%d %H:%M:%S')
                    c.execute("UPDATE posts_historico SET data_postagem = ? WHERE post_id = ?", (dt_brasil_str, pid))
                    posts_ajustados += 1
                except Exception:
                    pass

        print(f"✅ posts_historico: {posts_ajustados} post(s) da Meta API ajustados para Horário de Brasília.")
    except Exception as e:
        print(f"⚠️ Erro ao migrar posts_historico: {e}")

    # 4. Sincronizar automacao_publicacoes criadas via META_API
    try:
        c.execute("""
            UPDATE automacao_publicacoes
            SET data_local = SUBSTR(p.data_postagem, 1, 10),
                hora_local = SUBSTR(p.data_postagem, 12, 5),
                publicado_em = p.data_postagem
            FROM posts_historico p
            WHERE automacao_publicacoes.id = 'meta_' || p.post_id
              AND automacao_publicacoes.origem = 'META_API'
        """)
        print("✅ automacao_publicacoes sincronizadas com as novas datas do posts_historico.")
    except Exception as e:
        print(f"ℹ️ automacao_publicacoes: {e}")

    conn.commit()
    conn.close()
    print("\n🎉 Migração concluída com sucesso! Todos os registros unificados no Horário de Brasília.")


if __name__ == "__main__":
    migrar()
