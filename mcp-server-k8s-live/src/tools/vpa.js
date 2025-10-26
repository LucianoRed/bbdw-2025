import { k8sGet, k8sPost } from '../utils/k8s.js';

export const tool = {
  name: 'create_vpa',
  description: 'Cria um VerticalPodAutoscaler (VPA) para um Deployment específico. Requer confirmação explícita (confirm: true). Suporta dryRun para testes.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace do Deployment.' },
      deployment: { type: 'string', description: 'Nome do Deployment alvo.' },
      name: { type: 'string', description: '(Opcional) Nome do VPA a criar. Se omitido, será <deployment>-vpa.' },
      confirm: { type: 'boolean', description: 'Confirmação obrigatória para operações de escrita. Deve ser true para criar o VPA.' },
      updateMode: { type: 'string', enum: ['Off','Initial','Auto'], default: 'Auto', description: "Modo de update do VPA. 'Auto' aplicará recomendações automaticamente." },
      dryRun: { type: 'boolean', description: 'Se true, faz uma criação em dry-run (server-side) usando ?dryRun=All.' },
    },
    required: ['namespace','deployment','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.namespace === 'string' ? args.namespace : '';
    const deployment = typeof args.deployment === 'string' ? args.deployment : '';
    const confirm = !!args.confirm;
    const vpaName = typeof args.name === 'string' && args.name ? args.name : `${deployment}-vpa`;
    const updateModeRaw = typeof args.updateMode === 'string' ? args.updateMode : 'Auto';
    const updateMode = ['Off','Initial','Auto'].includes(updateModeRaw) ? updateModeRaw : 'Auto';
    const dryRun = !!args.dryRun;

    if (!ns) return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
    if (!deployment) return { content: [{ type: 'text', text: 'Erro: parâmetro "deployment" obrigatório.' }], isError: true };
    if (!confirm) return { content: [{ type: 'text', text: 'Confirmação de escrita necessária: defina "confirm": true para criar o VPA.' }], isError: true };

    // Checar grupo API VPA
    try {
      const apiCheck = await k8sGet('/apis/autoscaling.k8s.io', { optional: true });
      if (!apiCheck) {
        return { content: [{ type: 'text', text: 'Erro: o grupo API autoscaling.k8s.io (VPA) não está disponível no cluster. Verifique se o CRD VerticalPodAutoscaler está instalado.' }], isError: true };
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `Erro ao verificar API VPA: ${e.message}` }], isError: true };
    }

    const manifest = {
      apiVersion: 'autoscaling.k8s.io/v1',
      kind: 'VerticalPodAutoscaler',
      metadata: { name: vpaName, namespace: ns },
      spec: {
        targetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: deployment },
        updatePolicy: { updateMode },
      },
    };

    try {
      let path = `/apis/autoscaling.k8s.io/v1/namespaces/${ns}/verticalpodautoscalers`;
      if (dryRun) path += '?dryRun=All';
      const result = await k8sPost(path, manifest);
      return { content: [{ type: 'text', text: JSON.stringify({ created: !dryRun, dryRun, result }, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}): ${e.message}` }], isError: true };
    }
  },
};
