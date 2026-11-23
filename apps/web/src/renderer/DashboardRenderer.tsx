import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  JSONUIProvider,
  Renderer,
  createStateStore,
  type StateModel,
  type StateStore,
} from '@json-render/react';
import {
  CATALOG_VERSION,
  CONTRACT_VERSION,
  type MoveTarget,
  type PageDocument,
  type QuickContainerLayoutMode,
} from '@ai-dashboard/contracts';
import { dashboardCatalog } from '@ai-dashboard/component-catalog';
import {
  DashboardQueryManager,
  type QueryExecutionLogEntry,
  type QueryRuntimeStatus,
} from '../data/query-manager';
import {
  DragEditContext,
  createDragEditRegistry,
  type DragHoverTarget,
} from './DragEditRegistry';
import { dashboardComponentRegistry } from './registry';

const dragEnabledComponentRegistry = createDragEditRegistry(
  dashboardComponentRegistry,
);

export interface DashboardRuntimeSnapshot {
  state: StateModel;
  queries: Record<string, QueryRuntimeStatus>;
  queryLog: QueryExecutionLogEntry[];
}

export interface DashboardDragEditConfig {
  enabled: boolean;
  onMove: (sourceId: string, target: MoveTarget) => void;
  onSwitchLayout: (containerId: string, mode: QuickContainerLayoutMode) => void;
  onRemove: (elementId: string) => void;
}

interface DashboardRendererProps {
  pageDocument: PageDocument;
  isStreaming?: boolean;
  dragEdit?: DashboardDragEditConfig;
  onRuntimeStateChange?: (snapshot: DashboardRuntimeSnapshot) => void;
}

function checkClientCompatibility(doc: PageDocument): string[] {
  const issues: string[] = [];
  if (doc.contractVersion !== CONTRACT_VERSION) {
    issues.push(
      `协议版本不兼容：页面为 ${doc.contractVersion}，当前客户端支持 ${CONTRACT_VERSION}`,
    );
  }
  if (doc.catalogVersion !== CATALOG_VERSION) {
    issues.push(
      `组件目录版本不兼容：页面为 ${doc.catalogVersion}，当前客户端支持 ${CATALOG_VERSION}`,
    );
  }
  const known = new Set(dashboardCatalog.componentNames);
  for (const [elId, el] of Object.entries(doc.ui.elements ?? {})) {
    if (!known.has(el.type)) {
      issues.push(`节点 "${elId}" 使用了未注册组件 "${el.type}"`);
    }
  }
  return issues;
}

