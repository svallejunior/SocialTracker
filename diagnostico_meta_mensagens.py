import sqlite3
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

conn = sqlite3.connect('instagram_tracker.db')
c = conn.cursor()
c.execute("SELECT id, meta_account_id, username, access_token FROM automacao_config")
rows = c.fetchall()
conn.close()

print(f"Total configs encontradas: {len(rows)}")

for row in rows:
    id_cfg, meta_acc_id, username, token = row
    if not username and id_cfg == 'default_config':
        token = token or os.environ.get("META_ACCESS_TOKEN", "")
        username = "default_config"

    token = (token or "").strip() or os.environ.get(f"META_TOKEN_{username.upper().replace('.', '_')}", "") or os.environ.get("META_ACCESS_TOKEN", "")

    print("\n" + "="*50)
    print(f"Conta: username={username} | id_cfg={id_cfg} | meta_acc_id={meta_acc_id}")
    print(f"Token: {token[:15]}... (len={len(token)})")

    if not token:
        print("❌ Sem token")
        continue

    # 1. /debug_token para ver escopos
    try:
        r_dbg = requests.get(f"https://graph.facebook.com/v20.0/debug_token?input_token={token}&access_token={token}", timeout=10)
        print("\n--- DEBUG TOKEN ---")
        dbg_json = r_dbg.json()
        data = dbg_json.get("data", {})
        print("App ID:", data.get("app_id"))
        print("Type:", data.get("type"))
        print("Valid:", data.get("is_valid"))
        print("Scopes:", data.get("scopes"))
        print("Granular Scopes:", data.get("granular_scopes"))
    except Exception as e:
        print("Erro debug token:", e)

    # 2. /me/accounts (Páginas vinculadas ao token)
    try:
        r_pages = requests.get(f"https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token={token}", timeout=10)
        print("\n--- ME/ACCOUNTS (PÁGINAS) ---")
        pages_json = r_pages.json()
        print(json.dumps(pages_json, indent=2))
    except Exception as e:
        print("Erro me/accounts:", e)

    # 3. Teste conversations na conta direta
    if meta_acc_id:
        try:
            r_c1 = requests.get(f"https://graph.facebook.com/v20.0/{meta_acc_id}/conversations?platform=instagram&access_token={token}", timeout=10)
            print(f"\n--- /{meta_acc_id}/conversations?platform=instagram ---")
            print("Status:", r_c1.status_code)
            print(r_c1.text[:300])
        except Exception as e:
            print("Erro c1:", e)

        try:
            r_c2 = requests.get(f"https://graph.facebook.com/v20.0/{meta_acc_id}/conversations?access_token={token}", timeout=10)
            print(f"\n--- /{meta_acc_id}/conversations (sem platform) ---")
            print("Status:", r_c2.status_code)
            print(r_c2.text[:300])
        except Exception as e:
            print("Erro c2:", e)
