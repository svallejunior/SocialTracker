import requests
import json
import sqlite3

conn = sqlite3.connect('instagram_tracker.db')
c = conn.cursor()
c.execute("SELECT id, meta_account_id, username, access_token FROM automacao_config WHERE LOWER(username) = '_lunavalente14'")
row = c.fetchone()
conn.close()

id_cfg, meta_acc_id, username, token = row

print(f"Buscando posts e comentários de @{username} ({meta_acc_id})...")

url = f"https://graph.facebook.com/v20.0/{meta_acc_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,comments{{id,text,from,timestamp,like_count,user_likes}}&limit=5&access_token={token}"
res = requests.get(url)
print("Status:", res.status_code)
data = res.json()

posts = data.get("data", [])
print(f"Posts encontrados: {len(posts)}")

total_comentarios = 0
for p in posts:
    comments = p.get("comments", {}).get("data", [])
    print(f"\nPost ID: {p.get('id')} | Curtidas: {p.get('like_count')} | Comentários: {len(comments)}")
    print(f"Legenda: {p.get('caption', '')[:60]}...")
    for com in comments:
        total_comentarios += 1
        print(f"  -> Comentário ID {com.get('id')}: @{com.get('from', {}).get('username', 'anon')} disse: '{com.get('text')}' (likes: {com.get('like_count')})")

print(f"\nTotal comentários lidos com sucesso: {total_comentarios}")
