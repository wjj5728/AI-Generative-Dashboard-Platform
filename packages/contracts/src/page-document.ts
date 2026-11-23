import type { Spec, UIElement } from '@json-render/core';
import { z } from 'zod';

/**
 * Re-export official json-render Spec directly as JsonRenderSpec.
 * Never invent an incompatible parallel UI spec protocol.
 */
export type JsonRenderSpec = Spec;
export type JsonRenderElement = UIElement;

export const VariableReferenceSchema = z
  .object({
    $var: z.string().min(1),
  })
  .strict();

export type VariableReference = z.infer<typeof VariableReferenceSchema>;

export function isVariableReference(value: unknown): value is VariableReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    '$var' in value &&
    typeof (value as Record<string, unknown>).$var === 'string'
  );
}

export const VariableOptionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export type VariableOption = z.infer<typeof VariableOptionSchema>;

export const VariableTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'dateRange',
  'stringArray',
]);

export type VariableType = z.infer<typeof VariableTypeSchema>;

export const VariableDefinitionSchema = z.object({
  type: VariableTypeSchema,
  defaultValue: z.unknown(),
  label: z.string().optional(),
  description: z.string().optional(),
  options: z.array(VariableOptionSchema).optional(),
});

export type VariableDefinition = z.infer<typeof VariableDefinitionSchema>;

const QueryParamLiteralSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

export const QueryParamValueSchema = z.union([
  VariableReferenceSchema,
  QueryParamLiteralSchema,
]);

export type QueryParamValue = z.infer<typeof QueryParamValueSchema>;

export const QueryDefinitionSchema = z.object({
  resource: z.string().min(1),
  params: z.record(z.string(), QueryParamValueSchema),
  targetState: z
    .string()
    .startsWith('/', 'targetState must be a JSON Pointer starting with "/"'),
  enabled: z.boolean().optional(),
});

export type QueryDefinition = z.infer<typeof QueryDefinitionSchema>;

export const UIElementRawSchema = z.object({
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()),
  children: z.array(z.string()).optional(),
  slots: z.record(z.string(), z.array(z.string())).optional(),
  visible: z.unknown().optional(),
  on: z.record(z.string(), z.unknown()).optional(),
  repeat: z
    .object({
      statePath: z.union([z.string(), z.object({ $item: z.string() })]),
      key: z.string().optional(),
    })
    .optional(),
  watch: z.record(z.string(), z.unknown()).optional(),
});

export const JsonRenderSpecRawSchema = z.object({
  root: z.string().min(1),
  elements: z.record(z.string(), UIElementRawSchema),
  state: z.record(z.string(), z.unknown()).optional(),
});

export const PageDocumentSchema = z.object({
  contractVersion: z.string().min(1),
  catalogVersion: z.string().min(1),
  id: z.string().optional(),
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  variables: z.record(z.string(), VariableDefinitionSchema),
  queries: z.record(z.string(), QueryDefinitionSchema),
  ui: JsonRenderSpecRawSchema,
});

export interface PageDocument {
  contractVersion: string;
  catalogVersion: string;
  id?: string;
  title: string;
  description?: string;
  variables: Record<string, VariableDefinition>;
  queries: Record<string, QueryDefinition>;
  ui: JsonRenderSpec;
}
