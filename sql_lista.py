import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
DB_PATH = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)

try:
    # 1. Conecta ao banco de dados
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 2. Busca o nome de todas as tabelas criadas pelo usuário
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    tabelas = cursor.fetchall()
    
    if not tabelas:
        print("📭 O banco de dados está vazio (nenhuma tabela encontrada).")
    else:
        print(f"🗂️  Foram encontradas {len(tabelas)} tabelas no banco de dados.\n")
        
        # 3. Percorre cada tabela para listar seu conteúdo
        for tabela in tabelas:
            nome_tabela = tabela[0]
            print("=" * 60)
            print(f"📋 TABELA: {nome_tabela}")
            print("=" * 60)
            
            # Executa o SELECT para a tabela atual
            cursor.execute(f"SELECT * FROM [{nome_tabela}];")
            
            # Pega o nome das colunas da tabela atual
            colunas = [description[0] for description in cursor.description]
            print(f"Colunas: {colunas}")
            print("-" * 60)
            
            # Pega todas as linhas de dados
            linhas = cursor.fetchall()
            
            if not linhas:
                print("   (Esta tabela está vazia)")
            else:
                for linha in linhas:
                    print(f"   {linha}")
            
            print("\n") # Linha em branco para separar as tabelas

    # Fecha as conexões
    cursor.close()
    conn.close()

except Exception as e:
    print(f"❌ Ocorreu um erro: {e}")