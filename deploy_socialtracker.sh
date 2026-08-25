#!/usr/bin/env bash
# ==============================================================================
# 🚀 SocialTracker - Script de Deploy Automatizado (Ubuntu / VPS / Daytona)
# ==============================================================================
# Execução:
#   chmod +x deploy_socialtracker.sh
#   VPS_API_KEY=minha_chave_secreta ./deploy_socialtracker.sh
# ==============================================================================

set -e

# Cores para logs no terminal
VERDE='\033[0;32m'
AZUL='\033[0;34m'
AMARELO='\033[1;33m'
VERMELHO='\033[0;31m'
NC='\033[0m' # Sem cor

echo -e "${AZUL}====================================================${NC}"
echo -e "${VERDE}   🚀 INICIANDO DEPLOY NATIVO DO SOCIALTRACKER     ${NC}"
echo -e "${AZUL}====================================================${NC}"

# 1. Diretório do Projeto
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo -e "${AMARELO}📂 Diretório base detectado:${NC} $PROJECT_DIR"

# API Key (pode ser passada como variável de ambiente)
if [ -z "$VPS_API_KEY" ]; then
    VPS_API_KEY="socialtracker-$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | head -c 32)"
    echo -e "${AMARELO}⚠️  VPS_API_KEY não definida. Gerada automaticamente:${NC} ${VPS_API_KEY}"
    echo -e "${AMARELO}   Configure essa chave na Vercel como VPS_API_KEY!${NC}"
fi

# 2. Atualização e Instalação de Pacotes do Sistema Operacional
echo -e "\n${AZUL}[1/6] Atualizando repositórios e instalando dependências do sistema...${NC}"
sudo apt-get update -y
sudo apt-get install -y \
    curl \
    git \
    tmux \
    sqlite3 \
    python3 \
    python3-pip \
    python3-venv \
    build-essential

# 3. Verificação/Instalação do Node.js 20 LTS e PM2
echo -e "\n${AZUL}[2/6] Verificando ambiente Node.js e PM2...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${AMARELO}Instalando Node.js 20 LTS via NodeSource...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${VERDE}✓ Node.js $(node -v) já está instalado.${NC}"
fi

if ! command -v pm2 &> /dev/null; then
    echo -e "${AMARELO}Instalando PM2 globalmente...${NC}"
    sudo npm install -g pm2
else
    echo -e "${VERDE}✓ PM2 já está instalado.${NC}"
fi

# 4. Instalação das Dependências Python (Ingestion, Anomalias e API Server)
echo -e "\n${AZUL}[3/6] Instalando dependências do Python...${NC}"
pip3 install --upgrade pip --break-system-packages 2>/dev/null || pip3 install --upgrade pip
pip3 install apify-client pandas requests flask --break-system-packages 2>/dev/null || \
    pip3 install apify-client pandas requests flask
echo -e "${VERDE}✓ Dependências do Python instaladas com sucesso.${NC}"

# 5. Inicialização do API Server Flask via PM2 (porta 5000)
echo -e "\n${AZUL}[4/6] Iniciando API Server Flask (porta 5000)...${NC}"
API_SCRIPT="$PROJECT_DIR/api_server.py"
if [ -f "$API_SCRIPT" ]; then
    pm2 delete socialtracker-api 2>/dev/null || true
    pm2 start "$API_SCRIPT" \
        --name "socialtracker-api" \
        --interpreter python3 \
        --env VPS_API_KEY="$VPS_API_KEY" \
        --env DB_PATH="$PROJECT_DIR/instagram_tracker.db"
    pm2 save
    echo -e "${VERDE}✓ API Flask rodando na porta 5000 via PM2!${NC}"
else
    echo -e "${VERMELHO}❌ api_server.py não encontrado em $PROJECT_DIR!${NC}"
    exit 1
fi

# 6. Build e Inicialização do Dashboard Next.js com PM2
echo -e "\n${AZUL}[5/6] Instalando dependências do Next.js e compilando o Dashboard...${NC}"
DASHBOARD_DIR="$PROJECT_DIR/dashboard"

if [ -d "$DASHBOARD_DIR" ]; then
    cd "$DASHBOARD_DIR"

    # Cria .env.local com a URL da VPS apontando para localhost
    cat > .env.local <<EOF
