"""
api_server.py — SocialTracker REST API
Servidor Flask leve que expõe todos os dados do SQLite e executa scripts Python.
Roda na VPS na porta 5000 via PM2.

Configuração:
  VPS_API_KEY=sua_chave_aqui python3 api_server.py
  ou via .env / variável de ambiente no PM2
"""

import os
import sys
import json
import sqlite3
import subprocess
import threading
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, g

app = Flask(__name__)

# ─── Configuração ──────────────────────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DB_PATH   = os.environ.get("DB_PATH",    os.path.join(BASE_DIR, "instagram_tracker.db"))
API_KEY   = os.environ.get("VPS_API_KEY", "")   # Deixe vazio para desativar auth
PORT      = int(os.environ.get("PORT",   5000))
PYTHON    = sys.executable


# ─── Helpers ───────────────────────────────────────────────────────────────────
def get_db():
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        g.db = conn
    return g.db

@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db:
        db.close()

def rows_to_list(rows):
    return [dict(r) for r in rows]

def require_api_key(f):
    """Decorator: valida API Key se VPS_API_KEY estiver configurada."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if API_KEY:
            auth = request.headers.get("Authorization", "")
            token = auth.replace("Bearer ", "").strip()
            if token != API_KEY:
                return jsonify({"success": False, "error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated

def cors_headers(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

@app.after_request
def after_request(response):
    return cors_headers(response)

@app.before_request
def handle_options():
    if request.method == "OPTIONS":
        r = app.make_default_options_response()
        return cors_headers(r)


# ─── Migrations (roda na primeira conexão) ─────────────────────────────────────
def run_migrations():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    try:
        c.execute("PRAGMA table_info(perfis_historico)")
        cols = {r[1] for r in c.fetchall()}
        if "tipo_janela"          not in cols: c.execute("ALTER TABLE perfis_historico ADD COLUMN tipo_janela TEXT DEFAULT 'ORGANICO'")
        if "revisado_manualmente" not in cols: c.execute("ALTER TABLE perfis_historico ADD COLUMN revisado_manualmente INTEGER DEFAULT 0")
        c.execute("PRAGMA table_info(perfis_monitorados)")
        cols2 = {r[1] for r in c.fetchall()}
        if "meu_perfil"         not in cols2: c.execute("ALTER TABLE perfis_monitorados ADD COLUMN meu_perfil INTEGER NOT NULL DEFAULT 0")
        if "primeira_postagem"  not in cols2: c.execute("ALTER TABLE perfis_monitorados ADD COLUMN primeira_postagem TEXT")
        if "exibir"             not in cols2: c.execute("ALTER TABLE perfis_monitorados ADD COLUMN exibir INTEGER NOT NULL DEFAULT 1")
        c.execute("PRAGMA table_info(controle_perfis)")
        cols3 = {r[1] for r in c.fetchall()}
        if "foto_url" not in cols3: c.execute("ALTER TABLE controle_perfis ADD COLUMN foto_url TEXT")
        
        # Automação Meta API
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
        c.execute("PRAGMA table_info(automacao_agendamentos)")
        cols_ag = {r[1] for r in c.fetchall()}
        if cols_ag:
            if "meta_media_id" not in cols_ag: c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN meta_media_id TEXT DEFAULT ''")
            if "publicado_em"  not in cols_ag: c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN publicado_em DATETIME")
            if "erro_detalhe"  not in cols_ag: c.execute("ALTER TABLE automacao_agendamentos ADD COLUMN erro_detalhe TEXT DEFAULT ''")
        conn.commit()
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# /api/data
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/api/data", methods=["GET"])
@require_api_key
def get_data():
    db = get_db()
    profiles = rows_to_list(db.execute(
        "SELECT * FROM perfis_monitorados WHERE status = 'ATIVO' AND exibir = 1 ORDER BY username"
    ).fetchall())

    history = rows_to_list(db.execute(
        "SELECT * FROM perfis_historico ORDER BY data_coleta DESC"
    ).fetchall())

    return jsonify({"success": True, "profiles": profiles, "history": history})


@app.route("/api/data", methods=["POST"])
@require_api_key
def add_profile():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip().lower()
    if not username:
        return jsonify({"success": False, "error": "username é obrigatório"}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM perfis_monitorados WHERE username = ?", (username,)
    ).fetchone()

    if existing:
        db.execute(
            "UPDATE perfis_monitorados SET status='ATIVO', exibir=1 WHERE username=?",
            (username,)
        )
    else:
        db.execute(
            "INSERT INTO perfis_monitorados (username, status, exibir, meu_perfil) VALUES (?, 'ATIVO', 1, 0)",
            (username,)
        )
    db.commit()
    return jsonify({"success": True})


@app.route("/api/data", methods=["DELETE"])
@require_api_key
def remove_profile():
    username = request.args.get("username", "").strip()
    if not username:
        return jsonify({"success": False, "error": "username é obrigatório"}), 400

    db = get_db()
    db.execute(
        "UPDATE perfis_monitorados SET status='INATIVO', exibir=0 WHERE username=?",
        (username,)
    )
    db.commit()
    return jsonify({"success": True})


# ═══════════════════════════════════════════════════════════════════════════════
# /api/ingestion
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/api/ingestion", methods=["POST"])
@require_api_key
def run_ingestion():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").replace(" ", "")
    username = "".join(c for c in username if c.isalnum() or c in "_.-")

    script = os.path.join(BASE_DIR, "ingestion.py")
    cmd = [PYTHON, script]
    if username:
        cmd.append(username)

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300,
            env={**os.environ, "DB_PATH": DB_PATH}
        )
        full_output = (result.stdout or "") + (result.stderr or "")
        is_warning  = any(x in full_output for x in ["AVISO:", "pulado:", "Nenhum dado"])

        if result.returncode != 0 and not is_warning:
            return jsonify({"success": False, "error": full_output}), 500

        return jsonify({
            "success": True,
            "warning": is_warning,
            "targetUsername": username or None,
            "stdout": full_output
        })
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "Timeout na ingestão"}), 504


# ═══════════════════════════════════════════════════════════════════════════════
# /api/anomalias
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/api/anomalias", methods=["GET"])
@require_api_key
def get_anomalias():
    db = get_db()
    filter_username = request.args.get("username", "")
    filter_tipo = request.args.get("tipo_janela", "")
    mode = request.args.get("mode", "")

    where_clauses = []
    params = []
    if filter_username:
        where_clauses.append("username = ?")
        params.append(filter_username)
    if filter_tipo:
        where_clauses.append("tipo_janela = ?")
        params.append(filter_tipo)
    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    registros = rows_to_list(db.execute(
        f"SELECT * FROM perfis_historico {where_sql} ORDER BY data_coleta DESC LIMIT 500",
        params
    ).fetchall())

    total_pendentes = db.execute(
        "SELECT COUNT(*) FROM perfis_historico WHERE revisado_manualmente = 0 AND tipo_janela IN ('VIRAL_ORGANICO','ADS')"
    ).fetchone()[0]

    return jsonify({
        "success": True,
        "registros": registros,
        "total_pendentes": total_pendentes
    })


@app.route("/api/anomalias", methods=["PUT"])
@require_api_key
def update_anomalia():
    body = request.get_json(silent=True) or {}
    record_id = body.get("id")
    if not record_id:
        return jsonify({"success": False, "error": "id é obrigatório"}), 400

    db = get_db()
    fields = []
    params = []
    for col in ["tipo_janela", "revisado_manualmente"]:
        if col in body:
            fields.append(f"{col} = ?")
            params.append(body[col])
    if not fields:
        return jsonify({"success": False, "error": "Nenhum campo para atualizar"}), 400

    params.append(record_id)
    db.execute(f"UPDATE perfis_historico SET {', '.join(fields)} WHERE id = ?", params)
    db.commit()
    return jsonify({"success": True})


# ═══════════════════════════════════════════════════════════════════════════════
# /api/anomalias/buscar-viral
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/api/anomalias/buscar-viral", methods=["POST"])
@require_api_key
def buscar_viral():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").replace(" ", "")
    username = "".join(c for c in username if c.isalnum() or c in "_.-")
    data_coleta = (body.get("data_coleta") or "").replace("'", "").replace('"', "")
    force_api   = bool(body.get("force_api"))

    if not username:
        return jsonify({"success": False, "error": "Username é obrigatório"}), 400

    script = os.path.join(BASE_DIR, "buscar_viral.py")
    cmd = [PYTHON, script, "--username", username]
    if data_coleta:
        cmd += ["--data_coleta", data_coleta]
    if force_api:
        cmd.append("--force_api")

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=180,
            env={**os.environ, "DB_PATH": DB_PATH}
        )
        try:
            return jsonify(json.loads(result.stdout))
        except Exception:
            return jsonify({"success": False, "error": result.stderr or result.stdout}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "Timeout na busca viral"}), 504


# ═══════════════════════════════════════════════════════════════════════════════
# /api/controle
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/api/controle", methods=["GET"])
@require_api_key
def get_controle():
    db = get_db()
    perfis = rows_to_list(db.execute(
        "SELECT * FROM controle_perfis ORDER BY nome"
    ).fetchall())
    lancamentos = rows_to_list(db.execute(
        "SELECT * FROM lancamentos ORDER BY data_lancamento DESC"
    ).fetchall())
    return jsonify({"success": True, "perfis": perfis, "lancamentos": lancamentos})


@app.route("/api/controle", methods=["POST"])
@require_api_key
def create_controle():
    body = request.get_json(silent=True) or {}
    action = body.get("action", "")
    db = get_db()

    if action == "add_perfil":
        nome = (body.get("nome") or "").strip()
        username = (body.get("username") or "").strip().lower()
        if not nome:
            return jsonify({"success": False, "error": "nome é obrigatório"}), 400
        db.execute(
            "INSERT INTO controle_perfis (nome, username, foto_url) VALUES (?,?,?)",
            (nome, username, body.get("foto_url", ""))
        )
        db.commit()
        return jsonify({"success": True})

    elif action == "add_lancamento":
        required = ["perfil_id", "tipo", "valor_brl", "data_lancamento", "descricao"]
        for f in required:
            if f not in body:
                return jsonify({"success": False, "error": f"Campo obrigatório: {f}"}), 400
        db.execute(
            """INSERT INTO lancamentos
               (perfil_id, tipo, valor_original, moeda, taxa_conversao, valor_brl,
                data_lancamento, descricao, rateio, perfis_rateio, id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                body["perfil_id"], body["tipo"],
                body.get("valor_original", body["valor_brl"]),
                body.get("moeda", "BRL"),
                body.get("taxa_conversao", 1),
                body["valor_brl"], body["data_lancamento"],
                body["descricao"],
                1 if body.get("rateio") else 0,
                json.dumps(body.get("perfis_rateio", [])),
                body.get("id", "")
            )
        )
        db.commit()
        return jsonify({"success": True})

    return jsonify({"success": False, "error": "Ação desconhecida"}), 400


