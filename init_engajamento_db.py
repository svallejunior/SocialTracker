import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
db_path = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 1. Criação das tabelas de engajamento (comentários e mensagens)
cur.execute('''
CREATE TABLE IF NOT EXISTS instagram_comentarios (
    id TEXT PRIMARY KEY,
    media_id TEXT,
    modelo_username TEXT NOT NULL,
    autor_username TEXT,
    texto TEXT,
    timestamp DATETIME,
    respondido INTEGER DEFAULT 0,
    curtido INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
)
''')

cur.execute('''
CREATE TABLE IF NOT EXISTS instagram_mensagens (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    modelo_username TEXT NOT NULL,
    remetente_username TEXT,
    texto TEXT,
    timestamp DATETIME,
    lida INTEGER DEFAULT 0,
    respondida INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
)
''')

# Índices para consultas rápidas por modelo e status
cur.execute('CREATE INDEX IF NOT EXISTS idx_comentarios_modelo_resp ON instagram_comentarios(modelo_username, respondido)')
cur.execute('CREATE INDEX IF NOT EXISTS idx_mensagens_modelo_resp ON instagram_mensagens(modelo_username, respondida)')

# 2. Inserir dados de exemplo se estiver vazio para demonstração
cur.execute('SELECT COUNT(*) FROM instagram_comentarios')
count_com = cur.fetchone()[0]

cur.execute('SELECT COUNT(*) FROM instagram_mensagens')
count_msg = cur.fetchone()[0]

if count_com == 0 and count_msg == 0:
    # Insere dados de teste em um perfil existente
    cur.execute('SELECT username FROM perfis_monitorados LIMIT 3')
    modelos = [r[0] for r in cur.fetchall()]
    
    if modelos:
        m1 = modelos[0]
        cur.execute('''
            INSERT INTO instagram_comentarios (id, media_id, modelo_username, autor_username, texto, timestamp, respondido, curtido)
            VALUES (?, ?, ?, ?, ?, datetime('now', '-2 hours'), 0, 0)
        ''', ('com_test_1', 'media_123', m1, 'fa_numero1', 'Linda demais! Quando sai conteúdo novo? ❤️'))
        
        cur.execute('''
            INSERT INTO instagram_mensagens (id, conversation_id, modelo_username, remetente_username, texto, timestamp, lida, respondida)
            VALUES (?, ?, ?, ?, ?, datetime('now', '-30 minutes'), 0, 0)
        ''', ('msg_test_1', 'conv_456', m1, 'fa_vip', 'Oie, vi seu último reels! Como funciona sua consultoria?'))
        
        if len(modelos) > 1:
            m2 = modelos[1]
            cur.execute('''
                INSERT INTO instagram_comentarios (id, media_id, modelo_username, autor_username, texto, timestamp, respondido, curtido)
                VALUES (?, ?, ?, ?, ?, datetime('now', '-5 hours'), 0, 0)
            ''', ('com_test_2', 'media_456', m2, 'marcos_silva', 'Perfeita! 👏'))

conn.commit()
conn.close()
print("Tabelas instagram_comentarios e instagram_mensagens criadas e inicializadas com sucesso!")
