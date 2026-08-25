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
import sqlite3
import argparse
import logging
import requests
from datetime import datetime, date
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


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
    
    # Colunas em automacao_agendamentos
    c.execute("PRAGMA table_info(automacao_agendamentos)")
    cols = {r[1] for r in c.fetchall()}
    if "meta_media_id" not in cols:
        c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN meta_media_id TEXT DEFAULT ''")
    if "publicado_em" not in cols:
        c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN publicado_em DATETIME")
    if "erro_detalhe" not in cols:
        c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN erro_detalhe TEXT DEFAULT ''")
    
    conn.commit()
    conn.close()

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


# Limite oficial de duração de Stories no Instagram
STORIES_MAX_DURATION_S = 60.0


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


def split_video_for_stories(local_path: str, max_duration: float = STORIES_MAX_DURATION_S):
    """Divide e/ou re-encoda um vídeo para Stories do Instagram usando ffmpeg.
    
    Garante:
      1. Codec H.264 (libx264 + yuv420p) e Áudio AAC (exigido pela Meta API; converte vídeos HEVC/TikTok)
      2. Taxa de bits controlada (maxrate 4.5M) → gera arquivos de ~15-25 MB (compatíveis com limite 50MB do Supabase)
      3. Segmentação em partes de até max_duration (60s)
    """
    import subprocess, math

    duration, codec = get_video_info(local_path)
    if duration is None:
        duration = 0.0

    precisa_reencodar = (codec.lower() != "h264")
    precisa_dividir = (duration > max_duration)

    if not precisa_reencodar and not precisa_dividir and duration > 0:
        return [local_path]

    ffmpeg = _find_ffmpeg_bin("ffmpeg")
    base = os.path.splitext(local_path)[0]
    ext = os.path.splitext(local_path)[1]
    
    num_parts = math.ceil(duration / max_duration) if duration > max_duration else 1
    logger.info(
        f"Processando vídeo Stories ('{os.path.basename(local_path)}'): "
        f"duração={duration:.1f}s, codec={codec} → dividindo em {num_parts} parte(s) H.264..."
    )

    parts = []
    for i in range(num_parts):
        start = i * max_duration
        output_path = f"{base}_story_part{i + 1}{ext}"
        
        # Parâmetros de codificação compatíveis 100% com Meta Graph API e Supabase Free Tier (< 50MB)
        cmd = [
            ffmpeg, "-y",
            "-ss", str(start),
            "-i", local_path,
            "-t", str(max_duration),
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
        logger.info(
            f"   Parte {i + 1}/{num_parts} pronta: {os.path.basename(output_path)} "
            f"({part_size_mb:.1f} MB)"
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
                err_msg = res_data["error"].get("message", json.dumps(res_data["error"]))
                raise Exception(f"Erro Meta API ao criar container de vídeo: {err_msg}")

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
            pub_res = requests.post(publish_url, data=pub_payload)
            pub_data = pub_res.json()

            if "id" in pub_data:
                meta_media_id = pub_data["id"]
                logger.info(f"✅ {descricao_pub} concluída com sucesso no Instagram! Media ID: {meta_media_id}")
                return meta_media_id

            err_obj = pub_data.get("error", {})
            err_msg = err_obj.get("message", json.dumps(pub_data))
            err_sub = err_obj.get("error_subcode")
            logger.warning(f"⚠️ Erro no media_publish (tentativa {tent}/{max_tentativas}): {err_msg} (subcode: {err_sub})")

            if tent < max_tentativas:
                espera = 5 * tent
                logger.info(f"   Aguardando {espera}s para estabilização antes de tentar publicar novamente...")
                time.sleep(espera)
            else:
                raise Exception(f"Erro Meta API no media_publish ({descricao_pub}): {err_msg} (subcode: {err_sub})")

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


def is_agendamento_no_horario(ag, agora=None):
    """Verifica se o agendamento atingiu o horário para ser postado"""
    if agora is None:
        agora = datetime.now()

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

        # Checa dia da semana
        dias_selecionados_raw = ag.get("dias_selecionados") or "[]"
        try:
            dias_selecionados = json.loads(dias_selecionados_raw) if isinstance(dias_selecionados_raw, str) else dias_selecionados_raw
        except Exception:
            dias_selecionados = []

        dia_map = {0: "SEG", 1: "TER", 2: "QUA", 3: "QUI", 4: "SEX", 5: "SAB", 6: "DOM"}
        dia_hoje = dia_map[agora.weekday()]

        # Se houver lista de dias e o dia de hoje não estiver nela
        if dias_selecionados:
            dias_norm = [d.upper() for d in dias_selecionados]
            # Pode conter tanto "SEG" quanto datas "2026-08-24"
            if dia_hoje not in dias_norm and hoje_str not in dias_norm:
                return False

        # Checa se já atingiu o horário
        if (agora.hour > hora_alvo) or (agora.hour == hora_alvo and agora.minute >= min_alvo):
            return True

    return False


def executar_agendamentos_pendentes(agendamento_id=None, force=False, dry_run=False):
    """Varre e executa os agendamentos pendentes"""
    init_db_schema()
    conn = get_db_connection()

    # Registra última verificação do daemon
    try:
        conn.execute("""
            INSERT INTO automacao_daemon_status (id, ultima_verificacao, status_daemon, mensagem)
            VALUES (1, datetime('now', 'localtime'), 'ATIVO', 'Verificação executada')
            ON CONFLICT(id) DO UPDATE SET
                ultima_verificacao = datetime('now', 'localtime'),
                status_daemon = 'ATIVO',
                mensagem = 'Verificação executada'
        """)
        conn.commit()
    except Exception as st_err:
        logger.warning(f"Não foi possível salvar status do daemon: {st_err}")

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
    resultados = []

    for ag in agendamentos:
        ag_id = ag["id"]
        
        # Se não for execução forçada por ID, valida o horário
        if not agendamento_id and not force:
            if not is_agendamento_no_horario(ag, agora):
                continue

        logger.info(f"Processando postagem agendada [{ag_id}] para @{ag.get('username')}...")
        config = get_meta_config(ag.get("meta_account_id"), ag.get("username"))

        conn = get_db_connection()
        try:
            meta_media_id = publicar_item_meta(ag, config, dry_run=dry_run)
            
            # Atualiza status para PUBLICADO
            conn.execute("""
                UPDATE automacao_agendamentos SET
                    status = 'PUBLICADO',
                    meta_media_id = ?,
                    publicado_em = datetime('now'),
                    erro_detalhe = '',
                    atualizado_em = datetime('now')
                WHERE id = ?
            """, (str(meta_media_id), ag_id))
            conn.commit()

            resultados.append({
                "id": ag_id,
                "status": "PUBLICADO",
                "meta_media_id": str(meta_media_id)
            })

        except Exception as e:
            err_msg = str(e)
            logger.error(f"❌ Falha ao publicar agendamento [{ag_id}]: {err_msg}")
            
            conn.execute("""
                UPDATE automacao_agendamentos SET
                    status = 'ERRO',
                    erro_detalhe = ?,
                    atualizado_em = datetime('now')
                WHERE id = ?
            """, (err_msg, ag_id))
            conn.commit()

            resultados.append({
                "id": ag_id,
                "status": "ERRO",
                "error": err_msg
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
            variacao = int(ag.get("variacao_minutos") or 0)

            try:
                hora_h, hora_m = map(int, hora_fixa.split(":"))
            except Exception:
                hora_h, hora_m = 18, 0

            if tipo == "DATA_ESPECIFICA":
                data_esp = ag.get("data_especifica") or ""
                if not data_esp:
                    continue
                try:
                    dt_alvo = datetime.strptime(f"{data_esp} {hora_fixa}", "%Y-%m-%d %H:%M")
                except Exception:
                    continue

            elif tipo == "RECORRENTE":
                hoje = agora.date()
                dt_alvo = datetime(hoje.year, hoje.month, hoje.day, hora_h, hora_m)
                if dt_alvo < agora:
                    import datetime as dtmod
                    dt_alvo += dtmod.timedelta(days=1)
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
    MAX_IDLE_SLEEP = 3600  # 1 hora máximo sem verificar (por segurança)
    POLL_AFTER_DUE = 60    # Após processar, verifica por 60s a cada 5s para garantir entrega

    logger.info("🚀 Daemon do Publicador iniciado — Modo Inteligente (Sleep até próximo agendamento).")

    while True:
        try:
            # ── 1. Calcula quando é o próximo agendamento
            prox_dt, segundos_ate_proximo = calcular_proximo_agendamento()

            if prox_dt is None:
                # Nenhum agendamento pendente: dorme MAX_IDLE_SLEEP e reaverifica
                logger.info(f"💤 Nenhum agendamento pendente. Próxima verificação em {MAX_IDLE_SLEEP//60} min.")
                time.sleep(MAX_IDLE_SLEEP)
                continue

            # ── 2. Dorme até 30s antes do agendamento
            if segundos_ate_proximo > 0:
                logger.info(f"⏰ Próximo agendamento em {prox_dt.strftime('%d/%m %H:%M')} "
                            f"(~{int(segundos_ate_proximo//60)}min {int(segundos_ate_proximo%60)}s). Daemon em espera...")
                time.sleep(segundos_ate_proximo)

            # ── 3. Janela de execução: verifica a cada 5s por até POLL_AFTER_DUE segundos
            logger.info(f"🔔 Janela de publicação ativa para {prox_dt.strftime('%d/%m %H:%M')}. Verificando...")
            inicio_janela = time.time()
            while time.time() - inicio_janela < POLL_AFTER_DUE:
                try:
                    executar_agendamentos_pendentes()
                except Exception as e:
                    logger.error(f"Erro ao executar agendamento: {e}")
                time.sleep(5)

        except Exception as e:
            logger.error(f"Erro no ciclo principal do Daemon: {e}")
            time.sleep(60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publicador Automático Instagram - SocialTracker")
    parser.add_argument("--id", help="ID do agendamento específico para publicar imediatamente")
    parser.add_argument("--force", action="store_true", help="Força a execução ignorando checagem de horário")
    parser.add_argument("--dry-run", action="store_true", help="Executa simulação sem chamar a API da Meta")
    parser.add_argument("--daemon", action="store_true", help="Roda em modo contínuo em segundo plano")
    parser.add_argument("--interval", type=int, default=60, help="Intervalo de checagem do daemon em segundos")

    args = parser.parse_args()

    if args.daemon:
        run_daemon(args.interval)
    else:
        results = executar_agendamentos_pendentes(agendamento_id=args.id, force=args.force, dry_run=args.dry_run)
        print(json.dumps({"success": True, "results": results}, indent=2))
