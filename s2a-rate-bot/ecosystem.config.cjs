const common = {
  cwd: __dirname,
  script: "npm",
  instances: 1,
  exec_mode: "fork",
  autorestart: true,
  max_restarts: 10,
  restart_delay: 5000,
  merge_logs: true,
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: "s2a-rate-bot-api",
      args: "run api",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 18074,
        DATABASE_URL: "file:./data/s2a-rate-bot.db",
      },
      out_file: "logs/pm2-api-out.log",
      error_file: "logs/pm2-api-error.log",
    },
    {
      ...common,
      name: "s2a-rate-bot-worker",
      args: "run worker",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "file:./data/s2a-rate-bot.db",
      },
      out_file: "logs/pm2-worker-out.log",
      error_file: "logs/pm2-worker-error.log",
    },
    {
      ...common,
      name: "s2a-rate-bot-bot",
      args: "run bot",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "file:./data/s2a-rate-bot.db",
      },
      out_file: "logs/pm2-bot-out.log",
      error_file: "logs/pm2-bot-error.log",
    },
  ],
};
