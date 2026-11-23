import type { JsonPatch } from '@json-render/core';
import type { PageDocument } from './page-document.js';

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  ok: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type DashboardStatus = 'draft' | 'published';

export interface UserIdentity {
  id: string;
  name: string;
  roles: string[];
}

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface DashboardSummary {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  status: DashboardStatus;
  currentRevision: number;
  publishedRevision: number | null;
  schemaVersion: string;
  catalogVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardDetail extends DashboardSummary {
  pageDocument: PageDocument;
}

export interface DashboardRevisionSummary {
  id: string;
  dashboardId: string;
  revision: number;
  changeDescription: string;
  createdAt: string;
}

export interface DashboardRevisionDetail extends DashboardRevisionSummary {
  pageDocument: PageDocument;
}

export interface QueryBatchItem {
  key: string;
  resource: string;
  params: Record<string, unknown>;
}

export interface QueryBatchRequest {
  queries: QueryBatchItem[];
  bypassCache?: boolean;
}

export interface QueryBatchItemSuccess {
  status: 'success';
  data: unknown;
  cached?: boolean;
  durationMs?: number;
}

export interface QueryBatchItemError {
  status: 'error';
  error: {
    code: string;
    message: string;
  };
}

export type QueryBatchItemResult = QueryBatchItemSuccess | QueryBatchItemError;

export interface QueryBatchResponse {
  results: Record<string, QueryBatchItemResult>;
}

export interface GenerateDashboardRequest {
  prompt: string;
  scenario?: 'game-ads' | 'traffic-analysis' | 'revenue-analysis' | 'auto';
  /** Optional SSE pacing delay in ms per patch (0-300) */
  streamDelayMs?: number;
}

export interface GenerateDashboardResponse {
  provider: string;
  pageDocument: PageDocument;
  validation: ValidationReport;
  notes?: string[];
}

export type GenerateStreamStage =
  | 'catalog'
  | 'planning'
  | 'spec'
  | 'validating'
  | 'done';

export interface GenerateStreamStageEvent {
  step: GenerateStreamStage;
  message: string;
  progress: number;
}

export interface GenerateStreamMetaEvent {
  provider: string;
  contractVersion: string;
  catalogVersion: string;
  title: string;
  description?: string;
  variables: PageDocument['variables'];
  queries: PageDocument['queries'];
}

export interface GenerateStreamPatchEvent {
  patch: JsonPatch;
  index: number;
  total: number;
  elementId?: string;
  componentType?: string;
}

export interface GenerateStreamCompleteEvent {
  provider: string;
  pageDocument: PageDocument;
  validation: ValidationReport;
}

export interface GenerateStreamErrorEvent {
  code: string;
  message: string;
  details?: unknown;
}

export interface AIEditDashboardRequest {
  instruction: string;
  currentDocument?: PageDocument;
}

export interface AIEditDashboardResponse {
  provider: string;
  candidateDocument: PageDocument;
  patches: JsonPatch[];
  changeSummary: string;
  validation: ValidationReport;
}

export interface SaveDashboardRequest {
  pageDocument: PageDocument;
  changeDescription?: string;
}

export interface UpdateDashboardRequest {
  baseRevision: number;
  pageDocument: PageDocument;
  changeDescription?: string;
}

export interface RollbackDashboardRequest {
  targetRevision: number;
  baseRevision: number;
  changeDescription?: string;
}

export type DataFieldType =
  | 'number'
  | 'currency'
  | 'percent'
  | 'ratio'
  | 'integer'
  | 'string'
  | 'date'
  | 'array'
  | 'object';

export interface DataFieldMetadata {
  name: string;
  label: string;
  type: DataFieldType;
  unit?: string;
  description: string;
  formula?: string;
  itemFields?: DataFieldMetadata[];
}

export interface DataSourceParamMetadata {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'dateRange';
  required: boolean;
  defaultValue?: unknown;
  allowedValues?: string[];
  description: string;
}

export interface DataSourceMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  requiredRoles: string[];
  params: DataSourceParamMetadata[];
  resultType: 'object' | 'array';
  fields: DataFieldMetadata[];
  metricDefinitions: Record<string, string>;
}

export interface ComponentMetadata {
  type: string;
  category: 'layout' | 'display' | 'filter' | 'action';
  description: string;
  slots: string[];
  dataInputType?: 'scalar' | 'series' | 'category' | 'table' | 'options' | 'none';
  defaultProps: Record<string, unknown>;
  useCases: string[];
  exampleSpec: Record<string, unknown>;
  propsDescription: Record<string, string>;
}
