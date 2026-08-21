import sqlite3

def atualizar_um_lancamento(id_alvo):
    # Conecta ao banco de dados
    conn = sqlite3.connect('instagram_tracker.db')
    cursor = conn.cursor()
    
    # 1. O 'id' precisa ser passado como uma tupla: (id_alvo,)
    # 2. O 'WHERE id = ?' garante que apenas esse registro específico seja afetado
    sql = "UPDATE lancamentos SET descricao = ? WHERE id = ?"
    
    # Executa a atualização
    cursor.execute(sql, ('gorgeta FANVUE', id_alvo))
    
    # Verifica se algo foi alterado
    if cursor.rowcount > 0:
        conn.commit()
        print(f"✅ Sucesso! Registro com ID {id_alvo} foi atualizado.")
    else:
        print(f"⚠️ Nenhum registro encontrado com o ID {id_alvo}.")
    
    conn.close()

if __name__ == "__main__":
    # Exemplo: atualizando o registro com ID 3
    atualizar_um_lancamento(9)