import type { JsonPatch } from '@json-render/core';
import {
  isLayoutContainerType,
  type JsonRenderSpec,
} from '@ai-dashboard/contracts';

export interface StreamPatchStep {
  patch: JsonPatch;
  elementId?: string;
  componentType?: string;
  /**
   * 'skeleton' for layout containers (streamed rapidly first to prevent CLS),
   * 'widget' for leaf display/filter components.
   */
  phase: 'skeleton' | 'widget';
  /** True when this patch attaches an already-added element to its parent's children/slots */
  isLinkPatch: boolean;
}

/**
 * Decomposes a complete json-render Spec into a two-phase sequence of RFC 6902
 * JSON Patches (SpecStream lines):
 *
 * - Phase 1 (skeleton): Rapidly emits all layout containers in BFS order so the
 *   page grid/column skeleton stabilizes immediately (eliminating layout shift).
 * - Phase 2 (widget): Emits each leaf widget followed immediately by its parent
 *   attachment patch so widgets materialize smoothly in their pre-allocated slots.
 *
 * Key invariant: every element is added with `children: []` before being linked
 * into its parent's `children` array (`/-`), so EVERY intermediate compiled Spec
 * passes `validateSpec` with zero dangling child references.
 */
export function buildProgressiveSpecPatches(
  spec: JsonRenderSpec,
): StreamPatchStep[] {
  const skeletonSteps: StreamPatchStep[] = [];
  const widgetSteps: StreamPatchStep[] = [];
  const elements = spec.elements ?? {};
  const rootEl = elements[spec.root];
  if (!spec.root || !rootEl) {
    return [];
  }

  const stripLinks = (el: (typeof elements)[string]) => ({
    ...el,
    ...(el.children !== undefined ? { children: [] } : {}),
    ...(el.slots !== undefined
      ? {
          slots: Object.fromEntries(
            Object.keys(el.slots).map((slotName) => [slotName, []]),
          ),
        }
      : {}),
  });

  // 1. Set root key & add root container
  skeletonSteps.push({
    patch: { op: 'add', path: '/root', value: spec.root },
    elementId: spec.root,
    componentType: rootEl.type,
    phase: 'skeleton',
    isLinkPatch: false,
  });

  skeletonSteps.push({
    patch: {
      op: 'add',
      path: `/elements/${spec.root}`,
      value: stripLinks(rootEl),
    },
    elementId: spec.root,
    componentType: rootEl.type,
    phase: 'skeleton',
    isLinkPatch: false,
  });

  // 2. BFS traversal separating layout skeleton containers from leaf widgets
  // Note: To preserve exact parent.children ordering when widgets attach after containers,
  // we emit container nodes first, then emit children in exact parent.children order.
  const visitedContainers = new Set<string>([spec.root]);
  const containerQueue: string[] = [spec.root];
  const orderedParents: string[] = [];

  while (containerQueue.length > 0) {
    const parentId = containerQueue.shift()!;
    const parentEl = elements[parentId];
    if (!parentEl) continue;
    orderedParents.push(parentId);

    for (const childId of parentEl.children ?? []) {
      const childEl = elements[childId];
      if (!childEl) continue;
      const isContainer =
        isLayoutContainerType(childEl.type) &&
        ((childEl.children?.length ?? 0) > 0 ||
          Object.keys(childEl.slots ?? {}).length > 0);

      if (isContainer && !visitedContainers.has(childId)) {
        visitedContainers.add(childId);
        skeletonSteps.push({
          patch: {
            op: 'add',
            path: `/elements/${childId}`,
            value: stripLinks(childEl),
          },
          elementId: childId,
          componentType: childEl.type,
          phase: 'skeleton',
          isLinkPatch: false,
        });
        containerQueue.push(childId);
      }
    }
  }

  // 3. Emit non-container elements and link all children in exact declared order per parent
  const addedElements = new Set<string>(visitedContainers);

  for (const parentId of orderedParents) {
    const parentEl = elements[parentId];
    if (!parentEl) continue;

    for (const childId of parentEl.children ?? []) {
      const childEl = elements[childId];
      if (!childEl) continue;
      const isSkeletonChild = visitedContainers.has(childId);
      const targetBucket = isSkeletonChild ? skeletonSteps : widgetSteps;
      const phase = isSkeletonChild ? 'skeleton' : 'widget';

      if (!addedElements.has(childId)) {
        addedElements.add(childId);
        targetBucket.push({
          patch: {
            op: 'add',
            path: `/elements/${childId}`,
            value: stripLinks(childEl),
          },
          elementId: childId,
          componentType: childEl.type,
          phase,
          isLinkPatch: false,
        });
      }

      // Wait: if a parent mixes container children and leaf children, linking a later
      // container child in skeletonSteps before an earlier leaf child in widgetSteps
      // would invert their relative order in `parent.children`!
      // Therefore, if a parent has ANY leaf children alongside container children,
      // link in widgetSteps in exact order; if all children of parent are containers,
      // link in skeletonSteps!
      const allChildrenAreContainers = (parentEl.children ?? []).every((cid) =>
        visitedContainers.has(cid),
      );
      const linkBucket = allChildrenAreContainers ? skeletonSteps : widgetSteps;
      linkBucket.push({
        patch: {
          op: 'add',
          path: `/elements/${parentId}/children/-`,
          value: childId,
        },
        elementId: childId,
        componentType: childEl.type,
        phase: allChildrenAreContainers ? 'skeleton' : 'widget',
        isLinkPatch: true,
      });
    }

    for (const [slotName, slotChildren] of Object.entries(parentEl.slots ?? {})) {
      for (const childId of slotChildren) {
        const childEl = elements[childId];
        if (!childEl) continue;
        if (!addedElements.has(childId)) {
          addedElements.add(childId);
          widgetSteps.push({
            patch: {
              op: 'add',
              path: `/elements/${childId}`,
              value: stripLinks(childEl),
            },
            elementId: childId,
            componentType: childEl.type,
            phase: 'widget',
            isLinkPatch: false,
          });
        }
        widgetSteps.push({
          patch: {
            op: 'add',
            path: `/elements/${parentId}/slots/${slotName}/-`,
            value: childId,
          },
          elementId: childId,
          componentType: childEl.type,
          phase: 'widget',
          isLinkPatch: true,
        });
      }
    }
  }

  return [...skeletonSteps, ...widgetSteps];
}
