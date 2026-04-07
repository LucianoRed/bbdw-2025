import {
  bytesToGiB,
  bytesToMiB,
  k8sGet,
  millicoresToCores,
  parseCpuMillicores,
  parseMemBytes,
  percent,
} from '../utils/k8s.js';

function splitCsv(value) {
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function getNodeRole(labels = {}) {
  if (
    labels['node-role.kubernetes.io/master'] ||
    labels['node-role.kubernetes.io/control-plane'] ||
    labels['node-role.kubernetes.io/controlplane']
  ) {
    return 'master';
  }
  if (labels['machine-type'] === 'infra-node' || labels['node-role.kubernetes.io/infra']) {
    return 'infra';
  }
  return 'worker';
}

function getNodeIp(addresses = []) {
  for (const address of addresses) {
    if (address?.type === 'InternalIP') return address.address || 'N/A';
  }
  for (const address of addresses) {
    if (address?.type === 'ExternalIP') return address.address || 'N/A';
  }
  return 'N/A';
}

function getNodeConditionMap(conditions = []) {
  const map = {};
  for (const condition of conditions) {
    const type = condition?.type;
    if (!type) continue;
    map[type] = {
      status: condition?.status || 'Unknown',
      reason: condition?.reason || '',
      message: condition?.message || '',
      lastTransitionTime: condition?.lastTransitionTime || null,
    };
  }
  return map;
}

function getPodPhase(pod) {
  return pod?.status?.phase || 'Unknown';
}

function isFinishedPod(pod) {
  return ['Succeeded', 'Failed'].includes(getPodPhase(pod));
}

function buildPodRequests(pod) {
  let cpuRequestedMillicores = 0;
  let memoryRequestedBytes = 0;

  for (const container of pod?.spec?.containers || []) {
    const requests = container?.resources?.requests || {};
    cpuRequestedMillicores += parseCpuMillicores(requests.cpu || '0');
    memoryRequestedBytes += parseMemBytes(requests.memory || '0');
  }

  return { cpuRequestedMillicores, memoryRequestedBytes };
}

function buildPodUsageMap(podMetrics) {
  const usageByPod = new Map();
  for (const metric of podMetrics?.items || []) {
    const namespace = metric?.metadata?.namespace || '';
    const name = metric?.metadata?.name || '';
    if (!namespace || !name) continue;

    let cpuUsedMillicores = 0;
    let memoryUsedBytes = 0;

    for (const container of metric?.containers || []) {
      cpuUsedMillicores += parseCpuMillicores(container?.usage?.cpu || '0');
      memoryUsedBytes += parseMemBytes(container?.usage?.memory || '0');
    }

    usageByPod.set(`${namespace}/${name}`, { cpuUsedMillicores, memoryUsedBytes });
  }
  return usageByPod;
}

function buildPodSummary(pod, podUsage) {
  const namespace = pod?.metadata?.namespace || 'default';
  const name = pod?.metadata?.name || 'unknown';
  const key = `${namespace}/${name}`;
  const requests = buildPodRequests(pod);
  const usage = podUsage.get(key) || { cpuUsedMillicores: 0, memoryUsedBytes: 0 };
  const ownerRefs = Array.isArray(pod?.metadata?.ownerReferences) ? pod.metadata.ownerReferences : [];
  const primaryOwner = ownerRefs[0];

  return {
    key,
    namespace,
    name,
    nodeName: pod?.spec?.nodeName || null,
    phase: getPodPhase(pod),
    qosClass: pod?.status?.qosClass || 'Unknown',
    priorityClassName: pod?.spec?.priorityClassName || null,
    cpuRequestedMillicores: requests.cpuRequestedMillicores,
    memoryRequestedBytes: requests.memoryRequestedBytes,
    cpuUsedMillicores: usage.cpuUsedMillicores,
    memoryUsedBytes: usage.memoryUsedBytes,
    cpuRequestedCores: millicoresToCores(requests.cpuRequestedMillicores),
    cpuUsedCores: millicoresToCores(usage.cpuUsedMillicores),
    memoryRequestedMiB: bytesToMiB(requests.memoryRequestedBytes),
    memoryUsedMiB: bytesToMiB(usage.memoryUsedBytes),
    owner: primaryOwner ? { kind: primaryOwner.kind || '', name: primaryOwner.name || '' } : null,
  };
}

function buildNodeSummary(node, nodePods) {
  const allocatable = node?.status?.allocatable || {};
  const labels = node?.metadata?.labels || {};
  const cpuAllocatableMillicores = parseCpuMillicores(allocatable.cpu || '0');
  const memoryAllocatableBytes = parseMemBytes(allocatable.memory || '0');

  let cpuRequestedMillicores = 0;
  let memoryRequestedBytes = 0;
  let cpuUsedMillicores = 0;
  let memoryUsedBytes = 0;

  for (const pod of nodePods) {
    cpuRequestedMillicores += pod.cpuRequestedMillicores;
    memoryRequestedBytes += pod.memoryRequestedBytes;
    cpuUsedMillicores += pod.cpuUsedMillicores;
    memoryUsedBytes += pod.memoryUsedBytes;
  }

  return {
    name: node?.metadata?.name || 'unknown',
    role: getNodeRole(labels),
    ip: getNodeIp(node?.status?.addresses || []),
    unschedulable: !!node?.spec?.unschedulable,
    cpuAllocatableMillicores,
    memoryAllocatableBytes,
    cpuAllocatableCores: millicoresToCores(cpuAllocatableMillicores),
    memoryAllocatableGiB: bytesToGiB(memoryAllocatableBytes),
    cpuRequestedMillicores,
    memoryRequestedBytes,
    cpuUsedMillicores,
    memoryUsedBytes,
    cpuRequestedCores: millicoresToCores(cpuRequestedMillicores),
    cpuUsedCores: millicoresToCores(cpuUsedMillicores),
    memoryRequestedMiB: bytesToMiB(memoryRequestedBytes),
    memoryUsedMiB: bytesToMiB(memoryUsedBytes),
    cpuRequestPct: percent(cpuRequestedMillicores, cpuAllocatableMillicores),
    memoryRequestPct: percent(memoryRequestedBytes, memoryAllocatableBytes),
    cpuUsagePct: percent(cpuUsedMillicores, cpuAllocatableMillicores),
    memoryUsagePct: percent(memoryUsedBytes, memoryAllocatableBytes),
    podCount: nodePods.length,
    labels,
    taints: node?.spec?.taints || [],
    conditions: getNodeConditionMap(node?.status?.conditions || []),
  };
}

export async function getClusterSnapshot({ namespaces = '', includeFinishedPods = false } = {}) {
  const namespaceFilter = new Set(splitCsv(namespaces));
  const [nodes, pods, podMetrics] = await Promise.all([
    k8sGet('/api/v1/nodes'),
    k8sGet('/api/v1/pods'),
    k8sGet('/apis/metrics.k8s.io/v1beta1/pods', { optional: true }),
  ]);

  const podUsage = buildPodUsageMap(podMetrics);
  const podsByNode = new Map();
  const pendingPods = [];
  const allPods = [];

  for (const pod of pods.items || []) {
    const namespace = pod?.metadata?.namespace || 'default';
    if (namespaceFilter.size > 0 && !namespaceFilter.has(namespace)) continue;
    if (!includeFinishedPods && isFinishedPod(pod)) continue;

    const summary = buildPodSummary(pod, podUsage);
    allPods.push(summary);

    if (!summary.nodeName) {
      pendingPods.push(summary);
      continue;
    }

    if (!podsByNode.has(summary.nodeName)) podsByNode.set(summary.nodeName, []);
    podsByNode.get(summary.nodeName).push(summary);
  }

  const nodeSummaries = [];
  for (const node of nodes.items || []) {
    const name = node?.metadata?.name || 'unknown';
    const nodePods = podsByNode.get(name) || [];
    nodeSummaries.push(buildNodeSummary(node, nodePods));
  }

  return {
    metricsAvailable: !!podMetrics,
    namespaceFilter: Array.from(namespaceFilter),
    nodes: nodeSummaries,
    pods: allPods,
    pendingPods,
  };
}

export function buildLiveBinpacking(snapshot, resource = 'cpu') {
  const bins = [];
  const nodes = [];
  const pending = [];
  let perBinAllowedUnits = 0;
  let totalUsedUnits = 0;
  let totalAvailableUnits = 0;

  for (const node of snapshot.nodes) {
    const capUnits = resource === 'memory'
      ? Math.ceil(node.memoryAllocatableBytes / (256 * 1024 * 1024))
      : Math.ceil(node.cpuAllocatableMillicores / 100);
    const usedUnits = resource === 'memory'
      ? Math.ceil(node.memoryRequestedBytes / (256 * 1024 * 1024))
      : Math.ceil(node.cpuRequestedMillicores / 100);
    const effUnits = resource === 'memory'
      ? Math.ceil(node.memoryUsedBytes / (256 * 1024 * 1024))
      : Math.ceil(node.cpuUsedMillicores / 100);

    perBinAllowedUnits = capUnits;
    totalUsedUnits += usedUnits;
    totalAvailableUnits += capUnits;

    const nodePods = snapshot.pods.filter((pod) => pod.nodeName === node.name);
    const items = nodePods.map((pod) => ({
      id: pod.key,
      shortId: pod.name,
      sizeUnits: resource === 'memory'
        ? Math.ceil(pod.memoryRequestedBytes / (256 * 1024 * 1024))
        : Math.ceil(pod.cpuRequestedMillicores / 100),
      sizeHuman: resource === 'memory'
        ? `${pod.memoryRequestedMiB} Mi`
        : `${pod.cpuRequestedMillicores}m`,
      cpu_m: pod.cpuRequestedMillicores,
      mem_b: pod.memoryRequestedBytes,
      cpuHuman: `${pod.cpuRequestedMillicores}m (${pod.cpuRequestedCores} cores)`,
      memHuman: `${pod.memoryRequestedMiB} Mi`,
      phase: pod.phase,
    }));

    nodes.push({
      name: node.name,
      role: node.role,
      ip: node.ip,
      capacityHuman: resource === 'memory'
        ? `Mem ${bytesToMiB(node.memoryAllocatableBytes)} Mi`
        : `CPU ${node.cpuAllocatableCores.toFixed(2)} cores`,
      usedPct: resource === 'memory' ? node.memoryRequestPct : node.cpuRequestPct,
      usedEffPct: resource === 'memory' ? node.memoryUsagePct : node.cpuUsagePct,
    });
    bins.push(items);
    if (effUnits > capUnits) totalAvailableUnits += 0;
  }

  for (const pod of snapshot.pendingPods) {
    pending.push({
      id: pod.key,
      sizeUnits: resource === 'memory'
        ? Math.ceil(pod.memoryRequestedBytes / (256 * 1024 * 1024))
        : Math.ceil(pod.cpuRequestedMillicores / 100),
      cpu_m: pod.cpuRequestedMillicores,
      mem_b: pod.memoryRequestedBytes,
      cpuHuman: `${pod.cpuRequestedMillicores}m (${pod.cpuRequestedCores} cores)`,
      memHuman: `${pod.memoryRequestedMiB} Mi`,
    });
  }

  return {
    nodes,
    bins,
    perBinAllowedUnits,
    totalUsedUnits,
    totalAvailableUnits,
    binPackRatio: totalAvailableUnits ? Math.round((totalUsedUnits / totalAvailableUnits) * 100) / 100 : 0,
    pending,
  };
}

function chooseWorkers(nodes) {
  return nodes
    .filter((node) => node.role === 'worker' && !node.unschedulable)
    .sort((a, b) => {
      if (a.cpuAllocatableMillicores !== b.cpuAllocatableMillicores) {
        return a.cpuAllocatableMillicores - b.cpuAllocatableMillicores;
      }
      return a.name.localeCompare(b.name);
    });
}

function simulateFit(nodes, cpuNeeded, memoryNeeded) {
  let cpuAvailable = 0;
  let memoryAvailable = 0;
  for (const node of nodes) {
    cpuAvailable += Math.max(0, node.cpuAllocatableMillicores - node.cpuRequestedMillicores);
    memoryAvailable += Math.max(0, node.memoryAllocatableBytes - node.memoryRequestedBytes);
  }
  return {
    fits: cpuAvailable >= cpuNeeded && memoryAvailable >= memoryNeeded,
    cpuHeadroomMillicores: cpuAvailable,
    memoryHeadroomBytes: memoryAvailable,
  };
}

export function buildOptimizationReport(snapshot) {
  const workers = chooseWorkers(snapshot.nodes);
  const totalWorkerCpuAllocatable = workers.reduce((sum, node) => sum + node.cpuAllocatableMillicores, 0);
  const totalWorkerMemoryAllocatable = workers.reduce((sum, node) => sum + node.memoryAllocatableBytes, 0);
  const totalWorkerCpuRequested = workers.reduce((sum, node) => sum + node.cpuRequestedMillicores, 0);
  const totalWorkerMemoryRequested = workers.reduce((sum, node) => sum + node.memoryRequestedBytes, 0);
  const totalWorkerCpuUsed = workers.reduce((sum, node) => sum + node.cpuUsedMillicores, 0);
  const totalWorkerMemoryUsed = workers.reduce((sum, node) => sum + node.memoryUsedBytes, 0);

  const simulations = [];
  const removableNodes = [];
  for (let removeCount = 1; removeCount < workers.length; removeCount += 1) {
    const candidates = workers.slice(0, removeCount);
    const survivors = workers.slice(removeCount);
    const cpuToRepack = candidates.reduce((sum, node) => sum + node.cpuRequestedMillicores, 0);
    const memoryToRepack = candidates.reduce((sum, node) => sum + node.memoryRequestedBytes, 0);
    const fit = simulateFit(survivors, cpuToRepack, memoryToRepack);

    const result = {
      removeCount,
      candidateNodes: candidates.map((node) => node.name),
      survivorNodes: survivors.map((node) => node.name),
      fitsByRequests: fit.fits,
      cpuToRepackMillicores: cpuToRepack,
      memoryToRepackBytes: memoryToRepack,
      cpuHeadroomMillicores: fit.cpuHeadroomMillicores,
      memoryHeadroomBytes: fit.memoryHeadroomBytes,
    };
    simulations.push(result);
    if (fit.fits) removableNodes.push(result);
    else break;
  }

  const recommendation = removableNodes.length > 0
    ? removableNodes[removableNodes.length - 1]
    : null;

  const notes = [];
  if (snapshot.pendingPods.length > 0) {
    notes.push(`Ha ${snapshot.pendingPods.length} pods pendentes; nao e seguro reduzir nos antes de resolver esse backlog.`);
  }
  if (!snapshot.metricsAvailable) {
    notes.push('A API metrics.k8s.io nao esta disponivel; a analise usa requests, mas nao consegue validar uso real dos pods.');
  }
  if (recommendation) {
    notes.push(`Pelos requests atuais, ate ${recommendation.removeCount} worker(s) podem ser removidos se os pods candidatos forem redistribuidos com sucesso.`);
  } else {
    notes.push('Nao foi encontrada margem suficiente para remover workers considerando os requests atuais.');
  }

  return {
    metricsAvailable: snapshot.metricsAvailable,
    pendingPodCount: snapshot.pendingPods.length,
    workerTotals: {
      count: workers.length,
      cpuAllocatableCores: millicoresToCores(totalWorkerCpuAllocatable),
      memoryAllocatableGiB: bytesToGiB(totalWorkerMemoryAllocatable),
      cpuRequestedCores: millicoresToCores(totalWorkerCpuRequested),
      memoryRequestedGiB: bytesToGiB(totalWorkerMemoryRequested),
      cpuUsedCores: millicoresToCores(totalWorkerCpuUsed),
      memoryUsedGiB: bytesToGiB(totalWorkerMemoryUsed),
      cpuRequestPct: percent(totalWorkerCpuRequested, totalWorkerCpuAllocatable),
      memoryRequestPct: percent(totalWorkerMemoryRequested, totalWorkerMemoryAllocatable),
      cpuUsagePct: percent(totalWorkerCpuUsed, totalWorkerCpuAllocatable),
      memoryUsagePct: percent(totalWorkerMemoryUsed, totalWorkerMemoryAllocatable),
    },
    recommendation,
    simulations,
    notes,
  };
}
