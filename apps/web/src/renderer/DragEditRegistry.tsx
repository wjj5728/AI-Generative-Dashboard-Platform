import React, { createContext, useContext } from 'react';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import type { ComponentRegistry, ComponentRenderProps } from '@json-render/react';
import {
  canMoveElement,
  isLayoutContainerType,
  type JsonRenderSpec,
  type MoveTarget,
  type QuickContainerLayoutMode,
} from '@ai-dashboard/contracts';

export interface DragHoverTarget {
  kind: 'before' | 'after' | 'into';
  id: string;
}

export interface DragEditContextValue {
  spec: JsonRenderSpec;
  draggingId: string | null;
  getDraggingId: () => string | null;
  setDraggingId: (id: string | null) => void;
  hoverTarget: DragHoverTarget | null;
  setHoverTarget: (target: DragHoverTarget | null) => void;
  onMove: (sourceId: string, target: MoveTarget) => void;
  onSwitchLayout: (containerId: string, mode: QuickContainerLayoutMode) => void;
  onRemove: (elementId: string) => void;
}

export const DragEditContext = createContext<DragEditContextValue | null>(null);
const ElementIdContext = createContext<string | null>(null);

const NON_DRAGGABLE_CONTAINERS = new Set([
  'toolbar-panel',
  'toolbar-row',
  'filter-group',
]);

function getRawElementKey(child: React.ReactNode): string | undefined {
  if (!React.isValidElement(child)) return undefined;
  const propsKey = (child.props as Record<string, unknown>)?.elementKey;
  if (typeof propsKey === 'string' && propsKey) return propsKey;
  if (typeof child.key === 'string' && child.key) {
    return child.key.replace(/^\.\$/, '');
  }
  return undefined;
}

function getElementLabel(spec: JsonRenderSpec, elementId: string): string {
  const el = spec.elements?.[elementId];
  if (!el) return elementId;
  const props = el.props as Record<string, unknown>;
  const title = props?.title || props?.text || props?.label;
  return title ? `${el.type} · ${String(title)}` : `${el.type} · ${elementId}`;
}

function isHorizontalContainer(type?: string): boolean {
  return type === 'Row' || type === 'DashboardRow' || type === 'DashboardGrid';
}

