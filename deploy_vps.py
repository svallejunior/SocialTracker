"""
deploy_vps.py — Atualiza o código na VPS, recompila o dashboard Next.js e reinicia os serviços PM2.
"""

import os
import sys
import subprocess

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

VPS_HOST = os.environ.get("VPS_HOST", "137.131.202.56")
VPS_USER = os.environ.get("VPS_USER", "ubuntu")
SSH_KEY = os.environ.get("SSH_KEY", r"C:\Users\sergi\Downloads\ssh-key-2026-09-07.key")

def main():
    print("=" * 60)
    print("🚀 SocialTracker — Atualização e Deploy na VPS de Produção")
    print("=" * 60)

    if not os.path.exists(SSH_KEY):
        print(f"❌ Erro: Chave SSH não encontrada no caminho: {SSH_KEY}")
        sys.exit(1)

    remote_cmd = "cd /var/www/socialtracker && git pull origin main && cd dashboard && npm run build && cd .. && pm2 reload ecosystem.config.js"

    cmd = [
        "ssh", "-i", SSH_KEY,
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        f"{VPS_USER}@{VPS_HOST}",
        remote_cmd
    ]

    print(f"📡 Conectando a {VPS_USER}@{VPS_HOST} e executando deploy...")
    res = subprocess.run(cmd)
    if res.returncode == 0:
        print("\n✅ Deploy na VPS concluído com sucesso!")
    else:
        print(f"\n❌ Erro durante o deploy na VPS (código: {res.returncode})")
        sys.exit(res.returncode)

if __name__ == "__main__":
    main()
