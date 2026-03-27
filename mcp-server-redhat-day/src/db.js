import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redis;

export function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: 5000,
    });
    redis.on('connect', () => console.error('[RHD] Redis connected'));
    redis.on('error', (err) => console.error('[RHD] Redis error:', err.message));
  }
  return redis;
}

// ------------------------------------------------------------------ Keys
const KEY_DAY = (id) => `rhd:days:${id}`;
const KEY_INDEX = 'rhd:days:all';

// ------------------------------------------------------------------ Days CRUD

export async function createDay({ clientName, clientContact, date, type, clientInterests }) {
  const r = getRedis();
  const id = uuidv4();
  const now = new Date().toISOString();
  const day = {
    id,
    clientName,
    clientContact: clientContact || '',
    date,
    type, // 'full' | 'morning' | 'afternoon'
    clientInterests: clientInterests || [],
    presentations: [],
    createdAt: now,
    updatedAt: now,
  };
  await r.set(KEY_DAY(id), JSON.stringify(day));
  await r.sadd(KEY_INDEX, id);
  return day;
}

export async function listDays() {
  const r = getRedis();
  const ids = await r.smembers(KEY_INDEX);
  if (!ids.length) return [];
  const pipeline = r.pipeline();
  for (const id of ids) pipeline.get(KEY_DAY(id));
  const results = await pipeline.exec();
  return results
    .map(([err, val]) => (err || !val ? null : JSON.parse(val)))
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function getDay(id) {
  const r = getRedis();
  const raw = await r.get(KEY_DAY(id));
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function saveDay(day) {
  const r = getRedis();
  day.updatedAt = new Date().toISOString();
  await r.set(KEY_DAY(day.id), JSON.stringify(day));
  return day;
}

export async function deleteDay(id) {
  const r = getRedis();
  const day = await getDay(id);
  if (!day) return null;
  await r.del(KEY_DAY(id));
  await r.srem(KEY_INDEX, id);
  return day;
}

// ------------------------------------------------------------------ Presentation helpers

export function addPresentation(day, { product, title, description, presenter, durationMinutes, discussionMinutes }) {
  const id = uuidv4();
  const order = (day.presentations.length > 0
    ? Math.max(...day.presentations.map((p) => p.order)) + 1
    : 1);
  const presentation = {
    id,
    product: product || '',
    title: title || product || '',
    description: description || '',
    presenter: presenter || '',
    durationMinutes: Number(durationMinutes) || 20,
    discussionMinutes: Number(discussionMinutes) || 10,
    order,
  };
  day.presentations.push(presentation);
  return presentation;
}

export function removePresentation(day, presentationId) {
  const idx = day.presentations.findIndex((p) => p.id === presentationId);
  if (idx === -1) return null;
  const [removed] = day.presentations.splice(idx, 1);
  // Re-order
  day.presentations.forEach((p, i) => { p.order = i + 1; });
  return removed;
}

export function updatePresentation(day, presentationId, fields) {
  const p = day.presentations.find((x) => x.id === presentationId);
  if (!p) return null;
  const allowed = ['product', 'title', 'description', 'presenter', 'durationMinutes', 'discussionMinutes', 'order'];
  for (const key of allowed) {
    if (fields[key] !== undefined) p[key] = fields[key];
  }
  if (fields.durationMinutes !== undefined) p.durationMinutes = Number(fields.durationMinutes);
  if (fields.discussionMinutes !== undefined) p.discussionMinutes = Number(fields.discussionMinutes);
  if (fields.order !== undefined) p.order = Number(fields.order);
  return p;
}

// ------------------------------------------------------------------ Registrations

const KEY_REG     = (dayId, regId) => `rhd:reg:${dayId}:${regId}`;
const KEY_REG_IDX = (dayId)        => `rhd:reg:idx:${dayId}`;

export async function addRegistration(dayId, {
  nome, email, empresa, area, cargo,
  funcaoDescricao, telefone, whatsapp,
  nivelDev, nivelOps, nivelContainers,
  nivelKubernetes, nivelOpenShift,
  nivelSegContainers, nivelSegKubernetes,
}) {
  const r = getRedis();
  const id = uuidv4();
  const now = new Date().toISOString();
  const reg = {
    id,
    dayId,
    nome:               nome         || '',
    email:              email        || '',
    empresa:            empresa      || '',
    area:               area         || '',
    cargo:              cargo        || '',
    funcaoDescricao:    funcaoDescricao    || '',
    telefone:           telefone           || '',
    whatsapp:           whatsapp           || '',
    nivelDev:           Number(nivelDev)           || 0,
    nivelOps:           Number(nivelOps)           || 0,
    nivelContainers:    Number(nivelContainers)    || 0,
    nivelKubernetes:    Number(nivelKubernetes)    || 0,
    nivelOpenShift:     Number(nivelOpenShift)     || 0,
    nivelSegContainers: Number(nivelSegContainers) || 0,
    nivelSegKubernetes: Number(nivelSegKubernetes) || 0,
    createdAt: now,
  };
  await r.set(KEY_REG(dayId, id), JSON.stringify(reg));
  await r.sadd(KEY_REG_IDX(dayId), id);
  return reg;
}

export async function listRegistrations(dayId) {
  const r = getRedis();
  const ids = await r.smembers(KEY_REG_IDX(dayId));
  if (!ids.length) return [];
  const pipeline = r.pipeline();
  for (const id of ids) pipeline.get(KEY_REG(dayId, id));
  const results = await pipeline.exec();
  return results
    .map(([err, val]) => (err || !val ? null : JSON.parse(val)))
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function deleteRegistration(dayId, regId) {
  const r = getRedis();
  const raw = await r.get(KEY_REG(dayId, regId));
  if (!raw) return null;
  const reg = JSON.parse(raw);
  await r.del(KEY_REG(dayId, regId));
  await r.srem(KEY_REG_IDX(dayId), regId);
  return reg;
}

export async function deleteAllRegistrations(dayId) {
  const r = getRedis();
  const ids = await r.smembers(KEY_REG_IDX(dayId));
  if (!ids.length) return 0;
  const pipeline = r.pipeline();
  for (const id of ids) pipeline.del(KEY_REG(dayId, id));
  pipeline.del(KEY_REG_IDX(dayId));
  await pipeline.exec();
  return ids.length;
}

