import sqlite3

conn = sqlite3.connect('instagram_tracker.db')
cursor = conn.cursor()

# Check formats and views/reach counts
cursor.execute("""
SELECT formato, 
    SUM(CASE WHEN views > 0 THEN 1 ELSE 0 END) as com_views,
    SUM(CASE WHEN reach > 0 THEN 1 ELSE 0 END) as com_reach,
    COUNT(*) as total
FROM posts_historico 
GROUP BY formato 
ORDER BY total DESC
""")
rows = cursor.fetchall()
print("formato | com_views | com_reach | total")
for r in rows:
    print(r)

print("\n--- Sample carousel posts ---")
cursor.execute("""
SELECT post_id, username, formato, views, reach, saved, total_interactions
FROM posts_historico
WHERE UPPER(formato) LIKE '%CAROUSEL%' OR UPPER(formato) LIKE '%CARROSSEL%' OR UPPER(formato) LIKE '%ALBUM%'
LIMIT 10
""")
rows2 = cursor.fetchall()
for r in rows2:
    print(r)

conn.close()