@app.route("/api/controle", methods=["DELETE"])
@require_api_key
def delete_controle():
    body = request.get_json(silent=True) or {}
    lancamento_id = body.get("lancamento_id") or request.args.get("lancamento_id")
    if not lancamento_id:
        return jsonify({"success": False, "error": "lancamento_id é obrigatório"}), 400
    db = get_db()
    db.execute("DELETE FROM lancamentos WHERE id = ?", (lancamento_id,))
    db.commit()
    return jsonify({"success": True})


# ═══════════════════════════════════════════════════════════════════════════════
# /api/projecao
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/api/projecao", methods=["GET"])
@require_api_key
def get_projecao():
    db = get_db()
    username = request.args.get("username", "")
    if not username:
        return jsonify({"success": False, "error": "username é obrigatório"}), 400

    historico = rows_to_list(db.execute(
        "SELECT * FROM perfis_historico WHERE username = ? ORDER BY data_coleta",
        (username,)
    ).fetchall())

    lancamentos = rows_to_list(db.execute(
        """SELECT l.* FROM lancamentos l
           JOIN controle_perfis cp ON cp.id = l.perfil_id
           WHERE cp.username = ? ORDER BY l.data_lancamento""",
        (username,)
    ).fetchall())

    return jsonify({"success": True, "historico": historico, "lancamentos": lancamentos})


