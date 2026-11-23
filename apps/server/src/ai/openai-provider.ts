import {
  autoFixSpec,
  diffToPatches,
  type JsonPatch,
} from '@json-render/core';
import {
  CATALOG_VERSION,
  CONTRACT_VERSION,
  type PageDocument,
} from '@ai-dashboard/contracts';
import {
  dashboardCatalog,
  validatePageDocument,
} from '@ai-dashboard/component-catalog';
import type { AIProvider, EditInput, EditOutput, GenerateInput } from './provider.js';

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('LLM response did not contain a valid JSON object.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly config: OpenAIProviderConfig) {}

  private async callChatCompletion(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured on the server. Set AI_PROVIDER=mock or provide OPENAI_API_KEY in .env.',
      );
    }

    const endpoint = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(
        `LLM API request failed (${response.status}): ${bodyText.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned an empty response.');
    }
    return content;
  }

  private buildSystemPrompt(
    datasources: GenerateInput['datasources'],
    components: GenerateInput['components'],
  ): string {
    const catalogPrompt = dashboardCatalog.prompt({
      system:
        'You are a Senior BI Architect generating declarative PageDocument JSON for json-render.',
      customRules: [
        `contractVersion MUST be "${CONTRACT_VERSION}" and catalogVersion MUST be "${CATALOG_VERSION}".`,
        'Return ONLY a single JSON object matching PageDocument { contractVersion, catalogVersion, title, description, variables, queries, ui: { root, elements } }.',
        'Use ONLY registered components from Component Catalog and ONLY authorized DataSources from DataSource Catalog.',
        'NEVER fabricate real business metric numbers inside ui props. Always bind data using { "$state": "/data/<queryId>" } or { "$state": "/data/<queryId>/<field>" }.',
        'Use { "$bindState": "/variables/<varName>" } on filter controls and { "$var": "<varName>" } inside queries.*.params.',
        'Keep element keys semantic and stable (e.g., "root", "toolbar-panel", "main-grid", "stat-cost", "chart-daily-trend").',
        'Automatically choose between Row (horizontal side-by-side, with equalWidth: true when splitting charts/cards) and Column (vertical stack) based on the user prompt: use Row for horizontal/并排/横向/左右布局 intents, Column for vertical/纵向/竖排/上下堆叠 intents, and nest Row inside Column (or vice versa) for multi-section layouts.',
        'Do NOT include executable JavaScript, inline functions, arbitrary CSS, or SQL.',
      ],
    });

    const datasourceSummary = JSON.stringify(
      datasources.map((ds) => ({
        id: ds.id,
        description: ds.description,
        params: ds.params,
        resultType: ds.resultType,
        fields: ds.fields.map((f) => ({
          name: f.name,
          type: f.type,
          unit: f.unit,
          description: f.description,
        })),
        metricDefinitions: ds.metricDefinitions,
      })),
      null,
      2,
    );

    const componentUseCases = JSON.stringify(
      components.map((c) => ({
        type: c.type,
        category: c.category,
        dataInputType: c.dataInputType,
        useCases: c.useCases,
      })),
      null,
      2,
    );

    return [
      catalogPrompt,
      '\n## Authorized DataSource Catalog (Public Metadata Only)\n',
      datasourceSummary,
      '\n## Component Usage Guidelines\n',
      componentUseCases,
    ].join('\n');
  }

  async generate(input: GenerateInput): Promise<PageDocument> {
    const systemPrompt = this.buildSystemPrompt(input.datasources, input.components);
    const userPrompt = [
      `User Request: ${input.prompt}`,
      input.scenario && input.scenario !== 'auto'
        ? `Preferred Scenario: ${input.scenario}`
        : '',
      'Generate a complete, valid PageDocument JSON object.',
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.callChatCompletion(systemPrompt, userPrompt);
    const parsed = extractJsonObject(raw) as PageDocument;
    if (parsed?.ui) {
      parsed.ui = autoFixSpec(parsed.ui).spec;
    }
    parsed.contractVersion = CONTRACT_VERSION;
    parsed.catalogVersion = CATALOG_VERSION;

    const validation = validatePageDocument(parsed, {
      userRoles: input.user.roles,
    });
    if (!validation.valid) {
      const errorList = validation.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('\n');
      throw new Error(`LLM produced invalid PageDocument:\n${errorList}`);
    }

    return parsed;
  }

  async edit(input: EditInput): Promise<EditOutput> {
    const systemPrompt = this.buildSystemPrompt(input.datasources, input.components);
    const userPrompt = [
      'You are modifying an existing PageDocument according to the user instruction.',
      'CRITICAL: Preserve all unrelated element IDs so existing components remain stable.',
      'Return ONLY a JSON object with shape: { "changeSummary": string, "pageDocument": PageDocument }.',
      '\nCurrent PageDocument:',
      JSON.stringify(input.currentDocument, null, 2),
      `\nEdit Instruction: ${input.instruction}`,
    ].join('\n');

    const raw = await this.callChatCompletion(systemPrompt, userPrompt);
    const parsed = extractJsonObject(raw) as {
      changeSummary?: string;
      pageDocument?: PageDocument;
    };

    const nextDoc = parsed.pageDocument ?? (parsed as unknown as PageDocument);
    if (nextDoc?.ui) {
      nextDoc.ui = autoFixSpec(nextDoc.ui).spec;
    }
    nextDoc.contractVersion = CONTRACT_VERSION;
    nextDoc.catalogVersion = CATALOG_VERSION;

    const validation = validatePageDocument(nextDoc, {
      userRoles: input.user.roles,
    });
    if (!validation.valid) {
      const errorList = validation.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('\n');
      throw new Error(`LLM edit produced invalid PageDocument:\n${errorList}`);
    }

    const patches: JsonPatch[] = diffToPatches(
      input.currentDocument.ui as unknown as Record<string, unknown>,
      nextDoc.ui as unknown as Record<string, unknown>,
    );

    return {
      pageDocument: nextDoc,
      patches,
      changeSummary:
        parsed.changeSummary || `Applied AI edit: ${input.instruction}`,
    };
  }
}
