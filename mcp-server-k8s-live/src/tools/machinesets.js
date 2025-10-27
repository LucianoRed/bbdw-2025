import { k8sGet, k8sPatch } from '../utils/k8s.js';

export const setMachineSetReplicasTool = {
  name: 'set_machineset_replicas',
  description: 'Atualiza o número de réplicas de um MachineSet (OpenShift Machine API). Requer confirmação explícita (confirm: true). Suporta dryRun. Salvaguardas: não permite replicas=0 e bloqueia MachineSets com label machine-type=infra-node.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace do MachineSet (geralmente openshift-machine-api).' },
      name: { type: 'string', description: 'Nome do MachineSet a alterar.' },
      replicas: { type: 'integer', minimum: 1, description: 'Novo número de réplicas (mínimo: 1).'} ,
      confirm: { type: 'boolean', description: 'Confirmação obrigatória para operações de escrita.' },
      dryRun: { type: 'boolean', description: 'Se true, aplica em modo dry-run (?dryRun=All).' },
    },
    required: ['namespace','name','replicas','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.namespace === 'string' ? args.namespace : '';
    const name = typeof args.name === 'string' ? args.name : '';
    const replicas = Number.isInteger(args.replicas) ? args.replicas : NaN;
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;

    if (!ns) return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
    if (!name) return { content: [{ type: 'text', text: 'Erro: parâmetro "name" obrigatório.' }], isError: true };
    if (!Number.isInteger(replicas) || replicas < 1) return { content: [{ type: 'text', text: 'Erro: "replicas" deve ser um inteiro >= 1 (não é permitido reduzir para 0).' }], isError: true };
    if (!confirm) return { content: [{ type: 'text', text: 'Confirmação de escrita necessária: defina "confirm": true para alterar replicas.' }], isError: true };

    // Checar grupo API MachineSet
    try {
      const apiCheck = await k8sGet('/apis/machine.openshift.io', { optional: true });
      if (!apiCheck) {
        return { content: [{ type: 'text', text: 'Erro: o grupo API machine.openshift.io (MachineSets) não está disponível no cluster.' }], isError: true };
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `Erro ao verificar API MachineSets: ${e.message}` }], isError: true };
    }
    // Obter MachineSet para validar labels e existência
    let ms;
    const getPath = `/apis/machine.openshift.io/v1beta1/namespaces/${ns}/machinesets/${encodeURIComponent(name)}`;
    try {
      ms = await k8sGet(getPath, { optional: false });
    } catch (e) {
      const status = e?.statusCode || 500;
      if (status === 404) return { content: [{ type: 'text', text: `MachineSet "${name}" não encontrado no namespace "${ns}".` }], isError: true };
      return { content: [{ type: 'text', text: `Erro (${status}) ao buscar MachineSet: ${e.message}` }], isError: true };
    }
    const labels = ms?.metadata?.labels || {};
    if (labels['machine-type'] === 'infra-node') {
      return { content: [{ type: 'text', text: 'Operação bloqueada: MachineSet com label "machine-type=infra-node" não pode ser alterado por esta ferramenta.' }], isError: true };
    }

    // Limite de aumento: não permitir subir mais do que +3 em relação ao atual
    const currentReplicas = Number.isInteger(ms?.spec?.replicas) ? ms.spec.replicas : 0;
    if (replicas > currentReplicas && (replicas - currentReplicas) > 3) {
      return { content: [{ type: 'text', text: `Operação bloqueada: aumento solicitado (${replicas}) excede o limite de +3 sobre o atual (${currentReplicas}).` }], isError: true };
    }

    const body = { spec: { replicas } };
    try {
      let path = `/apis/machine.openshift.io/v1beta1/namespaces/${ns}/machinesets/${encodeURIComponent(name)}`;
      if (dryRun) path += '?dryRun=All';
      const result = await k8sPatch(path, body);
      return { content: [{ type: 'text', text: JSON.stringify({ updated: !dryRun, dryRun, name, namespace: ns, replicas, result }, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      if (status === 404) {
        return { content: [{ type: 'text', text: `MachineSet "${name}" não encontrado no namespace "${ns}".` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Erro (${status}): ${e.message}` }], isError: true };
    }
  }
};

export const listMachineSetsTool = {
  name: 'list_machinesets',
  description: 'Lista MachineSets (OpenShift Machine API) com nome, namespace, réplicas desejadas/atuais e labels. Útil para escolher qual escalar.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace para filtrar (padrão: openshift-machine-api).', default: 'openshift-machine-api' },
      labelSelector: { type: 'string', description: 'Label selector opcional para filtrar MachineSets.' }
    },
    required: [],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = (typeof args.namespace === 'string' && args.namespace) ? args.namespace : 'openshift-machine-api';
    const labelSelector = typeof args.labelSelector === 'string' ? args.labelSelector : '';

    // Verificar API
    try {
      const apiCheck = await k8sGet('/apis/machine.openshift.io', { optional: true });
      if (!apiCheck) {
        return { content: [{ type: 'text', text: 'Erro: o grupo API machine.openshift.io não está disponível no cluster.' }], isError: true };
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `Erro ao verificar API MachineSets: ${e.message}` }], isError: true };
    }

    try {
      const base = `/apis/machine.openshift.io/v1beta1/namespaces/${ns}/machinesets`;
      const path = labelSelector ? `${base}?labelSelector=${encodeURIComponent(labelSelector)}` : base;
      const list = await k8sGet(path, { optional: false });
      const items = Array.isArray(list?.items) ? list.items : [];
      const result = items.map(ms => ({
        name: ms?.metadata?.name,
        namespace: ms?.metadata?.namespace,
        labels: ms?.metadata?.labels || {},
        replicas: ms?.spec?.replicas ?? null,
        readyReplicas: ms?.status?.readyReplicas ?? null,
        availableReplicas: ms?.status?.availableReplicas ?? null,
      }));
      return { content: [{ type: 'text', text: JSON.stringify({ namespace: ns, count: result.length, items: result }, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}): ${e.message}` }], isError: true };
    }
  }
};
