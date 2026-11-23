import { diffToPatches, type JsonPatch } from '@json-render/core';
import type { JsonRenderSpec } from './page-document.js';

export const LAYOUT_CONTAINER_TYPES = new Set([
  'Row',
  'Column',
  'DashboardRow',
  'DashboardColumn',
  'DashboardGrid',
  'DashboardPanel',
  'DashboardCard',
]);

export function isLayoutContainerType(type?: string): boolean {
  return Boolean(type && LAYOUT_CONTAINER_TYPES.has(type));
}

export interface ParentLocation {
  parentId: string;
  index: number;
}

/**
 * Find the parent container and child index of an element in a flat json-render Spec.
 */
export function findParentOfElement(
  spec: JsonRenderSpec,
  targetId: string,
): ParentLocation | null {
  for (const [parentId, el] of Object.entries(spec.elements ?? {})) {
    const children = el.children ?? [];
    const index = children.indexOf(targetId);
    if (index !== -1) {
      return { parentId, index };
    }
  }
  return null;
}

/**
 * Returns true if `candidateId` is inside the subtree rooted at `ancestorId`.
 * Used to guarantee drag-and-drop can never introduce a circular reference.
 */
export function isDescendantOf(
  spec: JsonRenderSpec,
  ancestorId: string,
  candidateId: string,
): boolean {
  if (ancestorId === candidateId) return true;
  const visited = new Set<string>();
  const stack: string[] = [ancestorId];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);

    const el = spec.elements?.[cur];
    if (!el) continue;
    const allChildren = [
      ...(el.children ?? []),
      ...Object.values(el.slots ?? {}).flat(),
    ];
    for (const childId of allChildren) {
      if (childId === candidateId) return true;
      stack.push(childId);
    }
  }

  return false;
}

/**
 * Check whether moving `sourceId` into `targetContainerId` is structurally safe.
 */
export function canMoveElement(
  spec: JsonRenderSpec,
  sourceId: string,
  targetContainerId: string,
): boolean {
  if (!sourceId || !targetContainerId) return false;
  if (sourceId === spec.root) return false;
  if (sourceId === targetContainerId) return false;
  if (!(sourceId in spec.elements) || !(targetContainerId in spec.elements)) {
    return false;
  }
  const targetEl = spec.elements[targetContainerId];
  if (!isLayoutContainerType(targetEl.type)) return false;
  if (isDescendantOf(spec, sourceId, targetContainerId)) return false;
  return true;
}

export type MoveTarget =
  | { mode: 'into'; containerId: string; index?: number }
  | { mode: 'before'; targetId: string }
  | { mode: 'after'; targetId: string };

export interface LayoutMutationResult {
  spec: JsonRenderSpec;
  patches: JsonPatch[];
  changed: boolean;
  description: string;
}

/**
 * Move or reorder an element inside a json-render Spec cleanly,
 * returning a new Spec and canonical RFC 6902 JSON Patches.
 */
export function moveElementInSpec(
  spec: JsonRenderSpec,
  sourceId: string,
  target: MoveTarget,
): LayoutMutationResult {
  const sourceLoc = findParentOfElement(spec, sourceId);
  if (!sourceLoc || sourceId === spec.root) {
    return { spec, patches: [], changed: false, description: '' };
  }

  let targetContainerId: string;
  let desiredIndex: number;

  if (target.mode === 'into') {
    targetContainerId = target.containerId;
    const existingChildren = spec.elements[targetContainerId]?.children ?? [];
    desiredIndex =
      target.index !== undefined
        ? Math.max(0, Math.min(target.index, existingChildren.length))
        : existingChildren.length;
  } else {
    if (target.targetId === sourceId) {
      return { spec, patches: [], changed: false, description: '' };
    }
    const targetLoc = findParentOfElement(spec, target.targetId);
    if (!targetLoc) {
      return { spec, patches: [], changed: false, description: '' };
    }
    targetContainerId = targetLoc.parentId;
    desiredIndex =
      target.mode === 'before' ? targetLoc.index : targetLoc.index + 1;
  }

  if (!canMoveElement(spec, sourceId, targetContainerId)) {
    return { spec, patches: [], changed: false, description: '' };
  }

  const nextSpec = structuredClone(spec);
  const srcChildren = [...(nextSpec.elements[sourceLoc.parentId].children ?? [])];
  srcChildren.splice(sourceLoc.index, 1);
  nextSpec.elements[sourceLoc.parentId].children = srcChildren;

  const dstChildren =
    sourceLoc.parentId === targetContainerId
      ? srcChildren
      : [...(nextSpec.elements[targetContainerId].children ?? [])];

  let insertIndex = desiredIndex;
  if (sourceLoc.parentId === targetContainerId && sourceLoc.index < desiredIndex) {
    insertIndex = Math.max(0, desiredIndex - 1);
  }
  insertIndex = Math.max(0, Math.min(insertIndex, dstChildren.length));

  dstChildren.splice(insertIndex, 0, sourceId);
  nextSpec.elements[targetContainerId].children = dstChildren;

  const patches = diffToPatches(
    spec as unknown as Record<string, unknown>,
    nextSpec as unknown as Record<string, unknown>,
  );

  if (patches.length === 0) {
    return { spec, patches: [], changed: false, description: '' };
  }

  const srcTitle =
    String((spec.elements[sourceId]?.props as Record<string, unknown>)?.title ?? '') ||
    sourceId;
  const description =
    sourceLoc.parentId === targetContainerId
      ? `拖拽调整 "${srcTitle}" 排序（${targetContainerId} 内第 ${insertIndex + 1} 位）`
      : `拖拽移动 "${srcTitle}" 到容器 ${targetContainerId}`;

  return {
    spec: nextSpec,
    patches,
    changed: true,
    description,
  };
}

