import { k8sGet, k8sPatch } from '../utils/k8s.js';

export const tool = {
  name: 'set_machineset_replicas',
  description: 'Atualiza o número de réplicas de um MachineSet (OpenShift Machine API). Requer confirmação explícita (confirm: true). Suporta dryRun.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace do MachineSet (geralmente openshift-machine-api).' },
      name: { type: 'string', description: 'Nome do MachineSet a alterar.' },
      replicas: { type: 'integer', minimum: 0, description: 'Novo número de réplicas.' },
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
    if (!Number.isInteger(replicas) || replicas < 0) return { content: [{ type: 'text', text: 'Erro: "replicas" deve ser um inteiro >= 0.' }], isError: true };
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
