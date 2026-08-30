import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
DB_PATH = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)

def calcular_benchmark_dinamico():
    """
    Calcula a curva de mediana esperada (P50) para perfis de benchmark por dia relativo (D0 a DN)
    usando SQL puro (Recursivo + Imputação LOCF + Mediana com Window Functions).
    """
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    sql = """
    WITH RECURSIVE 
    -- 1. Gera a sequência dinâmica de dias relativos até o dia máximo existente no histórico
    MaxDia AS (
        SELECT MAX(CAST((julianday(DATE(h.data_coleta)) - julianday(SUBSTR(m.primeira_postagem, -10))) AS INTEGER)) AS max_d
        FROM perfis_monitorados m
        JOIN perfis_historico h ON m.username = h.username
        WHERE m.primeira_postagem IS NOT NULL
          AND (h.tipo_janela IS NULL OR h.tipo_janela IN ('ORGANICO', 'VIRAL_ORGANICO'))
    ),
    DiasRelativos AS (
        SELECT 0 AS dia_relativo
        UNION ALL
        SELECT dia_relativo + 1 FROM DiasRelativos, MaxDia WHERE dia_relativo < MaxDia.max_d
    ),

    -- 2. Mapeia as coletas reais do grupo de BENCHMARK para cada dia relativo
    ColetasRelativas AS (
        SELECT 
            m.username,
            CAST((julianday(DATE(h.data_coleta)) - julianday(SUBSTR(m.primeira_postagem, -10))) AS INTEGER) AS dia_relativo,
            MAX(h.seguidores) AS seguidores
        FROM perfis_monitorados m
        JOIN perfis_historico h ON m.username = h.username
        WHERE m.primeira_postagem IS NOT NULL
          AND m.primeira_postagem != 'NULL'
          AND (h.tipo_janela IS NULL OR h.tipo_janela IN ('ORGANICO', 'VIRAL_ORGANICO'))
          AND DATE(h.data_coleta) >= SUBSTR(m.primeira_postagem, -10)
        GROUP BY m.username, dia_relativo
    ),

    -- 3. Preenche lacunas com Forward Fill (LOCF) para cada perfil por dia
    GradeImputada AS (
        SELECT 
            d.dia_relativo,
            m.username,
            COALESCE(
                c.seguidores,
                LAST_VALUE(c.seguidores) OVER (
                    PARTITION BY m.username 
                    ORDER BY d.dia_relativo 
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                )
            ) AS seguidores_acumulados
        FROM DiasRelativos d
        CROSS JOIN (
            SELECT DISTINCT username 
            FROM perfis_monitorados 
            WHERE primeira_postagem IS NOT NULL AND primeira_postagem != 'NULL'
        ) m
        LEFT JOIN ColetasRelativas c ON c.username = m.username AND c.dia_relativo = d.dia_relativo
    )

    -- 4. Calcula a MEDIANA (P50) dinâmica por dia relativo
    SELECT 
        dia_relativo,
        AVG(seguidores_acumulados) AS p50_mediana_esperada
    FROM (
        SELECT 
            dia_relativo,
            seguidores_acumulados,
            ROW_NUMBER() OVER (PARTITION BY dia_relativo ORDER BY seguidores_acumulados) AS row_num,
            COUNT(*) OVER (PARTITION BY dia_relativo) AS total_count
        FROM GradeImputada
        WHERE seguidores_acumulados IS NOT NULL
    ) sub
    WHERE row_num IN ((total_count + 1) / 2, (total_count + 2) / 2)
    GROUP BY dia_relativo
    ORDER BY dia_relativo ASC;
    """

    res = cur.execute(sql).fetchall()
    conn.close()
    return res

if __name__ == "__main__":
    dados = calcular_benchmark_dinamico()
    print("=== Curva Dinamica do Benchmark (P50 Mediana Esperada por Dia Relativo) ===")
    print("=" * 65)
    for dia, p50 in dados:
        print(f"Dia {dia:2d}: {p50:,.1f} seguidores esperados")
