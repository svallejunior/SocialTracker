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
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA busy_timeout = 30000;')
    cursor = conn.cursor()

    # Busca todos os registros ordenados cronologicamente por perfil com identificador de meu_perfil
    cursor.execute("""
        SELECT h.id, h.username, h.data_coleta, h.seguidores, h.total_posts, h.inativo, h.tipo_janela, h.revisado_manualmente,
               COALESCE(pm.meu_perfil, 0) as meu_perfil
        FROM perfis_historico h
        LEFT JOIN perfis_monitorados pm ON LOWER(pm.username) = LOWER(h.username)
        ORDER BY h.username, datetime(h.data_coleta) ASC, h.id ASC
    """)
    rows = cursor.fetchall()

    ultimo_por_perfil = {}
    marcados_analise = 0
    ignorados_ja_revisados = 0
    auto_validados_organico = 0

    for r in rows:
        rid, uname, data_coleta, segs, posts, inativo, tipo_janela, revisado, meu_perfil = r

        if inativo == 1 or segs is None or segs == 0:
            continue

        if uname in ultimo_por_perfil:
            seg_ant, posts_ant, tipo_ant, rev_ant = ultimo_por_perfil[uname]
            delta_s = segs - seg_ant
            delta_posts = (posts or 0) - (posts_ant or 0)
            pct_delta_s = ((segs - seg_ant) / seg_ant * 100) if seg_ant > 0 else 0

            precisa_analise = (pct_delta_s > LIMIAR_PERCENTUAL_MINIMO) and (delta_s >= LIMIAR_DELTA_S_MINIMO)

            if precisa_analise:
                ja_classificado = (revisado == 1) and (tipo_janela in ('ADS', 'VIRAL_ORGANICO'))
                if meu_perfil == 1 and ja_classificado:
                    ignorados_ja_revisados += 1
                elif revisado == 1 and tipo_janela != 'ORGANICO':
                    ignorados_ja_revisados += 1
                elif tipo_ant == 'VIRAL_ORGANICO' and rev_ant == 1:
                    cursor.execute("""
                        UPDATE perfis_historico
                        SET tipo_janela = 'VIRAL_ORGANICO', revisado_manualmente = 1
                        WHERE id = ?
                    """, (rid,))
                    tipo_janela = 'VIRAL_ORGANICO'
                    revisado = 1
                    auto_validados_organico += 1
                    print(f"  🔥 Registro #{rid} | @{uname} | {data_coleta} | ΔS={int(delta_s):+d} | %ΔS={pct_delta_s:.1f}% → mantido VIRAL_ORGANICO (viralização ativa)")
                elif meu_perfil == 1 and tipo_janela == 'ORGANICO':
                    cursor.execute("""
                        UPDATE perfis_historico
                        SET tipo_janela = 'ADS', revisado_manualmente = 0
                        WHERE id = ?
                    """, (rid,))
                    tipo_janela = 'ADS'
                    revisado = 0
                    marcados_analise += 1
                    print(f"  🔴 Registro #{rid} | @{uname} (Meu Perfil) | {data_coleta} | ΔS={int(delta_s):+d} | %ΔS={pct_delta_s:.1f}% | Sem marcação Viral/ADS → enviado para verificação")
                else:
                    cursor.execute("""
                        UPDATE perfis_historico
                        SET tipo_janela = 'ADS', revisado_manualmente = 0
                        WHERE id = ?
                    """, (rid,))
                    tipo_janela = 'ADS'
                    revisado = 0
                    marcados_analise += 1
                    print(f"  🔴 Registro #{rid} | @{uname} | {data_coleta} | ΔS={int(delta_s):+d} | %ΔS={pct_delta_s:.1f}% → enviado para análise/validação")
            else:
                cursor.execute("""
                    UPDATE perfis_historico
                    SET tipo_janela = 'ORGANICO', revisado_manualmente = 1
                    WHERE id = ?
                """, (rid,))
                tipo_janela = 'ORGANICO'
                revisado = 1
                auto_validados_organico += 1
        else:
            # Primeira coleta
            cursor.execute("""
                UPDATE perfis_historico
                SET tipo_janela = 'ORGANICO', revisado_manualmente = 1
                WHERE id = ?
            """, (rid,))
            tipo_janela = 'ORGANICO'
            revisado = 1
            auto_validados_organico += 1

        ultimo_por_perfil[uname] = (segs, posts or 0, tipo_janela, revisado)

    conn.commit()
    conn.close()

    print(f"\n✅ Varrida concluída com sucesso!")
    print(f"   - Validados automaticamente como Orgânico (variação <= 2% ou <= 10 seg): {auto_validados_organico}")
    print(f"   - Enviados para análise/validação manual (variação > 2% e > 10 seg): {marcados_analise}")
    print(f"   - Registros com variação > 2% e > 10 seg já revisados previamente: {ignorados_ja_revisados}")


if __name__ == "__main__":
    escanear_historico()
