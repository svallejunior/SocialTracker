import os
import sys
import sqlite3
from datetime import datetime, timezone, timedelta

# Fuso Horário Oficial do Brasil (UTC-3 / Horário de Brasília)
FUSO_BRASIL = timezone(timedelta(hours=-3))

def agora_brasil():
    return datetime.now(FUSO_BRASIL)

def conectar_db(db_path=None):
    """Abre conexão SQLite com timeout de 30s e modo WAL para concorrência."""
    conn = sqlite3.connect(db_path or DB_PATH, timeout=30)
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA synchronous = NORMAL;')
    conn.execute('PRAGMA busy_timeout = 30000;')
    return conn
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
# DB_PATH relativo é resolvido a partir da pasta do projeto, e não do cwd do processo
# que chamou o script (o Next.js roda com cwd = dashboard/).
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
DB_PATH = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)

if not APIFY_TOKEN:
    print("⚠️ AVISO: APIFY_TOKEN / APIFY_API_TOKEN não encontrado no ambiente ou arquivo .env!")

client = ApifyClient(APIFY_TOKEN) if APIFY_TOKEN else None

def get_perfis_ativos():
    """Busca no banco apenas perfis marcados como ATIVO."""
    conn = conectar_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT username FROM perfis_monitorados WHERE status = 'ATIVO'")
        perfis = [row[0] for row in cursor.fetchall()]
        return perfis
    except Exception as e:
        # Falha aqui significa banco errado/corrompido — precisa quebrar com código de saída
        # != 0, senão a API do dashboard reporta "ingestão concluída" sem ter coletado nada.
        print(f"ERRO: falha ao ler perfis ativos em '{DB_PATH}': {e}")
        sys.exit(1)
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
    conn = conectar_db()
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
        agora_brasil().strftime('%Y-%m-%d %H:%M:%S'),
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
    conn = conectar_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE perfis_monitorados SET status = ? WHERE username = ?", (novo_status, username))
        conn.commit()
    except Exception as e:
        print(f"Erro ao atualizar status do perfil @{username}: {e}")
    finally:
        conn.close()

def rodar_ingestao_diaria(meta_only=False):
    # 1. Executa extração oficial via Meta Graph API para contas configuradas
    contas_meta_processadas = set()
    try:
        from meta_ingestion import rodar_ingestao_meta
        resultado_meta = rodar_ingestao_meta()
        if resultado_meta.get("sucesso"):
            for d in resultado_meta.get("detalhes", []):
                contas_meta_processadas.add(d["username"].lower())
            print(f"✅ Ingestão Meta API concluída com sucesso para {len(contas_meta_processadas)} perfis.")
    except Exception as e:
        print(f"⚠️ Erro ao executar extração Meta API: {e}")

    if meta_only:
        return

    if not client:
        print("⚠️ AVISO: Cliente Apify não inicializado. Finalizando rotina (apenas perfis Meta coletados).")
        return

    perfis = get_perfis_ativos()
    if not perfis:
        print("Nenhum perfil ativo encontrado para processar no banco de dados.")
        return

    # Filtra perfis já atualizados pela Meta API
    perfis_restantes = [u for u in perfis if u.lower().strip().lstrip("@") not in contas_meta_processadas]
    if not perfis_restantes:
        print("Todos os perfis ativos já foram atualizados via Meta API oficial!")
        return

    print(f"Iniciando coleta Apify para {len(perfis_restantes)} perfis restantes sem Meta API.")

    for user in perfis_restantes:
        status_res, dados = consultar_apify(user)
        if status_res == "OK" and dados:
            salvar_no_banco(user, dados, inativo=0)
            atualizar_status_perfil(user, 'ATIVO')
        elif status_res == "NOT_FOUND":
            print(f"Perfil @{user} não encontrado no Instagram. Marcando como INDISPONIVEL (sem gravar data de coleta).")
            # Não inserimos registro em perfis_historico quando não há dados —
            # a data_coleta só deve ser registrada quando houver dados reais.
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
        arg = sys.argv[1]
        if arg in ("--meta-only", "--meta", "-m"):
            rodar_ingestao_diaria(meta_only=True)
        else:
            target_user = arg.strip().lstrip("@")
            print(f"Iniciando coleta para perfil específico: @{target_user}")
            
            # Tenta via Meta API primeiro
            coletado_meta = False
            try:
                from meta_ingestion import rodar_ingestao_meta
                res = rodar_ingestao_meta(username_filtro=target_user)
                if res.get("sucesso") and res.get("processados", 0) > 0:
                    print(f"✅ Coleta oficial Meta API concluída com sucesso para @{target_user}.")
                    coletado_meta = True
            except Exception as e:
                print(f"Aviso Meta API para @{target_user}: {e}")

            if not coletado_meta:
                print(f"Recorrendo ao Apify para @{target_user}...")
                status_res, dados = consultar_apify(target_user)
                if status_res == "OK" and dados:
                    salvar_no_banco(target_user, dados, inativo=0)
                    atualizar_status_perfil(target_user, 'ATIVO')
                    print(f"Coleta concluída com sucesso para @{target_user} via Apify.")
                elif status_res == "NOT_FOUND":
                    print(f"AVISO: @{target_user} não encontrado ou dados indisponíveis. Nenhuma alteração gravada no banco.")
                    # Status INDISPONIVEL atualizado sem gravar data de coleta
                    atualizar_status_perfil(target_user, 'INDISPONIVEL')
                else:
                    print(f"⚠️ Falha na API ao consultar @{target_user}. Status mantido sem alterações.")
    else:
        rodar_ingestao_diaria()