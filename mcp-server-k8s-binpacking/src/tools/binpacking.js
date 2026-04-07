import { buildLiveBinpacking, getClusterSnapshot } from './cluster-snapshot.js';

export const getBinpackingTool = {
  name: 'get_binpacking',
  description: 'Retorna o snapshot atual de binpacking do cluster por CPU ou memoria, incluindo nos, bins, pending e razao agregada.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: { type: 'string', enum: ['cpu', 'memory'], default: 'cpu' },
      ns: { type: 'string', description: 'Namespaces separados por virgula.' },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const resource = args.resource === 'memory' ? 'memory' : 'cpu';
    const snapshot = await getClusterSnapshot({ namespaces: typeof args.ns === 'string' ? args.ns : '' });
    const data = buildLiveBinpacking(snapshot, resource);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
