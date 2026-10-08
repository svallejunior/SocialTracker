import os
import re
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
import requests
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


def avaliar_anomalia(cursor, registro_id, username, seguidores_atual, posts_atual, hoje_prefix, ja_validado_hoje=False):
    """
    Avalia se a coleta recém-inserida requer análise manual:
    - Se já validado/classificado no mesmo dia de análise, mantém a classificação e validação prévias.
    - Se a leitura anterior válida já era VIRAL_ORGANICO e validada, mantém VIRAL_ORGANICO e valida automaticamente.
    - Variação de seguidores > 2% E > 10 seguidores: marcada como 'ADS' e revisado_manualmente = 0 (pendente de análise).
    - Dentro do parâmetro normal (<= 2% ou <= 10 seg): marcada como 'ORGANICO' e revisado_manualmente = 1 (validado automaticamente).

    A comparação é sempre feita contra o fechamento (última leitura) do dia anterior,
    nunca contra o registro imediatamente anterior — perfis coletados várias vezes ao dia
    (ex: "meu perfil", a cada 15 min) nunca acumulariam >2%/10 seguidores num intervalo
    tão curto, o que mascarava crescimento real do dia inteiro. Ver também a mesma
    comparação em dashboard/src/app/api/anomalias/route.ts (LAG por dia).
    """
    if ja_validado_hoje:
        return

    # Busca a última leitura válida de um dia estritamente anterior ao de hoje
    cursor.execute("""
        SELECT seguidores, total_posts, tipo_janela, revisado_manualmente FROM perfis_historico
        WHERE LOWER(username) = LOWER(?) AND id < ? AND inativo = 0
          AND SUBSTR(data_coleta, 1, 10) < ?
        ORDER BY data_coleta DESC, id DESC
        LIMIT 1
    """, (username, registro_id, hoje_prefix))
    anterior = cursor.fetchone()

    if not anterior:
        # Primeira coleta deste perfil — marcar automaticamente como orgânico e validado
        cursor.execute("""
            UPDATE perfis_historico
            SET tipo_janela = 'ORGANICO', revisado_manualmente = 1
            WHERE id = ?
        """, (registro_id,))
        return

    seg_anterior = anterior[0] or 0
    posts_anterior = anterior[1] or 0
    tipo_janela_ant = anterior[2] if len(anterior) > 2 else None
    revisado_ant = anterior[3] if len(anterior) > 3 else None

    delta_s = seguidores_atual - seg_anterior
    delta_posts = posts_atual - posts_anterior
    pct_delta_s = ((seguidores_atual - seg_anterior) / seg_anterior * 100) if seg_anterior > 0 else 0

    precisa_analise = (pct_delta_s > LIMIAR_PERCENTUAL_MINIMO) and (delta_s >= LIMIAR_DELTA_S_MINIMO)

    if precisa_analise:
        # Se a conta já estava em viralização confirmada na leitura anterior, herda VIRAL_ORGANICO e valida automaticamente
        if tipo_janela_ant == 'VIRAL_ORGANICO' and revisado_ant == 1:
            cursor.execute("""
                UPDATE perfis_historico
                SET tipo_janela = 'VIRAL_ORGANICO', revisado_manualmente = 1
                WHERE id = ?
            """, (registro_id,))
            print(f"  🔥 Registro #{registro_id} (@{username}): conta em viralização ativa (anterior VIRAL_ORGANICO) → validado como VIRAL_ORGANICO.")
        else:
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


import time


