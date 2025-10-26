import { k8sGet, k8sPatch } from '../utils/k8s.js';

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

export const setDeploymentReplicasTool = {
  name: 'set_deployment_replicas',
  description: 'Altera o número de réplicas de um Deployment usando o subrecurso Scale. Requer confirmação explícita (confirm: true). Suporta dryRun.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace do Deployment.' },
      deployment: { type: 'string', description: 'Nome do Deployment alvo.' },
      replicas: { type: 'number', description: 'Novo número de réplicas (>= 0).', minimum: 0 },
      confirm: { type: 'boolean', description: 'Confirmação obrigatória para operações de escrita.' },
      dryRun: { type: 'boolean', description: 'Se true, aplica em dry-run (?dryRun=All).' },
      getCurrent: { type: 'boolean', description: 'Se true, retorna também o valor atual antes de aplicar a alteração.' },
    },
    required: ['namespace','deployment','replicas','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.namespace === 'string' ? args.namespace : '';
    const deployment = typeof args.deployment === 'string' ? args.deployment : '';
    const replicasRaw = typeof args.replicas === 'number' ? args.replicas : NaN;
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;
    const getCurrent = !!args.getCurrent;

    if (!ns) return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
    if (!deployment) return { content: [{ type: 'text', text: 'Erro: parâmetro "deployment" obrigatório.' }], isError: true };
    if (!Number.isFinite(replicasRaw) || replicasRaw < 0) return { content: [{ type: 'text', text: 'Erro: "replicas" deve ser um número >= 0.' }], isError: true };
    if (!confirm) return { content: [{ type: 'text', text: 'Confirmação de escrita necessária: defina "confirm": true para alterar o número de réplicas.' }], isError: true };

    const replicas = Math.floor(replicasRaw);

    // GET-before-PATCH (opcional) para fornecer contexto ao usuário
    let current = null;
    try {
      if (getCurrent) {
        const scale = await k8sGet(`/apis/apps/v1/namespaces/${ns}/deployments/${encodeURIComponent(deployment)}/scale`, { optional: true });
        current = scale?.spec?.replicas;
      }
    } catch (e) {
      // não é bloqueante para a operação principal
    }

    try {
      let path = `/apis/apps/v1/namespaces/${ns}/deployments/${encodeURIComponent(deployment)}/scale`;
      if (dryRun) path += '?dryRun=All';
      const body = { spec: { replicas } };
      const result = await k8sPatch(path, body, 'application/merge-patch+json');
      const response = { namespace: ns, deployment, replicasRequested: replicas, dryRun, result };
      if (getCurrent) response.previousReplicas = current;
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}) ao escalar Deployment: ${e.message}` }], isError: true };
    }
  },
};
