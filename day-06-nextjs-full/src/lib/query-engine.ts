import { withTransaction } from './db';
import { RequestValidationError } from './api-errors';

export type QueryDataset =
  | 'institutions'
  | 'institution_reports'
  | 'supervisory_exceptions';

export interface QueryFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gte' | 'lte' | 'in';
  value: string | number | boolean | Array<string | number>;
}

export interface QuerySpec {
  dataset: QueryDataset;
  fields: string[];
  filters?: QueryFilter[];
  groupBy?: string[];
  orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limit?: number;
}

interface DatasetDefinition {
  table: string;
  fields: Record<string, string>;
  filterFields: Set<string>;
}

const DATASETS: Record<QueryDataset, DatasetDefinition> = {
  institutions: {
    table: 'institutions',
    fields: {
      institutionId: 'institution_id',
      name: 'institution_name',
      type: 'institution_type',
      region: 'region',
      tier: 'tier',
      status: 'status',
    },
    filterFields: new Set(['institutionId', 'region', 'tier', 'status', 'type']),
  },
  institution_reports: {
    table: 'institution_reports',
    fields: {
      reportId: 'report_id',
      institutionId: 'institution_id',
      period: 'reporting_period',
      deposits: 'deposits_tzs_billions',
      loans: 'loans_tzs_billions',
      capitalAdequacy: 'capital_adequacy_ratio_percent',
      liquidity: 'liquidity_ratio_percent',
      nplRatio: 'npl_ratio_percent',
      completeness: 'report_completeness_percent',
    },
    filterFields: new Set(['institutionId', 'period']),
  },
  supervisory_exceptions: {
    table: 'supervisory_exceptions',
    fields: {
      exceptionId: 'exception_id',
      institutionId: 'institution_id',
      reportId: 'report_id',
      period: 'reporting_period',
      indicatorId: 'indicator_id',
      observedValue: 'observed_value',
      thresholdValue: 'threshold_value',
      severity: 'severity',
      status: 'status',
    },
    filterFields: new Set(['institutionId', 'period', 'indicatorId', 'severity', 'status']),
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 100) {
    throw new RequestValidationError(`Query spec field "${field}" must be a bounded string.`);
  }
  return value;
}

