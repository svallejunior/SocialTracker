module.exports = {
  apps: [
    {
      name: 'socialtracker-dashboard',
      cwd: './dashboard',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_PATH: '/var/www/socialtracker/instagram_tracker.db',
        PYTHON_BIN: '/var/www/socialtracker/.venv/bin/python3',
        PUBLIC_MEDIA_BASE_URL: 'http://localhost:3000'
      }
    },
    {
      name: 'socialtracker-daemon',
      cwd: '.',
      script: 'publicador_instagram.py',
      args: '--daemon',
      interpreter: '/var/www/socialtracker/.venv/bin/python3',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 5000,
      max_restarts: 30,
      env: {
        DB_PATH: '/var/www/socialtracker/instagram_tracker.db',
        PYTHONIOENCODING: 'utf-8'
      }
    }
  ]
};
