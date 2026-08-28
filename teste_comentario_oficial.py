import requests
import sqlite3

conn = sqlite3.connect('instagram_tracker.db')
c = conn.cursor()
c.execute("SELECT access_token FROM automacao_config WHERE LOWER(username) = '_lunavalente14'")
token = c.fetchone()[0]
conn.close()

comment_id = "17961408357141084"

# Teste: GET /{comment_id} com campos oficiais
r_get = requests.get(f"https://graph.facebook.com/v20.0/{comment_id}?fields=id,text,timestamp,like_count,from,hidden,replies&access_token={token}")
print("GET Comentario Oficial:")
print("Status:", r_get.status_code)
print(r_get.text)
