import streamlit as st
import sqlite3
import pandas as pd
import plotly.express as px


import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_raw_db = os.environ.get("DB_PATH", "instagram_tracker.db")
DB_PATH = _raw_db if os.path.isabs(_raw_db) else os.path.join(BASE_DIR, _raw_db)

# Estilização CSS Customizada para os Cards de Métricas (Visual Premium)
st.markdown("""
    <style>
        .metric-card {
            background-color: #1E1E24;
            border-radius: 10px;
            padding: 20px;
            border-left: 5px solid #7100E2;
            box-shadow: 2px 2px 10px rgba(0,0,0,0.3);
            margin-bottom: 15px;
        }
        .metric-title {
            color: #8A8A93;
            font-size: 14px;
            font-weight: 500;
            text-transform: uppercase;
        }
        .metric-value {
            color: #FFFFFF;
            font-size: 28px;
            font-weight: 700;
            margin-top: 5px;
        }
    </style>
""", unsafe_allow_html=True)

# Função auxiliar para formatar números nos cards estáticos de topo
def formatar_numero_card(valor):
    try:
        return f"{int(valor):,}".replace(",", ".")
    except:
        return "0"

# Conversor de datas adaptativo com tratamento de fuso horário local
def normalizar_data(valor):
    try:
        val_str = str(valor).strip()
        if val_str.replace('.', '', 1).isdigit():
            ts = float(val_str)
            if ts > 5000000000:
                ts = ts / 1000000
            return pd.to_datetime(ts, unit='s', utc=True).tz_convert('America/Sao_Paulo').tz_localize(None)
        return pd.to_datetime(val_str, errors='coerce').tz_localize(None)
    except:
        return pd.NaT

# Pipeline de leitura local do SQLite
def carregar_dados_db():
    conn = sqlite3.connect(DB_PATH)
    df_perfis = pd.read_sql_query("SELECT * FROM perfis_historico", conn)
    df_posts = pd.read_sql_query("SELECT * FROM posts_historico", conn)
    conn.close()
    
    if not df_posts.empty:
        # Tenta converter as datas, mas se falhar, mantém o que for possível
        df_posts['data_dt'] = df_posts['data_postagem'].apply(normalizar_data)
        
        # REMOVIDO: df_posts = df_posts[df_posts['data_dt'].dt.year >= 2024]
        # Agora exibimos tudo, mesmo que a data esteja estranha (para você conferir)
        
        df_posts['likes'] = pd.to_numeric(df_posts['likes'], errors='coerce').fillna(0).astype(int)
        df_posts['comentarios'] = pd.to_numeric(df_posts['comentarios'], errors='coerce').fillna(0).astype(int)
        df_posts['views'] = pd.to_numeric(df_posts['views'], errors='coerce').fillna(0).astype(int)
        df_posts['taxa_engajamento'] = pd.to_numeric(df_posts['taxa_engajamento'], errors='coerce').fillna(0).astype(float)
        
        # Constrói o link de forma mais permissiva
        df_posts['url_post'] = df_posts.apply(
            lambda row: f"https://www.instagram.com/p/{row['shortcode']}/" if pd.notnull(row.get('shortcode')) and row['shortcode'] != 'None' 
            else f"https://www.instagram.com/p/{str(row['post_id']).split('_')[0]}/", axis=1
        )
    return df_perfis, df_posts

try:
    df_perfis, df_posts = carregar_dados_db()
except Exception as e:
    st.error(f"❌ Erro ao conectar ao banco de dados: {e}")
    st.stop()

# --- HEADER DO DASHBOARD ---
st.title("SocialTracker — Inteligência Competitiva 🚀")
st.markdown("Análise avançada e cruzamento de performance de dados reais extraídos do Instagram.")
st.markdown("---")

# Abas principais
aba_individual, aba_cruzamento = st.tabs(["📊 Visão por Perfil", "🔄 Benchmarking & Cruzamentos Avançados"])

