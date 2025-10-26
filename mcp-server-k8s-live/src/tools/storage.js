import { k8sGet } from '../utils/k8s.js';

async function getStorageMetrics(ns = '') {
  const nsFilter = ns.split(',').map(s => s.trim()).filter(Boolean);
  const pvs = await k8sGet('/api/v1/persistentvolumes');
  const pvList = (pvs.items || []).map(pv => ({
    name: pv?.metadata?.name || 'unknown',
    capacity: pv?.spec?.capacity?.storage || '0',
    accessModes: pv?.spec?.accessModes || [],
    storageClass: pv?.spec?.storageClassName || 'default',
    status: pv?.status?.phase || 'Unknown',
    claimRef: pv?.spec?.claimRef ? `${pv.spec.claimRef.namespace}/${pv.spec.claimRef.name}` : null,
  }));

  const pvcs = await k8sGet('/api/v1/persistentvolumeclaims');
  const pvcList = [];
  for (const pvc of (pvcs.items || [])) {
    const namespace = pvc?.metadata?.namespace || 'default';
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    pvcList.push({
      namespace,
      name: pvc?.metadata?.name || 'unknown',
      status: pvc?.status?.phase || 'Unknown',
      volume: pvc?.spec?.volumeName || null,
      capacity: pvc?.status?.capacity?.storage || '0',
      requestedStorage: pvc?.spec?.resources?.requests?.storage || '0',
      accessModes: pvc?.spec?.accessModes || [],
      storageClass: pvc?.spec?.storageClassName || 'default',
    });
  }
  return { persistentVolumes: pvList, persistentVolumeClaims: pvcList };
}

export const tool = {
  name: 'get_storage',
  description: 'Obtém dados de armazenamento do cluster, incluindo PersistentVolumes e PersistentVolumeClaims com capacidades e status.',
  inputSchema: {
    type: 'object',
    properties: {
      ns: { type: 'string', description: 'Namespaces separados por vírgula para filtrar PVCs (opcional).' },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const ns = typeof args.ns === 'string' ? args.ns : '';
    const data = await getStorageMetrics(ns);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
