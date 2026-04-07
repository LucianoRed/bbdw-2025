import { buildOptimizationReport, getClusterSnapshot } from './cluster-snapshot.js';

export const getOptimizationReportTool = {
  name: 'get_binpacking_optimization',
  description: 'Analisa margem de consolidacao de workers com base em requests, uso real e pods pendentes, retornando simulacoes de remocao de nos.',
  inputSchema: {
    type: 'object',
    properties: {
      ns: { type: 'string', description: 'Namespaces separados por virgula.' },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const snapshot = await getClusterSnapshot({ namespaces: typeof args.ns === 'string' ? args.ns : '' });
    const report = buildOptimizationReport(snapshot);
    return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
  },
};