# ==========================================
# ABA 1: VISÃO INDIVIDUAL DE PERFIL
# ==========================================
with aba_individual:
    if df_perfis.empty:
        st.warning("Nenhum dado encontrado.")
    else:
        perfil_selecionado = st.sidebar.selectbox("Selecione o perfil para análise:", df_perfis['username'].unique())
        
        dados_user = df_perfis[df_perfis['username'] == perfil_selecionado].iloc[0]
        posts_user = df_posts[df_posts['username'] == perfil_selecionado]
        
        # Grid de Cards Customizados
        c1, c2, c3, c4 = st.columns(4)
        with c1:
            st.markdown(f'<div class="metric-card"><div class="metric-title">Seguidores</div><div class="metric-value">{formatar_numero_card(dados_user["seguidores"])}</div></div>', unsafe_allow_html=True)
        with c2:
            st.markdown(f'<div class="metric-card"><div class="metric-title">Seguindo</div><div class="metric-value">{formatar_numero_card(dados_user["seguindo"])}</div></div>', unsafe_allow_html=True)
        with c3:
            st.markdown(f'<div class="metric-card"><div class="metric-title">Posts no Perfil</div><div class="metric-value">{formatar_numero_card(dados_user["total_posts"])}</div></div>', unsafe_allow_html=True)
        with c4:
            st.markdown(f'<div class="metric-card"><div class="metric-title">Amostra Monitorada</div><div class="metric-value">{len(posts_user)} posts</div></div>', unsafe_allow_html=True)
            
        if not posts_user.empty:
            st.markdown("### 📊 Eficiência Média por Formato de Conteúdo")
            df_formatos = posts_user.groupby('formato')[['likes', 'comentarios', 'views']].mean().reset_index()
            
            col_g1, col_g2 = st.columns(2)
            with col_g1:
                fig_likes = px.bar(
                    df_formatos, x='formato', y='likes',
                    title="Média de Curtidas por Formato",
                    labels={'likes': 'Curtidas', 'formato': 'Formato'},
                    template='plotly_dark',
                    color='formato',
                    color_discrete_sequence=px.colors.qualitative.Pastel
                )
                fig_likes.update_layout(showlegend=False)
                fig_likes.update_traces(texttemplate='%{y:,.0f}', textposition='outside')
                fig_likes.update_layout(yaxis=dict(tickformat=".,0f"))
                st.plotly_chart(fig_likes, use_container_width=True)
                
            with col_g2:
                df_reels = posts_user[posts_user['formato'] == 'Reels']
                if not df_reels.empty:
                    fig_views = px.line(
                        df_reels.sort_values(by='data_dt'), 
                        x='data_dt', y='views',
                        title="👁️ Curva de Visualizações nos Últimos Reels",
                        labels={'views': 'Visualizações (Plays)', 'data_dt': 'Data de Postagem'},
                        template='plotly_dark',
                        markers=True,
                        line_shape='spline'
                    )
                    fig_views.update_traces(line_color='#00F0FF', marker=dict(size=8))
                    fig_views.update_layout(yaxis=dict(tickformat=".,0f"), xaxis=dict(tickformat="%d/%m/%Y"))
                    st.plotly_chart(fig_views, use_container_width=True)
                else:
                    st.info("ℹ️ Publique ou colete Reels para ativar o gráfico de curva de visualizações.")

            # Feed Analítico
            st.markdown("---")
            st.markdown("### 📑 Feed Analítico das Publicações")
            
            with st.expander("🔍 Painel de Filtros e Ordenação Avançada"):
                col_f1, col_f2, col_f3 = st.columns([1, 1, 1])
                
                with col_f1:
                    formatos_disponiveis = posts_user['formato'].unique().tolist()
                    formatos_selecionados = st.multiselect(
                        "Filtrar por Formato:", 
                        options=formatos_disponiveis, 
                        default=formatos_disponiveis
                    )
                    
                with col_f2:
                    busca_legenda = st.text_input("Buscar na Legenda (Palavra-chave):", "")
                    
                with col_f3:
                    opcoes_ordenacao = {
                        "Mais Curtidas": ("likes", False),
                        "Mais Comentários": ("comentarios", False),
                        "Mais Visualizações (Reels)": ("views", False),
                        "Maior Engajamento (%)": ("taxa_engajamento", False),
                        "Mais Recentes": ("data_dt", False),
                        "Mais Antigos": ("data_dt", True)
                    }
                    criterio_selecionado = st.selectbox("Ordenar por:", list(opcoes_ordenacao.keys()))

            # Filtragem inicial via Pandas
            df_filtrado = posts_user[posts_user['formato'].isin(formatos_selecionados)].copy()
            if busca_legenda:
                df_filtrado = df_filtrado[df_filtrado['legenda'].fillna("").str.contains(busca_legenda, case=False)]
            
            # Executa a ordenação inicial matemática padrão escolhida no seletor
            coluna_sort, order_asc = opcoes_ordenacao[criterio_selecionado]
            df_filtrado = df_filtrado.sort_values(by=coluna_sort, ascending=order_asc)

            # Enviamos os dados PUROS e originais para manter a ordenação correta por cliques
            df_exibicao = df_filtrado[['data_dt', 'formato', 'likes', 'comentarios', 'views', 'taxa_engajamento', 'url_post', 'legenda']].copy()
            df_exibicao.columns = ['Data de Postagem', 'Formato', 'Curtidas', 'Comentários', 'Visualizações', 'Engajamento', 'Link do Post', 'Legenda']

            if not df_exibicao.empty:
                # 🛠️ AJUSTE CORRETO: Enviamos dados puros e formatamos com as máscaras nativas estáveis do Streamlit
                st.dataframe(
                    df_exibicao,
                    hide_index=True,
                    use_container_width=True,
                    column_config={
                        "Data de Postagem": st.column_config.DatetimeColumn("Data de Postagem", format="DD/MM/YYYY HH:mm:ss"),
                        "Formato": st.column_config.TextColumn("Formato"),
                        # O formato ",.0f" insere os pontos de milhares e remove decimais automaticamente
                        "Curtidas": st.column_config.NumberColumn("Curtidas", format="%,.0f"), 
                        "Comentários": st.column_config.NumberColumn("Comentários", format="%,.0f"),
                        "Visualizações": st.column_config.NumberColumn("Visualizações", format="%,.0f"),
                        "Engajamento": st.column_config.NumberColumn("Engajamento", format="%.2f%%"),
                        "Link do Post": st.column_config.LinkColumn("Link do Post", display_text="Abrir Publicação 🔗"),
                        "Legenda": st.column_config.TextColumn("Legenda")
                    }
                )
                st.caption(f"Exibindo {len(df_filtrado)} publicações organizadas inicialmente por {criterio_selecionado}.")
            else:
                st.info("ℹ️ Nenhum post encontrado para os filtros selecionados.")

