import { tool as live } from './live.js';
import { tool as deployments } from './deployments.js';
import { tool as services } from './services.js';
import { tool as storage } from './storage.js';
import { tool as events } from './events.js';
import { tool as overview } from './overview.js';
import { createVpaTool, deleteVpaTool, createVpasForNamespaceTool } from './vpa.js';
import { tool as setMachineSetReplicas } from './machinesets.js';

export const toolsRegistry = [
  live,
  deployments,
  services,
  storage,
  events,
  overview,
  createVpaTool,
  deleteVpaTool,
  createVpasForNamespaceTool,
  setMachineSetReplicas,
];
