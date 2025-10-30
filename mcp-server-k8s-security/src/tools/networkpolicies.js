import { k8sGet, k8sPost, k8sDelete } from '../utils/k8s.js';

function ensureNs(v) {
  return String(v || '').trim().toLowerCase();
}

function ensureName(v) {
  let name = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9]([-a-z0-9\.]*[a-z0-9])?$/.test(name)) {
    const match = name.match(/[a-z0-9]+[-a-z0-9\.]*[a-z0-9]/);
    if (match) name = match[0];
  }
  return name;
}

export const listNetworkPoliciesTool = {
  name: 'list_networkpolicies',
  description: 'Lista NetworkPolicies (cluster-wide ou por namespace). Suporta labelSelector.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace para filtrar (opcional). Se ausente, lista cluster-wide.' },
      labelSelector: { type: 'string', description: 'Filtro por labels, ex.: "project=myapp" (opcional).' },
      limit: { type: 'integer', minimum: 1, description: 'Limitar número de resultados (opcional).' },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = ensureNs(args.namespace);
    const labelSelector = typeof args.labelSelector === 'string' && args.labelSelector.trim() ? args.labelSelector.trim() : '';
    const limit = Number.isInteger(args.limit) ? args.limit : undefined;
    const qs = new URLSearchParams();
    if (labelSelector) qs.set('labelSelector', labelSelector);
    const base = ns ? `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies` : `/apis/networking.k8s.io/v1/networkpolicies`;
    const path = `${base}${qs.toString() ? `?${qs.toString()}` : ''}`;
    try {
      const data = await k8sGet(path);
      const items = (data?.items || []).map(np => ({
        name: np?.metadata?.name,
        namespace: np?.metadata?.namespace,
        policyTypes: Array.isArray(np?.spec?.policyTypes) ? np.spec.policyTypes : [],
        podSelector: np?.spec?.podSelector || {},
        ingressCount: Array.isArray(np?.spec?.ingress) ? np.spec.ingress.length : 0,
        egressCount: Array.isArray(np?.spec?.egress) ? np.spec.egress.length : 0,
        creationTimestamp: np?.metadata?.creationTimestamp || null,
      }));
      return { content: [{ type: 'json', json: limit ? items.slice(0, limit) : items }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}) ao listar NetworkPolicies: ${e.message}` }], isError: true };
    }
  }
};

export const createNetworkPolicyTool = {
  name: 'create_networkpolicy',
  description: 'Cria uma NetworkPolicy no namespace informado. Requer confirm=true. Aceita spec Kubernetes bruto.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace onde criar a NetworkPolicy.' },
      name: { type: 'string', description: 'Nome da NetworkPolicy.' },
      spec: { type: 'object', description: 'Objeto .spec completo da NetworkPolicy (Kubernetes).', additionalProperties: true },
      confirm: { type: 'boolean', description: 'Deve ser true para confirmar a criação.' },
      dryRun: { type: 'boolean', description: 'Se true, usa dryRun=All para simular.' },
    },
    required: ['namespace','name','spec','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = ensureNs(args.namespace);
    const name = ensureName(args.name);
    const spec = args.spec;
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;

    if (!confirm) return { content: [{ type: 'text', text: 'Operação bloqueada: confirme com confirm=true.' }], isError: true };
    if (!ns) return { content: [{ type: 'text', text: 'Parâmetro "namespace" obrigatório.' }], isError: true };
    if (!name) return { content: [{ type: 'text', text: 'Parâmetro "name" obrigatório.' }], isError: true };
    if (typeof spec !== 'object' || spec == null) return { content: [{ type: 'text', text: 'Parâmetro "spec" deve ser um objeto.' }], isError: true };

    const body = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name },
      spec,
    };
    const path = `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies${dryRun ? '?dryRun=All' : ''}`;
    try {
      const created = await k8sPost(path, body);
      return { content: [{ type: 'json', json: created }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}) ao criar NetworkPolicy: ${e.message}` }], isError: true };
    }
  }
};

