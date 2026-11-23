import { validateSpec } from '@json-render/core';
import {
  ALLOWED_ACTIONS,
  CATALOG_VERSION,
  CONTRACT_VERSION,
  MAX_SPEC_DEPTH,
  MAX_SPEC_NODES,
  PageDocumentSchema,
  getDefaultVariableValues,
  isVariableReference,
  resolveQueryParams,
  type PageDocument,
  type ValidationIssue,
  type ValidationReport,
} from '@ai-dashboard/contracts';
import {
  ALL_DATASOURCE_CONTRACTS,
  getDataSourceField,
} from '@ai-dashboard/datasource-contract';
import { dashboardCatalog } from './catalog.js';

export interface ValidatePageDocumentOptions {
  /** Current authenticated user roles for DataSource access verification */
  userRoles?: string[];
  /** Strict mode treats warnings as valid=true unless errors exist */
  maxDepth?: number;
  maxNodes?: number;
}

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<script\b/i, reason: 'Embedded <script> tags are forbidden' },
  { pattern: /\bjavascript:/i, reason: 'javascript: URLs are forbidden' },
  { pattern: /\beval\s*\(/i, reason: 'eval() expressions are forbidden' },
  { pattern: /\bnew\s+Function\s*\(/i, reason: 'Dynamic Function() constructors are forbidden' },
  { pattern: /\bSELECT\s+.+\s+FROM\s+/i, reason: 'Raw SQL statements are forbidden in Schema' },
  { pattern: /\bDROP\s+TABLE\b/i, reason: 'Raw SQL statements are forbidden in Schema' },
  { pattern: /\b__proto__\b|\bconstructor\b/i, reason: 'Prototype pollution keys are forbidden' },
];

const NUMERIC_FIELD_TYPES = new Set(['number', 'currency', 'percent', 'ratio', 'integer']);

function pushIssue(
  list: ValidationIssue[],
  code: string,
  path: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
) {
  list.push({ code, path, message, severity });
}

function scanUnsafeStrings(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (typeof value === 'string') {
    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      if (pattern.test(value)) {
        pushIssue(errors, 'FORBIDDEN_CONTENT', path, `${reason}: "${value.slice(0, 60)}"`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => scanUnsafeStrings(item, `${path}[${idx}]`, errors));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        pushIssue(errors, 'FORBIDDEN_CONTENT', `${path}.${key}`, 'Prototype pollution key is forbidden');
        continue;
      }
      if (typeof nested === 'function') {
        pushIssue(errors, 'FORBIDDEN_FUNCTION', `${path}.${key}`, 'Inline functions are forbidden in Schema');
        continue;
      }
      scanUnsafeStrings(nested, `${path}.${key}`, errors);
    }
  }
}

function collectStateRefs(value: unknown, path: string, out: Array<{ ref: string; kind: '$state' | '$bindState'; path: string }>) {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, idx) => collectStateRefs(item, `${path}[${idx}]`, out));
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.$state === 'string' && Object.keys(record).length === 1) {
    out.push({ ref: record.$state, kind: '$state', path });
    return;
  }
  if (typeof record.$bindState === 'string' && Object.keys(record).length === 1) {
    out.push({ ref: record.$bindState, kind: '$bindState', path });
    return;
  }
  for (const [k, v] of Object.entries(record)) {
    collectStateRefs(v, `${path}.${k}`, out);
  }
}

function extractActionBindings(bindingOrArray: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(bindingOrArray)) {
    return bindingOrArray.filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
    );
  }
  if (typeof bindingOrArray === 'object' && bindingOrArray !== null) {
    return [bindingOrArray as Record<string, unknown>];
  }
  return [];
}

/**
 * Full 14-point PageDocument validator enforcing schema contract, json-render
 * catalog compliance, graph integrity, DataSource & field type matching,
 * action allowlist, security policies, and user access control.
 */
