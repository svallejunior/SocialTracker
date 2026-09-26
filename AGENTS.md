# Regras do Projeto SocialTracker

## 🚀 REGRA OBRIGATÓRIA: SEMPRE ATUALIZAR NA VPS
Após concluir qualquer alteração no código solicitada pelo usuário:
1. **Commit & Push Local**:
   ```bash
   git add <arquivos-alterados>
   git commit -m "tipo(escopo): descrição da alteração"
   git push origin main
   ```
2. **Deploy Automático na VPS**:
   Sempre execute o comando de atualização na VPS de produção para que o usuário veja as alterações imediatamente:
   ```bash
   ssh -i "C:\Users\sergi\Downloads\ssh-key-2026-09-07.key" -o BatchMode=yes ubuntu@137.131.202.56 "cd /var/www/socialtracker && git pull origin main && cd dashboard && npm run build && cd .. && pm2 reload ecosystem.config.js"
   ```
   (Ou execute `python deploy_vps.py`).