export function validateQuerySpec(input: unknown): QuerySpec {
  if (!isRecord(input)) throw new RequestValidationError('Query specification must be an object.');
  if (Object.keys(input).some((key) => !['dataset', 'fields', 'filters', 'groupBy', 'orderBy', 'limit'].includes(key))) {
    throw new RequestValidationError('Query specification contains unsupported fields.');
  }

  const dataset = readText(input.dataset, 'dataset') as QueryDataset;
  if (!Object.prototype.hasOwnProperty.call(DATASETS, dataset)) {
    throw new RequestValidationError('Query dataset is not allowlisted.');
  }
  if (!Array.isArray(input.fields) || input.fields.length < 1 || input.fields.length > 12) {
    throw new RequestValidationError('Query fields must contain between 1 and 12 entries.');
  }
  const definition = DATASETS[dataset];
  const fields = input.fields.map((field) => {
    const name = readText(field, 'fields');
    if (!Object.prototype.hasOwnProperty.call(definition.fields, name)) {
      throw new RequestValidationError(`Field "${name}" is not allowlisted for ${dataset}.`);
    }
    return name;
  });

  const filters: QueryFilter[] = [];
  if (input.filters !== undefined) {
    if (!Array.isArray(input.filters) || input.filters.length > 8) {
      throw new RequestValidationError('Query filters must contain at most 8 entries.');
    }
    for (const entry of input.filters) {
      if (!isRecord(entry) || Object.keys(entry).some((key) => !['field', 'operator', 'value'].includes(key))) {
        throw new RequestValidationError('Query filter has an invalid shape.');
      }
      const field = readText(entry.field, 'filter.field');
      if (!definition.filterFields.has(field)) {
        throw new RequestValidationError(`Filter field "${field}" is not allowlisted.`);
      }
      if (!['eq', 'neq', 'gte', 'lte', 'in'].includes(String(entry.operator))) {
        throw new RequestValidationError('Query filter operator is not allowlisted.');
      }
      const operator = entry.operator as QueryFilter['operator'];
      if (operator === 'in') {
        if (!Array.isArray(entry.value) || entry.value.length < 1 || entry.value.length > 20) {
          throw new RequestValidationError('IN filters require a bounded value array.');
        }
        if (!entry.value.every((value) => typeof value === 'string' || typeof value === 'number')) {
          throw new RequestValidationError('IN filter values must be strings or numbers.');
        }
      } else if (
        typeof entry.value !== 'string' &&
        typeof entry.value !== 'number' &&
        typeof entry.value !== 'boolean'
      ) {
        throw new RequestValidationError('Scalar filter values must be primitive.');
      }
      filters.push({ field, operator, value: entry.value as QueryFilter['value'] });
    }
  }

  const groupBy: string[] = [];
  if (input.groupBy !== undefined) {
    if (!Array.isArray(input.groupBy) || input.groupBy.length > 4) {
      throw new RequestValidationError('Group-by fields must contain at most 4 entries.');
    }
    for (const field of input.groupBy) {
      const name = readText(field, 'groupBy');
      if (!Object.prototype.hasOwnProperty.call(definition.fields, name)) {
        throw new RequestValidationError(`Group-by field "${name}" is not allowlisted.`);
      }
      groupBy.push(name);
    }
  }

  const orderBy: QuerySpec['orderBy'] = [];
  if (input.orderBy !== undefined) {
    if (!Array.isArray(input.orderBy) || input.orderBy.length > 4) {
      throw new RequestValidationError('Order-by fields must contain at most 4 entries.');
    }
    for (const entry of input.orderBy) {
      if (!isRecord(entry) || typeof entry.field !== 'string') {
        throw new RequestValidationError('Order-by entry is invalid.');
      }
      if (!Object.prototype.hasOwnProperty.call(definition.fields, entry.field)) {
        throw new RequestValidationError(`Order-by field "${entry.field}" is not allowlisted.`);
      }
      if (entry.direction !== 'asc' && entry.direction !== 'desc') {
        throw new RequestValidationError('Order direction must be asc or desc.');
      }
      orderBy.push({ field: entry.field, direction: entry.direction });
    }
  }

  const limit = input.limit === undefined ? 100 : input.limit;
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 500) {
    throw new RequestValidationError('Query limit must be between 1 and 500.');
  }

  return {
    dataset,
    fields,
    ...(filters.length ? { filters } : {}),
    ...(groupBy.length ? { groupBy } : {}),
    ...(orderBy.length ? { orderBy } : {}),
    limit: Number(limit),
  };
}

function compileIdentifier(definition: DatasetDefinition, field: string): string {
  return definition.fields[field];
}

export function compileQuerySpec(spec: QuerySpec): { sql: string; values: unknown[] } {
  const definition = DATASETS[spec.dataset];
  const values: unknown[] = [];
  const selected = spec.fields.map((field) => `${compileIdentifier(definition, field)} AS "${field}"`);
  const clauses: string[] = [];

  for (const filter of spec.filters ?? []) {
    const column = compileIdentifier(definition, filter.field);
    if (filter.operator === 'in') {
      const array = filter.value as Array<string | number>;
      const placeholders = array.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      clauses.push(`${column} IN (${placeholders.join(', ')})`);
    } else {
      values.push(filter.value);
      const operator = { eq: '=', neq: '<>', gte: '>=', lte: '<=' }[filter.operator];
      clauses.push(`${column} ${operator} $${values.length}`);
    }
  }

  const sqlParts = [`SELECT ${selected.join(', ')} FROM ${definition.table}`];
  if (clauses.length) sqlParts.push(`WHERE ${clauses.join(' AND ')}`);
  if (spec.groupBy?.length) {
    sqlParts.push(`GROUP BY ${spec.groupBy.map((field) => compileIdentifier(definition, field)).join(', ')}`);
  }
  if (spec.orderBy?.length) {
    sqlParts.push(`ORDER BY ${spec.orderBy.map((entry) => `${compileIdentifier(definition, entry.field)} ${entry.direction.toUpperCase()}`).join(', ')}`);
  }
  values.push(spec.limit);
  sqlParts.push(`LIMIT $${values.length}`);

  return { sql: sqlParts.join('\n'), values };
}

