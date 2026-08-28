import requests
import json
import sqlite3

conn = sqlite3.connect('instagram_tracker.db')
c = conn.cursor()
c.execute("SELECT id, meta_account_id, username, access_token FROM automacao_config WHERE LOWER(username) = '_lunavalente14'")
row = c.fetchone()
conn.close()

id_cfg, meta_acc_id, username, user_token = row
comment_id = "17961408357141084"

print(f"Testando curtida no comentario {comment_id}...")

# 1. Pega Page Token da pagina vinculada (Luna Valente)
r_pages = requests.get(f"https://graph.facebook.com/v20.0/me/accounts?access_token={user_token}").json()
page_token = None
for p in r_pages.get("data", []):
    if "luna" in p.get("name", "").lower():
        page_token = p.get("access_token")
        print(f"Encontrou Page Token da pagina '{p.get('name')}' (ID {p.get('id')})")
        break

# Teste 1: POST /{comment_id}/likes com User Token
r1 = requests.post(f"https://graph.facebook.com/v20.0/{comment_id}/likes?access_token={user_token}")
print("\n[1] User Token -> POST /{comment_id}/likes:")
print("Status:", r1.status_code, r1.text)

# Teste 2: POST /{comment_id}/likes com Page Token
if page_token:
    r2 = requests.post(f"https://graph.facebook.com/v20.0/{comment_id}/likes?access_token={page_token}")
    print("\n[2] Page Token -> POST /{comment_id}/likes:")
    print("Status:", r2.status_code, r2.text)

# Teste 3: POST /{comment_id}?user_likes=true com User Token
r3 = requests.post(f"https://graph.facebook.com/v20.0/{comment_id}?user_likes=true&access_token={user_token}")
print("\n[3] User Token -> POST /{comment_id}?user_likes=true:")
print("Status:", r3.status_code, r3.text)

# Teste 4: POST /{comment_id}?user_likes=true com Page Token
if page_token:
    r4 = requests.post(f"https://graph.facebook.com/v20.0/{comment_id}?user_likes=true&access_token={page_token}")
    print("\n[4] Page Token -> POST /{comment_id}?user_likes=true:")
    print("Status:", r4.status_code, r4.text)

# Teste 5: GET /{comment_id}?fields=id,text,from,like_count,user_likes
r5 = requests.get(f"https://graph.facebook.com/v20.0/{comment_id}?fields=id,text,from,like_count,user_likes&access_token={user_token}")
print("\n[5] GET /{comment_id}:")
print("Status:", r5.status_code, r5.text)
