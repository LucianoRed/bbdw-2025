import { toolDays } from './days.js';
import { toolPresentations } from './presentations.js';
import { toolProducts } from './products.js';
import { toolReports } from './reports.js';
import { toolRegistrations } from './registrations.js';

export const toolsRegistry = [
  ...toolDays,
  ...toolPresentations,
  ...toolProducts,
  ...toolReports,
  ...toolRegistrations,
];