export const DashboardRenderer: React.FC<DashboardRendererProps> = ({
  pageDocument,
  isStreaming = false,
  dragEdit,
  onRuntimeStateChange,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onSnapshotRef = useRef(onRuntimeStateChange);
  onSnapshotRef.current = onRuntimeStateChange;
  const [draggingId, setDraggingIdState] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const setDraggingId = (nextId: string | null) => {
    draggingIdRef.current = nextId;
    setDraggingIdState(nextId);
  };
  const [hoverTarget, setHoverTarget] = useState<DragHoverTarget | null>(null);

  const compatibilityErrors = useMemo(
    () => checkClientCompatibility(pageDocument),
    [pageDocument],
  );

  // Create a controlled json-render StateStore per PageDocument instance
  const docIdentityKey = useMemo(
    () =>
      JSON.stringify({
        id: pageDocument.id,
        title: pageDocument.title,
        variables: pageDocument.variables,
        queries: pageDocument.queries,
      }),
    [pageDocument.id, pageDocument.title, pageDocument.variables, pageDocument.queries],
  );

  const storeRef = useRef<StateStore | null>(null);
  const queryManagerRef = useRef<DashboardQueryManager | null>(null);
  const [storeVersion, setStoreVersion] = useState(0);

  const { store, queryManager } = useMemo(() => {
    const nextStore = createStateStore({});
    const nextManager = new DashboardQueryManager(pageDocument, nextStore, {
      queryClient,
    });
    nextManager.initializeState();
    storeRef.current = nextStore;
    queryManagerRef.current = nextManager;
    return { store: nextStore, queryManager: nextManager };
  }, [docIdentityKey, queryClient]);

  // Subscribe to store updates for optional debug inspector
  useEffect(() => {
    const emitSnapshot = () => {
      if (!onSnapshotRef.current) return;
      const snap = store.getSnapshot();
      const meta = (snap.meta ?? {}) as Record<string, unknown>;
      onSnapshotRef.current({
        state: snap,
        queries: (meta.queries ?? {}) as Record<string, QueryRuntimeStatus>,
        queryLog: (meta.queryLog ?? []) as QueryExecutionLogEntry[],
      });
    };

    emitSnapshot();
    const unsub = store.subscribe(() => {
      setStoreVersion((v) => v + 1);
      emitSnapshot();
    });
    return unsub;
  }, [store]);

  // Execute initial DataSource queries (NEVER calls LLM)
  useEffect(() => {
    if (compatibilityErrors.length > 0) return;
    void queryManager.executeQueries({ trigger: 'init' });
  }, [queryManager, compatibilityErrors.length]);

  const actionHandlers = useMemo(
    () => ({
      setVariable: async (params: Record<string, unknown>) => {
        const variable = typeof params.variable === 'string' ? params.variable : '';
        if (!variable) return;
        await queryManager.setVariable(variable, params.value);
      },
      refreshData: async (params: Record<string, unknown>) => {
        const queryIds = Array.isArray(params?.queryIds)
          ? params.queryIds.filter((x): x is string => typeof x === 'string')
          : undefined;
        await queryManager.refresh(queryIds);
      },
      changeTab: async (params: Record<string, unknown>) => {
        const tabGroupId =
          typeof params.tabGroupId === 'string' ? params.tabGroupId : '';
        const activeKey =
          typeof params.activeKey === 'string' ? params.activeKey : '';
        if (!tabGroupId || !activeKey) return;
        store.set(`/ui/tabs/${tabGroupId}`, activeKey);
      },
      navigate: async (params: Record<string, unknown>) => {
        const path = typeof params.path === 'string' ? params.path : '';
        if (path.startsWith('/')) {
          navigate(path);
        }
      },
    }),
    [queryManager, store, navigate],
  );

  if (compatibilityErrors.length > 0) {
    return (
      <Alert
        type="error"
        showIcon
        message="当前 Dashboard Schema 与客户端组件目录不兼容"
        description={
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {compatibilityErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        }
      />
    );
  }

  const isDragMode = Boolean(dragEdit?.enabled && !isStreaming);
  const activeRegistry = isDragMode
    ? dragEnabledComponentRegistry
    : dashboardComponentRegistry;

  const dragContextValue = useMemo(
    () =>
      isDragMode && dragEdit
        ? {
            spec: pageDocument.ui,
            draggingId,
            getDraggingId: () => draggingIdRef.current,
            setDraggingId,
            hoverTarget,
            setHoverTarget,
            onMove: dragEdit.onMove,
            onSwitchLayout: dragEdit.onSwitchLayout,
            onRemove: dragEdit.onRemove,
          }
        : null,
    [isDragMode, dragEdit, pageDocument.ui, draggingId, hoverTarget],
  );

  const rendererElement = (
    <JSONUIProvider
      registry={activeRegistry}
      store={store}
      handlers={actionHandlers}
      navigate={(path) => {
        if (path.startsWith('/')) navigate(path);
      }}
    >
      <Renderer
        spec={pageDocument.ui}
        registry={activeRegistry}
        loading={isStreaming}
      />
    </JSONUIProvider>
  );

  return (
    <div
      className={`bi-dashboard-surface ${isDragMode ? 'bi-dashboard-surface--drag' : ''} ${
        isStreaming ? 'bi-dashboard-surface--streaming' : ''
      }`}
      data-store-version={storeVersion}
    >
      {dragContextValue ? (
        <DragEditContext.Provider value={dragContextValue}>
          {rendererElement}
        </DragEditContext.Provider>
      ) : (
        rendererElement
      )}
    </div>
  );
};
