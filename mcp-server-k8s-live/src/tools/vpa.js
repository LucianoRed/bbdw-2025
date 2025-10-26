import { k8sGet, k8sPost, k8sDelete } from '../utils/k8s.js';

const RESERVED_NS_RE = /^openshift/i; // bloquear namespaces openshift*
function isReservedNamespace(ns) { return RESERVED_NS_RE.test(ns || ''); }

export const createVpaTool = {
  name: 'create_vpa',
  description: 'Cria um VerticalPodAutoscaler (VPA) para um Deployment específico. Requer confirmação explícita (confirm: true). Suporta dryRun para testes. Bloqueado em namespaces openshift*.',
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
    if (isReservedNamespace(ns)) return { content: [{ type: 'text', text: 'Criação de VPA bloqueada em namespaces reservados (openshift*).' }], isError: true };
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

export const deleteVpaTool = {
  name: 'delete_vpa',
  description: 'Remove um VerticalPodAutoscaler (VPA) por nome (ou derivado de deployment). Requer confirmação explícita (confirm: true). Suporta dryRun.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace do VPA.' },
      name: { type: 'string', description: 'Nome do VPA a remover. Opcional se deployment for informado.' },
      deployment: { type: 'string', description: 'Se informado e name ausente, assume <deployment>-vpa.' },
      confirm: { type: 'boolean', description: 'Confirmação obrigatória para operações de escrita.' },
      dryRun: { type: 'boolean', description: 'Se true, faz deleção em dry-run (?dryRun=All).' },
    },
    required: ['namespace','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.namespace === 'string' ? args.namespace : '';
    const nameArg = typeof args.name === 'string' ? args.name : '';
    const deployment = typeof args.deployment === 'string' ? args.deployment : '';
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;

  if (!ns) return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
    if (!confirm) return { content: [{ type: 'text', text: 'Confirmação de escrita necessária: defina "confirm": true para remover o VPA.' }], isError: true };

    const vpaName = nameArg || (deployment ? `${deployment}-vpa` : '');
    if (!vpaName) return { content: [{ type: 'text', text: 'Informe "name" do VPA ou "deployment" para derivar o nome (<deployment>-vpa).' }], isError: true };

    try {
      // Checar grupo API VPA
      const apiCheck = await k8sGet('/apis/autoscaling.k8s.io', { optional: true });
      if (!apiCheck) {
        return { content: [{ type: 'text', text: 'Erro: o grupo API autoscaling.k8s.io (VPA) não está disponível no cluster.' }], isError: true };
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `Erro ao verificar API VPA: ${e.message}` }], isError: true };
    }

    try {
      let path = `/apis/autoscaling.k8s.io/v1/namespaces/${ns}/verticalpodautoscalers/${encodeURIComponent(vpaName)}`;
      if (dryRun) path += '?dryRun=All';
      const result = await k8sDelete(path);
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: !dryRun, dryRun, name: vpaName, result }, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      if (status === 404) {
        return { content: [{ type: 'text', text: `VPA "${vpaName}" não encontrado no namespace "${ns}".` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Erro (${status}): ${e.message}` }], isError: true };
    }
  },
};

export const createVpasForNamespaceTool = {
  name: 'create_vpas_for_namespace',
  description: 'Cria VPAs para todos os Deployments de um namespace (opcionalmente filtrados por labelSelector). Requer confirmação explícita (confirm: true). Suporta dryRun e pular existentes.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace alvo (não pode ser openshift*).' },
      labelSelector: { type: 'string', description: 'Opcional: labelSelector para filtrar Deployments (ex: app=myapp,env=prod).' },
      updateMode: { type: 'string', enum: ['Off','Initial','Auto'], default: 'Auto', description: "Modo de update do VPA. 'Auto' aplicará recomendações automaticamente." },
      skipIfExists: { type: 'boolean', default: true, description: 'Se true, não recria VPA se já existir.' },
      confirm: { type: 'boolean', description: 'Confirmação obrigatória para operações de escrita.' },
      dryRun: { type: 'boolean', description: 'Se true, cria em dry-run (?dryRun=All).' },
    },
    required: ['namespace','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.namespace === 'string' ? args.namespace : '';
    const labelSelector = typeof args.labelSelector === 'string' && args.labelSelector ? args.labelSelector : '';
    const updateModeRaw = typeof args.updateMode === 'string' ? args.updateMode : 'Auto';
    const updateMode = ['Off','Initial','Auto'].includes(updateModeRaw) ? updateModeRaw : 'Auto';
    const skipIfExists = args.skipIfExists === undefined ? true : !!args.skipIfExists;
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;

    if (!ns) return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
    if (isReservedNamespace(ns)) return { content: [{ type: 'text', text: 'Criação de VPA bloqueada em namespaces reservados (openshift*).' }], isError: true };
    if (!confirm) return { content: [{ type: 'text', text: 'Confirmação de escrita necessária: defina "confirm": true para criar os VPAs.' }], isError: true };

    // Checar API VPA disponível
    try {
      const apiCheck = await k8sGet('/apis/autoscaling.k8s.io', { optional: true });
      if (!apiCheck) {
        return { content: [{ type: 'text', text: 'Erro: o grupo API autoscaling.k8s.io (VPA) não está disponível no cluster. Verifique se o CRD VerticalPodAutoscaler está instalado.' }], isError: true };
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `Erro ao verificar API VPA: ${e.message}` }], isError: true };
    }

    // Listar Deployments do namespace
    try {
      let path = `/apis/apps/v1/namespaces/${ns}/deployments`;
      if (labelSelector) path += `?labelSelector=${encodeURIComponent(labelSelector)}`;
      const deployments = await k8sGet(path, { optional: false });
      const items = Array.isArray(deployments?.items) ? deployments.items : [];
      if (items.length === 0) {
        return { content: [{ type: 'text', text: 'Nenhum Deployment encontrado para o filtro informado.' }] };
      }

      const results = [];
      for (const d of items) {
        const depName = d?.metadata?.name;
        if (!depName) continue;
        const vpaName = `${depName}-vpa`;

        // Se preciso, pular se VPA já existe
        if (skipIfExists) {
          try {
            const existing = await k8sGet(`/apis/autoscaling.k8s.io/v1/namespaces/${ns}/verticalpodautoscalers/${encodeURIComponent(vpaName)}`, { optional: true });
            if (existing && existing.metadata && existing.metadata.name) {
              results.push({ deployment: depName, vpa: vpaName, status: 'skipped-exists' });
              continue;
            }
          } catch (e) {
            // ignore
          }
        }

        const manifest = {
          apiVersion: 'autoscaling.k8s.io/v1',
          kind: 'VerticalPodAutoscaler',
          metadata: { name: vpaName, namespace: ns },
          spec: {
            targetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: depName },
            updatePolicy: { updateMode },
          },
        };

        try {
          let createPath = `/apis/autoscaling.k8s.io/v1/namespaces/${ns}/verticalpodautoscalers`;
          if (dryRun) createPath += '?dryRun=All';
          const created = await k8sPost(createPath, manifest);
          results.push({ deployment: depName, vpa: vpaName, status: dryRun ? 'dry-run' : 'created', result: created });
        } catch (e) {
          const status = e?.statusCode || 500;
          results.push({ deployment: depName, vpa: vpaName, status: 'error', error: `(${status}) ${e.message}` });
        }
      }

      return { content: [{ type: 'text', text: JSON.stringify({ namespace: ns, count: results.length, results }, null, 2) }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}) ao listar Deployments ou criar VPAs: ${e.message}` }], isError: true };
    }
  },
};
