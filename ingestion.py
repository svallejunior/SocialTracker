import os
import sys
import sqlite3
from datetime import datetime
from apify_client import ApifyClient

# Força UTF-8 no stdout/stderr no Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# --- CONFIGURAÇÕES ---
import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

APIFY_TOKEN = os.getenv("APIFY_API_TOKEN") or os.getenv("APIFY_TOKEN")
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "instagram_tracker.db"))

if not APIFY_TOKEN:
    print("⚠️ AVISO: APIFY_TOKEN / APIFY_API_TOKEN não encontrado no ambiente ou arquivo .env!")

client = ApifyClient(APIFY_TOKEN) if APIFY_TOKEN else None

def get_perfis_ativos():
    """Busca no banco apenas perfis marcados como ATIVO."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT username FROM perfis_monitorados WHERE status = 'ATIVO'")
        perfis = [row[0] for row in cursor.fetchall()]
        return perfis
    except Exception as e:
        print(f"Erro ao buscar perfis ativos: {e}")
        return []
    finally:
        conn.close()

# --- CONSTANTES DE DETECÇÃO DE ANOMALIAS ---
LIMIAR_DELTA_S_MINIMO = 10         # ΔS mínimo para acionar análise
LIMIAR_PERCENTUAL_MINIMO = 2.0     # %ΔS mínimo para acionar análise (> 2%)


def avaliar_anomalia(cursor, registro_id, username, seguidores_atual, posts_atual):
    """
    Avalia se a coleta recém-inserida requer análise manual:
    - Variação de seguidores > 2% E > 10 seguidores: marcada como 'ADS' e revisado_manualmente = 0 (pendente de análise).
    - Dentro do parâmetro normal (<= 2% ou <= 10 seg): marcada como 'ORGANICO' e revisado_manualmente = 1 (validado automaticamente).
    """
    # Busca o registro anterior mais recente (excluindo o recém-inserido e inativos)
    cursor.execute("""
        SELECT seguidores, total_posts FROM perfis_historico
        WHERE username = ? AND id < ? AND inativo = 0
        ORDER BY data_coleta DESC, id DESC
        LIMIT 1
    """, (username, registro_id))
    anterior = cursor.fetchone()

    if not anterior:
        # Primeira coleta deste perfil — marcar automaticamente como orgânico e validado
        cursor.execute("""
            UPDATE perfis_historico
            SET tipo_janela = 'ORGANICO', revisado_manualmente = 1
            WHERE id = ?
        """, (registro_id,))
        return

    seg_anterior, posts_anterior = anterior
    seg_anterior = seg_anterior or 0
    posts_anterior = posts_anterior or 0

    delta_s = seguidores_atual - seg_anterior
    delta_posts = posts_atual - posts_anterior
    pct_delta_s = ((seguidores_atual - seg_anterior) / seg_anterior * 100) if seg_anterior > 0 else 0

    precisa_analise = (pct_delta_s > LIMIAR_PERCENTUAL_MINIMO) and (delta_s > LIMIAR_DELTA_S_MINIMO)

    if precisa_analise:
        cursor.execute("""
            UPDATE perfis_historico
            SET tipo_janela = 'ADS', revisado_manualmente = 0
            WHERE id = ?
        """, (registro_id,))
        print(f"  🔴 Registro #{registro_id} (@{username}) com variação > 2% e > 10 seg (ΔS={delta_s:+d}, %ΔS={pct_delta_s:.1f}%) → enviado para análise/validação.")
    else:
        cursor.execute("""
            UPDATE perfis_historico
            SET tipo_janela = 'ORGANICO', revisado_manualmente = 1
            WHERE id = ?
        """, (registro_id,))
        print(f"  🌱 Registro #{registro_id} (@{username}) dentro do parâmetro (ΔS={delta_s:+d}, %ΔS={pct_delta_s:.1f}%) → validado automaticamente como ORGANICO.")


def salvar_no_banco(username, dados, inativo=0):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("ALTER TABLE perfis_historico ADD COLUMN inativo INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    # Migração: garante colunas de classificação dinâmica
    try:
        cursor.execute("ALTER TABLE perfis_historico ADD COLUMN tipo_janela TEXT DEFAULT 'ORGANICO'")
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE perfis_historico ADD COLUMN revisado_manualmente INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    followers = dados.get('followers', 0) if dados else 0
    following = dados.get('following', 0) if dados else 0
    posts = dados.get('posts', 0) if dados else 0

    cursor.execute("""
        INSERT INTO perfis_historico (
            username,
            data_coleta,
            seguidores,
            seguindo,
            total_posts,
            inativo
        )
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        username,
        datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        followers,
        following,
        posts,
        inativo
    ))

    registro_id = cursor.lastrowid

    # Avalia anomalia apenas para leituras ativas com dados válidos
    if inativo == 0 and dados and followers > 0:
        avaliar_anomalia(cursor, registro_id, username, followers, posts)
        cursor.execute("UPDATE perfis_monitorados SET status = 'ATIVO' WHERE username = ?", (username,))

    conn.commit()
    conn.close()
    status_label = "INATIVO (falha/indisponivel)" if inativo == 1 else "ATIVO"
    print(f"Dados de @{username} salvos com sucesso! Status da leitura: {status_label}")