VPS_API_URL=http://localhost:5000
VPS_API_KEY=${VPS_API_KEY}
EOF
    echo -e "${VERDE}✓ .env.local configurado com VPS_API_URL=http://localhost:5000${NC}"

    npm install
    echo -e "${AMARELO}Gerando build de produção do Next.js...${NC}"
    npm run build

    pm2 delete socialtracker-dashboard 2>/dev/null || true
    pm2 start npm --name "socialtracker-dashboard" -- start -- -p 3000
    pm2 save

    # Configura PM2 para inicializar automaticamente com o boot da VPS
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $(whoami) --hp $HOME 2>/dev/null || true
    echo -e "${VERDE}✓ Dashboard Next.js em execução na porta 3000 via PM2!${NC}"
else
    echo -e "${VERMELHO}❌ Diretório dashboard/ não encontrado em $DASHBOARD_DIR!${NC}"
    exit 1
fi

cd "$PROJECT_DIR"

# 7. Configuração do Cron Job (Ingestão Diária 2x ao dia: 06:00 e 18:00)
echo -e "\n${AZUL}[6/6] Configurando rotina de coleta automática (Cron Job)...${NC}"
PYTHON_BIN=$(which python3)
INGESTION_SCRIPT="$PROJECT_DIR/ingestion.py"
LOG_FILE="$PROJECT_DIR/ingestion.log"

CRON_JOB_1="0 6 * * * cd $PROJECT_DIR && $PYTHON_BIN $INGESTION_SCRIPT >> $LOG_FILE 2>&1"
CRON_JOB_2="0 18 * * * cd $PROJECT_DIR && $PYTHON_BIN $INGESTION_SCRIPT >> $LOG_FILE 2>&1"

( crontab -l 2>/dev/null | grep -v "$INGESTION_SCRIPT" || true ; echo "$CRON_JOB_1" ; echo "$CRON_JOB_2" ) | crontab -

echo -e "${VERDE}✓ Cron configurado: 06:00 e 18:00 diariamente.${NC}"

# 8. Resumo Final
echo -e "\n${VERDE}====================================================${NC}"
echo -e "${VERDE}   🎉 DEPLOY CONCLUÍDO COM SUCESSO!                 ${NC}"
echo -e "${VERDE}====================================================${NC}"
echo -e "🗄️  ${AZUL}API REST (Flask):${NC}   http://localhost:5000"
echo -e "📊 ${AZUL}Dashboard (Next):${NC}   http://localhost:3000"
echo -e "⚙️  ${AZUL}Status do PM2:${NC}      pm2 status"
echo -e "📜 ${AZUL}Logs do Flask API:${NC}  pm2 logs socialtracker-api"
echo -e "📜 ${AZUL}Logs do Next.js:${NC}    pm2 logs socialtracker-dashboard"
echo -e "📈 ${AZUL}Logs de Ingestão:${NC}   tail -f $LOG_FILE"
echo -e ""
echo -e "${AMARELO}🔑  IMPORTANTE — Configure na Vercel as variáveis abaixo:${NC}"
echo -e "   VPS_API_URL = http://SEU_IP_PUBLICO:5000"
echo -e "   VPS_API_KEY = ${VPS_API_KEY}"
echo -e "${VERDE}====================================================${NC}\n"


set -e

# Cores para logs no terminal
VERDE='\033[0;32m'
AZUL='\033[0;34m'
AMARELO='\033[1;33m'
VERMELHO='\033[0;31m'
NC='\033[0m' # Sem cor

echo -e "${AZUL}====================================================${NC}"
echo -e "${VERDE}   🚀 INICIANDO DEPLOY NATIVO DO SOCIALTRACKER     ${NC}"
echo -e "${AZUL}====================================================${NC}"

# 1. Diretório do Projeto
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo -e "${AMARELO}📂 Diretório base detectado:${NC} $PROJECT_DIR"

# 2. Atualização e Instalação de Pacotes do Sistema Operacional
echo -e "\n${AZUL}[1/5] Atualizando repositórios e instalando dependências do sistema...${NC}"
sudo apt-get update -y
sudo apt-get install -y \
    curl \
    git \
    tmux \
    sqlite3 \
    python3 \
    python3-pip \
    python3-venv \
    build-essential

# 3. Verificação/Instalação do Node.js 20 LTS e PM2
echo -e "\n${AZUL}[2/5] Verificando ambiente Node.js e PM2...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${AMARELO}Instalando Node.js 20 LTS via NodeSource...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${VERDE}✓ Node.js $(node -v) já está instalado.${NC}"
fi