export const deleteNetworkPolicyTool = {
  name: 'delete_networkpolicy',
  description: 'Remove uma NetworkPolicy por nome e namespace. Requer confirm=true. Suporta dryRun.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace da NetworkPolicy.' },
      name: { type: 'string', description: 'Nome da NetworkPolicy.' },
      confirm: { type: 'boolean', description: 'Deve ser true para confirmar a deleção.' },
      dryRun: { type: 'boolean', description: 'Se true, adiciona dryRun=All.' },
    },
    required: ['namespace','name','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = ensureNs(args.namespace);
    const name = ensureName(args.name);
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;

    if (!confirm) return { content: [{ type: 'text', text: 'Operação bloqueada: confirme com confirm=true.' }], isError: true };
    if (!ns) return { content: [{ type: 'text', text: 'Parâmetro "namespace" obrigatório.' }], isError: true };
    if (!name) return { content: [{ type: 'text', text: 'Parâmetro "name" obrigatório.' }], isError: true };

    const path = `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies/${encodeURIComponent(name)}${dryRun ? '?dryRun=All' : ''}`;
    try {
      const out = await k8sDelete(path);
      return { content: [{ type: 'json', json: out }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}) ao deletar NetworkPolicy: ${e.message}` }], isError: true };
    }
  }
};

export const getNetworkPolicyTool = {
  name: 'get_networkpolicy',
  description: 'Obtém uma NetworkPolicy específica por nome e namespace.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace da NetworkPolicy.' },
      name: { type: 'string', description: 'Nome da NetworkPolicy.' },
    },
    required: ['namespace','name'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = ensureNs(args.namespace);
    const name = ensureName(args.name);
    if (!ns) return { content: [{ type: 'text', text: 'Parâmetro "namespace" obrigatório.' }], isError: true };
    if (!name) return { content: [{ type: 'text', text: 'Parâmetro "name" obrigatório.' }], isError: true };
    const path = `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies/${encodeURIComponent(name)}`;
    try {
      const np = await k8sGet(path);
      return { content: [{ type: 'json', json: np }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      const msg = status === 404 ? 'NetworkPolicy não encontrada.' : `Erro (${status}) ao obter NetworkPolicy: ${e.message}`;
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
};

export const createNetworkPolicyTemplateTool = {
  name: 'create_np_template',
  description: 'Cria uma NetworkPolicy a partir de templates seguros (deny-all, allow-same-namespace, allow-dns). Requer confirm=true.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace alvo.' },
      name: { type: 'string', description: 'Nome da NetworkPolicy.' },
      template: { type: 'string', enum: ['deny-all','allow-same-namespace','allow-dns'], description: 'Tipo de template.' },
      options: {
        type: 'object',
        description: 'Opções específicas do template (ex.: dnsNamespace, dnsLabelKey, dnsLabelValue).',
        additionalProperties: true,
        properties: {
          dnsNamespace: { type: 'string', description: 'Namespace do CoreDNS/kube-dns (padrão: kube-system).' },
          dnsLabelKey: { type: 'string', description: 'Chave de label do Pod DNS (padrão: k8s-app).' },
          dnsLabelValue: { type: 'string', description: 'Valor de label do Pod DNS (padrão: kube-dns).' },
        }
      },
      confirm: { type: 'boolean', description: 'Deve ser true para criar.' },
      dryRun: { type: 'boolean', description: 'Se true, usa dryRun=All.' },
    },
    required: ['namespace','name','template','confirm'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = ensureNs(args.namespace);
    const name = ensureName(args.name);
    const template = String(args.template || '').trim();
    const options = typeof args.options === 'object' && args.options ? args.options : {};
    const confirm = !!args.confirm;
    const dryRun = !!args.dryRun;

    if (!confirm) return { content: [{ type: 'text', text: 'Operação bloqueada: confirme com confirm=true.' }], isError: true };
    if (!ns) return { content: [{ type: 'text', text: 'Parâmetro "namespace" obrigatório.' }], isError: true };
    if (!name) return { content: [{ type: 'text', text: 'Parâmetro "name" obrigatório.' }], isError: true };

    let spec;
    if (template === 'deny-all') {
      spec = {
        podSelector: {},
        policyTypes: ['Ingress','Egress'],
        // sem regras → nega todo tráfego
      };
    } else if (template === 'allow-same-namespace') {
      spec = {
        podSelector: {},
        policyTypes: ['Ingress','Egress'],
        ingress: [ { from: [ { podSelector: {} } ] } ],
        egress:  [ { to:   [ { podSelector: {} } ] } ],
      };
    } else if (template === 'allow-dns') {
      const dnsNamespace = ensureNs(options.dnsNamespace || 'kube-system');
      const dnsLabelKey = String(options.dnsLabelKey || 'k8s-app');
      const dnsLabelValue = String(options.dnsLabelValue || 'kube-dns');
      spec = {
        podSelector: {},
        policyTypes: ['Egress'],
        egress: [
          {
            to: [
              {
                namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': dnsNamespace } },
                podSelector: { matchLabels: { [dnsLabelKey]: dnsLabelValue } }
              }
            ],
            ports: [
              { protocol: 'UDP', port: 53 },
              { protocol: 'TCP', port: 53 }
            ]
          }
        ],
      };
    } else {
      return { content: [{ type: 'text', text: `Template desconhecido: ${template}` }], isError: true };
    }

    const body = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name },
      spec,
    };
    const path = `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies${dryRun ? '?dryRun=All' : ''}`;
    try {
      const created = await k8sPost(path, body);
      return { content: [{ type: 'json', json: created }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      return { content: [{ type: 'text', text: `Erro (${status}) ao criar NetworkPolicy (template ${template}): ${e.message}` }], isError: true };
    }
  }
};
