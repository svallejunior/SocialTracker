"""
escanear_anomalias_historicas.py
Varre todo o histórico existente na tabela perfis_historico, calcula as métricas
e marca como 'ADS' (pendente de triagem) os registros não revisados que dispararam gatilhos.
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
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "instagram_tracker.db"))

LIMIAR_DELTA_S_VOLUME = 150
LIMIAR_PERCENTUAL_EXPLOSAO = 25
LIMIAR_S_ANTERIOR_MINIMO = 500


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
    marcados = 0
    ignorados_ja_revisados = 0

    for r in rows:
        rid, uname, data_coleta, segs, posts, inativo, tipo_janela, revisado = r

        if inativo == 1 or segs is None or segs == 0:
            continue

        if uname in ultimo_por_perfil:
            seg_ant, posts_ant = ultimo_por_perfil[uname]
            delta_s = segs - seg_ant
            delta_posts = (posts or 0) - (posts_ant or 0)
            pct_delta_s = ((segs - seg_ant) / seg_ant * 100) if seg_ant > 0 else 0

            gatilho_disparado = False
            if delta_s > LIMIAR_DELTA_S_VOLUME and delta_posts == 0:
                gatilho_disparado = True
            if pct_delta_s >= LIMIAR_PERCENTUAL_EXPLOSAO and seg_ant > LIMIAR_S_ANTERIOR_MINIMO:
                gatilho_disparado = True

            if gatilho_disparado:
                if revisado == 1:
                    ignorados_ja_revisados += 1
                else:
                    cursor.execute("""
                        UPDATE perfis_historico
                        SET tipo_janela = 'ADS', revisado_manualmente = 0
                        WHERE id = ?
                    """, (rid,))
                    marcados += 1
                    print(f"  🔴 Registro #{rid} | @{uname} | {data_coleta} | ΔS={int(delta_s):+d} | ΔP={int(delta_posts):+d} | %ΔS={pct_delta_s:.1f}% → marcado como ADS")

        ultimo_por_perfil[uname] = (segs, posts or 0)

    conn.commit()
    conn.close()

    print(f"\n✅ Varrida concluída!")
    print(f"   - Anomalias marcadas como ADS para triagem: {marcados}")
    print(f"   - Registros com anomalia já revisados anteriormente: {ignorados_ja_revisados}")


if __name__ == "__main__":
    escanear_historico()
