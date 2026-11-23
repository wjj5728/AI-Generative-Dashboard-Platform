import { applySpecPatch, diffToPatches, type JsonPatch } from '@json-render/core';
import type { PageDocument } from '@ai-dashboard/contracts';
import {
  applyLayoutIntentToDocument,
  inferLayoutIntent,
} from './layout-intent.js';
import type { AIProvider, EditInput, EditOutput, GenerateInput } from './provider.js';
import {
  buildGameAdsDashboard,
  buildRevenueAnalysisDashboard,
  buildTrafficAnalysisDashboard,
} from './templates.js';

function inferScenario(
  prompt: string,
  requested?: GenerateInput['scenario'],
): 'game-ads' | 'traffic-analysis' | 'revenue-analysis' {
  if (requested && requested !== 'auto') return requested;
  const lower = prompt.toLowerCase();

  const hasTraffic =
    (lower.includes('流量') || lower.includes('渠道') || lower.includes('traffic')) &&
    !lower.includes('充值区间') &&
    !lower.includes('总消耗');
  if (hasTraffic) return 'traffic-analysis';

  const hasRevenueOnly =
    (lower.includes('收入') || lower.includes('营收') || lower.includes('arpu') || lower.includes('revenue')) &&
    !lower.includes('渠道占比') &&
    !lower.includes('明细');
  if (hasRevenueOnly) return 'revenue-analysis';

  return 'game-ads';
}