def inicializar_banco():
    """Garante colunas necessárias em perfis_historico uma única vez na inicialização."""
    conn = conectar_db()
    cursor = conn.cursor()
    try:
        try:
            cursor.execute("ALTER TABLE perfis_historico ADD COLUMN inativo INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE perfis_historico ADD COLUMN tipo_janela TEXT DEFAULT 'ORGANICO'")
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE perfis_historico ADD COLUMN revisado_manualmente INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        # Controle de recuo (backoff) de perfis que o Apify não consegue ler — evita pagar todo dia
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS coleta_falhas (
                username TEXT PRIMARY KEY,
                falhas INTEGER DEFAULT 0,
                ultima_tentativa TEXT
            )
        """)
        conn.commit()
    finally:
        conn.close()


def salvar_no_banco(username, dados, inativo=0, perfil_ativo=True):
    # perfil_ativo=False: leitura de linha de base de perfil reativado (sem avaliar anomalia)
    followers = dados.get('followers', 0) if dados else 0
    following = dados.get('following', 0) if dados else 0
    posts = dados.get('posts', 0) if dados else 0

    hoje_prefix = agora_brasil().strftime('%Y-%m-%d')
    MAX_TENTATIVAS_DB = 5

    for tentativa in range(1, MAX_TENTATIVAS_DB + 1):
        conn = None
        try:
            conn = conectar_db()
            cursor = conn.cursor()

            # Checa se já havia registro no mesmo dia para substituir e preservar validação
            cursor.execute("""
                SELECT id, tipo_janela, revisado_manualmente
                FROM perfis_historico
                WHERE LOWER(username) = LOWER(?) AND (data_coleta LIKE ? OR data_coleta = ?)
                ORDER BY data_coleta DESC, id DESC LIMIT 1
            """, (username, f"{hoje_prefix}%", hoje_prefix))
            reg_hoje = cursor.fetchone()

            cursor.execute("SELECT meu_perfil FROM perfis_monitorados WHERE LOWER(username) = LOWER(?)", (username,))
            row_perfil = cursor.fetchone()
            is_meu_perfil = bool(row_perfil and row_perfil[0] == 1)

            tipo_janela_inicial = 'ORGANICO'
            revisado_inicial = 1
            ja_validado_hoje = False

            if reg_hoje:
                tipo_janela_ant = reg_hoje[1]
                revisado_ant = reg_hoje[2]
                # Preserva como validado apenas se o usuário já classificou explicitamente como VIRAL_ORGANICO, ADS ou IGNORAR
                if tipo_janela_ant in ('VIRAL_ORGANICO', 'ADS', 'IGNORAR') and revisado_ant == 1:
                    tipo_janela_inicial = tipo_janela_ant
                    revisado_inicial = 1
                    ja_validado_hoje = True

            cursor.execute("""
                INSERT INTO perfis_historico (
                    username,
                    data_coleta,
                    seguidores,
                    seguindo,
                    total_posts,
                    inativo,
                    tipo_janela,
                    revisado_manualmente
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                username,
                agora_brasil().strftime('%Y-%m-%d %H:%M:%S'),
                followers,
                following,
                posts,
                inativo,
                tipo_janela_inicial,
                revisado_inicial
            ))

            registro_id = cursor.lastrowid

            # Avalia anomalia apenas para leituras ativas com dados válidos
            if perfil_ativo and inativo == 0 and dados and followers > 0:
                avaliar_anomalia(cursor, registro_id, username, followers, posts, hoje_prefix, ja_validado_hoje=ja_validado_hoje)
                cursor.execute("UPDATE perfis_monitorados SET status = 'ATIVO' WHERE username = ?", (username,))

            conn.commit()
            status_label = "INATIVO (falha/indisponivel)" if inativo == 1 else "ATIVO"
            print(f"Dados de @{username} salvos com sucesso! Status da leitura: {status_label}")
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and tentativa < MAX_TENTATIVAS_DB:
                print(f"  ⏳ Banco ocupado ao salvar @{username} (tentativa {tentativa}/{MAX_TENTATIVAS_DB}). Aguardando...")
                time.sleep(2 * tentativa)
            else:
                raise
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

def atualizar_status_perfil(username, novo_status):
    """Atualiza o status do perfil na tabela perfis_monitorados com retry."""
    MAX_TENTATIVAS_DB = 5
    for tentativa in range(1, MAX_TENTATIVAS_DB + 1):
        conn = None
        try:
            conn = conectar_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE perfis_monitorados SET status = ? WHERE username = ?", (novo_status, username))
            conn.commit()
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and tentativa < MAX_TENTATIVAS_DB:
                time.sleep(2 * tentativa)
            else:
                print(f"Erro ao atualizar status do perfil @{username}: {e}")
                return
        except Exception as e:
            print(f"Erro ao atualizar status do perfil @{username}: {e}")
            return
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

