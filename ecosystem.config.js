module.exports = {
  apps: [{
    name: 'prospectra',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/opt/prospectra-plus',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G',
  }],
  // Voice worker — iniciar somente após validação real de envio
  // {
  //   name: 'prospectra-voice-worker',
  //   script: 'node',
  //   args: '.dist/voice-worker.cjs',
  //   cwd: '/opt/prospectra-plus',
  //   env: {
  //     NODE_ENV: 'production',
  //     VOICE_AUTOMATION_ENABLED: 'false',
  //   },
  //   autorestart: true,
  //   max_restarts: 10,
  // },
};
