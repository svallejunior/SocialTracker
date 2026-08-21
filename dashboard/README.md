# SocialTracker Dashboard 📈

Este diretório contém a interface web (Dashboard) principal da plataforma **SocialTracker**, construída utilizando Next.js, React e Recharts.

Para ver as instruções completas de configuração do banco de dados, scripts de captura em Python e arquitetura geral, por favor consulte o [README.md principal da raiz do projeto](../README.md).

## 🚀 Como Iniciar

Certifique-se de que possui o [Node.js](https://nodejs.org) instalado em sua máquina.

1.  **Instalar dependências**:
    ```bash
    npm install
    ```

2.  **Iniciar servidor de desenvolvimento**:
    ```bash
    npm run dev
    ```

3.  **Compilar para produção**:
    ```bash
    npm run build
    ```

## 🛠️ Detalhes da Implementação

*   **Framework**: [Next.js](https://nextjs.org/) (App Router, Turbopack)
*   **Banco de Dados**: SQLite integrando diretamente com `instagram_tracker.db` na raiz
*   **Gráficos**: [Recharts](https://recharts.org/) (com curva de Projeção/Benchmark $P_{50}$ e Faixa $P_{25}-P_{75}$)
*   **Algoritmo de Benchmark**: Cálculo dinâmico por dia relativo ($D_0 \to D_N$) com imputação LOCF e Mediana ($P_{50}$) sem valores fixos cravados.
*   **Design**: CSS puro em `src/app/globals.css` aplicando paleta de cores SaaS Dark Premium

