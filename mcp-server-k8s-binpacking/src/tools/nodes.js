import { bytesToMiB, k8sGet, millicoresToCores } from '../utils/k8s.js';
import { getClusterSnapshot } from './cluster-snapshot.js';

function toToolResponse(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export const listNodesTool = {
  name: 'list_nodes',
  description: 'Lista os nos do cluster com role, capacidade, requests, uso real, quantidade de pods e sinais uteis para analise de binpacking.',
  inputSchema: {
    type: 'object',
    properties: {
      ns: { type: 'string', description: 'Filtra pods por namespaces separados por virgula para o calculo de requests e uso.' },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const snapshot = await getClusterSnapshot({ namespaces: typeof args.ns === 'string' ? args.ns : '' });
    return toToolResponse({
      metricsAvailable: snapshot.metricsAvailable,
      total: snapshot.nodes.length,
      items: snapshot.nodes.map((node) => ({
        name: node.name,
        role: node.role,
        ip: node.ip,
        unschedulable: node.unschedulable,
        podCount: node.podCount,
        cpuAllocatableCores: node.cpuAllocatableCores,
        memoryAllocatableGiB: node.memoryAllocatableGiB,
        cpuRequestedCores: millicoresToCores(node.cpuRequestedMillicores),
        memoryRequestedMiB: bytesToMiB(node.memoryRequestedBytes),
        cpuUsedCores: millicoresToCores(node.cpuUsedMillicores),
        memoryUsedMiB: bytesToMiB(node.memoryUsedBytes),
        cpuRequestPct: node.cpuRequestPct,
        memoryRequestPct: node.memoryRequestPct,
        cpuUsagePct: node.cpuUsagePct,
        memoryUsagePct: node.memoryUsagePct,
      })),
    });
  },
};

export const describeNodeTool = {
  name: 'describe_node',
  description: 'Retorna um describe read-only de um no: labels, taints, condicoes, capacidade, requests, uso real e os pods alocados nele.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome do no.' },
      ns: { type: 'string', description: 'Filtra pods por namespaces separados por virgula.' },
    },
    required: ['name'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const name = typeof args.name === 'string' ? args.name : '';
    if (!name) {
      return { content: [{ type: 'text', text: 'Erro: parametro "name" obrigatorio.' }], isError: true };
    }

    const snapshot = await getClusterSnapshot({ namespaces: typeof args.ns === 'string' ? args.ns : '' });
    const node = snapshot.nodes.find((item) => item.name === name);
    if (!node) {
      return { content: [{ type: 'text', text: `No "${name}" nao encontrado.` }], isError: true };
    }

    const liveNode = await k8sGet(`/api/v1/nodes/${encodeURIComponent(name)}`);
    const pods = snapshot.pods
      .filter((pod) => pod.nodeName === name)
      .sort((a, b) => {
        if (b.cpuRequestedMillicores !== a.cpuRequestedMillicores) {
          return b.cpuRequestedMillicores - a.cpuRequestedMillicores;
        }
        return a.name.localeCompare(b.name);
      });

    return toToolResponse({
      metricsAvailable: snapshot.metricsAvailable,
      node: {
        name: node.name,
        role: node.role,
        ip: node.ip,
        unschedulable: node.unschedulable,
        labels: node.labels,
        taints: node.taints,
        conditions: node.conditions,
        capacity: liveNode?.status?.capacity || {},
        allocatable: liveNode?.status?.allocatable || {},
        pressure: {
          memoryPressure: node.conditions?.MemoryPressure?.status || 'Unknown',
          diskPressure: node.conditions?.DiskPressure?.status || 'Unknown',
          pidPressure: node.conditions?.PIDPressure?.status || 'Unknown',
          ready: node.conditions?.Ready?.status || 'Unknown',
        },
        requests: {
          cpuMillicores: node.cpuRequestedMillicores,
          cpuCores: node.cpuRequestedCores,
          memoryBytes: node.memoryRequestedBytes,
          memoryMiB: bytesToMiB(node.memoryRequestedBytes),
        },
        usage: {
          cpuMillicores: node.cpuUsedMillicores,
          cpuCores: millicoresToCores(node.cpuUsedMillicores),
          memoryBytes: node.memoryUsedBytes,
          memoryMiB: bytesToMiB(node.memoryUsedBytes),
        },
        percentages: {
          cpuRequestPct: node.cpuRequestPct,
          memoryRequestPct: node.memoryRequestPct,
          cpuUsagePct: node.cpuUsagePct,
          memoryUsagePct: node.memoryUsagePct,
        },
      },
      pods,
    });
  },
};