# ═══════════════════════════════════════════════════════════════════════════════
# /api/automacao
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/api/automacao/config", methods=["GET"])
@require_api_key
def get_automacao_config():
    db = get_db()
    username = request.args.get("username", "")
    config = None
    if username:
        row = db.execute("SELECT * FROM automacao_config WHERE LOWER(username) = LOWER(?) ORDER BY atualizado_em DESC LIMIT 1", (username,)).fetchone()
        if row: config = dict(row)
    if not config:
        row = db.execute("SELECT * FROM automacao_config ORDER BY atualizado_em DESC LIMIT 1").fetchone()
        if row: config = dict(row)
    return jsonify({"success": True, "config": config or {}})


@app.route("/api/automacao/config", methods=["POST"])
@require_api_key
def save_automacao_config():
    body = request.get_json(silent=True) or {}
    db = get_db()
    app_id = (body.get("app_id") or body.get("appId") or "").strip()
    app_secret = (body.get("app_secret") or body.get("appSecret") or "").strip()
    access_token = (body.get("access_token") or body.get("accessToken") or "").strip()
    meta_account_id = (body.get("meta_account_id") or body.get("metaAccountId") or "").strip()
    username = (body.get("username") or "").strip().lower()
    public_base_url = (body.get("public_base_url") or body.get("publicBaseUrl") or "").strip()

    config_id = meta_account_id or username or "default_config"
    db.execute("""
        INSERT INTO automacao_config (id, meta_account_id, username, app_id, app_secret, access_token, public_base_url, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            meta_account_id = excluded.meta_account_id,
            username = excluded.username,
            app_id = excluded.app_id,
            app_secret = excluded.app_secret,
            access_token = excluded.access_token,
            public_base_url = excluded.public_base_url,
            atualizado_em = datetime('now')
    """, (config_id, meta_account_id, username, app_id, app_secret, access_token, public_base_url))
    db.commit()
    return jsonify({"success": True, "message": "Configurações salvas com sucesso!"})