const DraggableNodeShell: React.FC<{
  elementId: string;
  parentId: string;
  index: number;
  siblingCount: number;
  horizontalParent: boolean;
  children: React.ReactNode;
}> = ({
  elementId,
  parentId,
  index,
  siblingCount,
  horizontalParent,
  children,
}) => {
  const ctx = useContext(DragEditContext);
  if (!ctx) return <>{children}</>;

  const {
    spec,
    draggingId,
    getDraggingId,
    setDraggingId,
    hoverTarget,
    setHoverTarget,
    onMove,
    onRemove,
  } = ctx;

  const el = spec.elements?.[elementId];
  const isDragging = draggingId === elementId;
  const isContainerNode = isLayoutContainerType(el?.type);
  const label = getElementLabel(spec, elementId);
  const canDropHere = Boolean(
    draggingId &&
      draggingId !== elementId &&
      canMoveElement(spec, draggingId, parentId),
  );

  const dropPosition =
    hoverTarget?.id === elementId &&
    (hoverTarget.kind === 'before' || hoverTarget.kind === 'after')
      ? hoverTarget.kind
      : null;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', elementId);
    setDraggingId(elementId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const activeId = getDraggingId() || draggingId;
    if (!activeId || activeId === elementId) return;
    if (!canMoveElement(spec, activeId, parentId)) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const isBefore = horizontalParent
      ? e.clientX < rect.left + rect.width / 2
      : e.clientY < rect.top + rect.height / 2;

    const nextKind = isBefore ? 'before' : 'after';
    if (hoverTarget?.id !== elementId || hoverTarget?.kind !== nextKind) {
      setHoverTarget({ kind: nextKind, id: elementId });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData('text/plain') || getDraggingId() || draggingId;
    if (!sourceId || sourceId === elementId) {
      setDraggingId(null);
      setHoverTarget(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const isBefore = horizontalParent
      ? e.clientX < rect.left + rect.width / 2
      : e.clientY < rect.top + rect.height / 2;

    onMove(sourceId, { mode: isBefore ? 'before' : 'after', targetId: elementId });
    setDraggingId(null);
    setHoverTarget(null);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setDraggingId(null);
    setHoverTarget(null);
  };

  const dropClass =
    dropPosition === 'before'
      ? horizontalParent
        ? 'bi-dnd-drop-left'
        : 'bi-dnd-drop-top'
      : dropPosition === 'after'
        ? horizontalParent
          ? 'bi-dnd-drop-right'
          : 'bi-dnd-drop-bottom'
        : '';

  return (
    <div
      className={`bi-dnd-node ${isContainerNode ? 'bi-dnd-node--container' : ''} ${
        isDragging ? 'bi-dnd-node--dragging' : ''
      } ${canDropHere ? 'bi-dnd-node--droppable' : ''} ${dropClass}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      data-testid={`dnd-node-${elementId}`}
      data-dnd-node={elementId}
      data-dnd-parent={parentId}
    >
      <div className="bi-dnd-handle-bar">
        <span className="bi-dnd-handle-label" title={`拖拽移动 ${label}`}>
          <HolderOutlined className="bi-dnd-grip" />
          <span>{label}</span>
        </span>
        <span
          className="bi-dnd-handle-actions"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {index > 0 && (
            <Tooltip title={horizontalParent ? '向左移一位' : '向上移一位'}>
              <Button
                type="text"
                size="small"
                icon={horizontalParent ? <ArrowLeftOutlined /> : <ArrowUpOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(elementId, {
                    mode: 'into',
                    containerId: parentId,
                    index: index - 1,
                  });
                }}
                data-testid={`dnd-move-prev-${elementId}`}
              />
            </Tooltip>
          )}
          {index < siblingCount - 1 && (
            <Tooltip title={horizontalParent ? '向右移一位' : '向下移一位'}>
              <Button
                type="text"
                size="small"
                icon={horizontalParent ? <ArrowRightOutlined /> : <ArrowDownOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(elementId, {
                    mode: 'into',
                    containerId: parentId,
                    index: index + 2,
                  });
                }}
                data-testid={`dnd-move-next-${elementId}`}
              />
            </Tooltip>
          )}
          {elementId !== 'toolbar-panel' && (
            <Tooltip title="移除组件">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(elementId);
                }}
                data-testid={`dnd-remove-${elementId}`}
              />
            </Tooltip>
          )}
        </span>
      </div>
      <div className="bi-dnd-node-content">{children}</div>
    </div>
  );
};

/**
 * Wraps the official json-render ComponentRegistry to enable direct visual
 * drag-and-drop layout editing (reorder + cross-container move + Row/Column/Grid toggle)
 * while keeping <Renderer /> 100% authentic.
 */
export function createDragEditRegistry(
  baseRegistry: ComponentRegistry,
): ComponentRegistry {
  const wrapped: ComponentRegistry = { ...baseRegistry };

  for (const typeName of Object.keys(baseRegistry)) {
    if (!isLayoutContainerType(typeName)) continue;

    const BaseComponent = baseRegistry[typeName];
    const WrappedContainer: React.FC<ComponentRenderProps<any>> = (renderProps) => {
      const ctx = useContext(DragEditContext);
      const inheritedId = useContext(ElementIdContext);

      if (!ctx) {
        return <BaseComponent {...renderProps} />;
      }

      const containerId = inheritedId ?? ctx.spec.root;
      const isRoot = containerId === ctx.spec.root;
      const isNonDraggableToolbar = NON_DRAGGABLE_CONTAINERS.has(containerId);
      const containerEl = ctx.spec.elements?.[containerId];
      const horizontal = isHorizontalContainer(containerEl?.type ?? typeName);

      // Wrap children with ElementIdContext and DraggableNodeShell
      const rawChildList = React.Children.toArray(renderProps.children);
      let idx = 0;
      const enhancedChildren = React.Children.map(renderProps.children, (child) => {
        const currentIdx = idx++;
        const childKey = getRawElementKey(child);
        if (!childKey) return child;

        const scopedChild = (
          <ElementIdContext.Provider key={childKey} value={childKey}>
            {child}
          </ElementIdContext.Provider>
        );

        if (isNonDraggableToolbar) {
          return scopedChild;
        }

        return (
          <DraggableNodeShell
            key={childKey}
            elementId={childKey}
            parentId={containerId}
            index={currentIdx}
            siblingCount={rawChildList.length}
            horizontalParent={horizontal}
          >
            {scopedChild}
          </DraggableNodeShell>
        );
      });

      const handleContainerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        const activeId = ctx.getDraggingId() || ctx.draggingId;
        if (
          isNonDraggableToolbar ||
          !activeId ||
          !canMoveElement(ctx.spec, activeId, containerId)
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (ctx.hoverTarget?.kind !== 'into' || ctx.hoverTarget?.id !== containerId) {
          ctx.setHoverTarget({ kind: 'into', id: containerId });
        }
      };

      const handleContainerDrop = (e: React.DragEvent<HTMLDivElement>) => {
        const sourceId =
          e.dataTransfer.getData('text/plain') ||
          ctx.getDraggingId() ||
          ctx.draggingId;
        if (
          isNonDraggableToolbar ||
          !sourceId ||
          !canMoveElement(ctx.spec, sourceId, containerId)
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        ctx.onMove(sourceId, { mode: 'into', containerId });
        ctx.setDraggingId(null);
        ctx.setHoverTarget(null);
      };

      if (isNonDraggableToolbar || containerId === 'toolbar-panel') {
        return <BaseComponent {...renderProps}>{enhancedChildren}</BaseComponent>;
      }

      const showLayoutSwitcher =
        !isRoot &&
        (typeName === 'Row' ||
          typeName === 'Column' ||
          typeName === 'DashboardRow' ||
          typeName === 'DashboardColumn' ||
          typeName === 'DashboardGrid');

      const activePreset =
        typeName === 'DashboardGrid'
          ? String((containerEl?.props as Record<string, unknown>)?.preset ?? '')
          : '';

      const isDropTarget =
        ctx.hoverTarget?.kind === 'into' && ctx.hoverTarget?.id === containerId;

      return (
        <div
          className={`bi-dnd-container ${isRoot ? 'bi-dnd-container--root' : ''} ${
            isDropTarget ? 'bi-dnd-container--drop-active' : ''
          }`}
          onDragOver={handleContainerDragOver}
          onDrop={handleContainerDrop}
          data-testid={`dnd-container-${containerId}`}
          data-dnd-container={containerId}
        >
          <div className="bi-dnd-container-bar">
            <span className="bi-dnd-container-tag">
              {typeName}
              {activePreset ? ` (${activePreset})` : ''} · {containerId}
            </span>
            {showLayoutSwitcher && (
              <span
                className="bi-dnd-layout-switch"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className={`bi-dnd-pill ${
                    typeName === 'Row' || typeName === 'DashboardRow'
                      ? 'bi-dnd-pill--active'
                      : ''
                  }`}
                  onClick={() => ctx.onSwitchLayout(containerId, 'row')}
                  data-testid={`dnd-switch-row-${containerId}`}
                >
                  Row
                </button>
                <button
                  type="button"
                  className={`bi-dnd-pill ${
                    typeName === 'Column' || typeName === 'DashboardColumn'
                      ? 'bi-dnd-pill--active'
                      : ''
                  }`}
                  onClick={() => ctx.onSwitchLayout(containerId, 'column')}
                  data-testid={`dnd-switch-col-${containerId}`}
                >
                  Col
                </button>
                <button
                  type="button"
                  className={`bi-dnd-pill ${
                    activePreset === 'equal-2' ? 'bi-dnd-pill--active' : ''
                  }`}
                  onClick={() => ctx.onSwitchLayout(containerId, 'grid-2')}
                  data-testid={`dnd-switch-grid2-${containerId}`}
                >
                  2列
                </button>
                <button
                  type="button"
                  className={`bi-dnd-pill ${
                    activePreset === 'equal-3' ? 'bi-dnd-pill--active' : ''
                  }`}
                  onClick={() => ctx.onSwitchLayout(containerId, 'grid-3')}
                  data-testid={`dnd-switch-grid3-${containerId}`}
                >
                  3列
                </button>
              </span>
            )}
          </div>
          <BaseComponent {...renderProps}>{enhancedChildren}</BaseComponent>
          {rawChildList.length === 0 && (
            <div className="bi-dnd-empty-dropzone">拖拽组件放置到此容器</div>
          )}
        </div>
      );
    };

    wrapped[typeName] = WrappedContainer;
  }

  return wrapped;
}
