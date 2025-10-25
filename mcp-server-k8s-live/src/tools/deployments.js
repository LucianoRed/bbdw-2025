import { k8sGet } from '../utils/k8s.js';

async function getDeploymentsMetrics(ns = '') {
  const nsFilter = ns.split(',').map(s => s.trim()).filter(Boolean);
  const deployments = await k8sGet('/apis/apps/v1/deployments');
  const result = [];
  for (const d of (deployments.items || [])) {
    const namespace = d?.metadata?.namespace || 'default';
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    const name = d?.metadata?.name || 'unknown';
    const replicas = d?.spec?.replicas || 0;
    const readyReplicas = d?.status?.readyReplicas || 0;
    const availableReplicas = d?.status?.availableReplicas || 0;
    const updatedReplicas = d?.status?.updatedReplicas || 0;
    result.push({
      namespace,
      name,
      replicas,
      readyReplicas,
      availableReplicas,
      updatedReplicas,
      status: readyReplicas === replicas ? 'Ready' : 'Not Ready',
      conditions: d?.status?.conditions || [],
    });
  }
  return result;
}

export const tool = {
  name: 'get_deployments',
  description: 'Obtém métricas de todos os Deployments do cluster, incluindo status de réplicas, disponibilidade e condições.',
  inputSchema: {
    type: 'object',
    properties: {
      ns: { type: 'string', description: 'Namespaces separados por vírgula para filtrar (opcional).' },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.ns === 'string' ? args.ns : '';
    const data = await getDeploymentsMetrics(ns);
    return { content: [{ type: 'text', text: JSON.stringify({ deployments: data, total: data.length }, null, 2) }] };
  },
};
