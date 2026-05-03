import crypto from 'crypto';
import path from 'path';
import express from 'express';

import { LogStore } from './logging/logStore';
import { runPipeline } from './pipeline/runPipeline';
import type { SubmitBody } from './types';

const logStore = new LogStore();
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptimeSeconds: Number(process.uptime().toFixed(3)) });
});

app.get('/logs/:requestId', (req, res) => {
  const requestId = req.params.requestId ?? '';
  const snap = logStore.snapshot(requestId);
  if (!snap) {
    res.status(404).json({ error: 'Unknown requestId' });
    return;
  }
  res.json({ requestId: snap.requestId, steps: snap.steps, finishedAt: snap.finishedAt });
});

app.post('/submit', (req, res) => {
  const body = req.body as SubmitBody;
  if (!isRecord(body) || typeof body.message !== 'string' || typeof body.emoji !== 'string') {
    res.status(400).json({
      error: 'JSON body must include string fields "message" and "emoji"',
    });
    return;
  }

  const requestId = crypto.randomUUID();
  logStore.createRequest(requestId);

  res.status(202).json({ requestId });

  void runPipeline(logStore, requestId, body.message, body.emoji);
});

app.use(express.static(path.join(process.cwd(), 'public')));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const rawPort = process.env.PORT;
const port = rawPort ? Number.parseInt(rawPort, 10) : 8787;
const listenPort = Number.isFinite(port) && port > 0 ? port : 8787;

app.listen(listenPort, () => {
  console.error(`Nango Vibe Relay listening on port ${listenPort} (cwd=${process.cwd()})`);
});
