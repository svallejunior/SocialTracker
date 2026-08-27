"""
escanear_anomalias_historicas.py
Varre todo o histórico existente na tabela perfis_historico:
- Coletas com variação de seguidores > 2% E > 10 seguidores: marcadas para análise/validação (se não revisadas).
- Coletas dentro do parâmetro normal (<= 2% ou <= 10 seguidores): marcadas automaticamente como ORGANICO e validado.
"""

import os
import sqlite3
import sys

# Força UTF-8 no stdout/stderr no Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# DB_PATH relativo é resolvido a partir da pasta do projeto, e não do cwd do processo chamador.
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
DB_PATH = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)

LIMIAR_DELTA_S_MINIMO = 10
LIMIAR_PERCENTUAL_MINIMO = 2.0


def escanear_historico():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Busca todos os registros ordenados cronologicamente por perfil
    cursor.execute("""
        SELECT id, username, data_coleta, seguidores, total_posts, inativo, tipo_janela, revisado_manualmente
        FROM perfis_historico
        ORDER BY username, datetime(data_coleta) ASC, id ASC
    """)
    rows = cursor.fetchall()

    ultimo_por_perfil = {}
    marcados_analise = 0
    ignorados_ja_revisados = 0
    auto_validados_organico = 0

    for r in rows:
        rid, uname, data_coleta, segs, posts, inativo, tipo_janela, revisado = r

        if inativo == 1 or segs is None or segs == 0:
            continue

        if uname in ultimo_por_perfil:
            seg_ant, posts_ant = ultimo_por_perfil[uname]
            delta_s = segs - seg_ant
            delta_posts = (posts or 0) - (posts_ant or 0)
            pct_delta_s = ((segs - seg_ant) / seg_ant * 100) if seg_ant > 0 else 0

            precisa_analise = (pct_delta_s > LIMIAR_PERCENTUAL_MINIMO) and (delta_s > LIMIAR_DELTA_S_MINIMO)

            if precisa_analise:
                if revisado == 1:
                    ignorados_ja_revisados += 1
                else:
                    cursor.execute("""
                        UPDATE perfis_historico
                        SET tipo_janela = 'ADS', revisado_manualmente = 0
                        WHERE id = ?
                    """, (rid,))
                    marcados_analise += 1
                    print(f"  🔴 Registro #{rid} | @{uname} | {data_coleta} | ΔS={int(delta_s):+d} | %ΔS={pct_delta_s:.1f}% → enviado para análise/validação")
            else:
                cursor.execute("""
                    UPDATE perfis_historico
                    SET tipo_janela = 'ORGANICO', revisado_manualmente = 1
                    WHERE id = ?
                """, (rid,))
                auto_validados_organico += 1
        else:
            # Primeira coleta
            cursor.execute("""
                UPDATE perfis_historico
                SET tipo_janela = 'ORGANICO', revisado_manualmente = 1
                WHERE id = ?
            """, (rid,))
            auto_validados_organico += 1

        ultimo_por_perfil[uname] = (segs, posts or 0)

    conn.commit()
    conn.close()

    print(f"\n✅ Varrida concluída com sucesso!")
    print(f"   - Validados automaticamente como Orgânico (variação <= 2% ou <= 10 seg): {auto_validados_organico}")
    print(f"   - Enviados para análise/validação manual (variação > 2% e > 10 seg): {marcados_analise}")
    print(f"   - Registros com variação > 2% e > 10 seg já revisados previamente: {ignorados_ja_revisados}")


if __name__ == "__main__":
    escanear_historico()
