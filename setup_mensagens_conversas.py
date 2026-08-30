import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
db_path = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 1. Garante que a coluna direcao exista na tabela instagram_mensagens
cur.execute("PRAGMA table_info(instagram_mensagens)")
cols = [c[1] for c in cur.fetchall()]

if 'direcao' not in cols:
    try:
        cur.execute("ALTER TABLE instagram_mensagens ADD COLUMN direcao TEXT DEFAULT 'recebida'")
        print("Coluna 'direcao' adicionada a instagram_mensagens.")
    except Exception as e:
        print("Aviso ao adicionar direcao:", e)

# 2. Povoar conversas realistas de exemplo se houver poucos dados
cur.execute("SELECT COUNT(*) FROM instagram_mensagens")
count = cur.fetchone()[0]

cur.execute("SELECT username FROM perfis_monitorados LIMIT 5")
modelos = [r[0] for r in cur.fetchall()]

if modelos and count <= 2:
    print(f"Inserindo conversas de demonstração para as modelos: {modelos}")
    conversas_exemplo = [
        {
            "remetente": "lucas_silva92",
            "msgs": [
                ("recebida", "Oi linda! Vi seus stories de hoje, você tá incrível ❤️", "datetime('now', '-2 days')"),
                ("enviada", "Oie Lucas! Muito obrigada pelo carinho 🥰", "datetime('now', '-2 days', '+1 hour')"),
                ("recebida", "Quando sai ensaio novo no canal VIP? Tô ansioso pra assinar!", "datetime('now', '-30 minutes')")
            ]
        },
        {
            "remetente": "marcos_rj_vip",
            "msgs": [
                ("recebida", "Boa tarde! Você faz parcerias para divulgação de marca?", "datetime('now', '-3 hours')")
            ]
        },
        {
            "remetente": "felipe_almeida",
            "msgs": [
                ("recebida", "Amei a foto na praia! Qual praia era aquela?", "datetime('now', '-1 day')"),
                ("enviada", "Era em Búzios! Lugar maravilhoso né?", "datetime('now', '-1 day', '+2 hours')"),
                ("recebida", "Demais! Quero muito viajar pra lá. Beijos!", "datetime('now', '-20 hours')")
            ]
        },
        {
            "remetente": "gabriel_costa",
            "msgs": [
                ("recebida", "Qual o link do seu grupo fechado? Não achei na bio", "datetime('now', '-15 minutes')")
            ]
        }
    ]

    for m_idx, modelo in enumerate(modelos[:3]):
        for c_idx, conv in enumerate(conversas_exemplo):
            conv_id = f"conv_{modelo}_{conv['remetente']}"
            for msg_idx, (direcao, texto, sql_time) in enumerate(conv["msgs"]):
                is_last = (msg_idx == len(conv["msgs"]) - 1)
                respondida = 1 if direcao == "enviada" or not is_last else (1 if conv["remetente"] == "felipe_almeida" else 0)
                lida = 1 if direcao == "enviada" or not is_last else 0
                msg_id = f"msg_{modelo}_{conv['remetente']}_{msg_idx}_{m_idx}"
                
                cur.execute(f'''
                    INSERT OR REPLACE INTO instagram_mensagens (id, conversation_id, modelo_username, remetente_username, direcao, texto, timestamp, lida, respondida)
                    VALUES (?, ?, ?, ?, ?, ?, {sql_time}, ?, ?)
                ''', (msg_id, conv_id, modelo, conv['remetente'], direcao, texto, lida, respondida))

conn.commit()
conn.close()
print("Banco de dados de mensagens pronto e atualizado com sucesso!")
