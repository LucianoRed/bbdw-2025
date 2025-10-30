import { k8sGet } from '../utils/k8s.js';

export const listNamespacesTool = {
  name: 'list_namespaces',
  description: 'Lista namespaces do cluster com labels e status. Suporta filtro por labelSelector.',
  inputSchema: {
    type: 'object',
    properties: {
      labelSelector: { type: 'string', description: 'Ex.: "env=prod,team=security" (opcional)' },
      limit: { type: 'integer', description: 'Limitar número de resultados retornados (opcional)', minimum: 1 },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const labelSelector = typeof args.labelSelector === 'string' && args.labelSelector.trim() ? args.labelSelector.trim() : '';
    const limit = Number.isInteger(args.limit) ? args.limit : undefined;
    const qs = new URLSearchParams();
    if (labelSelector) qs.set('labelSelector', labelSelector);
    const path = `/api/v1/namespaces${qs.toString() ? `?${qs.toString()}` : ''}`;
    try {
      const data = await k8sGet(path);
      const items = (data?.items || []).map(ns => ({
        name: ns?.metadata?.name,
        labels: ns?.metadata?.labels || {},
        status: ns?.status?.phase || 'Unknown',
        creationTimestamp: ns?.metadata?.creationTimestamp || null,
      }));
      return { content: [{ type: 'json', json: limit ? items.slice(0, limit) : items }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}) ao listar namespaces: ${e.message}` }], isError: true };
    }
  }
};