function findParentOf(
  elements: PageDocument['ui']['elements'],
  targetId: string,
): string | null {
  for (const [id, el] of Object.entries(elements)) {
    if (el.children?.includes(targetId)) {
      return id;
    }
  }
  return null;
}

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async generate(input: GenerateInput): Promise<PageDocument> {
    const scenario = inferScenario(input.prompt, input.scenario);
    const trimmedPrompt = input.prompt.trim();
    const layoutIntent = inferLayoutIntent(trimmedPrompt);

    let baseDoc: PageDocument;
    if (scenario === 'traffic-analysis') {
      baseDoc = buildTrafficAnalysisDashboard(
        undefined,
        trimmedPrompt || undefined,
      );
    } else if (scenario === 'revenue-analysis') {
      baseDoc = buildRevenueAnalysisDashboard(
        undefined,
        trimmedPrompt || undefined,
      );
    } else {
      baseDoc = buildGameAdsDashboard(undefined, trimmedPrompt || undefined);
    }

    return applyLayoutIntentToDocument(baseDoc, layoutIntent);
  }

  async edit(input: EditInput): Promise<EditOutput> {
    const original = structuredClone(input.currentDocument);
    const candidate = structuredClone(input.currentDocument);
    const instruction = input.instruction.trim();
    const lower = instruction.toLowerCase();
    const changes: string[] = [];
    const patches: JsonPatch[] = [];

    const applyPatch = (patch: JsonPatch) => {
      applySpecPatch(candidate.ui, patch);
      patches.push(patch);
    };

    // 1. Move trend chart section to top (right after toolbar)
    if (
      (lower.includes('趋势') || lower.includes('trend')) &&
      (lower.includes('顶部') || lower.includes('上方') || lower.includes('top'))
    ) {
      const rootEl = candidate.ui.elements[candidate.ui.root];
      const rootChildren = [...(rootEl?.children ?? [])];
      const trendIdx = rootChildren.findIndex(
        (id) =>
          id.includes('trend') ||
          candidate.ui.elements[id]?.type === 'LineChart',
      );
      if (trendIdx > 0) {
        const [trendId] = rootChildren.splice(trendIdx, 1);
        const insertAt = rootChildren[0]?.includes('toolbar') ? 1 : 0;
        rootChildren.splice(insertAt, 0, trendId);
        applyPatch({
          op: 'replace',
          path: `/elements/${candidate.ui.root}/children`,
          value: rootChildren,
        });
        changes.push(`已将趋势图模块 (${trendId}) 移动到页面顶部`);
      }
    }

    // 2. Add ROI (or CPA / ARPU / custom) StatCard while preserving existing node IDs
    if (
      (lower.includes('新增') || lower.includes('添加') || lower.includes('add')) &&
      (lower.includes('roi') || lower.includes('卡片') || lower.includes('card') || lower.includes('cpa') || lower.includes('arpu'))
    ) {
      if (!candidate.queries.summary) {
        candidate.queries.summary = {
          resource: 'ads.summary',
          params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
          targetState: '/data/summary',
        };
      }

      const isCpa = lower.includes('cpa') || lower.includes('获客成本');
      const isArpu = lower.includes('arpu');
      const baseId = isCpa
        ? 'stat-cpa-added'
        : isArpu
          ? 'stat-arpu-added'
          : 'stat-roi-added';
      let newId = baseId;
      let suffix = 2;
      while (newId in candidate.ui.elements) {
        newId = `${baseId}-${suffix++}`;
      }

      const newElement = isCpa
        ? {
            type: 'StatCard',
            props: {
              title: '单客成本 CPA',
              value: { $state: '/data/summary/cpa' },
              format: 'currency',
              accent: 'rose',
              subtitle: 'AI 新增指标卡',
              queryKey: 'summary',
            },
            children: [],
          }
        : isArpu
          ? {
              type: 'StatCard',
              props: {
                title: '人均收入 ARPU',
                value: { $state: '/data/summary/arpu' },
                format: 'currency',
                accent: 'indigo',
                subtitle: 'AI 新增指标卡',
                queryKey: 'summary',
              },
              children: [],
            }
          : {
              type: 'StatCard',
              props: {
                title: 'ROI 核心监控',
                value: { $state: '/data/summary/roi' },
                delta: { $state: '/data/summary/roiDelta' },
                deltaLabel: '较上周期',
                format: 'ratio',
                accent: 'amber',
                subtitle: 'AI 新增 ROI 卡片',
                queryKey: 'summary',
              },
              children: [],
            };

      applyPatch({
        op: 'add',
        path: `/elements/${newId}`,
        value: newElement,
      });

      const targetParentId =
        'kpi-grid' in candidate.ui.elements ? 'kpi-grid' : candidate.ui.root;
      const parentChildren = [
        ...(candidate.ui.elements[targetParentId]?.children ?? []),
      ];
      if (targetParentId === candidate.ui.root) {
        const insertAt = parentChildren[0]?.includes('toolbar') ? 1 : 0;
        parentChildren.splice(insertAt, 0, newId);
      } else {
        parentChildren.push(newId);
      }

      applyPatch({
        op: 'replace',
        path: `/elements/${targetParentId}/children`,
        value: parentChildren,
      });
      changes.push(`已新增指标卡片 "${newElement.props.title}" (${newId})`);
    }

    // 3. Convert PieChart / DonutChart to BarChart (preserving node ID)
    if (
      (lower.includes('饼图') || lower.includes('环形图') || lower.includes('pie') || lower.includes('donut')) &&
      (lower.includes('柱状图') || lower.includes('条形图') || lower.includes('bar'))
    ) {
      for (const [elId, el] of Object.entries(candidate.ui.elements)) {
        if (el.type === 'PieChart' || el.type === 'DonutChart') {
          const oldProps = el.props as Record<string, any>;
          const nextElement = {
            type: 'BarChart',
            props: {
              title: oldProps.title || '渠道分布柱状图',
              subtitle: oldProps.subtitle || '已由饼图切换为柱状图',
              data: oldProps.data,
              xField: oldProps.nameField || 'channel',
              series: [
                {
                  field: oldProps.valueField || 'cost',
                  name: oldProps.centerLabel || '数值',
                  color: '#38bdf8',
                },
              ],
              yAxisFormat: oldProps.valueFormat || 'currency',
              height: oldProps.height || 260,
              showLegend: true,
              queryKey: oldProps.queryKey,
            },
            children: [],
          };
          applyPatch({
            op: 'replace',
            path: `/elements/${elId}`,
            value: nextElement,
          });
          changes.push(`已将组件 ${elId} (${el.type}) 转换为 BarChart`);
        }
      }
    }

    // 4. Delete recharge distribution component (preserving unrelated nodes & datasources)
    if (
      (lower.includes('删除') || lower.includes('移除') || lower.includes('remove') || lower.includes('delete')) &&
      (lower.includes('充值') || lower.includes('recharge'))
    ) {
      const toDelete = Object.keys(candidate.ui.elements).filter((id) => {
        const el = candidate.ui.elements[id];
        const title = String((el.props as Record<string, unknown>).title ?? '');
        const qk = String((el.props as Record<string, unknown>).queryKey ?? '');
        return (
          id.includes('recharge') ||
          title.includes('充值') ||
          qk === 'recharge'
        );
      });

      for (const targetId of toDelete) {
        const parentId = findParentOf(candidate.ui.elements, targetId);
        if (parentId) {
          const filtered = (
            candidate.ui.elements[parentId].children ?? []
          ).filter((cid) => cid !== targetId);
          applyPatch({
            op: 'replace',
            path: `/elements/${parentId}/children`,
            value: filtered,
          });
        }
        applyPatch({
          op: 'remove',
          path: `/elements/${targetId}`,
        });
        changes.push(`已删除充值分布组件 (${targetId})`);
      }
    }

    // 5. Switch main layout to two-column grid
    if (
      lower.includes('双栏') ||
      lower.includes('两栏') ||
      lower.includes('two-column') ||
      lower.includes('two column') ||
      lower.includes('equal-2')
    ) {
      const gridId =
        'main-grid' in candidate.ui.elements
          ? 'main-grid'
          : Object.keys(candidate.ui.elements).find(
              (id) => candidate.ui.elements[id].type === 'DashboardGrid',
            );
      if (gridId) {
        if (candidate.ui.elements[gridId].type !== 'DashboardGrid') {
          applyPatch({
            op: 'replace',
            path: `/elements/${gridId}/type`,
            value: 'DashboardGrid',
          });
          applyPatch({
            op: 'replace',
            path: `/elements/${gridId}/props`,
            value: { preset: 'equal-2', gap: 'md' },
          });
        } else {
          applyPatch({
            op: 'replace',
            path: `/elements/${gridId}/props/preset`,
            value: 'equal-2',
          });
        }
        changes.push(`已将主网格布局 (${gridId}) 切换为双栏 (equal-2)`);
      }
    }

    // 6. Auto-detect Row / Column layout switch from natural language
    const editLayoutIntent = inferLayoutIntent(instruction);
    if (editLayoutIntent === 'row' || editLayoutIntent === 'column') {
      const isLayoutType = (t?: string) =>
        t === 'DashboardGrid' ||
        t === 'DashboardRow' ||
        t === 'DashboardColumn' ||
        t === 'Row' ||
        t === 'Column';

      const targetIds: string[] = [];
      if (
        (lower.includes('趋势') || lower.includes('trend')) &&
        'section-trends' in candidate.ui.elements &&
        isLayoutType(candidate.ui.elements['section-trends'].type)
      ) {
        targetIds.push('section-trends');
      } else if (
        (lower.includes('指标') || lower.includes('kpi')) &&
        'kpi-grid' in candidate.ui.elements &&
        isLayoutType(candidate.ui.elements['kpi-grid'].type)
      ) {
        targetIds.push('kpi-grid');
      } else {
        for (const candidateId of ['main-grid', 'section-trends']) {
          if (
            candidateId in candidate.ui.elements &&
            isLayoutType(candidate.ui.elements[candidateId].type)
          ) {
            targetIds.push(candidateId);
          }
        }
      }

      for (const tid of targetIds) {
        if (editLayoutIntent === 'row') {
          applyPatch({
            op: 'replace',
            path: `/elements/${tid}/type`,
            value: 'Row',
          });
          applyPatch({
            op: 'replace',
            path: `/elements/${tid}/props`,
            value: {
              gap: 'md',
              align: 'stretch',
              equalWidth: true,
              wrap: true,
              width: 'full',
            },
          });
        } else {
          applyPatch({
            op: 'replace',
            path: `/elements/${tid}/type`,
            value: 'Column',
          });
          applyPatch({
            op: 'replace',
            path: `/elements/${tid}/props`,
            value: {
              gap: 'md',
              width: 'full',
            },
          });
        }
      }

      if (targetIds.length > 0) {
        changes.push(
          `已自动识别自然语言布局意图，将 ${targetIds.join(', ')} 切换为 ${editLayoutIntent === 'row' ? 'Row（横向并排）' : 'Column（纵向堆叠）'} 布局`,
        );
      }
    }

    // Fallback: if instruction didn't match a specific rule, add an explanatory note card
    if (changes.length === 0) {
      let noteId = 'ai-edit-note';
      let idx = 2;
      while (noteId in candidate.ui.elements) {
        noteId = `ai-edit-note-${idx++}`;
      }
      applyPatch({
        op: 'add',
        path: `/elements/${noteId}`,
        value: {
          type: 'DashboardCard',
          props: {
            title: 'AI 编辑说明',
            subtitle: `指令：${instruction}`,
            padding: 'sm',
          },
          children: [`${noteId}-text`],
        },
      });
      applyPatch({
        op: 'add',
        path: `/elements/${noteId}-text`,
        value: {
          type: 'Text',
          props: {
            content: `已根据自然语言指令“${instruction}”更新看板结构（Mock AI Provider）。`,
            tone: 'secondary',
            size: 'sm',
          },
          children: [],
        },
      });
      const rootChildren = [
        ...(candidate.ui.elements[candidate.ui.root]?.children ?? []),
        noteId,
      ];
      applyPatch({
        op: 'replace',
        path: `/elements/${candidate.ui.root}/children`,
        value: rootChildren,
      });
      changes.push(`已根据指令“${instruction}”追加标注卡片 (${noteId})`);
    }

    // Compute canonical RFC 6902 diff patches if needed
    const finalPatches =
      patches.length > 0
        ? patches
        : diffToPatches(
            original.ui as unknown as Record<string, unknown>,
            candidate.ui as unknown as Record<string, unknown>,
          );

    return {
      pageDocument: candidate,
      patches: finalPatches,
      changeSummary: changes.join('；'),
    };
  }
}