export function validatePageDocument(
  input: unknown,
  options: ValidatePageDocumentOptions = {},
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const maxDepth = options.maxDepth ?? MAX_SPEC_DEPTH;
  const maxNodes = options.maxNodes ?? MAX_SPEC_NODES;

  // Basic structural Zod parse
  const parsed = PageDocumentSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      pushIssue(
        errors,
        'SCHEMA_STRUCTURE_INVALID',
        issue.path.join('.') || '$',
        issue.message,
      );
    }
    return { valid: false, errors, warnings };
  }

  const doc = parsed.data as PageDocument;

  // Security scan: forbid executable JS, SQL, script tags, inline functions
  scanUnsafeStrings(doc, '$', errors);

  // 1. Contract version check
  if (doc.contractVersion !== CONTRACT_VERSION) {
    pushIssue(
      errors,
      'INVALID_CONTRACT_VERSION',
      'contractVersion',
      `Unsupported contractVersion "${doc.contractVersion}". Expected "${CONTRACT_VERSION}".`,
    );
  }

  // 2. Component Catalog version check
  if (doc.catalogVersion !== CATALOG_VERSION) {
    pushIssue(
      errors,
      'INVALID_CATALOG_VERSION',
      'catalogVersion',
      `Unsupported catalogVersion "${doc.catalogVersion}". Expected "${CATALOG_VERSION}".`,
    );
  }

  // 5 & 6. Official json-render validateSpec check (root, missing children, misplaced fields)
  const coreSpecCheck = validateSpec(doc.ui, { checkOrphans: true });
  for (const issue of coreSpecCheck.issues) {
    const target = issue.severity === 'error' ? errors : warnings;
    pushIssue(
      target,
      `SPEC_${issue.code.toUpperCase()}`,
      issue.elementKey ? `ui.elements.${issue.elementKey}` : 'ui',
      issue.message,
      issue.severity,
    );
  }

  const elements = doc.ui.elements ?? {};
  const elementIds = Object.keys(elements);

  // 8. Max node count check
  if (elementIds.length > maxNodes) {
    pushIssue(
      errors,
      'MAX_NODES_EXCEEDED',
      'ui.elements',
      `Spec contains ${elementIds.length} nodes, exceeding maximum allowed ${maxNodes}.`,
    );
  }

  // 3 & 4. Component type & props validation against official json-render catalog
  const registeredComponents = new Set(dashboardCatalog.componentNames);
  const allowedActionSet = new Set<string>(ALLOWED_ACTIONS);

  for (const [elId, element] of Object.entries(elements)) {
    const elPath = `ui.elements.${elId}`;

    if (!registeredComponents.has(element.type)) {
      pushIssue(
        errors,
        'UNKNOWN_COMPONENT',
        `${elPath}.type`,
        `Component type "${element.type}" is not registered in Component Catalog.`,
      );
      continue;
    }

    // Per-component Zod props validation using dashboardCatalog.data.components
    const compDef = (dashboardCatalog.data.components as Record<string, { props: any; slots?: string[] }>)[
      element.type
    ];
    if (compDef?.props) {
      const propCheck = compDef.props.safeParse(element.props);
      if (!propCheck.success) {
        for (const zIssue of propCheck.error.issues) {
          pushIssue(
            errors,
            'INVALID_COMPONENT_PROPS',
            `${elPath}.props.${zIssue.path.join('.')}`,
            `[${element.type}] ${zIssue.message}`,
          );
        }
      }
    }

    // 13. Action allowlist check (element.on and element.watch)
    if (element.on) {
      for (const [eventName, rawBinding] of Object.entries(element.on)) {
        for (const binding of extractActionBindings(rawBinding)) {
          const actionName = binding.action;
          if (typeof actionName !== 'string' || !allowedActionSet.has(actionName)) {
            pushIssue(
              errors,
              'DISALLOWED_ACTION',
              `${elPath}.on.${eventName}`,
              `Action "${String(actionName)}" is not in the allowed action whitelist (${ALLOWED_ACTIONS.join(', ')}).`,
            );
          }
        }
      }
    }
    if (element.watch) {
      for (const [watchPath, rawBinding] of Object.entries(element.watch)) {
        for (const binding of extractActionBindings(rawBinding)) {
          const actionName = binding.action;
          if (typeof actionName !== 'string' || !allowedActionSet.has(actionName)) {
            pushIssue(
              errors,
              'DISALLOWED_ACTION',
              `${elPath}.watch.${watchPath}`,
              `Watch action "${String(actionName)}" is not in the allowed action whitelist.`,
            );
          }
        }
      }
    }

    // Check slot references exist
    if (element.slots) {
      for (const [slotName, slotChildren] of Object.entries(element.slots)) {
        for (const childId of slotChildren) {
          if (!(childId in elements)) {
            pushIssue(
              errors,
              'MISSING_SLOT_CHILD',
              `${elPath}.slots.${slotName}`,
              `Slot "${slotName}" references missing element "${childId}".`,
            );
          }
        }
      }
    }
  }

  // Also run catalog.validate(doc.ui) for full official json-render catalog compliance
  const catalogCheck = dashboardCatalog.validate(doc.ui);
  if (!catalogCheck.success && errors.length === 0) {
    for (const issue of catalogCheck.error?.issues ?? []) {
      pushIssue(
        errors,
        'CATALOG_VALIDATION_FAILED',
        `ui.${issue.path.join('.')}`,
        issue.message,
      );
    }
  }

  // 6 & 7. Cycle detection & max nesting depth via DFS from root
  if (doc.ui.root && doc.ui.root in elements) {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    let detectedCycle = false;

    const dfs = (nodeId: string, depth: number) => {
      if (depth > maxDepth) {
        pushIssue(
          errors,
          'MAX_DEPTH_EXCEEDED',
          `ui.elements.${nodeId}`,
          `Component tree nesting depth ${depth} exceeds maximum allowed ${maxDepth}.`,
        );
        return;
      }
      if (visiting.has(nodeId)) {
        if (!detectedCycle) {
          detectedCycle = true;
          pushIssue(
            errors,
            'CIRCULAR_REFERENCE',
            `ui.elements.${nodeId}`,
            `Circular reference detected involving element "${nodeId}".`,
          );
        }
        return;
      }
      if (visited.has(nodeId)) return;

      visiting.add(nodeId);
      const node = elements[nodeId];
      if (node) {
        const allChildren = [
          ...(node.children ?? []),
          ...Object.values(node.slots ?? {}).flat(),
        ];
        for (const childId of allChildren) {
          if (childId in elements) {
            dfs(childId, depth + 1);
          }
        }
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
    };

    dfs(doc.ui.root, 1);
  }

  // 9, 10, 12, 14. DataSource reference, query params, variable references & access permissions
  const defaultVars = getDefaultVariableValues(doc.variables);
  const queryTargetMap = new Map<string, { queryId: string; resource: string }>();

  for (const [queryId, query] of Object.entries(doc.queries)) {
    const qPath = `queries.${queryId}`;
    const contract = ALL_DATASOURCE_CONTRACTS[query.resource];

    if (!contract) {
      pushIssue(
        errors,
        'UNKNOWN_DATASOURCE',
        `${qPath}.resource`,
        `DataSource "${query.resource}" is not registered in DataSource Catalog.`,
      );
      continue;
    }

    queryTargetMap.set(query.targetState, { queryId, resource: query.resource });

    // 14. Permission check
    if (options.userRoles) {
      const missingRoles = contract.requiredRoles.filter(
        (role) => !options.userRoles!.includes(role),
      );
      if (missingRoles.length > 0) {
        pushIssue(
          errors,
          'FORBIDDEN_DATASOURCE_ACCESS',
          `${qPath}.resource`,
          `Current user lacks required role(s) [${missingRoles.join(', ')}] for DataSource "${query.resource}".`,
        );
      }
    }

    // 12. Variable reference validation inside query params
    for (const [paramName, rawVal] of Object.entries(query.params)) {
      if (isVariableReference(rawVal)) {
        if (!(rawVal.$var in doc.variables)) {
          pushIssue(
            errors,
            'UNKNOWN_VARIABLE_REF',
            `${qPath}.params.${paramName}`,
            `Query parameter "${paramName}" references undeclared variable "$var:${rawVal.$var}".`,
          );
        }
      }
    }

    // 10. Validate resolved params against DataSource paramsSchema
    const resolvedParams = resolveQueryParams(query, defaultVars, doc.variables);
    const paramResult = contract.paramsSchema.safeParse(resolvedParams);
    if (!paramResult.success) {
      for (const issue of paramResult.error.issues) {
        pushIssue(
          errors,
          'INVALID_QUERY_PARAMS',
          `${qPath}.params.${issue.path.join('.')}`,
          `[${query.resource}] ${issue.message}`,
        );
      }
    }
  }

  // 11 & 12. Validate $state / $bindState bindings against variables & DataSource field types
  for (const [elId, element] of Object.entries(elements)) {
    const elPath = `ui.elements.${elId}`;
    const refs: Array<{ ref: string; kind: '$state' | '$bindState'; path: string }> = [];
    collectStateRefs(element.props, `${elPath}.props`, refs);

    for (const { ref, path } of refs) {
      if (ref.startsWith('/variables/')) {
        const varName = ref.slice('/variables/'.length).split('/')[0];
        if (!varName || !(varName in doc.variables)) {
          pushIssue(
            errors,
            'UNKNOWN_VARIABLE_BINDING',
            path,
            `State binding "${ref}" references undeclared variable "${varName}".`,
          );
        }
      } else if (ref.startsWith('/data/')) {
        // Match longest targetState prefix in queryTargetMap
        let matchedTarget: { targetState: string; queryId: string; resource: string } | undefined;
        for (const [targetState, info] of queryTargetMap.entries()) {
          if (ref === targetState || ref.startsWith(`${targetState}/`)) {
            if (!matchedTarget || targetState.length > matchedTarget.targetState.length) {
              matchedTarget = { targetState, ...info };
            }
          }
        }

        if (!matchedTarget) {
          pushIssue(
            errors,
            'UNBOUND_DATA_STATE',
            path,
            `Data binding "${ref}" does not match any query targetState in PageDocument.queries.`,
          );
          continue;
        }

        const contract = ALL_DATASOURCE_CONTRACTS[matchedTarget.resource];
        if (!contract) continue;

        const subPath = ref.slice(matchedTarget.targetState.length).replace(/^\//, '');
        if (subPath) {
          const fieldName = subPath.split('/')[0];
          const fieldMeta = getDataSourceField(matchedTarget.resource, fieldName);
          if (!fieldMeta) {
            pushIssue(
              errors,
              'UNKNOWN_DATA_FIELD',
              path,
              `Field "${fieldName}" does not exist on DataSource "${matchedTarget.resource}".`,
            );
          } else if (
            element.type === 'StatCard' &&
            path.endsWith('.delta') &&
            !NUMERIC_FIELD_TYPES.has(fieldMeta.type)
          ) {
            pushIssue(
              errors,
              'DATA_FIELD_TYPE_MISMATCH',
              path,
              `StatCard.delta expects numeric field, got "${fieldMeta.type}" from ${matchedTarget.resource}.${fieldName}.`,
            );
          }
        } else {
          // Bound directly to root query targetState (e.g. /data/daily)
          const expectsArray = [
            'LineChart',
            'BarChart',
            'PieChart',
            'DonutChart',
            'DataTable',
            'MetricList',
            'ProgressList',
          ].includes(element.type);
          if (expectsArray && path.endsWith('.data') && contract.metadata.resultType !== 'array') {
            pushIssue(
              errors,
              'DATA_FIELD_TYPE_MISMATCH',
              path,
              `Component "${element.type}" requires an array DataSource, but "${matchedTarget.resource}" returns "${contract.metadata.resultType}".`,
            );
          }

          // Validate field references inside chart/table/list props against the bound DataSource fields
          if (expectsArray && path.endsWith('.data')) {
            const props = element.props as Record<string, any>;
            const checkField = (fieldName: unknown, propName: string, requireNumeric = false) => {
              if (typeof fieldName !== 'string' || !fieldName) return;
              const fm = getDataSourceField(matchedTarget!.resource, fieldName);
              if (!fm) {
                pushIssue(
                  errors,
                  'UNKNOWN_DATA_FIELD',
                  `${elPath}.props.${propName}`,
                  `Field "${fieldName}" does not exist in DataSource "${matchedTarget!.resource}".`,
                );
              } else if (requireNumeric && !NUMERIC_FIELD_TYPES.has(fm.type)) {
                pushIssue(
                  errors,
                  'DATA_FIELD_TYPE_MISMATCH',
                  `${elPath}.props.${propName}`,
                  `Field "${fieldName}" in "${matchedTarget!.resource}" has type "${fm.type}", expected numeric.`,
                );
              }
            };

            if (element.type === 'LineChart' || element.type === 'BarChart') {
              checkField(props.xField, 'xField', false);
              if (Array.isArray(props.series)) {
                props.series.forEach((s: any, idx: number) =>
                  checkField(s?.field, `series[${idx}].field`, true),
                );
              }
            } else if (element.type === 'PieChart' || element.type === 'DonutChart') {
              checkField(props.nameField, 'nameField', false);
              checkField(props.valueField, 'valueField', true);
            } else if (element.type === 'MetricList') {
              checkField(props.labelField, 'labelField', false);
              checkField(props.valueField, 'valueField', false);
              checkField(props.secondaryField, 'secondaryField', false);
            } else if (element.type === 'ProgressList') {
              checkField(props.labelField, 'labelField', false);
              checkField(props.valueField, 'valueField', true);
              checkField(props.percentField, 'percentField', true);
            } else if (element.type === 'DataTable' && Array.isArray(props.columns)) {
              props.columns.forEach((col: any, idx: number) =>
                checkField(col?.dataIndex, `columns[${idx}].dataIndex`, false),
              );
            }
          }
        }
      }
    }

    // Validate SelectFilter / DateRangeFilter variable prop exists
    if (element.type === 'SelectFilter' || element.type === 'DateRangeFilter') {
      const varName = (element.props as Record<string, unknown>).variable;
      if (typeof varName === 'string' && !(varName in doc.variables)) {
        pushIssue(
          errors,
          'UNKNOWN_VARIABLE_REF',
          `${elPath}.props.variable`,
          `${element.type} references undeclared variable "${varName}".`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