@app.route("/api/automacao/executar", methods=["POST"])
@require_api_key
def executar_automacao():
    body = request.get_json(silent=True) or {}
    ag_id = body.get("id")
    force = bool(body.get("force") or ag_id)
    dry_run = bool(body.get("dryRun") or body.get("dry_run"))

    script = os.path.join(BASE_DIR, "publicador_instagram.py")
    cmd = [PYTHON, script]
    if ag_id:
        cmd += ["--id", str(ag_id)]
    if force:
        cmd.append("--force")
    if dry_run:
        cmd.append("--dry-run")

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=180,
            env={**os.environ, "DB_PATH": DB_PATH}
        )
        try:
            return jsonify(json.loads(result.stdout))
        except Exception:
            return jsonify({"success": result.returncode == 0, "stdout": result.stdout, "stderr": result.stderr})
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "Timeout na execução do publicador"}), 504


@app.route("/api/automacao/media/<path:filepath>", methods=["GET"])
def get_automacao_media(filepath):
    from flask import send_from_directory
    media_dir = os.path.join(BASE_DIR, "automacao")
    return send_from_directory(media_dir, filepath)


# ═══════════════════════════════════════════════════════════════════════════════
# Background Worker Thread para Publicação Automática
# ═══════════════════════════════════════════════════════════════════════════════
def start_background_publisher():
    def loop_publisher():
        import publicador_instagram
        import time as tmod
        MAX_IDLE_SLEEP = 3600   # Sem agendamentos: verificar a cada 1 hora
        POLL_AFTER_DUE = 60     # Janela de execução: verificar a cada 5s por 60s após horário

        logger.info("🚀 Background Publisher — Modo Inteligente iniciado.")

        while True:
            try:
                prox_dt, segundos_ate_proximo = publicador_instagram.calcular_proximo_agendamento()

                if prox_dt is None:
                    logger.info(f"💤 Nenhum agendamento pendente. Próxima verificação em 1h.")
                    tmod.sleep(MAX_IDLE_SLEEP)
                    continue

                if segundos_ate_proximo and segundos_ate_proximo > 0:
                    logger.info(f"⏰ Background Publisher: próximo agendamento em "
                                f"{prox_dt.strftime('%d/%m %H:%M')} "
                                f"(~{int(segundos_ate_proximo//60)}min). Em espera...")
                    tmod.sleep(segundos_ate_proximo)

                # Janela ativa: verificar a cada 5s por POLL_AFTER_DUE segundos
                logger.info(f"🔔 Janela de publicação ativa ({prox_dt.strftime('%H:%M')}). Verificando...")
                inicio = tmod.time()
                while tmod.time() - inicio < POLL_AFTER_DUE:
                    try:
                        publicador_instagram.executar_agendamentos_pendentes()
                    except Exception as e:
                        logger.error(f"Background Publisher — erro ao publicar: {e}")
                    tmod.sleep(5)

            except Exception as e:
                logger.error(f"Background Publisher — erro no ciclo: {e}")
                tmod.sleep(60)

    t = threading.Thread(target=loop_publisher, daemon=True)
    t.start()


# ═══════════════════════════════════════════════════════════════════════════════
# Health check
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "db": DB_PATH, "ts": datetime.utcnow().isoformat()})


# ─── Inicialização ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"[SocialTracker API] 🗄️  Banco: {DB_PATH}")
    print(f"[SocialTracker API] 🔑  Auth: {'Ativa (API_KEY configurada)' if API_KEY else 'DESATIVADA (sem VPS_API_KEY)'}")
    print(f"[SocialTracker API] 🚀  Iniciando na porta {PORT}...")
    run_migrations()
    start_background_publisher()
    app.run(host="0.0.0.0", port=PORT, debug=False)

