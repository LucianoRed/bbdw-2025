import { k8sGet, parseCpuMillicores, parseMemBytes } from '../utils/k8s.js';

async function getClusterOverview() {
  const nodes = await k8sGet('/api/v1/nodes');
  const pods = await k8sGet('/api/v1/pods');
  const namespaces = await k8sGet('/api/v1/namespaces');
  const deployments = await k8sGet('/apis/apps/v1/deployments');
  const services = await k8sGet('/api/v1/services');

  let masterCount = 0, workerCount = 0, infraCount = 0;
  let totalCpu = 0, totalMemory = 0;

  for (const n of (nodes.items || [])) {
    const labels = n?.metadata?.labels || {};
    if (labels['node-role.kubernetes.io/master'] || labels['node-role.kubernetes.io/control-plane']) {
      masterCount++;
    } else if (labels['machine-type'] === 'infra-node' || labels['node-role.kubernetes.io/infra']) {
      infraCount++;
    } else {
      workerCount++;
    }
    const alloc = n?.status?.allocatable || {};
    totalCpu += parseCpuMillicores(alloc.cpu || '0');
    totalMemory += parseMemBytes(alloc.memory || '0');
  }

  let runningPods = 0, pendingPods = 0, failedPods = 0, succeededPods = 0;
  for (const p of (pods.items || [])) {
    const phase = p?.status?.phase || '';
    switch (phase) {
      case 'Running': runningPods++; break;
      case 'Pending': pendingPods++; break;
      case 'Failed': failedPods++; break;
      case 'Succeeded': succeededPods++; break;
    }
  }

  return {
    cluster: {
      totalNodes: nodes.items?.length || 0,
      masterNodes: masterCount,
      workerNodes: workerCount,
      infraNodes: infraCount,
      totalCpuCores: (totalCpu / 1000).toFixed(2),
      totalMemoryGiB: (totalMemory / (1024 * 1024 * 1024)).toFixed(2),
    },
    pods: {
      total: pods.items?.length || 0,
      running: runningPods,
      pending: pendingPods,
      failed: failedPods,
      succeeded: succeededPods,
    },
    namespaces: {
      total: namespaces.items?.length || 0,
      active: namespaces.items?.filter(ns => ns?.status?.phase === 'Active').length || 0,
    },
    deployments: { total: deployments.items?.length || 0 },
    services: { total: services.items?.length || 0 },
  };
}

export const tool = {
  name: 'get_cluster_overview',
  description: 'Obtém uma visão geral do cluster com estatísticas agregadas de nós, pods, namespaces, deployments e services.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async () => {
    const data = await getClusterOverview();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