export type QuickContainerLayoutMode =
  | 'row'
  | 'column'
  | 'grid-2'
  | 'grid-3'
  | 'grid-4';

/**
 * Switch a layout container between Row, Column, and DashboardGrid presets in-place.
 */
export function switchContainerLayoutInSpec(
  spec: JsonRenderSpec,
  containerId: string,
  mode: QuickContainerLayoutMode,
): LayoutMutationResult {
  const el = spec.elements?.[containerId];
  if (!el || !isLayoutContainerType(el.type)) {
    return { spec, patches: [], changed: false, description: '' };
  }

  const nextSpec = structuredClone(spec);
  const target = nextSpec.elements[containerId];
  const currentGap =
    typeof (target.props as Record<string, unknown>)?.gap === 'string'
      ? (target.props as Record<string, unknown>).gap
      : 'md';

  if (mode === 'row') {
    target.type = 'Row';
    target.props = {
      gap: currentGap,
      align: 'stretch',
      equalWidth: true,
      wrap: true,
      width: 'full',
    };
  } else if (mode === 'column') {
    target.type = 'Column';
    target.props = {
      gap: currentGap,
      width: 'full',
    };
  } else {
    const preset =
      mode === 'grid-2' ? 'equal-2' : mode === 'grid-3' ? 'equal-3' : 'equal-4';
    target.type = 'DashboardGrid';
    target.props = {
      preset,
      gap: currentGap,
    };
  }

  const patches = diffToPatches(
    spec as unknown as Record<string, unknown>,
    nextSpec as unknown as Record<string, unknown>,
  );

  if (patches.length === 0) {
    return { spec, patches: [], changed: false, description: '' };
  }

  const labelMap: Record<QuickContainerLayoutMode, string> = {
    row: 'Row（横向并排）',
    column: 'Column（纵向堆叠）',
    'grid-2': '2 列网格',
    'grid-3': '3 列网格',
    'grid-4': '4 列网格',
  };

  return {
    spec: nextSpec,
    patches,
    changed: true,
    description: `切换容器 ${containerId} 布局为 ${labelMap[mode]}`,
  };
}

/**
 * Remove an element and any unreachable subtree nodes from a json-render Spec.
 */
export function removeElementFromSpec(
  spec: JsonRenderSpec,
  targetId: string,
): LayoutMutationResult {
  if (!targetId || targetId === spec.root || !(targetId in spec.elements)) {
    return { spec, patches: [], changed: false, description: '' };
  }

  const parentLoc = findParentOfElement(spec, targetId);
  if (!parentLoc) {
    return { spec, patches: [], changed: false, description: '' };
  }

  const nextSpec = structuredClone(spec);
  nextSpec.elements[parentLoc.parentId].children = (
    nextSpec.elements[parentLoc.parentId].children ?? []
  ).filter((id) => id !== targetId);

  // Compute reachable elements from root to clean up unreachable descendants
  const reachable = new Set<string>();
  const stack: string[] = [nextSpec.root];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (reachable.has(cur) || !(cur in nextSpec.elements)) continue;
    reachable.add(cur);
    const node = nextSpec.elements[cur];
    for (const childId of [
      ...(node.children ?? []),
      ...Object.values(node.slots ?? {}).flat(),
    ]) {
      stack.push(childId);
    }
  }

  for (const id of Object.keys(nextSpec.elements)) {
    if (!reachable.has(id)) {
      delete nextSpec.elements[id];
    }
  }

  const patches = diffToPatches(
    spec as unknown as Record<string, unknown>,
    nextSpec as unknown as Record<string, unknown>,
  );
  const title =
    String((spec.elements[targetId]?.props as Record<string, unknown>)?.title ?? '') ||
    targetId;

  return {
    spec: nextSpec,
    patches,
    changed: patches.length > 0,
    description: `移除组件 "${title}" (${targetId})`,
  };
}
