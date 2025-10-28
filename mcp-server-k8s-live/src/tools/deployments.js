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

    // GET-before-PATCH para obter o valor atual e aplicar guarda de aumento +3
    let current = null;
    try {
      const scale = await k8sGet(`/apis/apps/v1/namespaces/${ns}/deployments/${encodeURIComponent(deployment)}/scale`, { optional: false });
      current = Number.isFinite(scale?.spec?.replicas) ? scale.spec.replicas : 0;
    } catch (e) {
      const status = e?.statusCode || 500;
      if (status === 404) return { content: [{ type: 'text', text: `Deployment "${deployment}" não encontrado em "${ns}".` }], isError: true };
      return { content: [{ type: 'text', text: `Erro (${status}) ao obter escala atual: ${e.message}` }], isError: true };
    }

    // Bloquear aumento maior que +3 sobre o atual; reduções e aumentos até +3 são permitidos
    if (replicas > current && (replicas - current) > 3) {
      return { content: [{ type: 'text', text: `Operação bloqueada: aumento solicitado (${replicas}) excede o limite de +3 sobre o atual (${current}).` }], isError: true };
    }

    try {
      let path = `/apis/apps/v1/namespaces/${ns}/deployments/${encodeURIComponent(deployment)}/scale`;
      if (dryRun) path += '?dryRun=All';
      const body = { spec: { replicas } };
      const result = await k8sPatch(path, body, 'application/merge-patch+json');
  const response = { namespace: ns, deployment, replicasRequested: replicas, previousReplicas: current, dryRun, result };
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}) ao escalar Deployment: ${e.message}` }], isError: true };
    }
  },
};

export const addDeploymentEnvVarTool = {
  name: 'add_deployment_env_var',
  description: 'Adiciona (ou atualiza) uma variável de ambiente em um Deployment. Usa strategic-merge-patch. Requer confirmação explícita (confirm: true).',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace do Deployment.' },
      deployment: { type: 'string', description: 'Nome do Deployment.' },
      container: { type: 'string', description: 'Nome do container. Se omitido, será inferido se houver apenas um container.' },
      name: { type: 'string', description: 'Nome da variável de ambiente.' },
      value: { type: 'string', description: 'Valor da variável de ambiente.' },
      confirm: { type: 'boolean', description: 'Confirmação obrigatória para operações de escrita.' },
      dryRun: { type: 'boolean', description: 'Se true, aplica em dry-run (?dryRun=All).' },
    },
    required: ['namespace','deployment','name','value','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.namespace === 'string' ? args.namespace : '';
    const deployment = typeof args.deployment === 'string' ? args.deployment : '';
    const containerInput = typeof args.container === 'string' ? args.container : '';
    const envName = typeof args.name === 'string' ? args.name : '';
    const envValue = typeof args.value === 'string' ? args.value : '';
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;

    if (!ns) return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
    if (!deployment) return { content: [{ type: 'text', text: 'Erro: parâmetro "deployment" obrigatório.' }], isError: true };
    if (!envName) return { content: [{ type: 'text', text: 'Erro: parâmetro "name" da env obrigatório.' }], isError: true };
    if (!confirm) return { content: [{ type: 'text', text: 'Confirmação de escrita necessária: defina "confirm": true para aplicar o patch.' }], isError: true };

    // Descobrir container se não informado
    let container = containerInput;
    try {
      if (!container) {
        const dep = await k8sGet(`/apis/apps/v1/namespaces/${ns}/deployments/${encodeURIComponent(deployment)}`, { optional: false });
        const containers = dep?.spec?.template?.spec?.containers || [];
        if (containers.length === 1) {
          container = containers[0]?.name;
        } else {
          return { content: [{ type: 'text', text: 'Erro: informe "container" (há 0 ou mais de 1 containers no deployment).' }], isError: true };
        }
      }
    } catch (e) {
      const status = e?.statusCode || 500;
      if (status === 404) return { content: [{ type: 'text', text: `Deployment "${deployment}" não encontrado em "${ns}".` }], isError: true };
      return { content: [{ type: 'text', text: `Erro (${status}) ao obter Deployment: ${e.message}` }], isError: true };
    }

    // Strategic merge patch para env var
    const patch = {
      spec: {
        template: {
          spec: {
            containers: [
              {
                name: container,
                env: [ { name: envName, value: envValue } ],
              }
            ]
          }
        }
      }
    };

    try {
      let path = `/apis/apps/v1/namespaces/${ns}/deployments/${encodeURIComponent(deployment)}`;
      if (dryRun) path += '?dryRun=All';
      const result = await k8sPatch(path, patch, 'application/strategic-merge-patch+json');
      const response = { namespace: ns, deployment, container, env: { name: envName, value: envValue }, dryRun, result };
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}) ao aplicar env no Deployment: ${e.message}` }], isError: true };
    }
  },
};
