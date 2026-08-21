import sqlite3

conn = sqlite3.connect(r'C:\Projetos\SocialTracker\instagram_tracker.db')
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print('Tabelas:', cur.fetchall())

try:
    cur.execute('SELECT username, seguidores, data_coleta FROM perfis_historico ORDER BY data_coleta DESC LIMIT 5')
    print('Últimos registros perfis_historico:', cur.fetchall())
except Exception as e:
    print('Erro perfis_historico:', e)

try:
    cur.execute('SELECT username, followers, date FROM instagram_stats ORDER BY date DESC LIMIT 5')
    print('Últimos registros instagram_stats:', cur.fetchall())
except Exception as e:
    print('Erro instagram_stats:', e)

try:
    cur.execute('SELECT username, ativo FROM perfis_monitorados LIMIT 10')
    print('perfis_monitorados:', cur.fetchall())
except Exception as e:
    print('Erro perfis_monitorados:', e)

conn.close()