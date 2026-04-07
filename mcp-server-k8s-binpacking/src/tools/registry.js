import { getBinpackingTool } from './binpacking.js';
import { describeNodeTool, listNodesTool } from './nodes.js';
import { getOptimizationReportTool } from './optimization.js';
import { listPodUsageTool } from './pod-usage.js';

export const toolsRegistry = [
  listNodesTool,
  describeNodeTool,
  listPodUsageTool,
  getBinpackingTool,
  getOptimizationReportTool,
];