export interface QueryEngineResult {
  spec: QuerySpec;
  sql: string;
  rows: Array<Record<string, unknown>>;
  chartRecommendation: 'table' | 'line' | 'bar';
  audit: { dataset: QueryDataset; rowCount: number; readOnly: true };
}

export async function executeQuerySpec(input: unknown): Promise<QueryEngineResult> {
  const spec = validateQuerySpec(input);
  const compiled = compileQuerySpec(spec);
  const result = await withTransaction(async (client) => {
    await client.query('SET TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '3000ms'");
    return client.query<Record<string, unknown>>(compiled.sql, compiled.values);
  });

  const chartRecommendation =
    spec.fields.includes('period') && spec.fields.some((field) => ['deposits', 'loans', 'nplRatio', 'completeness'].includes(field))
      ? 'line'
      : spec.groupBy?.length
        ? 'bar'
        : 'table';
  const rowCount = result.rowCount ?? 0;

  console.info('Generated read-only query executed', {
    dataset: spec.dataset,
    fields: spec.fields,
    filters: spec.filters ?? [],
    limit: spec.limit,
    rowCount,
  });

  return {
    spec,
    sql: compiled.sql,
    rows: result.rows,
    chartRecommendation,
    audit: { dataset: spec.dataset, rowCount, readOnly: true },
  };
}

export function inferQuerySpec(question: string): QuerySpec {
  const normalized = question.trim().toLowerCase();
  const period = normalized.match(/\b\d{4}-(0[1-9]|1[0-2])\b/)?.[0];
  const institutionId = question.match(/\b[A-Z]{2}\d{3}\b/i)?.[0]?.toUpperCase();

  if (/\b(exception|exceptions|signal|signals|breach|breaches)\b/.test(normalized)) {
    const severity = ['critical', 'high', 'medium', 'low'].find((value) => normalized.includes(value));
    const status = ['open', 'under_review', 'resolved'].find((value) =>
      normalized.includes(value) || normalized.includes(value.replace('_', ' ')),
    );
    return validateQuerySpec({
      dataset: 'supervisory_exceptions',
      fields: ['exceptionId', 'institutionId', 'period', 'indicatorId', 'observedValue', 'thresholdValue', 'severity', 'status'],
      filters: [
        ...(institutionId ? [{ field: 'institutionId', operator: 'eq', value: institutionId }] : []),
        ...(period ? [{ field: 'period', operator: 'eq', value: period }] : []),
        ...(severity ? [{ field: 'severity', operator: 'eq', value: severity }] : []),
        ...(status ? [{ field: 'status', operator: 'eq', value: status }] : []),
      ],
      orderBy: [{ field: 'period', direction: 'desc' }],
      limit: 100,
    });
  }

  if (/\b(report|reports|deposits|loans|capital|liquidity|npl|completeness)\b/.test(normalized)) {
    return validateQuerySpec({
      dataset: 'institution_reports',
      fields: [
        'reportId',
        'institutionId',
        'period',
        'deposits',
        'loans',
        'capitalAdequacy',
        'liquidity',
        'nplRatio',
        'completeness',
      ],
      filters: [
        ...(institutionId ? [{ field: 'institutionId', operator: 'eq', value: institutionId }] : []),
        ...(period ? [{ field: 'period', operator: 'eq', value: period }] : []),
      ],
      orderBy: [{ field: 'period', direction: 'desc' }],
      limit: 100,
    });
  }

  return validateQuerySpec({
    dataset: 'institutions',
    fields: ['institutionId', 'name', 'type', 'region', 'tier', 'status'],
    filters: institutionId
      ? [{ field: 'institutionId', operator: 'eq', value: institutionId }]
      : [],
    orderBy: [{ field: 'name', direction: 'asc' }],
    limit: 100,
  });
}
