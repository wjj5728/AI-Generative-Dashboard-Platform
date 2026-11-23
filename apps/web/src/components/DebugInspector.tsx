import React from 'react';
import { Badge, Tabs, Tag } from 'antd';
import type { PageDocument, ValidationReport } from '@ai-dashboard/contracts';
import type { DashboardRuntimeSnapshot } from '../renderer/DashboardRenderer';

interface DebugInspectorProps {
  pageDocument: PageDocument | null;
  runtimeSnapshot: DashboardRuntimeSnapshot | null;
  validation: ValidationReport | null;
  streamPatches?: string[];
}

export const DebugInspector: React.FC<DebugInspectorProps> = ({
  pageDocument,
  runtimeSnapshot,
  validation,
  streamPatches = [],
}) => {
  const errorCount = validation?.errors.length ?? 0;

  return (
    <div className="bi-card" style={{ marginTop: 20 }} data-testid="debug-inspector">
      <div className="bi-card-header" style={{ marginBottom: 8 }}>
        <div>
          <div className="bi-card-title">开发者调试面板 (Generative UI Inspector)</div>
          <div className="bi-card-subtitle">
            实时检查 json-render UI Spec、PageDocument 契约、DataSource 依赖查询与 Runtime State Store
          </div>
        </div>
        {validation && (
          <Tag color={validation.valid ? 'green' : 'red'}>
            {validation.valid ? 'Schema 校验通过' : `校验失败 (${errorCount})`}
          </Tag>
        )}
      </div>

      <Tabs
        size="small"
        items={[
          {
            key: 'ui-spec',
            label: 'UI Spec',
            children: (
              <pre className="code-viewer">
                {pageDocument ? JSON.stringify(pageDocument.ui, null, 2) : '// 尚未生成 UI Spec'}
              </pre>
            ),
          },
          {
            key: 'page-document',
            label: 'PageDocument',
            children: (
              <pre className="code-viewer">
                {pageDocument ? JSON.stringify(pageDocument, null, 2) : '// 尚未生成 PageDocument'}
              </pre>
            ),
          },
          {
            key: 'queries',
            label: 'DataSource Queries',
            children: (
              <pre className="code-viewer">
                {JSON.stringify(
                  {
                    definitions: pageDocument?.queries ?? {},
                    runtimeStatus: runtimeSnapshot?.queries ?? {},
                    executionLog: runtimeSnapshot?.queryLog ?? [],
                  },
                  null,
                  2,
                )}
              </pre>
            ),
          },
          {
            key: 'runtime-state',
            label: 'Runtime State',
            children: (
              <pre className="code-viewer">
                {JSON.stringify(runtimeSnapshot?.state ?? {}, null, 2)}
              </pre>
            ),
          },
          {
            key: 'sse-stream',
            label: `SSE Stream (${streamPatches.length})`,
            children: (
              <pre className="code-viewer" data-testid="sse-patch-log">
                {streamPatches.length > 0
                  ? streamPatches.join('\n')
                  : '// 尚未接收到 SSE SpecStream Patch'}
              </pre>
            ),
          },
          {
            key: 'validation',
            label: (
              <span>
                Validation Errors{' '}
                <Badge
                  count={errorCount}
                  size="small"
                  style={{ backgroundColor: errorCount > 0 ? '#ef4444' : '#10b981' }}
                />
              </span>
            ),
            children: (
              <pre className="code-viewer">
                {JSON.stringify(
                  validation ?? { valid: true, errors: [], warnings: [] },
                  null,
                  2,
                )}
              </pre>
            ),
          },
        ]}
      />
    </div>
  );
};