# --- ECONOMIA DE CRÉDITOS APIFY ---
FALHAS_PARA_RECUAR = 2   # após N falhas seguidas do Apify o perfil entra em recuo
DIAS_DE_RECUO = 7        # em recuo, o Apify só tenta de novo após N dias

_apify_sem_credito = False  # vira True quando o Apify recusa por limite mensal: evita chamadas inúteis na mesma execução
_discovery_contas = None  # cache das contas Meta usadas como "lupa" na business_discovery
_discovery_rr = 0         # rodízio entre as contas, para não concentrar chamadas em um só token


def _contas_discovery():
    """Contas Meta configuradas, com tokens do Facebook Login primeiro (IGAA por último)."""
    global _discovery_contas
    if _discovery_contas is None:
        try:
            from meta_ingestion import obter_contas_meta_configuradas
            contas = obter_contas_meta_configuradas()
        except Exception as e:
            print(f"⚠️ Business Discovery indisponível (contas Meta): {e}")
            contas = []
        _discovery_contas = sorted(contas, key=lambda c: c["token"].startswith("IGAA"))
    return _discovery_contas


def consultar_business_discovery(username):
    """
    Lê seguidores/seguindo/posts de qualquer conta Business/Creator via Meta (gratuito).
    Retorna (status, dados): 'OK', 'NAO_DISPONIVEL' (conta pessoal/inexistente) ou 'API_ERROR'.
    """
    from meta_ingestion import graph_api_base

    username = username.strip().lstrip("@")
    if not re.fullmatch(r"[A-Za-z0-9_.]+", username):
        return "NAO_DISPONIVEL", None

    global _discovery_rr
    contas = _contas_discovery()
    if not contas:
        return "API_ERROR", None
    fb = [c for c in contas if not c["token"].startswith("IGAA")]
    ig = [c for c in contas if c["token"].startswith("IGAA")]
    if fb:
        inicio = _discovery_rr % len(fb)
        _discovery_rr += 1
        fb = fb[inicio:] + fb[:inicio]

    for conta in fb + ig:
        try:
            res = requests.get(
                f"{graph_api_base(conta['token'])}/{conta['account_id']}",
                params={
                    "fields": f"business_discovery.username({username}){{followers_count,follows_count,media_count}}",
                    "access_token": conta["token"],
                },
                timeout=20,
            )
            corpo = res.json()
        except Exception:
            continue

        bd = corpo.get("business_discovery") if res.status_code == 200 else None
        if bd and bd.get("followers_count") is not None:
            return "OK", {
                "followers": bd.get("followers_count") or 0,
                "following": bd.get("follows_count") or 0,
                "posts": bd.get("media_count") or 0,
            }

        erro = corpo.get("error", {})
        if erro.get("code") == 110 or erro.get("error_subcode") == 2207013:
            return "NAO_DISPONIVEL", None
        # Token expirado, limite de requisições, etc. → tenta a próxima conta Meta

    return "API_ERROR", None


def status_do_perfil(username):
    """Status atual do perfil em perfis_monitorados (None se não existir)."""
    try:
        conn = conectar_db()
        try:
            row = conn.execute(
                "SELECT status FROM perfis_monitorados WHERE LOWER(username) = LOWER(?)", (username,)
            ).fetchone()
        finally:
            conn.close()
        return (row[0] or '').upper() if row else None
    except Exception:
        return None


def coletado_hoje(username):
    """True se já existe leitura válida (com seguidores) de hoje para o perfil."""
    try:
        conn = conectar_db()
        try:
            row = conn.execute("""
                SELECT 1 FROM perfis_historico
                WHERE LOWER(username) = LOWER(?) AND SUBSTR(data_coleta, 1, 10) = ?
                  AND inativo = 0 AND seguidores > 0
                LIMIT 1
            """, (username, agora_brasil().strftime('%Y-%m-%d'))).fetchone()
            return row is not None
        finally:
            conn.close()
    except Exception:
        return False


