import { getClusterSnapshot } from './cluster-snapshot.js';

function toToolResponse(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export const listPodUsageTool = {
  name: 'list_pod_usage',
  description: 'Lista os pods com namespace, no, owner, requests e uso real para validar se ha margem de consolidacao de carga.',
  inputSchema: {
    type: 'object',
    properties: {
      ns: { type: 'string', description: 'Namespaces separados por virgula.' },
      node: { type: 'string', description: 'Filtra por nome do no.' },
      limit: { type: 'integer', description: 'Quantidade maxima de pods retornados.', minimum: 1, default: 200 },
      sortBy: { type: 'string', enum: ['cpu_request', 'memory_request', 'cpu_usage', 'memory_usage'], default: 'cpu_usage' },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const snapshot = await getClusterSnapshot({ namespaces: typeof args.ns === 'string' ? args.ns : '' });
    const nodeFilter = typeof args.node === 'string' ? args.node : '';
    const limit = Number.isInteger(args.limit) ? args.limit : 200;
    const sortBy = typeof args.sortBy === 'string' ? args.sortBy : 'cpu_usage';

    const sorters = {
      cpu_request: (pod) => pod.cpuRequestedMillicores,
      memory_request: (pod) => pod.memoryRequestedBytes,
      cpu_usage: (pod) => pod.cpuUsedMillicores,
      memory_usage: (pod) => pod.memoryUsedBytes,
    };

    const sorter = sorters[sortBy] || sorters.cpu_usage;
    const items = snapshot.pods
      .filter((pod) => !nodeFilter || pod.nodeName === nodeFilter)
      .sort((a, b) => sorter(b) - sorter(a))
      .slice(0, limit);

    return toToolResponse({
      metricsAvailable: snapshot.metricsAvailable,
      total: items.length,
      items,
    });
  },
};
