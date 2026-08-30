"""
sync_db.py — Sincroniza o banco de dados SQLite e arquivos WAL/SHM da VPS para a máquina local.
"""

import os
import sys
import subprocess
import shutil
from datetime import datetime

# Garante UTF-8 no terminal Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Configurações padrão da VPS
VPS_HOST = os.environ.get("VPS_HOST", "146.235.54.162")
VPS_USER = os.environ.get("VPS_USER", "ubuntu")
SSH_KEY = os.environ.get("SSH_KEY", r"C:\Users\sergi\Downloads\ssh-key-2026-08-29.key")
REMOTE_DB_PATH = "/var/www/socialtracker/instagram_tracker.db"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_DB_PATH = os.path.join(BASE_DIR, "instagram_tracker.db")

def main():
    print("=" * 60)
    print("🔄 SocialTracker — Sincronização do Banco de Dados VPS -> Local")
    print("=" * 60)

    if not os.path.exists(SSH_KEY):
        print(f"❌ Erro: Chave SSH não encontrada no caminho: {SSH_KEY}")
        print("Defina a variável de ambiente SSH_KEY ou verifique o arquivo.")
        sys.exit(1)

    # 1. Faz backup de segurança do banco local existente (se houver)
    if os.path.exists(LOCAL_DB_PATH):
        backup_dir = os.path.join(BASE_DIR, "backups_locais")
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = os.path.join(backup_dir, f"instagram_tracker_backup_{timestamp}.db")
        try:
            shutil.copy2(LOCAL_DB_PATH, backup_file)
            print(f"📦 Backup local criado em: backups_locais/{os.path.basename(backup_file)}")
        except Exception as e:
            print(f"⚠️ Aviso ao criar backup local: {e}")

    # 2. Força checkpoint WAL na VPS antes do download para garantir consistência total
    print("🔒 Executando checkpoint de WAL no SQLite da VPS...")
    checkpoint_cmd = [
        "ssh", "-i", SSH_KEY,
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        f"{VPS_USER}@{VPS_HOST}",
        f"sqlite3 {REMOTE_DB_PATH} 'PRAGMA wal_checkpoint(TRUNCATE);'"
    ]
    try:
        subprocess.run(checkpoint_cmd, check=True, capture_output=True, text=True)
        print("✅ Checkpoint WAL executado com sucesso na VPS.")
    except Exception as e:
        print(f"⚠️ Aviso no checkpoint WAL (prosseguindo com a cópia): {e}")

    # 3. Baixa o arquivo principal .db via SCP
    print(f"📥 Baixando {REMOTE_DB_PATH} de {VPS_USER}@{VPS_HOST}...")
    scp_cmd = [
        "scp", "-i", SSH_KEY,
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        f"{VPS_USER}@{VPS_HOST}:{REMOTE_DB_PATH}",
        LOCAL_DB_PATH
    ]

    res = subprocess.run(scp_cmd)
    if res.returncode != 0:
        print("❌ Falha no download do banco via SCP.")
        sys.exit(res.returncode)

    # 4. Remove eventuais arquivos de lock WAL/SHM locais órfãos para evitar inconsistência
    for ext in ["-wal", "-shm"]:
        extra_file = LOCAL_DB_PATH + ext
        if os.path.exists(extra_file):
            try:
                os.remove(extra_file)
            except Exception:
                pass

    tamanho_mb = os.path.getsize(LOCAL_DB_PATH) / (1024 * 1024)
    print(f"✅ Banco de dados sincronizado com sucesso!")
    print(f"📍 Localização: {LOCAL_DB_PATH} ({tamanho_mb:.2f} MB)")
    print("🚀 Seu localhost agora está com 100% dos dados reais da VPS.")

if __name__ == "__main__":
    main()
