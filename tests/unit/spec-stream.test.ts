import { describe, expect, it } from 'vitest';
import { createSpecStreamCompiler, validateSpec } from '@json-render/core';
import type { JsonRenderSpec } from '@ai-dashboard/contracts';
import { buildProgressiveSpecPatches } from '../../apps/server/src/ai/spec-stream';
import {
  buildGameAdsDashboard,
  buildRevenueAnalysisDashboard,
  buildTrafficAnalysisDashboard,
} from '../../apps/server/src/ai/templates';

describe('Progressive SpecStream Patch Builder', () => {
  it('streams all 3 dashboard templates with structurally valid intermediate frames and exact final spec', () => {
    const docs = [
      buildGameAdsDashboard(),
      buildTrafficAnalysisDashboard(),
      buildRevenueAnalysisDashboard(),
    ];

    for (const doc of docs) {
      const steps = buildProgressiveSpecPatches(doc.ui);
      expect(steps.length).toBeGreaterThan(Object.keys(doc.ui.elements).length);

      // Verify two-phase ordering: all 'skeleton' steps appear before 'widget' steps
      const firstWidgetIdx = steps.findIndex((s) => s.phase === 'widget');
      const lastSkeletonIdx = steps.map((s) => s.phase).lastIndexOf('skeleton');
      expect(firstWidgetIdx).toBeGreaterThan(0);
      expect(lastSkeletonIdx).toBeLessThan(firstWidgetIdx);

      const compiler = createSpecStreamCompiler<JsonRenderSpec>({
        root: '',
        elements: {},
      });

      for (let i = 0; i < steps.length; i++) {
        const { result } = compiler.push(`${JSON.stringify(steps[i].patch)}\n`);
        // Starting from frame index 1 (once /root and /elements/root exist),
        // every intermediate frame must have zero dangling references.
        if (i >= 1) {
          const check = validateSpec(result);
          expect(check.valid, `Frame ${i} invalid: ${JSON.stringify(check.issues)}`).toBe(
            true,
          );
        }
      }

      const finalSpec = compiler.getResult();
      expect(finalSpec.root).toBe(doc.ui.root);
      expect(Object.keys(finalSpec.elements).sort()).toEqual(
        Object.keys(doc.ui.elements).sort(),
      );
      expect(finalSpec).toEqual(doc.ui);
    }
  });
});
