import { tool as live } from './live.js';
import { tool as deployments, setDeploymentReplicasTool, addDeploymentEnvVarTool } from './deployments.js';
import { getPodLogsTool } from './logs.js';
import { tool as services } from './services.js';
import { tool as storage } from './storage.js';
import { tool as events } from './events.js';
import { tool as overview } from './overview.js';
import { createVpaTool, deleteVpaTool, createVpasForNamespaceTool } from './vpa.js';
import { setMachineSetReplicasTool as setMachineSetReplicas, listMachineSetsTool } from './machinesets.js';
import { deletePodTool, deletePodsBySelectorTool } from './pods.js';

export const toolsRegistry = [
  live,
  deployments,
  setDeploymentReplicasTool,
  addDeploymentEnvVarTool,
  getPodLogsTool,
  services,
  storage,
  events,
  overview,
  createVpaTool,
  deleteVpaTool,
  createVpasForNamespaceTool,
  setMachineSetReplicas,
  listMachineSetsTool,
  deletePodTool,
  deletePodsBySelectorTool,
];
