"""
publicador_instagram.py — Worker de Publicação Automática no Instagram (Meta Graph API)
SocialTracker Automation Engine

Suporta:
- Publicação de Feed (Foto única, Vídeo e Carrossel)
- Reels com verificação de processamento
- Stories (Foto e Vídeo)
- Verificação de agendamentos por data, hora e recorrência
- Execução direta via CLI (--id, --run-once, --daemon, --dry-run)
"""

import os
import sys
import json
import time
import uuid
import sqlite3
import argparse
import logging
import requests
from datetime import datetime, date, timedelta, timezone
try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

# Configuração de Logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("PublicadorInstagram")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
DB_PATH = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)
GRAPH_API_VERSION = "v20.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

# Status que não geram novas ocorrências (nem previsão no calendário)
STATUS_INATIVOS = ("PAUSADO", "ENCERRADO")
DIA_MAP = {0: "SEG", 1: "TER", 2: "QUA", 3: "QUI", 4: "SEX", 5: "SAB", 6: "DOM"}

# Uma linha "PUBLICANDO" mais velha que isso é considerada de um processo morto
CLAIM_TIMEOUT_MIN = 15
# Máximo de tentativas com erro por dia, por agendamento (evita loop de retry)
MAX_TENTATIVAS_DIA = 3

# Lock de instância única do daemon
LOCK_PATH = os.path.join(BASE_DIR, "automacao", ".daemon.lock")
LOCK_STALE_SECONDS = 90
HEARTBEAT_STEP = 20


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _utc_para_local(ts):
    """Converte um timestamp gravado com datetime('now') (UTC) para hora local.

    As rotas do dashboard gravam criado_em/atualizado_em/publicado_em em UTC, enquanto o
    Python compara com datetime.now() (local). Sem a conversão, uma rotina criada às
    06:08 local aparece como 09:08 e a ocorrência das 06:30 seria tratada como anterior
    à criação (ou o inverso, publicando retroativo).
    """
    if not ts:
        return None
    txt = str(ts).strip().replace("T", " ")
    if "." in txt:
        txt = txt.split(".")[0]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(txt, fmt)
        except ValueError:
            continue
        return dt.replace(tzinfo=timezone.utc).astimezone().replace(tzinfo=None)
    return None


def _tabela_existe(conn, nome):
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", (nome,)
    ).fetchone()
    return row is not None


