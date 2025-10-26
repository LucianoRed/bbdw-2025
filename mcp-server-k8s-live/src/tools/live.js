import { k8sGet, parseCpuMillicores, parseMemBytes, bytesToMiB } from '../utils/k8s.js';

export async function buildLiveData({ resource = 'cpu', ns = '' }) {
  const nsFilter = ns.split(',').map(s => s.trim()).filter(Boolean);

  const nodes = await k8sGet('/api/v1/nodes');
  const pods = await k8sGet('/api/v1/pods');
  const podMetrics = await k8sGet('/apis/metrics.k8s.io/v1beta1/pods', { optional: true });

  const podUsage = new Map();
  if (podMetrics && Array.isArray(podMetrics.items)) {
    for (const m of podMetrics.items) {
      const ns = m?.metadata?.namespace || '';
      const name = m?.metadata?.name || '';
      if (!ns || !name) continue;
      let cpu_m = 0, mem_b = 0;
      for (const c of (m.containers || [])) {
        cpu_m += parseCpuMillicores(c?.usage?.cpu ?? '0');
        mem_b += parseMemBytes(c?.usage?.memory ?? '0');
      }
      podUsage.set(`${ns}/${name}`, { cpu_m, mem_b });
    }
  }

  const nodeOrder = [];
  const nodeInfo = new Map();
  const pendingPods = [];

  for (const n of (nodes.items || [])) {
    const name = n?.metadata?.name || 'unknown';
    const labels = n?.metadata?.labels || {};
    const alloc = n?.status?.allocatable || {};
    const addresses = n?.status?.addresses || [];
    const cpu_m = parseCpuMillicores(alloc.cpu ?? '0');
    const mem_b = parseMemBytes(alloc.memory ?? '0');

    let role = 'Worker';
    if (labels['node-role.kubernetes.io/master'] || labels['node-role.kubernetes.io/control-plane'] || labels['node-role.kubernetes.io/controlplane']) {
      role = 'Master';
    } else if ((labels['machine-type'] === 'infra-node') || labels['node-role.kubernetes.io/infra']) {
      role = 'InfraNode';
    }

    let ip = 'N/A';
    for (const addr of addresses) {
      if (addr?.type === 'InternalIP') { ip = addr?.address || 'N/A'; break; }
    }
    if (ip === 'N/A') {
      for (const addr of addresses) { if (addr?.type === 'ExternalIP') { ip = addr?.address || 'N/A'; break; } }
    }

    nodeOrder.push(name);
    nodeInfo.set(name, {
      name,
      role,
      ip,
      alloc_cpu_m: cpu_m,
      alloc_mem_b: mem_b,
      used_cpu_m: 0,
      used_mem_b: 0,
      used_eff_cpu_m: 0,
      used_eff_mem_b: 0,
      pods: [],
    });
  }

  for (const p of (pods.items || [])) {
    const phase = p?.status?.phase || '';
    if (['Succeeded', 'Failed'].includes(phase)) continue;
    const namespace = p?.metadata?.namespace || 'default';
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    const podName = p?.metadata?.name || 'pod';
    const nodeName = p?.spec?.nodeName || null;
    const isTerminating = !!p?.metadata?.deletionTimestamp;

    let creating = false;
    for (const cs of (p?.status?.containerStatuses || [])) {
      const reason = cs?.state?.waiting?.reason || '';
      if (reason === 'ContainerCreating') { creating = true; break; }
    }
    if (!creating) {
      for (const cs of (p?.status?.initContainerStatuses || [])) {
        const reason = cs?.state?.waiting?.reason || '';
        if (reason === 'PodInitializing' || reason === 'ContainerCreating') { creating = true; break; }
      }
    }

    let req_cpu_m = 0, req_mem_b = 0;
    for (const c of (p?.spec?.containers || [])) {
      const req = c?.resources?.requests || {};
      req_cpu_m += parseCpuMillicores(req.cpu ?? '0');
      req_mem_b += parseMemBytes(req.memory ?? '0');
    }

    const key = `${namespace}/${podName}`;
    const eff = podUsage.get(key) || { cpu_m: 0, mem_b: 0 };

    const pod = {
      id: key,
      ns: namespace,
      name: podName,
      cpu_m: req_cpu_m,
      mem_b: req_mem_b,
      terminating: isTerminating,
      phase,
      creating,
      eff_cpu_m: eff.cpu_m || 0,
      eff_mem_b: eff.mem_b || 0,
    };

    const info = nodeName ? nodeInfo.get(nodeName) : null;
    if (!info) {
      pendingPods.push(pod);
    } else {
      info.pods.push(pod);
      info.used_cpu_m += req_cpu_m;
      info.used_mem_b += req_mem_b;
      info.used_eff_cpu_m += (pod.eff_cpu_m || 0);
      info.used_eff_mem_b += (pod.eff_mem_b || 0);
    }
  }

  const bins = [];
  let totalAvailUnits = 0, totalUsedUnits = 0, perBinAllowedUnits = 0;
  const nodesOut = [];

  for (const n of nodeOrder) {
    const info = nodeInfo.get(n);
    if (!info) continue;

    if (resource === 'cpu') {
      const capUnits = Math.ceil((info.alloc_cpu_m || 0) / 100);
      const usedUnits = Math.ceil((info.used_cpu_m || 0) / 100);
      const usedPct = capUnits > 0 ? Math.round((usedUnits / capUnits) * 100) : 0;

      const effUnits = Math.ceil((info.used_eff_cpu_m || 0) / 100);
      const usedEffPct = capUnits > 0 ? Math.round((effUnits / capUnits) * 100) : null;

      nodesOut.push({
        name: n,
        role: info.role || 'Worker',
        ip: info.ip || 'N/A',
        capacityHuman: `CPU ${((info.alloc_cpu_m || 0) / 1000).toFixed(2)} cores`,
        usedPct,
        usedEffPct,
      });

      perBinAllowedUnits = capUnits;
      totalAvailUnits += capUnits;
      totalUsedUnits += usedUnits;

      const items = [];
      for (const pod of info.pods) {
        const units = Math.max(0, Math.ceil((pod.cpu_m || 0) / 100));
        const cpuHuman = `${pod.cpu_m || 0}m (${((pod.cpu_m || 0) / 1000).toFixed(2)} cores)`;
        const memHuman = `${bytesToMiB(pod.mem_b || 0)} Mi`;
        items.push({
          id: pod.id,
          shortId: pod.name,
          sizeUnits: units,
          sizeHuman: `${pod.cpu_m || 0}m`,
          cpu_m: Number(pod.cpu_m || 0),
          mem_b: Number(pod.mem_b || 0),
          cpuHuman,
          memHuman,
          terminating: !!pod.terminating,
          phase: pod.phase || '',
          creating: !!pod.creating,
        });
      }
      bins.push(items);
    } else {
      const unitSize = 256 * 1024 * 1024;
      const capUnits = Math.ceil((info.alloc_mem_b || 0) / unitSize);
      const usedUnits = Math.ceil((info.used_mem_b || 0) / unitSize);
      const usedPct = capUnits > 0 ? Math.round((usedUnits / capUnits) * 100) : 0;

      const effUnits = Math.ceil((info.used_eff_mem_b || 0) / unitSize);
      const usedEffPct = capUnits > 0 ? Math.round((effUnits / capUnits) * 100) : null;

      nodesOut.push({
        name: n,
        role: info.role || 'Worker',
        ip: info.ip || 'N/A',
        capacityHuman: `Mem ${bytesToMiB(info.alloc_mem_b || 0)} Mi`,
        usedPct,
        usedEffPct,
      });

      perBinAllowedUnits = capUnits;
      totalAvailUnits += capUnits;
      totalUsedUnits += usedUnits;

      const items = [];
      for (const pod of info.pods) {
        const units = Math.max(0, Math.ceil((pod.mem_b || 0) / unitSize));
        const cpuHuman = `${pod.cpu_m || 0}m (${((pod.cpu_m || 0) / 1000).toFixed(2)} cores)`;
        const memHuman = `${bytesToMiB(pod.mem_b || 0)} Mi`;
        items.push({
          id: pod.id,
          shortId: pod.name,
          sizeUnits: units,
          sizeHuman: `${bytesToMiB(pod.mem_b || 0)} Mi`,
          cpu_m: Number(pod.cpu_m || 0),
          mem_b: Number(pod.mem_b || 0),
          cpuHuman,
          memHuman,
          terminating: !!pod.terminating,
          phase: pod.phase || '',
          creating: !!pod.creating,
        });
      }
      bins.push(items);
    }
  }

  const pendingOut = [];
  if (resource === 'cpu') {
    for (const pod of pendingPods) {
      const units = Math.max(0, Math.ceil((pod.cpu_m || 0) / 100));
      pendingOut.push({
        id: pod.id,
        sizeUnits: units,
        cpu_m: Number(pod.cpu_m || 0),
        mem_b: Number(pod.mem_b || 0),
        cpuHuman: `${pod.cpu_m || 0}m (${((pod.cpu_m || 0) / 1000).toFixed(2)} cores)`,
        memHuman: `${bytesToMiB(pod.mem_b || 0)} Mi`,
      });
    }
  } else {
    const unitSize = 256 * 1024 * 1024;
    for (const pod of pendingPods) {
      const units = Math.max(0, Math.ceil((pod.mem_b || 0) / unitSize));
      pendingOut.push({
        id: pod.id,
        sizeUnits: units,
        cpu_m: Number(pod.cpu_m || 0),
        mem_b: Number(pod.mem_b || 0),
        cpuHuman: `${pod.cpu_m || 0}m (${((pod.cpu_m || 0) / 1000).toFixed(2)} cores)`,
        memHuman: `${bytesToMiB(pod.mem_b || 0)} Mi`,
      });
    }
  }

  const binPackRatio = totalAvailUnits > 0 ? Math.round((totalUsedUnits / totalAvailUnits) * 100) / 100 : 0;

  return {
    nodes: nodesOut,
    bins,
    perBinAllowedUnits,
    totalUsedUnits,
    totalAvailableUnits: totalAvailUnits,
    binPackRatio,
    pending: pendingOut,
  };
}

export const tool = {
  name: 'get_live_binpacking',
  description: "Obtém o snapshot atual de binpacking do cluster Kubernetes, retornando JSON idêntico ao binpacking-live/liveData.php. Inclui nós (name, role, ip, capacityHuman, usedPct, usedEffPct), bins (pods alocados por nó com cpu/mem requests e flags), pending (pods não alocados) e agregados (perBinAllowedUnits, totalUsedUnits, totalAvailableUnits, binPackRatio). Use resource=cpu|memory e ns=ns1,ns2 para filtrar.",
  inputSchema: {
    type: 'object',
    properties: {
      resource: { type: 'string', enum: ['cpu', 'memory'], default: 'cpu', description: "Recurso de referência para dimensionar bins e cálculos de uso: 'cpu' (padrão) ou 'memory'." },
      ns: { type: 'string', description: "Namespaces separados por vírgula para filtrar os pods (opcional). Ex.: 'default,kube-system'." },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const resourceRaw = typeof args.resource === 'string' ? args.resource : 'cpu';
    const resource = resourceRaw === 'memory' ? 'memory' : 'cpu';
    const ns = typeof args.ns === 'string' ? args.ns : '';
    const data = await buildLiveData({ resource, ns });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
