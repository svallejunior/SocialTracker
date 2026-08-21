import sqlite3  
import os

# Caminho do banco de dados
DB_PATH = r"C:\Projetos\SocialTracker\instagram_tracker.db"  
# Nome do arquivo SQL que contém a sua CONSULTA (ex: SELECT * FROM ...)
SQL_FILE = "schema_controle.sql"
try:
    # 1. Abre e lê o arquivo SQL contendo a consulta
    with open(SQL_FILE, "r", encoding="utf-8") as f:  
        sql_query = f.read()  
    
    # 2. Conecta ao banco de dados SQLite
    conn = sqlite3.connect(DB_PATH)  
    cursor = conn.cursor()
    
    # 3. Executa a consulta
    cursor.execute(sql_query)  
    
    # 4. Recupera todos os resultados
    resultados = cursor.fetchall()
    
    # 5. Recupera o nome das colunas (opcional, mas ajuda muito a entender o print)
    colunas = [description[0] for description in cursor.description]
    
    print(f"📊 --- Resultado da Consulta ({len(resultados)} linhas encontradas) ---")
    print(colunas) # Printa o cabeçalho das colunas
    print("-" * 50)
    
    for linha in resultados:
        print(linha)
        
    # Fecha as conexões
    cursor.close()
    conn.close()  

except FileNotFoundError:
    print(f"❌ Erro: O arquivo '{SQL_FILE}' não foi encontrado na pasta atual.")
except sqlite3.OperationalError as e:
    print(f"❌ Erro de SQL (verifique a sintaxe no seu arquivo): {e}")
except Exception as e:
    print(f"❌ Ocorreu um erro inesperado: {e}")