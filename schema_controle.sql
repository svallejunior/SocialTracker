CREATE TABLE IF NOT EXISTS controle_perfis (
    username TEXT PRIMARY KEY,
    nome TEXT,
    nascimento DATE,
    email TEXT,
    reserva TEXT,
    linktree TEXT,
    inicio DATE,
    telegram TEXT,
    fotos_estoque INTEGER DEFAULT 0,
    status TEXT,
    obs TEXT,
    atualizado_em DATETIME
);

