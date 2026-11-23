export const CONTRACT_VERSION = '2.0.0';
export const CATALOG_VERSION = '2.0.0';

export const MAX_SPEC_DEPTH = 12;
export const MAX_SPEC_NODES = 120;

export const ALLOWED_ACTIONS = [
  'setVariable',
  'refreshData',
  'changeTab',
  'navigate',
  'setState',
] as const;

export type AllowedActionName = (typeof ALLOWED_ACTIONS)[number];