def init_db_schema():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS automacao_config (
            id TEXT PRIMARY KEY,
            meta_account_id TEXT,
            username TEXT,
            app_id TEXT,
            app_secret TEXT,
            access_token TEXT,
            public_base_url TEXT DEFAULT '',
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS automacao_daemon_status (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            ultima_verificacao DATETIME DEFAULT CURRENT_TIMESTAMP,
            status_daemon TEXT DEFAULT 'ATIVO',
            mensagem TEXT DEFAULT ''
        );
    """)

    # Histórico de publicações: uma linha por publicação real (ou erro real).
    # Uma rotina recorrente gera N linhas aqui — a linha de automacao_agendamentos
    # guarda apenas a configuração e a última execução.
    # ATENÇÃO: as datas desta tabela são em hora LOCAL (data_local/hora_local/publicado_em),
    # ao contrário de automacao_agendamentos, cujos timestamps vêm em UTC das rotas.
    c.execute("""
        CREATE TABLE IF NOT EXISTS automacao_publicacoes (
            id TEXT PRIMARY KEY,
            agendamento_id TEXT,
            username TEXT NOT NULL,
            meta_account_id TEXT DEFAULT '',
            tipo_postagem TEXT NOT NULL,
            data_local TEXT NOT NULL,
            hora_local TEXT NOT NULL,
            publicado_em DATETIME NOT NULL,
            status TEXT NOT NULL DEFAULT 'PUBLICADO',
            meta_media_id TEXT DEFAULT '',
            erro_detalhe TEXT DEFAULT '',
            arquivos TEXT DEFAULT '[]',
            legenda TEXT DEFAULT '',
            origem TEXT DEFAULT 'AGENDADOR'
        );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_pub_user_data ON automacao_publicacoes(username, data_local)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_pub_agendamento ON automacao_publicacoes(agendamento_id, data_local)")

    # Colunas em automacao_agendamentos
    if _tabela_existe(conn, "automacao_agendamentos"):
        c.execute("PRAGMA table_info(automacao_agendamentos)")
        cols = {r[1] for r in c.fetchall()}
        if "meta_media_id" not in cols:
            c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN meta_media_id TEXT DEFAULT ''")
        if "publicado_em" not in cols:
            c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN publicado_em DATETIME")
        if "erro_detalhe" not in cols:
            c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN erro_detalhe TEXT DEFAULT ''")
        if "ultima_execucao" not in cols:
            c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN ultima_execucao DATETIME")

        # Backfill idempotente: antes desta versão a publicação só existia na própria
        # linha do agendamento. publicado_em está em UTC → 'localtime' converte.
        c.execute("""
            INSERT INTO automacao_publicacoes (
                id, agendamento_id, username, meta_account_id, tipo_postagem,
                data_local, hora_local, publicado_em, status, meta_media_id,
                erro_detalhe, arquivos, legenda, origem
            )
            SELECT
                'backfill_' || a.id,
                a.id,
                a.username,
                COALESCE(a.meta_account_id, ''),
                COALESCE(a.tipo_postagem, 'FEED'),
                date(a.publicado_em, 'localtime'),
                strftime('%H:%M', a.publicado_em, 'localtime'),
                datetime(a.publicado_em, 'localtime'),
                'PUBLICADO',
                COALESCE(a.meta_media_id, ''),
                '',
                COALESCE(a.arquivos, '[]'),
                COALESCE(a.legenda, ''),
                'AGENDADOR'
            FROM automacao_agendamentos a
            WHERE a.status = 'PUBLICADO'
              AND a.publicado_em IS NOT NULL
              AND TRIM(a.publicado_em) <> ''
              AND date(a.publicado_em, 'localtime') IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM automacao_publicacoes p WHERE p.agendamento_id = a.id
              )
        """)

        # Correção pontual do modelo antigo: uma rotina recorrente era "consumida"
        # (virava PUBLICADO na primeira ocorrência) e nunca mais publicava. Agora que o
        # histórico existe, ela volta a ficar AGENDADO sem risco de duplicar (a guarda
        # de "uma publicação por dia" usa automacao_publicacoes).
        rearmadas = c.execute("""
            UPDATE automacao_agendamentos
               SET status = 'AGENDADO',
                   ultima_execucao = COALESCE(ultima_execucao, publicado_em)
             WHERE tipo_agendamento = 'RECORRENTE'
               AND status = 'PUBLICADO'
        """).rowcount
        if rearmadas:
            logger.info(f"♻️  {rearmadas} rotina(s) recorrente(s) reativada(s) — o histórico agora guarda as publicações.")

        # Recuperação de agendamentos DATA_ESPECIFICA que ficaram em ERRO com o código
        # antigo (antes desta correção, um único erro marcava definitivamente como ERRO).
        # Reativa apenas os que: (a) ainda têm tentativas disponíveis hoje e (b) a data
        # especifica ainda não passou.
        hoje_str = datetime.now().strftime("%Y-%m-%d")
        max_tent = MAX_TENTATIVAS_DIA
        recuperados_erro = c.execute(f"""
            UPDATE automacao_agendamentos
               SET status = 'AGENDADO', atualizado_em = datetime('now')
             WHERE status = 'ERRO'
               AND tipo_agendamento = 'DATA_ESPECIFICA'
               AND (data_especifica IS NULL OR data_especifica >= '{hoje_str}')
               AND (
                   SELECT COUNT(*) FROM automacao_publicacoes p
                    WHERE p.agendamento_id = automacao_agendamentos.id
                      AND p.data_local = '{hoje_str}'
                      AND p.status = 'ERRO'
               ) < {max_tent}
        """).rowcount
        if recuperados_erro:
            logger.info(
                f"♻️  {recuperados_erro} agendamento(s) DATA_ESPECIFICA reativado(s) de ERRO para AGENDADO "
                f"(ainda com tentativas disponíveis hoje)."
            )

    conn.commit()
    conn.close()


def registrar_publicacao(ag, status="PUBLICADO", meta_media_id="", erro="", origem="AGENDADOR", conn=None):
    """Grava uma linha no histórico de publicações (sempre em hora LOCAL)."""
    agora = datetime.now()
    fechar = conn is None
    if conn is None:
        conn = get_db_connection()
    try:
        conn.execute("""
            INSERT INTO automacao_publicacoes (
                id, agendamento_id, username, meta_account_id, tipo_postagem,
                data_local, hora_local, publicado_em, status, meta_media_id,
                erro_detalhe, arquivos, legenda, origem
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            uuid.uuid4().hex,
            ag.get("id"),
            ag.get("username") or "",
            ag.get("meta_account_id") or "",
            ag.get("tipo_postagem") or "FEED",
            agora.strftime("%Y-%m-%d"),
            agora.strftime("%H:%M"),
            agora.strftime("%Y-%m-%d %H:%M:%S"),
            status,
            str(meta_media_id or ""),
            (erro or "")[:2000],
            ag.get("arquivos") or "[]",
            ag.get("legenda") or "",
            origem
        ))
        conn.commit()
    except Exception as e:
        logger.warning(f"Não foi possível gravar o histórico de publicação: {e}")
    finally:
        if fechar:
            conn.close()


def ja_publicou_hoje(agendamento_id, dia=None, conn=None):
    """True se já existe publicação bem-sucedida deste agendamento no dia (hora local)."""
    if not agendamento_id:
        return False
    dia = dia or datetime.now().strftime("%Y-%m-%d")
    fechar = conn is None
    if conn is None:
        conn = get_db_connection()
    try:
        row = conn.execute("""
            SELECT 1 FROM automacao_publicacoes
            WHERE agendamento_id = ? AND data_local = ? AND status = 'PUBLICADO'
            LIMIT 1
        """, (agendamento_id, dia)).fetchone()
        return row is not None
    except Exception:
        return False
    finally:
        if fechar:
            conn.close()


def contar_erros_hoje(agendamento_id, dia=None, conn=None):
    """Quantas tentativas falharam hoje — limita o retry de rotinas recorrentes."""
    if not agendamento_id:
        return 0
    dia = dia or datetime.now().strftime("%Y-%m-%d")
    fechar = conn is None
    if conn is None:
        conn = get_db_connection()
    try:
        row = conn.execute("""
            SELECT COUNT(*) FROM automacao_publicacoes
            WHERE agendamento_id = ? AND data_local = ? AND status = 'ERRO'
        """, (agendamento_id, dia)).fetchone()
        return int(row[0]) if row else 0
    except Exception:
        return 0
    finally:
        if fechar:
            conn.close()


def _reivindicar_agendamento(conn, ag_id):
    """Marca a linha como PUBLICANDO de forma atômica.

    Retorna False quando outra instância já reivindicou a ocorrência — é o que impede
    dois processos do publicador de publicarem a mesma postagem. Linhas presas em
    PUBLICANDO por mais de CLAIM_TIMEOUT_MIN minutos (processo morto) são liberadas.
    """
    cur = conn.execute(f"""
        UPDATE automacao_agendamentos
           SET status = 'PUBLICANDO', atualizado_em = datetime('now')
         WHERE id = ?
           AND (status <> 'PUBLICANDO'
                OR atualizado_em IS NULL
                OR atualizado_em < datetime('now', '-{CLAIM_TIMEOUT_MIN} minutes'))
    """, (ag_id,))
    conn.commit()
    return cur.rowcount > 0


def _adquirir_lock_daemon():
    """Garante uma única instância do daemon. Lock sem heartbeat há 90s é considerado morto.

    Não usa os.kill/PID: no Windows a checagem de processo vivo é pouco confiável e o PID
    pode ter sido reciclado. O mtime do arquivo é atualizado a cada heartbeat.
    """
    try:
        os.makedirs(os.path.dirname(LOCK_PATH), exist_ok=True)
    except OSError:
        pass
    try:
        fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        try:
            idade = time.time() - os.path.getmtime(LOCK_PATH)
        except OSError:
            idade = LOCK_STALE_SECONDS + 1
        if idade < LOCK_STALE_SECONDS:
            return False
        logger.warning(f"Lock do daemon sem heartbeat há {int(idade)}s — assumindo processo morto.")
        try:
            os.remove(LOCK_PATH)
            fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except OSError:
            return False
    try:
        with os.fdopen(fd, "w") as fh:
            fh.write(str(os.getpid()))
    except OSError:
        pass
    return True


def _tocar_lock_daemon():
    try:
        if os.path.exists(LOCK_PATH):
            os.utime(LOCK_PATH, None)
    except OSError:
        pass


def _liberar_lock_daemon():
    try:
        if os.path.exists(LOCK_PATH):
            os.remove(LOCK_PATH)
    except OSError:
        pass


def registrar_heartbeat(mensagem="Verificação executada", status="ATIVO"):
    """Atualiza o heartbeat lido pelo dashboard (hora local) e o mtime do lock."""
    try:
        conn = get_db_connection()
        conn.execute("""
            INSERT INTO automacao_daemon_status (id, ultima_verificacao, status_daemon, mensagem)
            VALUES (1, datetime('now', 'localtime'), ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                ultima_verificacao = datetime('now', 'localtime'),
                status_daemon = excluded.status_daemon,
                mensagem = excluded.mensagem
        """, (status, mensagem))
        conn.commit()
        conn.close()
    except Exception as st_err:
        logger.warning(f"Não foi possível salvar status do daemon: {st_err}")
    _tocar_lock_daemon()


def dormir_com_heartbeat(segundos, mensagem="Aguardando próximo agendamento"):
    """Dorme em blocos curtos mantendo o heartbeat vivo.

    Sem isso o dashboard considera o daemon morto e dispara um novo processo — a origem
    das publicações duplicadas.
    """
    restante = max(0.0, float(segundos))
    registrar_heartbeat(mensagem)
    while restante > 0:
        passo = min(HEARTBEAT_STEP, restante)
        time.sleep(passo)
        restante -= passo
        registrar_heartbeat(mensagem)


try:
    import dotenv
    dotenv.load_dotenv(os.path.join(BASE_DIR, ".env"))
except Exception:
    pass

def get_meta_config(meta_account_id=None, username=None):
    """Busca a configuração de API no banco (ou fallback no .env)"""
    conn = get_db_connection()
    c = conn.cursor()

    config = {}
    if username:
        row = c.execute("SELECT * FROM automacao_config WHERE LOWER(username) = LOWER(?)", (username,)).fetchone()
        if row:
            config = dict(row)

    if not config and meta_account_id:
        row = c.execute("SELECT * FROM automacao_config WHERE meta_account_id = ?", (meta_account_id,)).fetchone()
        if row:
            config = dict(row)

    # Se a config encontrada não tem token real, busca o default_config como fallback de token
    # (cenário: conta usa o mesmo App/Token global mas tem meta_account_id próprio)
    default_config = {}
    if not (config.get("access_token") or "").strip():
        row = c.execute(
            "SELECT * FROM automacao_config WHERE id = 'default_config' OR username = '' ORDER BY atualizado_em DESC LIMIT 1"
        ).fetchone()
        if row:
            default_config = dict(row)

    if not config:
        # Nenhuma config encontrada, usa a mais recente disponível
        row = c.execute("SELECT * FROM automacao_config ORDER BY atualizado_em DESC LIMIT 1").fetchone()
        if row:
            config = dict(row)

    conn.close()

    if not config:
        config = {}

    # Chave por perfil no .env (ex: META_TOKEN__LUNAVALENTE14 ou META_TOKEN_LUNAVALENTE14)
    user_env_key = f"META_TOKEN_{username.upper().replace('@', '').replace('.', '_')}" if username else None
    user_env_key_clean = f"META_TOKEN_{username.upper().replace('@', '').replace('.', '_').strip('_')}" if username else None

    token_from_env = (
        (user_env_key and os.environ.get(user_env_key)) or
        (user_env_key_clean and os.environ.get(user_env_key_clean)) or
        os.environ.get("META_ACCESS_TOKEN", "")
    )

    # Prioridade: token do config específico → token do default_config → token do .env
    access_token = (
        (config.get("access_token") or "").strip() or
        (default_config.get("access_token") or "").strip() or
        token_from_env
    )
    app_id = (config.get("app_id") or default_config.get("app_id") or "").strip() or os.environ.get("META_APP_ID", "")
    app_secret = (config.get("app_secret") or default_config.get("app_secret") or "").strip() or os.environ.get("META_APP_SECRET", "")
    public_base_url = (
        (config.get("public_base_url") or default_config.get("public_base_url") or "").strip() or
        os.environ.get("PUBLIC_MEDIA_BASE_URL", os.environ.get("PUBLIC_BASE_URL", "http://localhost:3000"))
    )

    if not access_token:
        logger.warning(f"Nenhum Access Token encontrado para username='{username}' / meta_account_id='{meta_account_id}'. Configure as credenciais na aba Automatização.")

    return {
        "access_token": access_token,
        "app_id": app_id,
        "app_secret": app_secret,
        "public_base_url": public_base_url.rstrip("/"),
        "meta_account_id": config.get("meta_account_id") or meta_account_id or ""
    }


def wait_for_media_processing(creation_id, access_token, max_timeout=300, check_interval=5):
    """Aguarda o processamento de vídeos/reels pelo Instagram até ficar FINISHED.
    
    Aumentamos o timeout padrão para 300s (5 min) pois vídeos maiores levam mais tempo.
    O intervalo de verificação cresce progressivamente para não sobrecarregar a API.
    Retorna os dados de status em caso de ERROR para que o chamador possa decidir
    se tenta novamente com um novo container (error code 2207076 é transitório).
    """
    url = f"{GRAPH_API_BASE}/{creation_id}"
    params = {
        "fields": "status_code,status",
        "access_token": access_token
    }
    start_time = time.time()
    logger.info(f"Aguardando processamento do container {creation_id} (timeout={max_timeout}s)...")
    poll_count = 0

    while time.time() - start_time < max_timeout:
        res = requests.get(url, params=params)
        data = res.json()
        status_code = data.get("status_code", "").upper()
        poll_count += 1

        if status_code == "FINISHED":
            logger.info(f"✅ Container {creation_id} pronto para publicação! ({poll_count} verificações)")
            return True
        elif status_code in ["ERROR", "EXPIRED"]:
            status_msg = data.get('status', 'Erro desconhecido')
            logger.error(f"❌ Erro no processamento do container {creation_id}: status='{status_msg}' | dados={data}")
            # Lança exceção com mensagem estruturada para que o retry possa identificar
            raise Exception(f"Processamento de vídeo falhou: {status_msg}")

        # Intervalo progressivo: começa em 5s, sobe até 20s a cada 3 polls
        current_interval = min(check_interval + (poll_count // 3) * 5, 20)
        logger.info(
            f"⏳ Container {creation_id}: status='{status_code or 'IN_PROGRESS'}' "
            f"(~{int(time.time()-start_time)}s decorridos). Próxima verificação em {current_interval}s..."
        )
        time.sleep(current_interval)

    raise Exception(f"Timeout de {max_timeout}s aguardando processamento do vídeo no Instagram")


# Limites oficiais de duração de Stories no Instagram
STORIES_MAX_DURATION_S = 60.0
STORIES_MIN_DURATION_S = 3.0

# Folga descontada de cada parte antes de cortar. O AAC só termina em fronteira de
# frame (1024 amostras = 23,2 ms a 44,1 kHz), então cortar em "-t 60.0" gera um
# arquivo de 60,0232 s: o vídeo fica em 60,000 s mas o áudio estoura um frame e a
# duração do container passa de 60 s. A Meta aceita esse arquivo no container
# (chega a FINISHED), mas recusa no media_publish com "Fatal" e subcode 2207085.
STORIES_MARGEM_CORTE_S = 0.5

# Tetos que a Meta documenta para vídeo de Stories/Reels. Um arquivo acima disso
# atravessa o container sem reclamação (chega a FINISHED) e é recusado no
# media_publish, também com "Fatal" e subcode 2207085 — daí valer normalizar antes.
STORIES_MAX_VIDEO_BITRATE = 5_000_000   # 5 Mbps
STORIES_MAX_AUDIO_BITRATE = 128_000     # 128 kbps
STORIES_MAX_FPS = 60.0


# Subcodes de erro documentados pela Meta para publicação de conteúdo.
# Referência: developers.facebook.com/docs/instagram-api/reference/error-codes
SUBCODES_META = {
    2207001: "Erro interno do Instagram — vale tentar de novo mais tarde.",
    2207003: "A Meta estourou o tempo limite ao baixar a mídia da URL pública.",
    2207004: "Imagem acima do limite de 8 MiB.",
    2207005: "Formato de imagem não suportado.",
    2207006: "Mídia não encontrada — pode ser problema de permissão ou token.",
    2207008: "Container inexistente ou expirado.",
    2207009: "Proporção fora da faixa aceita (4:5 a 1.91:1).",
    2207010: "Legenda acima de 2.200 caracteres.",
    2207020: "Mídia expirada — é preciso criar um container novo.",
    2207023: "media_type não reconhecido.",
    2207026: "Formato de vídeo não suportado (esperado MOV ou MP4).",
    2207027: "Container ainda não está FINISHED.",
    2207028: "Carrossel fora da faixa de 2 a 10 itens.",
    2207035: "Coordenadas X/Y enviadas para tag de produto em vídeo.",
    2207036: "Coordenadas X/Y ausentes na tag de produto em foto.",
    2207037: "Tag de produto inválida, excluída ou sem permissão.",
    2207040: "Mais de 20 marcações com @.",
    2207042: "Cota diária de publicações da conta atingida.",
    2207050: "Conta inativa, em checkpoint ou restrita pelo Instagram.",
    2207051: "Publicação sinalizada como possível spam pela Meta.",
    2207052: "A Meta não conseguiu baixar a mídia dessa URL.",
    2207053: "Erro desconhecido no upload do vídeo.",
    2207057: "Thumbnail offset fora da duração do vídeo.",
    # Fora da tabela oficial (a Meta documenta de 2207001 a 2207057). Chega com
    # code -1, message "Fatal", is_transient false e error_user_msg genérico
    # ("erro interno, tente mais tarde" — texto que a própria resposta contradiz
    # ao marcar is_transient false).
    #
    # Investigado a fundo em 25/08/2026. Resultado: TODA publicação de vídeo desta
    # app cai aqui e NENHUMA publicação de imagem cai. Descartados por teste direto:
    #   • arquivo/codec/bitrate/duração — um clipe gerado na hora (5s, 19 KB,
    #     1080x1920, h264, áudio silencioso, 100% dentro da spec) falha igual;
    #   • media_type — STORIES e REELS falham;
    #   • modo de ingestão — video_url e upload resumável falham;
    #   • conta — as duas contas do projeto falham, com o mesmo token;
    #   • versão da API — v20 (auto-upgraded) e v26 explícita falham.
    # Em todos os casos o container chega a FINISHED, "ready to be published".
    # Ou seja: é bloqueio no lado da Meta. Não há o que corrigir no arquivo nem aqui.
    2207085: "Recusa genérica e não documentada do media_publish. Neste projeto "
             "TODA publicação de vídeo cai neste subcode e toda publicação de "
             "imagem passa — indício de bloqueio da app no lado da Meta, não de "
             "problema no arquivo. Reprocessar o vídeo não resolve.",
}

# Insistir nestes casos não resolve e pode agravar a situação (spam/cota/restrição).
# 2207085 entrou aqui em 25/08/2026 depois da investigação descrita acima: a Meta
# responde is_transient false e a falha se reproduz em 100% das tentativas, então
# as 3 tentativas só triplicavam a espera por uma recusa garantida. O texto
# "tente novamente mais tarde" que vem no error_user_msg é genérico e enganoso.
SUBCODES_PERMANENTES = {2207004, 2207005, 2207009, 2207010, 2207023, 2207026,
                        2207028, 2207040, 2207042, 2207050, 2207051, 2207057,
                        2207085}


def descrever_erro_meta(err_obj: dict) -> str:
    """Monta uma mensagem legível a partir do objeto de erro da Graph API.

    A Meta costuma explicar a causa real em error_user_title/error_user_msg —
    o campo `message` sozinho frequentemente é só "Fatal". Subcodes fora da
    tabela documentada (ex.: 2207085) só ficam diagnosticáveis assim.
    """
    if not err_obj:
        return "A Meta respondeu sem objeto de erro."

    msg = err_obj.get("message") or "erro sem mensagem"
    subcode = err_obj.get("error_subcode")
    code = err_obj.get("code")

    partes = [msg]

    titulo_usuario = err_obj.get("error_user_title")
    msg_usuario = err_obj.get("error_user_msg")
    if titulo_usuario or msg_usuario:
        partes.append(" — ".join(p for p in (titulo_usuario, msg_usuario) if p))

    conhecido = SUBCODES_META.get(subcode)
    if conhecido:
        partes.append(conhecido)
    elif subcode:
        partes.append(f"Subcode {subcode} não consta na referência da Meta.")

    ids = [f"code: {code}" if code is not None else None,
           f"subcode: {subcode}" if subcode is not None else None,
           f"fbtrace_id: {err_obj['fbtrace_id']}" if err_obj.get("fbtrace_id") else None]
    ids = [i for i in ids if i]
    if ids:
        partes.append(f"({', '.join(ids)})")

    return " | ".join(partes)


def _find_ffmpeg_bin(name: str) -> str:
    """Retorna o caminho do executável ffmpeg/ffprobe.
    Tenta primeiro pelo PATH; se não encontrado, procura nos diretórios
    de instalação conhecidos do winget no Windows."""
    import shutil
    if shutil.which(name):
        return name  # já está no PATH

    # Caminhos conhecidos de instalação via winget (Windows)
    winget_base = os.path.expandvars(
        r"%LOCALAPPDATA%\Microsoft\WinGet\Packages"
    )
    # Procura qualquer pasta Gyan.FFmpeg dentro do winget
    if os.path.isdir(winget_base):
        for entry in os.listdir(winget_base):
            if entry.lower().startswith("gyan.ffmpeg"):
                candidate = os.path.join(winget_base, entry)
                # Busca recursiva pelo executável dentro dessa pasta
                for root, dirs, files in os.walk(candidate):
                    if f"{name}.exe" in files:
                        return os.path.join(root, f"{name}.exe")

    return name  # fallback: tenta mesmo assim (pode gerar FileNotFoundError)


def get_video_info(local_path: str):
    """Retorna (duração_em_segundos, codec_name) do vídeo usando ffprobe."""
    import subprocess
    ffprobe = _find_ffmpeg_bin("ffprobe")
    try:
        result = subprocess.run(
            [
                ffprobe, "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name,duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                local_path
            ],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            lines = [l.strip() for l in result.stdout.strip().splitlines() if l.strip()]
            codec = lines[0] if len(lines) > 0 else "unknown"
            duration = float(lines[1]) if len(lines) > 1 else None
            logger.info(f"ffprobe: '{os.path.basename(local_path)}' → codec={codec}, duração={duration}s")
            return duration, codec
        else:
            logger.warning(f"ffprobe retornou código {result.returncode}: {result.stderr[:300]}")
    except FileNotFoundError:
        logger.warning(f"ffprobe não encontrado em '{ffprobe}' — verificação ignorada.")
    except (ValueError, Exception) as e:
        logger.warning(f"Erro ao ler info do vídeo com ffprobe: {e}")
    return None, "unknown"


def get_video_duration(local_path: str):
    """Retorna a duração do vídeo em segundos (wrapper de conveniência)."""
    duration, _ = get_video_info(local_path)
    return duration


def get_container_duration(local_path: str):
    """Retorna a duração do container MP4 (format=duration) em segundos.

    Difere de get_video_info(), que lê a duração do stream de vídeo. O container
    vale o maior entre os streams e é esse valor que a Meta usa para validar o
    limite de 60s de Stories — um arquivo com vídeo de 60,000s e áudio de
    60,023s tem container de 60,023s e é recusado.
    """
    import subprocess
    ffprobe = _find_ffmpeg_bin("ffprobe")
    try:
        result = subprocess.run(
            [
                ffprobe, "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                local_path
            ],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
        logger.warning(f"ffprobe não retornou a duração do container de '{os.path.basename(local_path)}'.")
    except FileNotFoundError:
        logger.warning(f"ffprobe não encontrado em '{ffprobe}' — verificação de duração ignorada.")
    except (ValueError, Exception) as e:
        logger.warning(f"Erro ao ler a duração do container: {e}")
    return None


def get_media_specs(local_path: str) -> dict:
    """Lê num único ffprobe tudo que a Meta valida num vídeo de Stories.

    Retorna dict com container_dur, video_codec/bitrate/fps/largura/altura e
    audio_codec/bitrate. Campos que o ffprobe não souber informar vêm como None.
    """
    import subprocess
    ffprobe = _find_ffmpeg_bin("ffprobe")
    especs = {
        "container_dur": None, "video_codec": "unknown", "video_dur": None,
        "video_bitrate": None, "fps": None, "largura": None, "altura": None,
        "audio_codec": None, "audio_bitrate": None
    }
    try:
        res = subprocess.run(
            [ffprobe, "-v", "error", "-show_format", "-show_streams", "-of", "json", local_path],
            capture_output=True, text=True, timeout=30
        )
        if res.returncode != 0:
            logger.warning(f"ffprobe falhou em '{os.path.basename(local_path)}': {res.stderr[:300]}")
            return especs

        dados = json.loads(res.stdout)
        formato = dados.get("format", {})
        if formato.get("duration"):
            especs["container_dur"] = float(formato["duration"])

        def num(valor):
            try:
                return float(valor)
            except (TypeError, ValueError):
                return None

        for stream in dados.get("streams", []):
            if stream.get("codec_type") == "video" and especs["video_codec"] == "unknown":
                especs["video_codec"] = stream.get("codec_name", "unknown")
                especs["video_dur"] = num(stream.get("duration"))
                especs["video_bitrate"] = num(stream.get("bit_rate"))
                especs["largura"] = stream.get("width")
                especs["altura"] = stream.get("height")
                taxa = stream.get("avg_frame_rate") or stream.get("r_frame_rate") or ""
                if "/" in taxa:
                    n, d = taxa.split("/", 1)
                    if num(d):
                        especs["fps"] = num(n) / num(d)
            elif stream.get("codec_type") == "audio" and especs["audio_codec"] is None:
                especs["audio_codec"] = stream.get("codec_name")
                especs["audio_bitrate"] = num(stream.get("bit_rate"))

        # Sem bitrate por stream, estima pelo total do container.
        if especs["video_bitrate"] is None and formato.get("bit_rate"):
            especs["video_bitrate"] = num(formato["bit_rate"])
    except FileNotFoundError:
        logger.warning(f"ffprobe não encontrado em '{ffprobe}' — verificação de spec ignorada.")
    except Exception as e:
        logger.warning(f"Erro ao ler as specs de '{os.path.basename(local_path)}': {e}")
    return especs


def motivos_fora_de_spec_stories(especs: dict, max_duration: float = STORIES_MAX_DURATION_S) -> list:
    """Lista o que, nas specs lidas, viola a spec de Stories da Meta.

    Lista vazia = o arquivo pode ir como está. Qualquer motivo dispara o
    re-encode, então errar para o lado de re-encodar é barato: o pior caso é
    reprocessar um arquivo que já estava bom.
    """
    motivos = []
    if (especs.get("video_codec") or "").lower() != "h264":
        motivos.append(f"codec de vídeo é '{especs.get('video_codec')}' (a Meta exige H.264/AVC)")

    dur = max(especs.get("container_dur") or 0.0, especs.get("video_dur") or 0.0)
    if dur > max_duration:
        motivos.append(f"duração de {dur:.3f}s passa do limite de {max_duration:.0f}s")

    bitrate = especs.get("video_bitrate")
    if bitrate and bitrate > STORIES_MAX_VIDEO_BITRATE:
        motivos.append(
            f"bitrate de vídeo é {bitrate/1_000_000:.1f} Mbps "
            f"(máximo documentado: {STORIES_MAX_VIDEO_BITRATE/1_000_000:.0f} Mbps)"
        )

    audio_codec = especs.get("audio_codec")
    if audio_codec and audio_codec.lower() != "aac":
        motivos.append(f"codec de áudio é '{audio_codec}' (a Meta exige AAC)")

    audio_bitrate = especs.get("audio_bitrate")
    # 10% de tolerância: 128 kbps é recomendação, não teto, e "-b:a 128k" sai como
    # ~129 kbps reais por overhead de container — sem a folga, um arquivo já
    # normalizado voltaria a ser marcado como fora de spec.
    if audio_bitrate and audio_bitrate > STORIES_MAX_AUDIO_BITRATE * 1.1:
        motivos.append(
            f"bitrate de áudio é {audio_bitrate/1000:.0f} kbps "
            f"(recomendado: {STORIES_MAX_AUDIO_BITRATE/1000:.0f} kbps)"
        )

    fps = especs.get("fps")
    if fps and fps > STORIES_MAX_FPS + 0.5:
        motivos.append(f"{fps:.1f} fps passa do máximo de {STORIES_MAX_FPS:.0f} fps")

    return motivos


def split_video_for_stories(local_path: str, max_duration: float = STORIES_MAX_DURATION_S):
    """Normaliza e, se preciso, divide um vídeo para Stories do Instagram com ffmpeg.

    Garante:
      1. Codec H.264 (libx264 + yuv420p) e áudio AAC — a Meta recusa HEVC, o padrão
         de exportação de TikTok e iPhone
      2. Bitrate dentro do teto da Meta (maxrate 4.5M / áudio 128k). Arquivos acima
         disso passam pelo container e são recusados no media_publish
      3. Partes de duração equilibrada, todas com folga sob o limite de 60s
         (ver STORIES_MARGEM_CORTE_S) e nenhuma abaixo do mínimo de 3s

    Um arquivo que já atende a tudo é devolvido sem reprocessamento.
    """
    import subprocess, math

    especs = get_media_specs(local_path)
    codec = especs["video_codec"]
    # A Meta valida pela duração do container, então a decisão usa o maior dos dois.
    dur_efetiva = max(especs["container_dur"] or 0.0, especs["video_dur"] or 0.0)

    motivos = motivos_fora_de_spec_stories(especs, max_duration)

    if not motivos and dur_efetiva > 0:
        logger.info(
            f"Vídeo '{os.path.basename(local_path)}' já atende à spec de Stories "
            f"({codec}, {dur_efetiva:.3f}s) — enviando sem reprocessar."
        )
        return [local_path]

    for motivo in motivos:
        logger.warning(f"Fora da spec de Stories: {motivo}")

    ffmpeg = _find_ffmpeg_bin("ffmpeg")
    base = os.path.splitext(local_path)[0]
    ext = os.path.splitext(local_path)[1]
    
    # Corta com folga sob o limite: "-t 60.0" produz 60,023s por causa da fronteira
    # de frame do AAC, e a Meta recusa isso no media_publish (subcode 2207085).
    alvo_max = max(max_duration - STORIES_MARGEM_CORTE_S, STORIES_MIN_DURATION_S)
    num_parts = math.ceil(dur_efetiva / alvo_max) if dur_efetiva > max_duration else 1

    if num_parts > 1:
        # Divide igualmente para não sobrar um rabo curto: 61s viraria 60s + 1s,
        # e a Meta recusa partes com menos de 3s.
        segmento = dur_efetiva / num_parts
    elif dur_efetiva > alvo_max:
        # Cabe em uma parte, mas está perto demais do limite para absorver o
        # overshoot do áudio — corta em alvo_max (perde menos de 0,5s).
        segmento = alvo_max
        logger.warning(
            f"Vídeo de {dur_efetiva:.3f}s está a menos de {STORIES_MARGEM_CORTE_S}s do limite "
            f"de {max_duration:.0f}s: será cortado em {alvo_max:.3f}s "
            f"(perde {dur_efetiva - alvo_max:.3f}s do final) para caber na spec da Meta."
        )
    else:
        # Parte única com folga sobrando: re-encoda o arquivo inteiro, sem cortar.
        segmento = None

    logger.info(
        f"Processando vídeo Stories ('{os.path.basename(local_path)}'): "
        f"duração={dur_efetiva:.3f}s, codec={codec} → {num_parts} parte(s) H.264 "
        f"{f'de até {segmento:.3f}s' if segmento else 'sem corte'}..."
    )

    parts = []
    for i in range(num_parts):
        start = i * segmento if segmento else 0.0
        output_path = f"{base}_story_part{i + 1}{ext}"

        # Parâmetros de codificação compatíveis 100% com Meta Graph API e Supabase Free Tier (< 50MB)
        cmd = [ffmpeg, "-y", "-ss", f"{start:.3f}", "-i", local_path]
        if segmento:
            cmd += ["-t", f"{segmento:.3f}"]
        cmd += [
            "-c:v", "libx264",         # força H.264 (resolve rejeição de HEVC pelo Instagram)
            "-preset", "fast",
            "-crf", "26",
            "-r", "30",                # taxa de quadros constante (CFR 30fps exigida pela Meta)
            "-maxrate", "4.5M",        # limita bitrate para garantir < 50MB (compatível Supabase)
            "-bufsize", "9M",
            "-pix_fmt", "yuv420p",      # formato de cor padrão aceito pela Meta
            "-c:a", "aac",             # áudio AAC
            "-b:a", "128k",
            "-ar", "44100",            # sample rate 44.1kHz estéreo
            "-ac", "2",
            "-avoid_negative_ts", "make_zero",
            "-movflags", "+faststart",  # otimiza MP4 para streaming
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise Exception(
                f"Erro ao re-processar vídeo (parte {i + 1}/{num_parts}) com ffmpeg: "
                f"{result.stderr[-600:]}"
            )
            
        part_size_mb = os.path.getsize(output_path) / 1024 / 1024
        part_dur = get_container_duration(output_path)

        # A Meta aceita um arquivo fora de spec no container (chega a FINISHED) e só
        # recusa no media_publish, com "Fatal" e um subcode não documentado. Melhor
        # descobrir aqui, com a duração real em mãos.
        if part_dur is not None and part_dur > max_duration:
            raise Exception(
                f"Parte {i + 1}/{num_parts} ficou com {part_dur:.3f}s, acima do limite de "
                f"{max_duration:.0f}s de Stories — a Meta recusaria na publicação. "
                f"Aumente STORIES_MARGEM_CORTE_S."
            )
        if part_dur is not None and 0 < part_dur < STORIES_MIN_DURATION_S:
            # Aviso, não erro: o mínimo de 3s é o que a doc da Meta indica para
            # Stories, mas não foi confirmado na prática — não vale bloquear uma
            # publicação que talvez passasse.
            logger.warning(
                f"   Parte {i + 1}/{num_parts} tem apenas {part_dur:.3f}s, abaixo do mínimo "
                f"de {STORIES_MIN_DURATION_S:.0f}s que a Meta documenta para Stories — "
                f"a publicação pode ser recusada."
            )

        dur_txt = f"{part_dur:.3f}s" if part_dur is not None else "duração desconhecida"
        logger.info(
            f"   Parte {i + 1}/{num_parts} pronta: {os.path.basename(output_path)} "
            f"({part_size_mb:.1f} MB, {dur_txt})"
        )
        parts.append(output_path)

    return parts


def upload_video_resumable_meta(local_path: str, meta_account_id: str, access_token: str,
                                extra_params: dict) -> str:
    """
    Faz upload direto de vídeo para a Meta API via Upload Resumável.
    NÃO requer URL pública — envia os bytes do arquivo local diretamente para os
    servidores da Meta. Ideal para vídeos grandes ou quando o servidor não tem
    URL pública acessível pelos crawlers da Meta.

    Fluxo:
      1. POST /{ig-user-id}/media?upload_type=resumable  →  obtém creation_id + uri
      2. POST {uri} com os bytes do vídeo               →  confirma upload
      3. Aguarda processamento via wait_for_media_processing()

    Retorna o creation_id pronto para media_publish.
    """
    file_size = os.path.getsize(local_path)
    filename = os.path.basename(local_path)
    logger.info(
        f"📤 Upload resumável → Meta: '{filename}' ({file_size / 1024 / 1024:.1f} MB) "
        f"| conta: {meta_account_id}"
    )

    # ── Etapa 1: inicializar sessão de upload ──────────────────────────────
    init_params = {
        "access_token": access_token,
        "upload_type": "resumable",
        **extra_params
    }
    init_res = requests.post(f"{GRAPH_API_BASE}/{meta_account_id}/media", data=init_params)
    init_data = init_res.json()

    if "error" in init_data:
        raise Exception(
            f"Erro ao inicializar upload resumável: "
            f"{init_data['error'].get('message', json.dumps(init_data))}"
        )

    creation_id = init_data.get("id")
    upload_uri = init_data.get("uri")

    if not creation_id or not upload_uri:
        raise Exception(
            f"Meta API não retornou id/uri para upload resumável: {init_data}"
        )

    logger.info(f"   Sessão iniciada — creation_id: {creation_id}")
    logger.info(f"   Upload URI: {upload_uri}")

    # ── Etapa 2: enviar os bytes do vídeo ──────────────────────────────────
    with open(local_path, "rb") as f:
        video_bytes = f.read()

    upload_headers = {
        "Authorization": f"OAuth {access_token}",
        "offset": "0",
        "file_size": str(file_size),
        "Content-Type": "application/octet-stream"
    }
    upload_res = requests.post(
        upload_uri, headers=upload_headers, data=video_bytes, timeout=600
    )

    try:
        upload_data = upload_res.json()
    except Exception:
        upload_data = {}

    if not upload_data.get("success"):
        raise Exception(
            f"Falha no upload resumável (HTTP {upload_res.status_code}): "
            f"{upload_data or upload_res.text[:500]}"
        )

    logger.info("   ✅ Bytes enviados com sucesso. Aguardando processamento pela Meta...")

    # ── Etapa 3: aguardar processamento ───────────────────────────────────
    wait_for_media_processing(creation_id, access_token)
    logger.info(f"🎉 Upload resumável concluído! creation_id: {creation_id}")
    return creation_id


SUPABASE_URL = os.environ.get("SUPABASE_URL", os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://hdycnhouyjpsagondjvb.supabase.co"))
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_pRMd3suVuGcOUJPIFmPYLw_HMDfyBse"))
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", os.environ.get("NEXT_PUBLIC_SUPABASE_BUCKET", "Postagens"))


def upload_para_supabase(local_path, filename, is_video=False):
    """Envia arquivo para o Supabase Storage (bucket Postagens) e retorna a URL pública"""
    try:
        if not local_path or not os.path.exists(local_path):
            return None
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{filename}"

        # 1. Verifica se já existe e está acessível publicamente no Supabase
        try:
            head_res = requests.head(public_url, timeout=5)
            if head_res.status_code == 200:
                logger.info(f"ℹ️ Arquivo já existe e está acessível no Supabase Storage ({SUPABASE_BUCKET}): {public_url}")
                return public_url
        except Exception:
            pass

        content_type = "video/mp4" if is_video else ("image/png" if filename.endswith(".png") else "image/jpeg")
        url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{filename}"
        headers = {
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": content_type,
            "x-upsert": "true"
        }
        with open(local_path, "rb") as f:
            res = requests.post(url, headers=headers, data=f.read())
        if res.status_code in (200, 201):
            logger.info(f"🎉 Upload para Supabase Storage ({SUPABASE_BUCKET}) concluído: {public_url}")
            return public_url
        else:
            # Em caso de 403 / RLS error por upsert em arquivo existente, verifica se a URL está disponível
            try:
                head_check = requests.head(public_url, timeout=5)
                if head_check.status_code == 200:
                    logger.info(f"ℹ️ Arquivo confirmado no Supabase Storage ({SUPABASE_BUCKET}): {public_url}")
                    return public_url
            except Exception:
                pass
            logger.warning(f"Aviso no upload Supabase ({res.status_code}): {res.text}")
    except Exception as e:
        logger.warning(f"Erro ao enviar mídia para Supabase Storage: {e}")
    return None


def publicar_item_meta(agendamento, config, dry_run=False):
    """Executa a criação do container e publicação na Meta Graph API"""
    access_token = config.get("access_token")
    meta_account_id = agendamento.get("meta_account_id") or config.get("meta_account_id")
    public_base_url = config.get("public_base_url")

    if not access_token:
        raise Exception("Access Token da Meta API não configurado. Salve as credenciais nas Configurações da Meta API.")
    if not meta_account_id:
        raise Exception("Meta Account ID (Instagram Business Account ID) não informado para este perfil.")

    tipo_postagem = (agendamento.get("tipo_postagem") or "FEED").upper()
    legenda = agendamento.get("legenda") or ""
    
    arquivos_raw = agendamento.get("arquivos") or "[]"
    try:
        arquivos = json.loads(arquivos_raw) if isinstance(arquivos_raw, str) else arquivos_raw
    except Exception:
        arquivos = []

    if not arquivos:
        raise Exception("Nenhum arquivo de mídia encontrado no agendamento.")

    logger.info(f"Iniciando publicação para @{agendamento.get('username')} (ID: {agendamento.get('id')}) | Tipo: {tipo_postagem} | Arquivos: {len(arquivos)}")

    container_url_ep = f"{GRAPH_API_BASE}/{meta_account_id}/media"

    if dry_run:
        logger.info(f"[DRY-RUN] Simulação de publicação bem-sucedida para o agendamento {agendamento.get('id')}")
        return "DRY_RUN_MEDIA_ID_12345"

    # Prepara lista de mídias (com localPath e url pública Supabase)
    media_list = []
    automacao_dir = os.path.join(BASE_DIR, "automacao", str(meta_account_id))

    # Garante que a pasta existe (pode não ter sido criada se o Meta Account ID foi
    # configurado antes de qualquer upload via dashboard)
    if not os.path.exists(automacao_dir):
        try:
            os.makedirs(automacao_dir, exist_ok=True)
            logger.info(f"Pasta de automação criada automaticamente: {automacao_dir}")
        except Exception as dir_err:
            logger.warning(f"Não foi possível criar pasta de automação: {dir_err}")

    for item in arquivos:
        saved_name = item.get("savedName")
        if not saved_name and item.get("path"):
            saved_name = os.path.basename(item.get("path"))

        if not saved_name:
            continue

        ext = os.path.splitext(saved_name)[1].lower()
        is_video = bool(item.get("type", "").startswith("video") or ext in (".mp4", ".mov", ".m4v"))

        # Instagram não aceita PNG via URL — converte para JPEG automaticamente
        served_name = saved_name
        if not is_video and ext == ".png" and HAS_PILLOW:
            png_path = os.path.join(automacao_dir, saved_name)
            jpg_name = os.path.splitext(saved_name)[0] + "_converted.jpg"
            jpg_path = os.path.join(automacao_dir, jpg_name)
            if os.path.exists(png_path) and not os.path.exists(jpg_path):
                try:
                    with Image.open(png_path) as img:
                        rgb = img.convert("RGB")
                        rgb.save(jpg_path, "JPEG", quality=95)
                    logger.info(f"PNG convertido para JPEG: {jpg_name}")
                except Exception as conv_err:
                    logger.warning(f"Falha ao converter PNG para JPEG ({saved_name}): {conv_err}")
            if os.path.exists(jpg_path):
                served_name = jpg_name

        local_path = os.path.join(automacao_dir, served_name)
        if not os.path.exists(local_path) and item.get("path") and os.path.exists(item.get("path")):
            local_path = item.get("path")
        elif not os.path.exists(local_path):
            local_path = None

        # Prioridade 1: Usar URL pública do Supabase se já existir e não for PNG convertido
        file_url = item.get("url") if item.get("url") and "supabase.co" in item.get("url") else None
        if file_url and served_name != saved_name and file_url.endswith(".png"):
            # Foi convertido para JPG localmente, então descarta a URL antiga PNG para reenviar como JPG
            file_url = None
        
        # Prioridade 2: Tentar enviar o arquivo local (inclusive JPG convertido) para o Supabase Storage
        if not file_url and local_path and os.path.exists(local_path):
            file_url = upload_para_supabase(local_path, served_name, is_video=is_video)

        # Fallback: Usar public_base_url antiga se Supabase falhar
        if not file_url:
            file_url = f"{public_base_url}/api/automacao/media/{meta_account_id}/{served_name}" if public_base_url else None

        media_list.append({
            "url": file_url,
            "local_path": local_path,
            "is_video": is_video,
            "saved_name": served_name
        })

    if not media_list:
        raise Exception("Não foi possível encontrar os arquivos de mídia do agendamento.")

    # ────────────────────────────────────────────────────────────────────────
    # Helper: cria container de imagem (tenta upload direto, depois image_url)
    # ────────────────────────────────────────────────────────────────────────
    def criar_container_imagem(extra_data: dict, item: dict) -> str:
        """Cria container de imagem na Meta API. Tenta upload direto (source)
        quando arquivo existe localmente, caso contrário usa image_url."""
        base_data = {"access_token": access_token}
        base_data.update(extra_data)

        # Tenta upload direto por multipart (sem precisar de URL pública)
        if item.get("local_path") and os.path.exists(item["local_path"]):
            logger.info(f"Tentando upload direto (source) para: {item['saved_name']}")
            try:
                with open(item["local_path"], "rb") as f:
                    res = requests.post(
                        container_url_ep,
                        data=base_data,
                        files={"source": (item["saved_name"], f, "image/jpeg")}
                    )
                rd = res.json()
                if "id" in rd:
                    logger.info(f"Upload direto OK! container_id={rd['id']}")
                    return rd["id"]
                logger.warning(f"Upload direto falhou ({rd.get('error', {}).get('message', rd)}), tentando image_url...")
            except Exception as e:
                logger.warning(f"Erro no upload direto: {e}, tentando image_url...")

        # Fallback: image_url pública
        if not item.get("url"):
            raise Exception("Nenhuma URL pública configurada e arquivo local não encontrado.")
        base_data["image_url"] = item["url"]
        logger.info(f"Usando image_url: {item['url']}")
        res = requests.post(container_url_ep, data=base_data)
        rd = res.json()
        if "error" in rd:
            raise Exception(rd["error"].get("message", json.dumps(rd["error"])))
        return rd.get("id")

    # Alias
    media_urls = media_list

    # ────────────────────────────────────────────────────────────────────────
    # Helper: cria container de vídeo com retry + backoff exponencial
    # O erro 2207076 é transitório — a Meta não conseguiu baixar o vídeo
    # naquele momento. A solução oficial é criar um NOVO container e tentar
    # novamente (nunca reutilizar um container em estado ERROR).
    # ────────────────────────────────────────────────────────────────────────
    def criar_container_video_com_retry(payload: dict, descricao: str, max_tentativas: int = 3) -> str:
        """Cria container de vídeo na Meta API com até `max_tentativas` retries.
        A cada falha de processamento (erro 2207076 / ERROR), aguarda e cria
        um container NOVO — nunca reutiliza o container em estado de erro."""
        esperas = [15, 30, 60]  # segundos de espera entre tentativas

        for tentativa in range(1, max_tentativas + 1):
            logger.info(f"🎬 {descricao} — Tentativa {tentativa}/{max_tentativas}")
            logger.info(f"   URL do vídeo: {payload.get('video_url', '(sem URL)')}")

            res = requests.post(container_url_ep, data=payload)
            res_data = res.json()

            if "error" in res_data:
                raise Exception(
                    f"Erro Meta API ao criar container de vídeo: {descrever_erro_meta(res_data['error'])}"
                )

            creation_id = res_data.get("id")
            if not creation_id:
                raise Exception(f"Meta API não retornou um container ID: {res_data}")

            logger.info(f"   Container criado: {creation_id}")

            try:
                wait_for_media_processing(creation_id, access_token)
                logger.info(f"✅ {descricao} — Container {creation_id} processado com sucesso na tentativa {tentativa}.")
                return creation_id
            except Exception as proc_err:
                proc_msg = str(proc_err)
                logger.warning(
                    f"⚠️  {descricao} — Falha no processamento (tentativa {tentativa}/{max_tentativas}): {proc_msg}\n"
                    f"   Container {creation_id} descartado (estado terminal). Será criado um novo container."
                )
                if tentativa < max_tentativas:
                    espera = esperas[tentativa - 1]
                    logger.info(f"   Aguardando {espera}s antes da próxima tentativa...")
                    time.sleep(espera)
                else:
                    raise Exception(
                        f"{proc_msg} (após {max_tentativas} tentativas)"
                    )

        raise Exception(f"Falha ao criar container de vídeo após {max_tentativas} tentativas.")


    # ────────────────────────────────────────────────────────────────────────
    # Helper: executa media_publish com retry e estabilização de CDN
    # ────────────────────────────────────────────────────────────────────────
    def executar_media_publish_com_retry(creation_id_to_pub: str, descricao_pub: str = "Publicação", max_tentativas: int = 3) -> str:
        """Executa a publicação oficial (media_publish) com delay de estabilização da CDN da Meta e retries automáticos."""
        publish_url = f"{GRAPH_API_BASE}/{meta_account_id}/media_publish"
        pub_payload = {
            "access_token": access_token,
            "creation_id": creation_id_to_pub
        }
        
        # Pausa para sincronização da CDN da Meta
        time.sleep(4)

        for tent in range(1, max_tentativas + 1):
            logger.info(f"Disparando media_publish ({descricao_pub}) — Tentativa {tent}/{max_tentativas} com creation_id: {creation_id_to_pub}...")
            # timeout obrigatório: um POST pendurado deixa a linha reivindicada por
            # tempo indefinido e atrasa o restante da fila.
            pub_res = requests.post(publish_url, data=pub_payload, timeout=120)
            pub_data = pub_res.json()

            if "id" in pub_data:
                meta_media_id = pub_data["id"]
                logger.info(f"✅ {descricao_pub} concluída com sucesso no Instagram! Media ID: {meta_media_id}")
                return meta_media_id

            err_obj = pub_data.get("error", {})
            err_msg = err_obj.get("message", json.dumps(pub_data))
            err_sub = err_obj.get("error_subcode")

            # A Meta manda o motivo legível em error_user_title/error_user_msg. Sem
            # isso, subcodes não documentados (ex.: 2207085) só dizem "Fatal".
            detalhe = descrever_erro_meta(err_obj)
            logger.warning(
                f"⚠️ Erro no media_publish (tentativa {tent}/{max_tentativas}): {detalhe}"
            )
            logger.warning(f"   Payload completo da Meta: {json.dumps(pub_data, ensure_ascii=False)}")

            # Erros permanentes: insistir não resolve e pode agravar (spam/quota)
            if err_sub in SUBCODES_PERMANENTES:
                raise Exception(f"Erro Meta API no media_publish ({descricao_pub}): {detalhe}")

            if tent < max_tentativas:
                espera = 5 * tent
                logger.info(f"   Aguardando {espera}s para estabilização antes de tentar publicar novamente...")
                time.sleep(espera)
            else:
                raise Exception(f"Erro Meta API no media_publish ({descricao_pub}): {detalhe}")

        raise Exception(f"Falha no media_publish ({descricao_pub}) após {max_tentativas} tentativas.")


    # ─────────────────────────────────────────────────────────────
    # 1. FEED DE IMAGEM ÚNICA OU VÍDEO ÚNICO
    # ─────────────────────────────────────────────────────────────
    if tipo_postagem == "FEED" and len(media_urls) == 1:
        first_item = media_urls[0]

        if first_item["is_video"]:
            extra = {"media_type": "REELS", "caption": legenda}
            if first_item.get("url"):
                logger.info(f"Feed (vídeo): usando URL pública Supabase ({first_item['url']}).")
                payload = {"access_token": access_token, "video_url": first_item["url"], **extra}
                try:
                    creation_id = criar_container_video_com_retry(payload, "Feed (vídeo único como Reels)")
                except Exception as url_err:
                    if first_item.get("local_path") and os.path.exists(first_item["local_path"]):
                        logger.warning(f"Falha com URL pública ({url_err}), tentando upload resumável...")
                        creation_id = upload_video_resumable_meta(
                            first_item["local_path"], meta_account_id, access_token, extra
                        )
                    else:
                        raise
            elif first_item.get("local_path") and os.path.exists(first_item["local_path"]):
                logger.info("Feed (vídeo): arquivo local disponível → usando upload resumável.")
                creation_id = upload_video_resumable_meta(
                    first_item["local_path"], meta_account_id, access_token, extra
                )
            else:
                raise Exception("Nenhum arquivo local ou URL disponível para o vídeo do Feed.")
        else:
            creation_id = criar_container_imagem({"caption": legenda}, first_item)

    # ─────────────────────────────────────────────────────────────
    # 2. CARROSSEL (Múltiplas Fotos/Vídeos no Feed)
    # ─────────────────────────────────────────────────────────────
    elif tipo_postagem == "FEED" and len(media_urls) > 1:
        child_ids = []

        for idx, item in enumerate(media_urls):
            logger.info(f"Criando item {idx+1}/{len(media_urls)} do carrossel...")
            if item["is_video"]:
                extra = {"media_type": "VIDEO", "is_carousel_item": "true"}
                descricao = f"Carrossel item {idx+1}/{len(media_urls)} (vídeo)"
                if item.get("url"):
                    payload = {"access_token": access_token, "video_url": item["url"], **extra}
                    try:
                        child_id = criar_container_video_com_retry(payload, descricao)
                    except Exception as url_err:
                        if item.get("local_path") and os.path.exists(item["local_path"]):
                            logger.warning(f"Falha com URL ({url_err}), tentando upload resumável...")
                            child_id = upload_video_resumable_meta(
                                item["local_path"], meta_account_id, access_token, extra
                            )
                        else:
                            raise
                elif item.get("local_path") and os.path.exists(item["local_path"]):
                    logger.info(f"{descricao}: arquivo local disponível → usando upload resumável.")
                    child_id = upload_video_resumable_meta(
                        item["local_path"], meta_account_id, access_token, extra
                    )
                else:
                    raise Exception(f"Vídeo {item.get('saved_name')} sem URL e sem arquivo local.")
            else:
                child_id = criar_container_imagem({"is_carousel_item": "true"}, item)
            child_ids.append(child_id)

        # Cria o container pai do Carrossel
        logger.info(f"Criando container pai do carrossel com {len(child_ids)} itens...")
        carousel_payload = {
            "access_token": access_token,
            "media_type": "CAROUSEL",
            "children": json.dumps(child_ids),
            "caption": legenda
        }
        res_car = requests.post(container_url_ep, data=carousel_payload)
        car_data = res_car.json()

        if "error" in car_data:
            err_msg = car_data["error"].get("message", json.dumps(car_data["error"]))
            raise Exception(f"Erro Meta API ao criar carrossel pai: {err_msg}")

        creation_id = car_data.get("id")
        wait_for_media_processing(creation_id, access_token)

    # ─────────────────────────────────────────────────────────────
    # 3. REELS
    # ─────────────────────────────────────────────────────────────
    elif tipo_postagem == "REELS":
        video_item = next((m for m in media_urls if m["is_video"]), media_urls[0])
        extra = {"media_type": "REELS", "caption": legenda, "share_to_feed": "true"}
        if video_item.get("url"):
            logger.info(f"Reels: usando URL pública Supabase ({video_item['url']}).")
            payload = {"access_token": access_token, "video_url": video_item["url"], **extra}
            try:
                creation_id = criar_container_video_com_retry(payload, "Reels")
            except Exception as url_err:
                if video_item.get("local_path") and os.path.exists(video_item["local_path"]):
                    logger.warning(f"Falha com URL ({url_err}), tentando upload resumável...")
                    creation_id = upload_video_resumable_meta(
                        video_item["local_path"], meta_account_id, access_token, extra
                    )
                else:
                    raise
        elif video_item.get("local_path") and os.path.exists(video_item["local_path"]):
            logger.info("Reels: arquivo local disponível → usando upload resumável.")
            creation_id = upload_video_resumable_meta(
                video_item["local_path"], meta_account_id, access_token, extra
            )
        else:
            raise Exception("Nenhum arquivo local ou URL disponível para Reels.")

    # ─────────────────────────────────────────────────────────────
    # 4. STORIES
    # ─────────────────────────────────────────────────────────────
    elif tipo_postagem == "STORIES":
        story_item = media_urls[0]

        if story_item["is_video"]:
            extra = {"media_type": "STORIES"}
            local_path = story_item.get("local_path")

            if local_path and os.path.exists(local_path):
                # Processa o vídeo com ffmpeg (garante H.264 AVC + áudio AAC + partes ≤60s)
                video_parts = split_video_for_stories(local_path, STORIES_MAX_DURATION_S)
                logger.info(f"Publicando {len(video_parts)} Stories de vídeo em sequência...")

                last_media_id = None

                for i, part_path in enumerate(video_parts):
                    part_name = os.path.basename(part_path)
                    logger.info(f"📱 Story parte {i + 1}/{len(video_parts)}: {part_name}")
                    
                    # 1. Envia a parte processada (< 50MB) para o Supabase Storage como URL pública
                    part_sup_url = None
                    try:
                        part_sup_url = upload_para_supabase(part_path, part_name, is_video=True)
                        if part_sup_url:
                            logger.info(f"   Supabase Storage URL pública: {part_sup_url}")
                    except Exception as sup_err:
                        logger.warning(f"   Falha ao enviar parte {i + 1} para Supabase: {sup_err}")

                    # 2. Criação do container na Meta API (Prioriza URL Supabase; fallback para resumable)
                    part_cid = None
                    if part_sup_url:
                        payload = {"access_token": access_token, "video_url": part_sup_url, **extra}
                        try:
                            part_cid = criar_container_video_com_retry(
                                payload, f"Stories (parte {i + 1}/{len(video_parts)})"
                            )
                        except Exception as url_err:
                            logger.warning(f"   Falha via video_url ({url_err}), tentando upload resumável...")
                            part_cid = upload_video_resumable_meta(
                                part_path, meta_account_id, access_token, extra
                            )
                    else:
                        logger.info(f"   URL pública não disponível. Usando upload resumável para parte {i + 1}...")
                        part_cid = upload_video_resumable_meta(
                            part_path, meta_account_id, access_token, extra
                        )

                    # 3. Publicação com retry
                    last_media_id = executar_media_publish_com_retry(
                        part_cid, f"Story parte {i + 1}/{len(video_parts)}"
                    )

                logger.info(f"🎉 Todas as {len(video_parts)} partes do Story publicadas com sucesso!")
                return last_media_id  # retorno antecipado — pula o bloco media_publish geral
            else:
                logger.warning(
                    "Stories (vídeo): arquivo local NÃO encontrado. "
                    "Tentando via URL (pode falhar se URL não for acessível pela Meta)."
                )
                payload = {"access_token": access_token, "video_url": story_item["url"], **extra}
                creation_id = criar_container_video_com_retry(payload, "Stories (vídeo)")
        else:
            # Upload direto para Stories de imagem
            creation_id = criar_container_imagem({"media_type": "STORIES"}, story_item)

    else:
        raise Exception(f"Tipo de postagem '{tipo_postagem}' não suportado.")

    # ─────────────────────────────────────────────────────────────
    # 5. ETAPA FINAL: PUBLICAÇÃO OFICIAL (media_publish)
    # ─────────────────────────────────────────────────────────────
    meta_media_id = executar_media_publish_com_retry(creation_id, f"Publicação {tipo_postagem}")
    return meta_media_id


def _dias_selecionados(ag):
    """Lista normalizada de dias da rotina — aceita códigos ('SEG') e datas ISO."""
    raw = ag.get("dias_selecionados") or "[]"
    try:
        lista = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        lista = []
    return [str(d).upper() for d in (lista or [])]


def _limite_inferior_rotina(ag):
    """Primeira data em que a rotina pode ocorrer (nunca antes de ter sido criada)."""
    criado_local = _utc_para_local(ag.get("criado_em"))
    data_inicio = ag.get("data_inicio") or ""
    limites = []
    if criado_local:
        limites.append(criado_local)
    if data_inicio:
        try:
            limites.append(datetime.strptime(data_inicio, "%Y-%m-%d"))
        except ValueError:
            pass
    return max(limites) if limites else None


def is_agendamento_no_horario(ag, agora=None, conn=None):
    """Verifica se o agendamento atingiu o horário para ser postado"""
    if agora is None:
        agora = datetime.now()

    if (ag.get("status") or "").upper() in STATUS_INATIVOS:
        return False

    tipo_agendamento = ag.get("tipo_agendamento") or ("DATA_ESPECIFICA" if ag.get("recorrencia") == "UNICA" else "RECORRENTE")
    hora_fixa = ag.get("hora_fixa") or "18:00"

    try:
        hora_alvo, min_alvo = map(int, hora_fixa.split(":"))
    except Exception:
        hora_alvo, min_alvo = 18, 0

    if tipo_agendamento == "DATA_ESPECIFICA":
        data_especifica = ag.get("data_especifica") or ""
        if not data_especifica:
            return False
        try:
            dt_alvo = datetime.strptime(f"{data_especifica} {hora_fixa}", "%Y-%m-%d %H:%M")
            return agora >= dt_alvo
        except Exception:
            return False

    elif tipo_agendamento == "RECORRENTE":
        # Checa limites de data início / data fim
        data_inicio = ag.get("data_inicio") or ""
        data_fim = ag.get("data_fim") or ""
        hoje_str = agora.strftime("%Y-%m-%d")

        if data_inicio and hoje_str < data_inicio:
            return False
        if data_fim and hoje_str > data_fim:
            return False

        # Checa dia da semana (a lista pode conter "SEG" ou datas "2026-08-24")
        dias_norm = _dias_selecionados(ag)
        if dias_norm:
            if DIA_MAP[agora.weekday()] not in dias_norm and hoje_str not in dias_norm:
                return False

        # A ocorrência é sempre a de HOJE: publicação atrasada no mesmo dia é permitida,
        # de dias anteriores nunca.
        dt_alvo = datetime(agora.year, agora.month, agora.day, hora_alvo, min_alvo)
        if agora < dt_alvo:
            return False

        # Nunca uma ocorrência anterior à criação da rotina (ex.: rotina de 06:30 criada
        # às 07:00 não deve publicar "atrasada" no mesmo dia).
        limite = _limite_inferior_rotina(ag)
        if limite and dt_alvo < limite:
            return False

        # No máximo uma publicação por dia
        if ja_publicou_hoje(ag.get("id"), hoje_str, conn=conn):
            return False

        return True

    return False


def _proxima_ocorrencia_recorrente(ag, agora, limite_dias=400):
    """Próxima data/hora futura de uma rotina, respeitando dias da semana e período."""
    hora_fixa = ag.get("hora_fixa") or "18:00"
    try:
        hora_h, hora_m = map(int, hora_fixa.split(":"))
    except Exception:
        hora_h, hora_m = 18, 0

    dias_norm = _dias_selecionados(ag)
    data_fim = ag.get("data_fim") or ""
    limite = _limite_inferior_rotina(ag)

    for offset in range(0, limite_dias):
        dia = agora + timedelta(days=offset)
        dt_alvo = datetime(dia.year, dia.month, dia.day, hora_h, hora_m)
        if dt_alvo < agora:
            continue
        iso = dt_alvo.strftime("%Y-%m-%d")
        if data_fim and iso > data_fim:
            return None
        if dias_norm and DIA_MAP[dt_alvo.weekday()] not in dias_norm and iso not in dias_norm:
            continue
        if limite and dt_alvo < limite:
            continue
        return dt_alvo
    return None


def executar_agendamentos_pendentes(agendamento_id=None, force=False, dry_run=False, permitir_duplicado=False):
    """Varre e executa os agendamentos pendentes"""
    init_db_schema()
    registrar_heartbeat()

    conn = get_db_connection()

    # Recuperação: linhas travadas em PUBLICANDO (processo morto no meio do upload)
    # voltam para AGENDADO, senão nunca mais seriam selecionadas.
    try:
        recuperadas = conn.execute(f"""
            UPDATE automacao_agendamentos
               SET status = 'AGENDADO'
             WHERE status = 'PUBLICANDO'
               AND (atualizado_em IS NULL
                    OR atualizado_em < datetime('now', '-{CLAIM_TIMEOUT_MIN} minutes'))
        """).rowcount
        conn.commit()
        if recuperadas:
            logger.warning(f"♻️  {recuperadas} agendamento(s) travado(s) em PUBLICANDO foram liberados.")
    except sqlite3.OperationalError as rec_err:
        logger.warning(f"Não foi possível liberar agendamentos travados: {rec_err}")

    if agendamento_id:
        query = "SELECT * FROM automacao_agendamentos WHERE id = ?"
        params = (agendamento_id,)
    else:
        query = "SELECT * FROM automacao_agendamentos WHERE status = 'AGENDADO' ORDER BY criado_em ASC"
        params = ()

    agendamentos = [dict(r) for r in conn.execute(query, params).fetchall()]
    conn.close()

    if not agendamentos:
        logger.info("Nenhum agendamento pendente encontrado para processar.")
        return []

    agora = datetime.now()
    hoje_local = agora.strftime("%Y-%m-%d")
    resultados = []

    for ag in agendamentos:
        ag_id = ag["id"]
        status_original = (ag.get("status") or "AGENDADO").upper()
        tipo_agendamento = ag.get("tipo_agendamento") or ("DATA_ESPECIFICA" if ag.get("recorrencia") == "UNICA" else "RECORRENTE")
        recorrente = tipo_agendamento == "RECORRENTE"

        # Se não for execução forçada por ID, valida o horário
        if not agendamento_id and not force:
            if not is_agendamento_no_horario(ag, agora):
                continue
        elif status_original in STATUS_INATIVOS:
            logger.warning(f"⏭️  Agendamento [{ag_id}] está {status_original}. Nada a publicar.")
            resultados.append({"id": ag_id, "status": "IGNORADO", "motivo": status_original})
            continue

        # Guarda anti-duplicidade: uma publicação por dia, mesmo com --force
        if not permitir_duplicado and ja_publicou_hoje(ag_id, hoje_local):
            logger.warning(
                f"⏭️  Agendamento [{ag_id}] já tem publicação registrada hoje ({hoje_local}). "
                f"Ignorando para não duplicar."
            )
            resultados.append({"id": ag_id, "status": "IGNORADO", "motivo": "JA_PUBLICADO_HOJE"})
            continue

        if not force and contar_erros_hoje(ag_id, hoje_local) >= MAX_TENTATIVAS_DIA:
            logger.warning(
                f"⏭️  Agendamento [{ag_id}] já falhou {MAX_TENTATIVAS_DIA}x hoje. "
                f"Nova tentativa apenas amanhã (ou manualmente)."
            )
            resultados.append({"id": ag_id, "status": "IGNORADO", "motivo": "LIMITE_TENTATIVAS_DIA"})
            continue

        # Reivindicação atômica: se outro processo já pegou esta ocorrência, sai fora
        conn = get_db_connection()
        try:
            reivindicado = _reivindicar_agendamento(conn, ag_id)
        finally:
            conn.close()

        if not reivindicado:
            logger.warning(f"⏭️  Agendamento [{ag_id}] já está sendo publicado por outra instância. Ignorando.")
            resultados.append({"id": ag_id, "status": "IGNORADO", "motivo": "EM_PUBLICACAO"})
            continue

        logger.info(f"Processando postagem agendada [{ag_id}] para @{ag.get('username')}...")
        config = get_meta_config(ag.get("meta_account_id"), ag.get("username"))
        origem = "MANUAL" if agendamento_id else "AGENDADOR"

        conn = get_db_connection()
        try:
            meta_media_id = publicar_item_meta(ag, config, dry_run=dry_run)

            registrar_publicacao(ag, "PUBLICADO", meta_media_id=meta_media_id, origem=origem, conn=conn)

            # Rotina recorrente não é consumida: volta para AGENDADO para as próximas
            # ocorrências. Só data específica termina em PUBLICADO.
            novo_status = "AGENDADO" if recorrente else "PUBLICADO"
            agora_local = datetime.now()
            hoje_local_str = agora_local.strftime("%Y-%m-%d")
            hora_local_str = agora_local.strftime("%H:%M")

            if not recorrente:
                conn.execute("""
                    UPDATE automacao_agendamentos SET
                        status = ?,
                        meta_media_id = ?,
                        data_especifica = ?,
                        hora_fixa = ?,
                        dias_selecionados = ?,
                        publicado_em = datetime('now'),
                        ultima_execucao = datetime('now'),
                        erro_detalhe = '',
                        atualizado_em = datetime('now')
                    WHERE id = ?
                """, (novo_status, str(meta_media_id), hoje_local_str, hora_local_str, json.dumps([hoje_local_str]), ag_id))
            else:
                conn.execute("""
                    UPDATE automacao_agendamentos SET
                        status = ?,
                        meta_media_id = ?,
                        publicado_em = datetime('now'),
                        ultima_execucao = datetime('now'),
                        erro_detalhe = '',
                        atualizado_em = datetime('now')
                    WHERE id = ?
                """, (novo_status, str(meta_media_id), ag_id))
            conn.commit()

            resultados.append({
                "id": ag_id,
                "status": "PUBLICADO",
                "meta_media_id": str(meta_media_id),
                "agendamento_status": novo_status
            })

        except Exception as e:
            err_msg = str(e)
            logger.error(f"❌ Falha ao publicar agendamento [{ag_id}]: {err_msg}")

            registrar_publicacao(ag, "ERRO", erro=err_msg, origem=origem, conn=conn)

            # Para rotinas recorrentes: sempre volta a AGENDADO (ocorrências futuras devem
            # continuar. O contar_erros_hoje já limita as tentativas do dia.
            # Para data específica: mantém AGENDADO enquanto não atingiu MAX_TENTATIVAS_DIA
            # e a data ainda não passou — só então marca ERRO definitivo para sinalizar
            # que não há mais retentativas automáticas.
            if recorrente:
                novo_status = "AGENDADO"
            else:
                erros_hoje = contar_erros_hoje(ag_id, hoje_local, conn=conn)
                data_esp = ag.get("data_especifica") or ""
                data_ja_passou = bool(data_esp) and hoje_local > data_esp
                if erros_hoje >= MAX_TENTATIVAS_DIA or data_ja_passou:
                    novo_status = "ERRO"
                    logger.warning(
                        f"⛔  Agendamento [{ag_id}] marcado como ERRO definitivo "
                        f"(tentativas hoje: {erros_hoje}/{MAX_TENTATIVAS_DIA}, "
                        f"data passou: {data_ja_passou})."
                    )
                else:
                    novo_status = "AGENDADO"
                    logger.info(
                        f"🔄  Agendamento [{ag_id}] volta a AGENDADO para nova tentativa "
                        f"(tentativa {erros_hoje}/{MAX_TENTATIVAS_DIA} hoje)."
                    )

            conn.execute("""
                UPDATE automacao_agendamentos SET
                    status = ?,
                    erro_detalhe = ?,
                    ultima_execucao = datetime('now'),
                    atualizado_em = datetime('now')
                WHERE id = ?
            """, (novo_status, err_msg, ag_id))
            conn.commit()

            resultados.append({
                "id": ag_id,
                "status": "ERRO",
                "error": err_msg,
                "agendamento_status": novo_status
            })
        finally:
            conn.close()

    return resultados


def calcular_proximo_agendamento():
    """Busca no banco o próximo agendamento AGENDADO e retorna quantos segundos faltam para ele."""
    try:
        conn = get_db_connection()
        rows = conn.execute(
            "SELECT * FROM automacao_agendamentos WHERE status = 'AGENDADO' ORDER BY criado_em ASC"
        ).fetchall()
        conn.close()

        agora = datetime.now()
        mais_proximo_dt = None

        for row in rows:
            ag = dict(row)
            tipo = ag.get("tipo_agendamento") or ("DATA_ESPECIFICA" if ag.get("recorrencia") == "UNICA" else "RECORRENTE")
            hora_fixa = ag.get("hora_fixa") or "18:00"

            if tipo == "DATA_ESPECIFICA":
                data_esp = ag.get("data_especifica") or ""
                if not data_esp:
                    continue
                try:
                    dt_alvo = datetime.strptime(f"{data_esp} {hora_fixa}", "%Y-%m-%d %H:%M")
                except Exception:
                    continue

            elif tipo == "RECORRENTE":
                dt_alvo = _proxima_ocorrencia_recorrente(ag, agora)
                if dt_alvo is None:
                    continue
            else:
                continue

            if mais_proximo_dt is None or dt_alvo < mais_proximo_dt:
                mais_proximo_dt = dt_alvo

        if mais_proximo_dt is None:
            return None, None

        # Acorda 30s antes para estar pronto
        segundos_restantes = max(0, (mais_proximo_dt - agora).total_seconds() - 30)
        return mais_proximo_dt, segundos_restantes

    except Exception as e:
        logger.warning(f"Erro ao calcular próximo agendamento: {e}")
        return None, None


def run_daemon(interval_seconds=60):
    """Daemon inteligente: dorme até o próximo agendamento ao invés de verificar a cada N segundos."""
    MAX_IDLE_SLEEP = 1800  # 30 min máximo sem recalcular a agenda
    POLL_AFTER_DUE = 60    # Após processar, verifica por 60s a cada 5s para garantir entrega

    if not _adquirir_lock_daemon():
        logger.warning(
            "⚠️  Outro daemon do publicador já está ativo (lock com heartbeat recente). "
            "Encerrando esta instância para não duplicar publicações."
        )
        return

    logger.info(f"🚀 Daemon do Publicador iniciado — instância única. Lock: {LOCK_PATH}")

    try:
        init_db_schema()
        registrar_heartbeat("Daemon iniciado")

        # Verificação imediata: publica a ocorrência atrasada do dia corrente quando a
        # máquina liga depois do horário previsto.
        try:
            executar_agendamentos_pendentes()
        except Exception as e:
            logger.error(f"Erro na verificação inicial do daemon: {e}")

        while True:
            try:
                # ── 1. Calcula quando é o próximo agendamento
                prox_dt, segundos_ate_proximo = calcular_proximo_agendamento()

                if prox_dt is None:
                    logger.info(f"💤 Nenhum agendamento pendente. Próxima verificação em {MAX_IDLE_SLEEP//60} min.")
                    dormir_com_heartbeat(MAX_IDLE_SLEEP, "Nenhum agendamento pendente")
                    continue

                # ── 2. Dorme até 30s antes do agendamento (em blocos, mantendo heartbeat)
                if segundos_ate_proximo > 0:
                    espera = min(segundos_ate_proximo, MAX_IDLE_SLEEP)
                    logger.info(f"⏰ Próximo agendamento em {prox_dt.strftime('%d/%m %H:%M')} "
                                f"(~{int(segundos_ate_proximo//60)}min {int(segundos_ate_proximo%60)}s). Daemon em espera...")
                    dormir_com_heartbeat(espera, f"Aguardando {prox_dt.strftime('%d/%m %H:%M')}")
                    if espera < segundos_ate_proximo:
                        continue  # ainda falta: recalcula (a agenda pode ter mudado)

                # ── 3. Janela de execução: verifica a cada 5s por até POLL_AFTER_DUE segundos
                logger.info(f"🔔 Janela de publicação ativa para {prox_dt.strftime('%d/%m %H:%M')}. Verificando...")
                inicio_janela = time.time()
                while time.time() - inicio_janela < POLL_AFTER_DUE:
                    try:
                        executar_agendamentos_pendentes()
                    except Exception as e:
                        logger.error(f"Erro ao executar agendamento: {e}")
                    _tocar_lock_daemon()
                    time.sleep(5)

            except Exception as e:
                logger.error(f"Erro no ciclo principal do Daemon: {e}")
                dormir_com_heartbeat(60, "Recuperando de erro")
    finally:
        _liberar_lock_daemon()
        logger.info("Daemon encerrado — lock liberado.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publicador Automático Instagram - SocialTracker")
    parser.add_argument("--id", help="ID do agendamento específico para publicar imediatamente")
    parser.add_argument("--force", action="store_true", help="Força a execução ignorando checagem de horário")
    parser.add_argument("--force-duplicado", action="store_true",
                        help="Ignora a proteção de 'uma publicação por dia' (depuração manual)")
    parser.add_argument("--dry-run", action="store_true", help="Executa simulação sem chamar a API da Meta")
    parser.add_argument("--daemon", action="store_true", help="Roda em modo contínuo em segundo plano")
    parser.add_argument("--interval", type=int, default=60, help="Intervalo de checagem do daemon em segundos")

    args = parser.parse_args()

    if args.daemon:
        run_daemon(args.interval)
    else:
        results = executar_agendamentos_pendentes(
            agendamento_id=args.id,
            force=args.force,
            dry_run=args.dry_run,
            permitir_duplicado=args.force_duplicado
        )
        print(json.dumps({"success": True, "results": results}, indent=2))

