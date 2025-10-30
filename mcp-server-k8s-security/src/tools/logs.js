import { k8sGetRaw } from '../utils/k8s.js';

function sanitizeLineInput(value) {
  if (typeof value !== 'string') return '';
  const lines = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let v = (lines.length ? lines[lines.length - 1] : value.trim());
  v = v.replace(/[\r\n\t]/g, '').trim();
  return v;
}

export const getPodLogsTool = {
  name: 'get_pod_logs',
  description: 'Obtém logs de um Pod (opcionalmente de um container específico). Suporta tailLines, sinceSeconds, previous e timestamps.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace do Pod.' },
      name: { type: 'string', description: 'Nome do Pod.' },
      container: { type: 'string', description: 'Nome do container (opcional).' },
      tailLines: { type: 'integer', description: 'Limitar número de linhas a partir do final (ex.: 500).', minimum: 1 },
      sinceSeconds: { type: 'integer', description: 'Retornar logs desde X segundos atrás.', minimum: 1 },
      previous: { type: 'boolean', description: 'Se true, retorna logs do container anterior (crash).', default: false },
      timestamps: { type: 'boolean', description: 'Se true, inclui timestamps em cada linha.', default: false },
    },
    required: ['namespace','name'],
    additionalProperties: false,
  },
  handler: async (args) => {
    let ns = sanitizeLineInput(args.namespace || '');
    let name = sanitizeLineInput(args.name || '');
    const container = sanitizeLineInput(args.container || '');

    ns = ns.toLowerCase();
    name = name.toLowerCase();

    if (!/^[a-z0-9]([-a-z0-9\.]*[a-z0-9])?$/.test(name)) {
      const match = String(name).toLowerCase().match(/[a-z0-9]+[-a-z0-9\.]*[a-z0-9]/);
      if (match) name = match[0];
    }
    const tailLines = Number.isInteger(args.tailLines) ? args.tailLines : undefined;
    const sinceSeconds = Number.isInteger(args.sinceSeconds) ? args.sinceSeconds : undefined;
    const previous = !!args.previous;
    const timestamps = !!args.timestamps;

    if (!ns) return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
    if (!name) return { content: [{ type: 'text', text: 'Erro: parâmetro "name" obrigatório (dica: passe apenas o nome do Pod, sem quebras de linha nem prefixos).' }], isError: true };

    const params = new URLSearchParams();
    if (container) params.set('container', container);
    if (tailLines) params.set('tailLines', String(tailLines));
    if (sinceSeconds) params.set('sinceSeconds', String(sinceSeconds));
    if (previous) params.set('previous', 'true');
    if (timestamps) params.set('timestamps', 'true');

    const qs = params.toString();
    const path = `/api/v1/namespaces/${ns}/pods/${encodeURIComponent(name)}/log${qs ? `?${qs}` : ''}`;
    try {
      const logs = await k8sGetRaw(path, { optional: false });
      const MAX = 10000;
      let out = logs ?? '';
      if (out.length > MAX) out = out.slice(out.length - MAX);
      return { content: [{ type: 'text', text: out }] };
    } catch (e) {
      const status = e?.statusCode || 500;
      const hint = (status === 406 || status === 415)
        ? '\nDica: verifique se o nome do Pod está correto (sem quebras de linha) e, se houver múltiplos containers no Pod, informe o parâmetro "container".'
        : '';
      return { content: [{ type: 'text', text: `Erro (${status}) ao obter logs: ${e.message}${hint}` }], isError: true };
    }
  },
};
