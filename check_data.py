import sqlite3

conn = sqlite3.connect("social_tracker.db")
cursor = conn.cursor()
cursor.execute("""
    SELECT DISTINCT username
    FROM instagram_stats
    ORDER BY username
""")

perfis = cursor.fetchall()

print("Perfis encontrados no banco:")
for (username,) in perfis:
    print(f"@{username}")

conn.close()