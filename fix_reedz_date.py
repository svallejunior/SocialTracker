import sqlite3
import sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(r'C:\Projetos\SocialTracker\instagram_tracker.db')
cur = conn.cursor()

# Verificar registro atual
cur.execute("SELECT username, nome, inicio, status FROM controle_perfis WHERE username LIKE '%mel.santos%'")
rows = cur.fetchall()
print("Registro atual:")
for row in rows:
    print(row)

# Atualizar a data de inicio para 25/07/2026
cur.execute("""
    UPDATE controle_perfis
    SET inicio = '2026-07-25',
        atualizado_em = datetime('now')
    WHERE username LIKE '%mel.santos%'
""")
conn.commit()
print(f"\nLinhas atualizadas: {cur.rowcount}")

# Confirmar a atualizacao
cur.execute("SELECT username, nome, inicio, status FROM controle_perfis WHERE username LIKE '%mel.santos%'")
rows = cur.fetchall()
print("\nRegistro apos atualizacao:")
for row in rows:
    print(row)

conn.close()
