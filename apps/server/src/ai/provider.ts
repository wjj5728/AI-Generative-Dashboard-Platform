import type { JsonPatch } from '@json-render/core';
import type {
  ComponentMetadata,
  DataSourceMetadata,
  PageDocument,
  UserIdentity,
} from '@ai-dashboard/contracts';

export interface GenerateInput {
  prompt: string;
  scenario?: 'game-ads' | 'traffic-analysis' | 'revenue-analysis' | 'auto';
  components: ComponentMetadata[];
  datasources: DataSourceMetadata[];
  user: UserIdentity;
}

export interface EditInput {
  instruction: string;
  currentDocument: PageDocument;
  components: ComponentMetadata[];
  datasources: DataSourceMetadata[];
  user: UserIdentity;
}

export interface EditOutput {
  pageDocument: PageDocument;
  patches: JsonPatch[];
  changeSummary: string;
}

export interface AIProvider {
  readonly name: string;
  generate(input: GenerateInput): Promise<PageDocument>;
  edit(input: EditInput): Promise<EditOutput>;
}
