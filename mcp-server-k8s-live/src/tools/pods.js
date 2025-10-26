import { k8sDelete, k8sGet } from '../utils/k8s.js';

function buildDeleteQuery({ dryRun, gracePeriodSeconds, propagationPolicy }) {
  const params = new URLSearchParams();
  if (dryRun) params.set('dryRun', 'All');
  if (Number.isInteger(gracePeriodSeconds) && gracePeriodSeconds >= 0) params.set('gracePeriodSeconds', String(gracePeriodSeconds));
  if (typeof propagationPolicy === 'string' && ['Foreground','Background','Orphan'].includes(propagationPolicy)) params.set('propagationPolicy', propagationPolicy);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const deletePodTool = {
  name: 'delete_pod',
  description: 'Remove (mata) um Pod específico por nome e namespace. Requer confirmação explícita (confirm: true). Suporta dryRun e opções de deleção (gracePeriodSeconds, propagationPolicy).',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace do Pod.' },
      name: { type: 'string', description: 'Nome do Pod a remover.' },
      confirm: { type: 'boolean', description: 'Confirmação obrigatória para operações de escrita.' },
      dryRun: { type: 'boolean', description: 'Se true, faz deleção em dry-run (?dryRun=All).' },
      gracePeriodSeconds: { type: 'integer', description: 'Tempo de graça antes de encerrar o pod (0 para matar imediatamente).', minimum: 0 },
      propagationPolicy: { type: 'string', enum: ['Foreground','Background','Orphan'], description: 'Política de propagação de deleção.' },
    },
    required: ['namespace','name','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.namespace === 'string' ? args.namespace : '';
    const name = typeof args.name === 'string' ? args.name : '';
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;
    const gracePeriodSeconds = Number.isInteger(args.gracePeriodSeconds) ? args.gracePeriodSeconds : undefined;
    const propagationPolicy = typeof args.propagationPolicy === 'string' ? args.propagationPolicy : undefined;

    if (!ns) return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
    if (!name) return { content: [{ type: 'text', text: 'Erro: parâmetro "name" obrigatório.' }], isError: true };
    if (!confirm) return { content: [{ type: 'text', text: 'Confirmação de escrita necessária: defina "confirm": true para remover o Pod.' }], isError: true };

    // Opcional: verificar existência antes para mensagens melhores
    try {
      const pod = await k8sGet(`/api/v1/namespaces/${ns}/pods/${encodeURIComponent(name)}`, { optional: true });
      if (!pod) {
        return { content: [{ type: 'text', text: `Pod "${name}" não encontrado no namespace "${ns}".` }] };
      }
    } catch (e) {
      // ignore, vamos tentar deletar mesmo assim
    }

    try {
      const qs = buildDeleteQuery({ dryRun, gracePeriodSeconds, propagationPolicy });
      const path = `/api/v1/namespaces/${ns}/pods/${encodeURIComponent(name)}${qs}`;
      const result = await k8sDelete(path);
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: !dryRun, dryRun, namespace: ns, name, result }, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      if (status === 404) return { content: [{ type: 'text', text: `Pod "${name}" não encontrado no namespace "${ns}".` }], isError: true };
      return { content: [{ type: 'text', text: `Erro (${status}): ${e.message}` }], isError: true };
    }
  },
};

export const deletePodsBySelectorTool = {
  name: 'delete_pods_by_selector',
  description: 'Remove (mata) todos os Pods em um namespace que correspondem a um labelSelector. Requer confirmação explícita (confirm: true). Suporta dryRun e opções de deleção em lote.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace alvo.' },
      labelSelector: { type: 'string', description: 'Label selector (ex: app=myapp,component=api). Obrigatório se name não for informado.' },
      confirm: { type: 'boolean', description: 'Confirmação obrigatória para operações de escrita.' },
      dryRun: { type: 'boolean', description: 'Se true, faz deleção em dry-run (?dryRun=All).' },
      gracePeriodSeconds: { type: 'integer', description: 'Tempo de graça antes de encerrar os pods (0 para matar imediatamente).', minimum: 0 },
      propagationPolicy: { type: 'string', enum: ['Foreground','Background','Orphan'], description: 'Política de propagação de deleção.' },
      previewOnly: { type: 'boolean', description: 'Se true, apenas lista os pods que seriam deletados (não deleta).', default: false },
    },
    required: ['namespace','labelSelector','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.namespace === 'string' ? args.namespace : '';
    const labelSelector = typeof args.labelSelector === 'string' ? args.labelSelector : '';
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;
    const previewOnly = !!args.previewOnly;
    const gracePeriodSeconds = Number.isInteger(args.gracePeriodSeconds) ? args.gracePeriodSeconds : undefined;
    const propagationPolicy = typeof args.propagationPolicy === 'string' ? args.propagationPolicy : undefined;

    if (!ns) return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
    if (!labelSelector) return { content: [{ type: 'text', text: 'Erro: parâmetro "labelSelector" obrigatório.' }], isError: true };
    if (!confirm) return { content: [{ type: 'text', text: 'Confirmação de escrita necessária: defina "confirm": true para remover os Pods.' }], isError: true };

    // Sempre listar previamente para retorno claro
    try {
      const listPath = `/api/v1/namespaces/${ns}/pods?labelSelector=${encodeURIComponent(labelSelector)}`;
      const pods = await k8sGet(listPath, { optional: false });
      const items = Array.isArray(pods?.items) ? pods.items : [];
      const names = items.map(p => p?.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        return { content: [{ type: 'text', text: 'Nenhum Pod encontrado para o seletor informado.' }] };
      }
      if (previewOnly) {
        return { content: [{ type: 'text', text: JSON.stringify({ namespace: ns, count: names.length, matchedPods: names, action: 'preview-only' }, null, 2) }] };
      }

      const qs = buildDeleteQuery({ dryRun, gracePeriodSeconds, propagationPolicy });
      const delPath = `/api/v1/namespaces/${ns}/pods${qs}${qs ? '&' : '?'}labelSelector=${encodeURIComponent(labelSelector)}`;
      const result = await k8sDelete(delPath);
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: !dryRun, dryRun, namespace: ns, selector: labelSelector, matchedCount: names.length, matchedPods: names, result }, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}): ${e.message}` }], isError: true };
    }
  },
};