if ! command -v pm2 &> /dev/null; then
    echo -e "${AMARELO}Instalando PM2 globalmente...${NC}"
    sudo npm install -g pm2
else
    echo -e "${VERDE}✓ PM2 já está instalado.${NC}"
fi

# 4. Instalação das Dependências Python (Ingestion & Anomalias)
echo -e "\n${AZUL}[3/5] Instalando dependências do Python...${NC}"
# Permite instalar pacotes Python globalmente no Ubuntu 24.04+ com fallback seguro
pip3 install --upgrade pip --break-system-packages 2>/dev/null || pip3 install --upgrade pip
pip3 install apify-client pandas requests --break-system-packages 2>/dev/null || pip3 install apify-client pandas requests

echo -e "${VERDE}✓ Dependências do Python instaladas com sucesso.${NC}"

# 5. Build e Inicialização do Dashboard Next.js com PM2
echo -e "\n${AZUL}[4/5] Instalando dependências do Next.js e compilando o Dashboard...${NC}"
DASHBOARD_DIR="$PROJECT_DIR/dashboard"

if [ -d "$DASHBOARD_DIR" ]; then
    cd "$DASHBOARD_DIR"
    npm install
    
    echo -e "${AMARELO}Gerando build de produção do Next.js...${NC}"
    npm run build

    echo -e "${AMARELO}Configurando processo PM2...${NC}"
    pm2 delete socialtracker-dashboard 2>/dev/null || true
    pm2 start npm --name "socialtracker-dashboard" -- start -- -p 3000
    pm2 save
    
    # Configura PM2 para inicializar automaticamente com o boot da VPS
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $(whoami) --hp $HOME 2>/dev/null || true
    echo -e "${VERDE}✓ Dashboard Next.js em execução na porta 3000 via PM2!${NC}"
else
    echo -e "${VERMELHO}❌ Diretório dashboard/ não encontrado em $DASHBOARD_DIR!${NC}"
    exit 1
fi

cd "$PROJECT_DIR"

# 6. Configuração do Cron Job (Ingestão Diária 2x ao dia: 06:00 e 18:00)
echo -e "\n${AZUL}[5/5] Configurando rotina de coleta automática (Cron Job)...${NC}"
PYTHON_BIN=$(which python3)
INGESTION_SCRIPT="$PROJECT_DIR/ingestion.py"
LOG_FILE="$PROJECT_DIR/ingestion.log"

CRON_JOB_1="0 6 * * * cd $PROJECT_DIR && $PYTHON_BIN $INGESTION_SCRIPT >> $LOG_FILE 2>&1"
CRON_JOB_2="0 18 * * * cd $PROJECT_DIR && $PYTHON_BIN $INGESTION_SCRIPT >> $LOG_FILE 2>&1"

# Atualiza a crontab sem duplicar entradas
( crontab -l 2>/dev/null | grep -v "$INGESTION_SCRIPT" || true ; echo "$CRON_JOB_1" ; echo "$CRON_JOB_2" ) | crontab -

echo -e "${VERDE}✓ Cron configurado:${NC}"
echo -e "   • 06:00 UTC/Local: Ingestão matinal"
echo -e "   • 18:00 UTC/Local: Ingestão noturna"
echo -e "   • Logs salvos em: $LOG_FILE"

# 7. Resumo Final
echo -e "\n${VERDE}====================================================${NC}"
echo -e "${VERDE}   🎉 DEPLOY CONCLUÍDO COM SUCESSO!                 ${NC}"
echo -e "${VERDE}====================================================${NC}"
echo -e "📊 ${AZUL}Dashboard Web:${NC}      http://localhost:3000 (ou IP_DA_SUA_VPS:3000)"
echo -e "⚙️  ${AZUL}Status do PM2:${NC}      pm2 status"
echo -e "📜 ${AZUL}Logs do Next.js:${NC}    pm2 logs socialtracker-dashboard"
echo -e "📈 ${AZUL}Logs de Ingestão:${NC}   tail -f $LOG_FILE"
echo -e "🤖 ${AZUL}Testar Ingestão:${NC}    python3 $INGESTION_SCRIPT"
echo -e "${VERDE}====================================================${NC}\n"