def atualizar_status_perfil(username, novo_status):
    """Atualiza o status do perfil na tabela perfis_monitorados."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE perfis_monitorados SET status = ? WHERE username = ?", (novo_status, username))
        conn.commit()
    except Exception as e:
        print(f"Erro ao atualizar status do perfil @{username}: {e}")
    finally:
        conn.close()

def rodar_ingestao_diaria():
    if not client:
        print("❌ ERRO: Cliente Apify não inicializado. Verifique o token no arquivo .env.")
        return

    perfis = get_perfis_ativos()
    if not perfis:
        print("Nenhum perfil ativo encontrado para processar no banco de dados.")
        return

    print(f"Iniciando coleta para {len(perfis)} perfis ativos.")

    for user in perfis:
        status_res, dados = consultar_apify(user)
        if status_res == "OK" and dados:
            salvar_no_banco(user, dados, inativo=0)
            atualizar_status_perfil(user, 'ATIVO')
        elif status_res == "NOT_FOUND":
            print(f"Perfil @{user} não encontrado no Instagram. Marcando como INDISPONIVEL.")
            salvar_no_banco(user, None, inativo=1)
            atualizar_status_perfil(user, 'INDISPONIVEL')
        else:
            # Erro de API/token/rede/etc — NÃO marcar o perfil como INDISPONIVEL
            print(f"⚠️ Erro na consulta de @{user} (falha de API/conexão). Status 'ATIVO' mantido, pulando...")

def consultar_apify(username):
    """
    Consulta os dados públicos de um perfil no Apify.
    Retorna uma tupla: (status_code, dados)
    status_code: 'OK', 'NOT_FOUND', ou 'API_ERROR'
    """
    if not client:
        return "API_ERROR", None

    username = username.strip().lstrip("@")

    print(f"Buscando dados de @{username} no Apify...")

    # Configurações otimizadas com proxy residencial para contornar bloqueios do Instagram
    run_input = {
        "usernames": [username],
        "resultsLimit": 1,
        "scrapePosts": False,    # Economia: não baixar postagens
        "scrapeStories": False,  # Economia: não baixar stories
        "proxy": {
            "useApifyProxy": True,
            "apifyProxyGroups": ["RESIDENTIAL"],  # Proxy residencial: maior taxa de sucesso
        }
    }

    MAX_TENTATIVAS = 2  # Tenta até 2 vezes antes de desistir

    for tentativa in range(1, MAX_TENTATIVAS + 1):
        try:
            if tentativa > 1:
                print(f"  Tentativa {tentativa} para @{username}...")

            run = client.actor("apify/instagram-profile-scraper").call(
                run_input=run_input
            )

            itens = list(
                client.dataset(run["defaultDatasetId"]).iterate_items()
            )

            if not itens:
                if tentativa < MAX_TENTATIVAS:
                    print(f"  Nenhum dado retornado para @{username}, tentando novamente...")
                    continue
                print(f"Nenhum dado retornado para @{username} após {MAX_TENTATIVAS} tentativas.")
                return "NOT_FOUND", None

            item = itens[0]

            seguidores = item.get("followersCount")
            seguindo = item.get("followsCount")
            posts = item.get("postsCount")

            # Não salvar um registro "de sucesso" se não houver métricas.
            if seguidores is None:
                is_private = item.get("isPrivate", False)
                motivo = "perfil privado/restrito" if is_private else "dados não disponíveis"
                print(f"AVISO: @{username} pulado: {motivo}.")
                return "NOT_FOUND", None

            return "OK", {
                "followers": seguidores if seguidores is not None else 0,
                "following": seguindo if seguindo is not None else 0,
                "posts": posts if posts is not None else 0,
            }

        except Exception as e:
            print(f"Erro ao consultar @{username}: {e}")
            if tentativa < MAX_TENTATIVAS:
                print(f"  Aguardando para tentar novamente...")
                import time
                time.sleep(5)
            else:
                return "API_ERROR", None

    return "API_ERROR", None
    
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        target_user = sys.argv[1]
        print(f"Iniciando coleta para perfil específico: @{target_user}")
        status_res, dados = consultar_apify(target_user)
        if status_res == "OK" and dados:
            salvar_no_banco(target_user, dados, inativo=0)
            atualizar_status_perfil(target_user, 'ATIVO')
            print(f"Coleta concluída com sucesso para @{target_user} (status redefinido para ATIVO).")
        elif status_res == "NOT_FOUND":
            print(f"AVISO: @{target_user} não encontrado ou dados indisponíveis. Nenhuma alteração gravada no banco.")
        else:
            print(f"⚠️ Falha na API ao consultar @{target_user}. Status mantido sem alterações.")
    else:
        rodar_ingestao_diaria()