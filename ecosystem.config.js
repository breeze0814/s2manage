// PM2 进程编排：Web 与 worker 是两个独立进程，分别托管。
// 用法见 部署指南.md「用 PM2 托管」一节：
//   npm run pm2:start
//   pm2 logs / pm2 restart all / pm2 stop all
// 端口、worker 间隔等环境变量在下面 env 里改；数据库 Setting 优先于环境变量。
module.exports = {
  apps: [
    {
      name: "s2a-manager-web",
      cwd: __dirname,
      script: "npm",
      args: "run start",
      // Next.js 单进程即可，不要用 cluster（next start 自身不支持多实例共享端口）。
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Next.js 不从 .env 读取 PORT，需作为进程级环境变量传入。
      env: {
        NODE_ENV: "production",
        PORT: 15074,
      },
      out_file: "logs/pm2-web-out.log",
      error_file: "logs/pm2-web-error.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "s2a-manager-worker",
      cwd: __dirname,
      script: "npm",
      args: "run worker",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // 下列默认值仅在数据库未配置对应 Setting 时生效。
      env: {
        NODE_ENV: "production",
        S2A_WORKER_INTERVAL_SECONDS: 600,
        S2A_UPSTREAM_MONITOR_TIMEOUT_SECONDS: 45,
        S2A_UPSTREAM_MONITOR_CONCURRENCY: 3,
      },
      out_file: "logs/pm2-worker-out.log",
      error_file: "logs/pm2-worker-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
