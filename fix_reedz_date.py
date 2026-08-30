import sqlite3
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
db_path = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(db_path)
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
