// API do worker Go: recebe a ação por-lead do Prospectra e enfileira no Redis.
// Autenticação: header x-go-secret == GO_SECRET. O worker (worker.js) consome a fila.
const express = require('express');
const Redis = require('ioredis');

const app = express();
app.use(express.json({ limit: '256kb' }));

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const QUEUE = process.env.QUEUE_NAME || 'prospectra:acoes';
const GO_SECRET = (process.env.GO_SECRET || '').trim();
const TIPOS = ['invite', 'message', 'comment', 'react'];

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'prospectra-go' }));

app.post('/acoes', async (req, res) => {
  if (!GO_SECRET || req.get('x-go-secret') !== GO_SECRET) return res.status(401).json({ error: 'nao autorizado' });
  const { tarefa_id, conta_id, tipo, profile_url, texto, webhook_url } = req.body || {};
  if (!tarefa_id || !conta_id || !tipo || !profile_url) return res.status(400).json({ error: 'tarefa_id, conta_id, tipo e profile_url sao obrigatorios' });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'tipo invalido' });
  await redis.rpush(QUEUE, JSON.stringify({ tarefa_id, conta_id, tipo, profile_url, texto: texto || '', webhook_url: webhook_url || '', enqueued_at: new Date().toISOString() }));
  return res.status(201).json({ tarefa_id, status: 'enfileirada' });
});

const PORT = Number(process.env.PORT || 3200);
app.listen(PORT, '127.0.0.1', () => console.log(`prospectra-go API em 127.0.0.1:${PORT}`));
