import { listNamespacesTool } from './namespaces.js';
import { getPodLogsTool } from './logs.js';
import { listNetworkPoliciesTool, createNetworkPolicyTool, deleteNetworkPolicyTool, getNetworkPolicyTool, createNetworkPolicyTemplateTool } from './networkpolicies.js';

export const toolsRegistry = [
  listNamespacesTool,
  listNetworkPoliciesTool,
  getNetworkPolicyTool,
  createNetworkPolicyTool,
  deleteNetworkPolicyTool,
  createNetworkPolicyTemplateTool,
  getPodLogsTool,
];
