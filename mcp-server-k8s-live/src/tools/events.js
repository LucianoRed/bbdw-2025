import { k8sGet } from '../utils/k8s.js';

async function getEventsMetrics(ns = '', limit = 50) {
  const nsFilter = ns.split(',').map(s => s.trim()).filter(Boolean);
  const events = await k8sGet('/api/v1/events');
  const result = [];
  for (const e of (events.items || [])) {
    const namespace = e?.metadata?.namespace || 'default';
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    result.push({
      namespace,
      name: e?.metadata?.name || '',
      type: e?.type || 'Normal',
      reason: e?.reason || '',
      message: e?.message || '',
      involvedObject: { kind: e?.involvedObject?.kind || '', name: e?.involvedObject?.name || '' },
      firstTimestamp: e?.firstTimestamp || null,
      lastTimestamp: e?.lastTimestamp || null,
      count: e?.count || 1,
    });
  }
  result.sort((a, b) => {
    const tA = a.lastTimestamp || a.firstTimestamp || '';
    const tB = b.lastTimestamp || b.firstTimestamp || '';
    return tB.localeCompare(tA);
  });
  return result.slice(0, limit);
}

export const tool = {
  name: 'get_events',
  description: 'Obtém eventos recentes do cluster, incluindo tipo, razao, mensagem e objeto envolvido.',
  inputSchema: {
    type: 'object',
    properties: {
      ns: { type: 'string', description: 'Namespaces separados por vírgula para filtrar (opcional).' },
      limit: { type: 'number', default: 50, description: 'Número máximo de eventos a retornar (padrão: 50).' },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.ns === 'string' ? args.ns : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const data = await getEventsMetrics(ns, limit);
    return { content: [{ type: 'text', text: JSON.stringify({ events: data, total: data.length }, null, 2) }] };
  },
};