def em_recuo(username):
    """True se o Apify falhou várias vezes seguidas neste perfil e ainda está no período de recuo."""
    try:
        conn = conectar_db()
        try:
            row = conn.execute(
                "SELECT falhas, ultima_tentativa FROM coleta_falhas WHERE LOWER(username) = LOWER(?)",
                (username,)
            ).fetchone()
        finally:
            conn.close()
        if not row or (row[0] or 0) < FALHAS_PARA_RECUAR or not row[1]:
            return False
        ultima = datetime.strptime(row[1], '%Y-%m-%d').date()
        return (agora_brasil().date() - ultima).days < DIAS_DE_RECUO
    except Exception:
        return False


def registrar_resultado_coleta(username, sucesso):
    """Zera o contador de falhas em caso de sucesso; incrementa quando o Apify não traz dados."""
    try:
        conn = conectar_db()
        try:
            if sucesso:
                conn.execute("DELETE FROM coleta_falhas WHERE LOWER(username) = LOWER(?)", (username,))
            else:
                conn.execute("""
                    INSERT INTO coleta_falhas (username, falhas, ultima_tentativa) VALUES (LOWER(?), 1, ?)
                    ON CONFLICT(username) DO UPDATE SET falhas = falhas + 1, ultima_tentativa = excluded.ultima_tentativa
                """, (username, agora_brasil().strftime('%Y-%m-%d')))
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print(f"Aviso ao registrar controle de falhas de @{username}: {e}")


def coletar_perfil(user, manual=False):
    """
    Coleta um perfil sem Meta API oficial, gastando o mínimo possível de créditos Apify:
    1) Meta Business Discovery (gratuito, sempre primeiro); 2) Apify, se a Meta não cobrir.
    - rotina diária (manual=False): só chamada para perfis ATIVO; pula quem já foi coletado hoje
      e respeita o recuo de falhas do Apify.
    - manual=True (clique no dashboard), qualquer status: se retornar dados, o perfil volta para ATIVO.
      O Apify só é pulado se já houver leitura de hoje.
    Retorna 'OK', 'SKIP', 'NOT_FOUND' ou 'API_ERROR'.
    """
    if not manual and coletado_hoje(user):
        print(f"@{user} já coletado hoje, pulando (economia de créditos).")
        return "SKIP"

    # Perfil que não estava ATIVO: a leitura que o reativa é só linha de base (sem alerta de
    # anomalia contra um dado antigo).
    estava_ativo = status_do_perfil(user) in (None, 'ATIVO')

    status_res, dados = consultar_business_discovery(user)
    if status_res == "OK":
        print(f"@{user} coletado via Meta Business Discovery (gratuito).")
        salvar_no_banco(user, dados, inativo=0, perfil_ativo=estava_ativo)
        atualizar_status_perfil(user, 'ATIVO')
        registrar_resultado_coleta(user, True)
        return "OK"

    if not client:
        return "API_ERROR"

    if _apify_sem_credito:
        print(f"Apify sem créditos neste ciclo: @{user} não será consultado no Apify.")
        return "API_ERROR"

    if not manual and em_recuo(user):
        print(f"@{user} em recuo após falhas seguidas no Apify; nova tentativa só após {DIAS_DE_RECUO} dias.")
        return "SKIP"
    if manual and coletado_hoje(user):
        print(f"@{user} já tem leitura de hoje; Apify não foi acionado (economia de créditos).")
        return "SKIP"

    status_res, dados = consultar_apify(user)
    if status_res == "OK" and dados:
        salvar_no_banco(user, dados, inativo=0, perfil_ativo=estava_ativo)
        atualizar_status_perfil(user, 'ATIVO')
        registrar_resultado_coleta(user, True)
        return "OK"
    if status_res == "NOT_FOUND":
        registrar_resultado_coleta(user, False)
        return "NOT_FOUND"
    return "API_ERROR"