# ==========================================
# ABA 2: BENCHMARKING & CRUZAMENTOS AVANÇADOS
# ==========================================
with aba_cruzamento:
    st.subheader("🔄 Inteligência Competitiva Cruzada")
    
    if len(df_perfis) < 2:
        st.info("💡 Colete dados de mais perfis para habilitar o benchmarking lado a lado.")
    else:
        st.markdown("### 🏆 Share of Interactions (Quem domina o engajamento bruto?)")
        
        df_share = df_posts.groupby('username').agg(
            curtidas=('likes', 'sum'),
            comentarios=('comentarios', 'sum'),
            visualizacoes_reels=('views', 'sum')
        ).reset_index()
        df_share['total_interacoes'] = df_share['curtidas'] + df_share['comentarios']
        
        col_s1, col_s2 = st.columns([1, 1])
        with col_s1:
            fig_pizza = px.pie(
                df_share, values='total_interacoes', names='username',
                title="Divisão Percentual de Interações (Curtidas + Comentários)",
                hole=0.5,
                template='plotly_dark',
                color_discrete_sequence=['#7100E2', '#00F0FF']
            )
            st.plotly_chart(fig_pizza, use_container_width=True)
        with col_s2:
            st.markdown("<br>", unsafe_allow_html=True)
            st.dataframe(
                df_share,
                hide_index=True,
                use_container_width=True,
                column_config={
                    "username": "Perfil",
                    "curtidas": st.column_config.NumberColumn("Curtidas", format="%,.0f"),
                    "comentarios": st.column_config.NumberColumn("Comentários", format="%,.0f"),
                    "visualizacoes_reels": st.column_config.NumberColumn("Visualizações Reels", format="%,.0f"),
                    "total_interacoes": st.column_config.NumberColumn("Total Interações", format="%,.0f")
                }
            )
            
        st.markdown("---")
        st.markdown("### 👑 Top 15 Publicações Mais Engajadas do Mercado (Visão Unificada)")
        
        # CRIAÇÃO DE MÉTRICA DE VOLUME TOTAL PARA RANKING
        df_posts['total_interacoes'] = df_posts['likes'] + df_posts['comentarios']
        
        # Agora o Top 15 olha para o volume bruto, onde as grandes contas aparecem!
        top_15_geral = df_posts.sort_values(by='total_interacoes', ascending=False).head(15).copy()
        
        fig_top15 = px.bar(
            top_15_geral, x='total_interacoes', y='legenda',
            orientation='h',
            title="Top 15 por Volume Absoluto de Interações",
            labels={'total_interacoes': 'Volume de Interações', 'legenda': 'Início da Legenda'},
            color='username',
            template='plotly_dark'
        )
        fig_top15.update_layout(yaxis={'categoryorder':'total ascending'}, xaxis=dict(tickformat=",.2f"))
        st.plotly_chart(fig_top15, use_container_width=True)
        
        df_top15_exibicao = top_15_geral[['username', 'formato', 'taxa_engajamento', 'likes', 'comentarios', 'views', 'url_post', 'legenda']].copy()
        df_top15_exibicao.columns = ['Perfil', 'Formato', 'Engajamento', 'Curtidas', 'Comentários', 'Visualizações', 'Link do Post', 'Legenda']
        
        st.dataframe(
            df_top15_exibicao,
            hide_index=True,
            use_container_width=True,
            column_config={
                "Engajamento": st.column_config.NumberColumn("Engajamento", format="%.2f%%"),
                "Curtidas": st.column_config.NumberColumn("Curtidas", format="%,.0f"),
                "Comentários": st.column_config.NumberColumn("Comentários", format="%,.0f"),
                "Visualizações": st.column_config.NumberColumn("Visualizações", format="%,.0f"),
                "Link do Post": st.column_config.LinkColumn("Link do Post", display_text="Abrir Publicação 🔗")
            }
        )