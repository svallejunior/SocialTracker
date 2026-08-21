# SocialTracker 📈

Plataforma de inteligência competitiva e gestão operacional para monitoramento de performance e dados financeiros de perfis do Instagram.

O projeto é dividido em duas partes principais:
1. **Backend & Scripts de Coleta (Python)**: Scripts para raspagem de dados via Apify, ingestão direta no banco SQLite e uma aplicação Streamlit para análise inicial.
2. **Dashboard Interativo (Next.js)**: Painel web avançado de alta performance com estatísticas, gráficos interativos de evolução, detecção de posts virais e controle financeiro completo de rateio.

---

## 📂 Estrutura do Repositório

```text
SocialTracker/
├── database.py              # Scripts auxiliares para alteração direta de lançamentos
├── apify.py                 # Integração e testes com a API do Apify (Instagram Scraper)
├── ingestion.py             # Script de ingestão diária de dados dos perfis ativos
├── perfis_monitorados.py    # Script para inicializar e listar perfis a monitorar
├── criar_tabelas.py         # Executor de scripts SQL no banco de dados local
├── sql_lista.py             # Script utilitário para listar dados do SQLite
├── sql_projecao.py          # Cálculo SQL dinâmico de benchmark (P50 Mediana + LOCF)
├── check_db.py              # Script rápido de diagnóstico da conexão do banco
├── check_data.py            # Validador de dados no banco de controle
├── schema_controle.sql      # Schema SQL de controle operacional de perfis
├── instagram_tracker.db     # Banco de dados SQLite principal
├── app.py                   # Interface experimental e dashboard analítico em Streamlit
└── dashboard/               # Interface principal construída em Next.js
    ├── src/app/             # Roteamento e páginas da aplicação Next.js (App Router)
    │   ├── api/             # API Endpoints (/api/data e /api/controle)
    │   ├── page.tsx         # Dashboard Principal (Next.js React Server Component)
    │   └── globals.css      # Sistema de design visual customizado (SaaS Premium Dark)
    └── src/components/      # Componentes reutilizáveis (ex: ModalLancamento)
```

---

## 💾 Modelagem do Banco de Dados (`instagram_tracker.db`)

O banco SQLite é compartilhado entre a ingestão em Python e a interface em Next.js. O schema é composto pelas tabelas:

*   `perfis_monitorados`: Registros dos perfis do Instagram em acompanhamento.
    *   `username` (TEXT - PK): Identificador da conta.
    *   `status` (TEXT): Status de coleta (`ATIVO` / `INATIVO`).
    *   `meu_perfil` (INTEGER): Flag `0` ou `1` identificando se o perfil pertence ao usuário.
    *   `criado_em` (DATETIME): Timestamp de cadastro.
*   `perfis_historico` / `seguidores_historico`: Armazenam o histórico de crescimento de seguidores por coleta.
*   `posts_historico`: Histórico de publicações raspadas, contendo curtidas, comentários, views, taxa de engajamento e multiplicador de performance.
*   `controle_perfis`: Dados operacionais manuais de perfis (configurados na aba *Controle*).
    *   Inclui nome, nascimento, e-mail, links de linktree, data de início da operação, telegram, estoque de fotos, status operacional e observações.
*   `lancamentos`: Registro financeiro (Receitas e Despesas) individuais ou rateados entre perfis.
    *   Registra o valor bruto em BRL, taxa de conversão cambial se em USD/EUR, flag de rateamento e identificador do grupo de rateio.

---

## 🚀 Como Executar

### 1. Coleta e Ingestão de Dados (Python)

Certifique-se de ter as dependências instaladas:
```bash
pip install apify-client streamlit pandas plotly sqlite3
```

*   **Configurar Perfis Alvo**:
    ```bash
    python perfis_monitorados.py
    ```
*   **Rodar Ingestão Diária**:
    ```bash
    python ingestion.py
    ```
*   **Iniciar App Streamlit**:
    ```bash
    streamlit run app.py
    ```

### 2. Dashboard Web (Next.js)

O painel moderno possui um design escuro premium com visualizações usando Recharts.

Navegue até a pasta do dashboard:
```bash
cd dashboard
```

Instale as dependências e inicie em modo de desenvolvimento:
```bash
npm install
npm run dev
```

Abra o navegador em `http://localhost:3000`.

---

## 🛠️ Correções de Erros Efetuadas Recentemente

Durante a última verificação de integridade, identificamos e solucionamos erros que impediam a compilação correta da aplicação Next.js:

1.  **ReferenceError: `randomUUID`**: Em `src/app/api/controle/route.ts`, a geração de UUIDs para lançamentos rateados dependia de `randomUUID()` sem importação. Importamos `randomUUID` de `crypto`.
2.  **Type Error em `page.tsx`**:
    *   A propriedade `data_lancamento` recebia uma conversão desnecessária para `Number` na aba de rascunhos. Alterado para `string` padrão.
    *   Os componentes de `<Tooltip>` do Recharts continham definições de parâmetros muito estritas (`label: string` e `name: string`). As assinaturas foram atualizadas para aceitar tipos flexíveis (`any`), alinhando-se com as tipagens internas da biblioteca.
3.  **State Type Mismatch em `modalLancamento`**: O estado no React guardava apenas `{ username: string }`, mas recebia a propriedade `tipo`. Expandimos o tipo da variável de estado para `{ username: string; tipo: string; } | null` e passamos a propriedade `tipo` dinamicamente para o componente do modal.
4.  **Resíduos de Compilação**: Arquivos temporários duplicados (como `page20060712.tsx`) foram renomeados para `.bak` para evitar que o compilador do Next.js fizesse a verificação de tipo em códigos inativos.
5.  **State Initializer Type Mismatch**: Em `ModalLancamento.tsx`, a inicialização do estado com `useState(dadosIniciais)` foi corrigida para `useState(() => dadosIniciais("recebido"))` para satisfazer a assinatura estrita do React.

---

## 📊 Algoritmo Dinâmico de Benchmark ($P_{50}$ e LOCF)

O cálculo do valor acumulado esperado do benchmark por dia relativo $D$ é 100% dinâmico e livre de constantes rígidas no código:

### 1. Definição Matemática
Dado um conjunto de perfis de benchmark $B = \{p_1, p_2, \dots, p_n\}$ onde $\text{meu\_perfil} = 0$:

* **Dia Relativo ($D$)**:
  $$D(p, t) = \lfloor \text{data\_coleta}(t) - \text{primeira\_postagem}(p) \rfloor$$
* **Imputação de Lacunas / Série Não-Decrescente (LOCF - Last Observation Carried Forward)**:
  $$\hat{S}(p, D) = \max_{k \le D} \Big( S(p, k) \Big)$$
* **Métrica Esperada no Dia $D$ (Mediana Esperada $P_{50}$)**:
  $$P_{50}(D) = \text{mediana}\Big( \big\{ \hat{S}(p, D) \mid p \in B \big\} \Big)$$

### 2. Execução via CLI (Python)
Para visualizar a curva esperada do benchmark calculada via SQL puro no banco de dados:
```bash
python sql_projecao.py
```

