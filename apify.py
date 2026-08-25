from apify_client import ApifyClient

# Substitua pela sua string de token se ainda não estiver lá
import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

APIFY_TOKEN = os.getenv("APIFY_API_TOKEN") or os.getenv("APIFY_TOKEN")

def consultar_perfil_instagram(username):
    # Configuração otimizada para gastar o MÍNIMO de créditos
    run_input = {
        "usernames": [username],
        "resultsLimit": 1,
        "scrapePosts": False,      # ECONOMIA: NÃO baixa postagens
        "scrapeStories": False,    # ECONOMIA: NÃO baixa stories
        "includeCheckins": False,
        "proxy": {
            "useApifyProxy": True,
            "apifyProxyGroups": ["RESIDENTIAL"] # Se falhar no plano FREE, remova essa linha
        }
    }

    try:
        # Chama o Actor (o robô do Apify)
        # O 'apify/instagram-scraper' é o mais estável
        run = client.actor("apify/instagram-scraper").call(run_input=run_input)

        # Pega o resultado do banco de dados temporário do Apify
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            # Aqui temos os dados do perfil
            dados_simplificados = {
                "username": item.get("username"),
                "full_name": item.get("fullName"),
                "followers": item.get("followersCount"),
                "following": item.get("followsCount"),
                "biography": item.get("biography"),
                "external_url": item.get("externalUrl"),
                "is_private": item.get("private"),
                "profile_pic": item.get("profilePicUrl")
            }
            return dados_simplificados

    except Exception as e:
        print(f"Erro ao consultar Apify: {e}")
        return None

# Teste rápido
if __name__ == "__main__":
    perfil = "instagram" # substitua por um perfil real para testar
    resultado = consultar_perfil_instagram(perfil)
    if resultado:
        print(f"Sucesso! Seguidores: {resultado['followers']}")
    else:
        print("Falha na consulta.")