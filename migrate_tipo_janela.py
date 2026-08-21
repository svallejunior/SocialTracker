"""
migrate_tipo_janela.py
Script de migração idempotente para adicionar colunas de classificação
dinâmica por janela de amostragem na tabela perfis_historico.

Colunas adicionadas:
  - tipo_janela TEXT DEFAULT 'ORGANICO'
    Valores: 'ORGANICO', 'ADS', 'VIRAL_ORGANICO', 'IGNORAR'
  - revisado_manualmente INTEGER DEFAULT 0
    Valores: 0 (Pendente/Automático), 1 (Confirmado por Operador)
"""

import sqlite3
import sys

# Força UTF-8 no stdout/stderr no Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

DB_PATH = r"C:\Projetos\SocialTracker\instagram_tracker.db"


def migrar():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Verifica colunas existentes
    cursor.execute("PRAGMA table_info(perfis_historico)")
    colunas_existentes = {row[1] for row in cursor.fetchall()}

    alteracoes = 0

    # 1. Coluna tipo_janela
    if "tipo_janela" not in colunas_existentes:
        cursor.execute(
            "ALTER TABLE perfis_historico ADD COLUMN tipo_janela TEXT DEFAULT 'ORGANICO'"
        )
        print("✅ Coluna 'tipo_janela' adicionada com sucesso (DEFAULT 'ORGANICO').")
        alteracoes += 1
    else:
        print("ℹ️  Coluna 'tipo_janela' já existe — nenhuma alteração necessária.")

    # 2. Coluna revisado_manualmente
    if "revisado_manualmente" not in colunas_existentes:
        cursor.execute(
            "ALTER TABLE perfis_historico ADD COLUMN revisado_manualmente INTEGER DEFAULT 0"
        )
        print("✅ Coluna 'revisado_manualmente' adicionada com sucesso (DEFAULT 0).")
        alteracoes += 1
    else:
        print("ℹ️  Coluna 'revisado_manualmente' já existe — nenhuma alteração necessária.")

    conn.commit()
    conn.close()

    if alteracoes > 0:
        print(f"\n🎉 Migração concluída com {alteracoes} alteração(ões) aplicada(s).")
    else:
        print("\n✅ Banco de dados já está atualizado — nenhuma migração necessária.")


if __name__ == "__main__":
    migrar()
