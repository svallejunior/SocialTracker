import sqlite3

DB_NAME = "instagram_tracker.db"

PERFIS_ALVO = [
    "reedz.ion",
    "_lunavalente14",
    "aurorachloe_luna",
    "biaruivinhaofc_",
    "gabivaleriorj",
    "gavaanabeatriz",
    "isadoraamarallofc",
    "isadoragauchinha_",
    "kahvgxz",
    "licegomes2004",
    "ren.mello",
    "souclaraaaa",
    "zionr.eed",
]

conn = sqlite3.connect(DB_NAME)
cursor = conn.cursor()

cursor.execute("""
    CREATE TABLE IF NOT EXISTS perfis_monitorados (
        username TEXT PRIMARY KEY,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
""")

for username in PERFIS_ALVO:
    username_normalizado = username.strip().lstrip("@").lower()

    cursor.execute("""
        INSERT OR IGNORE INTO perfis_monitorados (username, ativo)
        VALUES (?, 1)
    """, (username_normalizado,))

conn.commit()

cursor.execute("""
    SELECT username, ativo, criado_em
    FROM perfis_monitorados
    ORDER BY username COLLATE NOCASE
""")

perfis = cursor.fetchall()

print(f"\n{len(perfis)} perfis cadastrados para monitoramento:\n")

for username, ativo, criado_em in perfis:
    status = "Ativo" if ativo else "Inativo"
    print(f"@{username} — {status} — cadastrado em {criado_em}")

conn.close()