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

load_dotenv()
APIFY_TOKEN = os.getenv("APIFY_API_TOKEN")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "instagram_tracker.db"))

client = ApifyClient(APIFY_TOKEN)

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
# Gatilho 1: Volume sem Conteúdo (ganho alto de seguidores sem novos posts)
LIMIAR_DELTA_S_VOLUME = 150       # ΔS mínimo para acionar
# Gatilho 2: Explosão Percentual
LIMIAR_PERCENTUAL_EXPLOSAO = 25   # %ΔS mínimo para acionar (≥ 25%)
LIMIAR_S_ANTERIOR_MINIMO = 500    # S_{t-1} mínimo para que a % seja relevante


def avaliar_anomalia(cursor, registro_id, username, seguidores_atual, posts_atual):
    """
    Avalia se a janela de coleta recém-inserida é uma anomalia (provável ADS).
    Compara com o registro anterior do mesmo perfil e aplica os gatilhos.
    Atualiza tipo_janela e revisado_manualmente no registro com id = registro_id.
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
        # Primeira coleta deste perfil — marcar como orgânico
        return

    seg_anterior, posts_anterior = anterior
    seg_anterior = seg_anterior or 0
    posts_anterior = posts_anterior or 0

    delta_s = seguidores_atual - seg_anterior
    delta_posts = posts_atual - posts_anterior
    pct_delta_s = ((seguidores_atual - seg_anterior) / seg_anterior * 100) if seg_anterior > 0 else 0

    gatilho_disparado = False

    # Gatilho 1: Volume sem Conteúdo — ΔS > 150 E ΔPosts = 0
    if delta_s > LIMIAR_DELTA_S_VOLUME and delta_posts == 0:
        gatilho_disparado = True
        print(f"  ⚠️  ANOMALIA @{username}: Volume sem Conteúdo (ΔS={delta_s:+d}, ΔPosts=0)")

    # Gatilho 2: Explosão Percentual — %ΔS ≥ 25% E S_{t-1} > 500
    if pct_delta_s >= LIMIAR_PERCENTUAL_EXPLOSAO and seg_anterior > LIMIAR_S_ANTERIOR_MINIMO:
        gatilho_disparado = True
        print(f"  ⚠️  ANOMALIA @{username}: Explosao Percentual (%ΔS={pct_delta_s:.1f}%, S_ant={seg_anterior})")

    if gatilho_disparado:
        cursor.execute("""
            UPDATE perfis_historico
            SET tipo_janela = 'ADS', revisado_manualmente = 0
            WHERE id = ?
        """, (registro_id,))
        print(f"  🔴 Registro #{registro_id} marcado como ADS (pendente de triagem).")
    # Se nenhum gatilho, mantém o DEFAULT 'ORGANICO' e revisado_manualmente = 0


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

    followers = (dados.get("followers") or 0) if dados else 0
    following = (dados.get("following") or 0) if dados else 0
    posts = (dados.get("posts") or 0) if dados else 0

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
    perfis = get_perfis_ativos()
    if not perfis:
        print("Nenhum perfil ativo encontrado para processar no banco de dados.")
        return

    print(f"Iniciando coleta para {len(perfis)} perfis ativos.")

    for user in perfis:
        dados = consultar_apify(user)
        if dados:
            salvar_no_banco(user, dados, inativo=0)
            atualizar_status_perfil(user, 'ATIVO')
        else:
            print(f"Registrando leitura INATIVA para @{user} devido a falha ou restrição na API.")
            salvar_no_banco(user, None, inativo=1)
            atualizar_status_perfil(user, 'INDISPONIVEL')
            print(f"Status do perfil @{user} alterado para INDISPONIVEL no monitoramento.")

def consultar_apify(username):
    """Consulta os dados públicos de um perfil no Apify."""
    username = username.strip().lstrip("@")

    print(f"Buscando dados de @{username} no Apify...")

    run_input = {
        "usernames": [username]
    }

    try:
        run = client.actor("apify/instagram-profile-scraper").call(
            run_input=run_input
        )

        itens = list(
            client.dataset(run["defaultDatasetId"]).iterate_items()
        )

        if not itens:
            print(f"Nenhum dado retornado para @{username}.")
            return None

        item = itens[0]

        seguidores = item.get("followersCount")
        seguindo = item.get("followsCount")
        posts = item.get("postsCount")

        # Não salvar um registro "de sucesso" se não houver métricas.
        if seguidores is None:
            is_private = item.get("isPrivate", False)
            motivo = "perfil privado/restrito" if is_private else "dados não disponíveis"
            print(f"AVISO: @{username} pulado: {motivo}.")
            return None

        return {
            "followers": seguidores if seguidores is not None else 0,
            "following": seguindo if seguindo is not None else 0,
            "posts": posts if posts is not None else 0,
        }

    except Exception as e:
        print(f"Erro ao consultar @{username}: {e}")
        return None
    
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        target_user = sys.argv[1]
        print(f"Iniciando coleta para perfil específico: @{target_user}")
        dados = consultar_apify(target_user)
        if dados:
            salvar_no_banco(target_user, dados, inativo=0)
            atualizar_status_perfil(target_user, 'ATIVO')
            print(f"Coleta concluída com sucesso para @{target_user} (status redefinido para ATIVO).")
        else:
            salvar_no_banco(target_user, None, inativo=1)
            atualizar_status_perfil(target_user, 'INDISPONIVEL')
            print(f"AVISO: Nenhum dado disponível para @{target_user} (registro de leitura inativa gravado no banco e status alterado para INDISPONIVEL).")
    else:
        rodar_ingestao_diaria()