def rodar_ingestao_diaria(meta_only=False):
    # 0. Garante estrutura do banco
    try:
        inicializar_banco()
    except Exception as e:
        print(f"⚠️ Aviso na inicialização do banco: {e}")

    # 1. Executa extração oficial via Meta Graph API para contas configuradas
    contas_meta_processadas = set()
    try:
        from meta_ingestion import obter_contas_meta_configuradas
        for c in obter_contas_meta_configuradas():
            u = c.get("username", "").lower().strip().lstrip("@")
            if u:
                contas_meta_processadas.add(u)
    except Exception as e:
        print(f"⚠️ Aviso ao identificar contas Meta configuradas: {e}")

    try:
        from meta_ingestion import rodar_ingestao_meta
        resultado_meta = rodar_ingestao_meta()
        if resultado_meta.get("sucesso"):
            for d in resultado_meta.get("detalhes", []):
                contas_meta_processadas.add(d["username"].lower().strip().lstrip("@"))
            print(f"✅ Ingestão Meta API concluída com sucesso para {len(contas_meta_processadas)} perfis.")
    except Exception as e:
        print(f"⚠️ Erro ao executar extração Meta API: {e}")

    if meta_only:
        return

    if not client:
        print("⚠️ Cliente Apify não inicializado: perfis sem Meta serão coletados só via Business Discovery.")

    perfis = get_perfis_ativos()
    if not perfis:
        print("Nenhum perfil ativo encontrado para processar no banco de dados.")
        return

    # Filtra perfis já atualizados pela Meta API
    perfis_restantes = [u for u in perfis if u.lower().strip().lstrip("@") not in contas_meta_processadas]
    if not perfis_restantes:
        print("Todos os perfis ativos já foram atualizados via Meta API oficial!")
        return

    print(f"Iniciando coleta (Business Discovery + Apify) para {len(perfis_restantes)} perfis restantes sem Meta API.")

    for user in perfis_restantes:
        try:
            status_res = coletar_perfil(user)
            if status_res in ("OK", "SKIP"):
                pass
            elif status_res == "NOT_FOUND":
                print(f"Perfil @{user} não encontrado no Instagram. Marcando como INDISPONIVEL (sem gravar data de coleta).")
                # Não inserimos registro em perfis_historico quando não há dados —
                # a data_coleta só deve ser registrada quando houver dados reais.
                atualizar_status_perfil(user, 'INDISPONIVEL')
            else:
                # Erro de API/token/rede/etc — NÃO marcar o perfil como INDISPONIVEL
                print(f"⚠️ Erro na consulta de @{user} (falha de API/conexão). Status 'ATIVO' mantido, pulando...")
        except Exception as e:
            print(f"❌ Erro ao processar perfil @{user}: {e}. Continuando com os próximos...")



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
                client.dataset(run.default_dataset_id).iterate_items()
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
            if "limit exceeded" in str(e).lower():
                # Limite mensal do Apify esgotado: repetir não adianta e atrasa a resposta
                global _apify_sem_credito
                _apify_sem_credito = True
                return "API_ERROR", None
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
                try:
                    inicializar_banco()
                except Exception as e:
                    print(f"⚠️ Aviso na inicialização do banco: {e}")
                print(f"Meta API não cobre @{target_user}; tentando Business Discovery e, se preciso, Apify...")
                status_res = coletar_perfil(target_user, manual=True)
                if status_res == "OK":
                    print(f"Coleta concluída com sucesso para @{target_user}.")
                elif status_res == "SKIP":
                    print(f"Nenhuma nova consulta paga foi feita para @{target_user} (já coletado hoje).")
                elif status_res == "NOT_FOUND":
                    print(f"AVISO: @{target_user} não encontrado ou dados indisponíveis. Nenhuma alteração gravada no banco.")
                    # Status INDISPONIVEL atualizado sem gravar data de coleta
                    atualizar_status_perfil(target_user, 'INDISPONIVEL')
                else:
                    # Falha real: a rota do dashboard só reporta erro se o script sair com código != 0
                    motivo = "o Apify está sem créditos (limite mensal esgotado)" if _apify_sem_credito else "o Apify também falhou"
                    print(f"ERRO: não foi possível coletar @{target_user}: a Meta não retornou dados (conta pessoal ou sem acesso) e {motivo}. Status mantido sem alterações.")
                    sys.exit(1)
    else:
        rodar_ingestao_diaria()