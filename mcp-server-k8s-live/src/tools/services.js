import { k8sGet } from '../utils/k8s.js';

async function getServicesMetrics(ns = '') {
  const nsFilter = ns.split(',').map(s => s.trim()).filter(Boolean);
  const services = await k8sGet('/api/v1/services');
  const result = [];
  for (const s of (services.items || [])) {
    const namespace = s?.metadata?.namespace || 'default';
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    const name = s?.metadata?.name || 'unknown';
    const type = s?.spec?.type || 'ClusterIP';
    const clusterIP = s?.spec?.clusterIP || 'None';
    const ports = (s?.spec?.ports || []).map(p => ({
      name: p?.name || '',
      port: p?.port || 0,
      targetPort: p?.targetPort || '',
      protocol: p?.protocol || 'TCP',
    }));
    result.push({ namespace, name, type, clusterIP, ports, selector: s?.spec?.selector || {} });
  }
  return result;
}

export const tool = {
  name: 'get_services',
  description: 'Obtém dados de todos os Services do cluster, incluindo tipo, ClusterIP, portas e seletores.',
  inputSchema: {
    type: 'object',
    properties: {
      ns: { type: 'string', description: 'Namespaces separados por vírgula para filtrar (opcional).' },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.ns === 'string' ? args.ns : '';
    const data = await getServicesMetrics(ns);
    return { content: [{ type: 'text', text: JSON.stringify({ services: data, total: data.length }, null, 2) }] };
  },
};
