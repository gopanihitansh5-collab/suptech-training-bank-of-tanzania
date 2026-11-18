import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { closePool, getPool, withTransaction } from '../src/lib/db';
import { INDICATOR_DEFINITIONS, TRAINING_THRESHOLDS } from '../src/lib/catalog';
import { buildDemoData } from '../src/lib/demo-data';
import { computeAnalytics } from '../src/lib/metrics';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

type UpdateAssignment = string;

async function insertBatch(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictTarget: string,
  updateAssignments: UpdateAssignment[],
  chunkSize: number,
): Promise<void> {
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params: unknown[] = [];
    const valueLists = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const setClause = updateAssignments.join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')})
       VALUES ${valueLists.join(', ')}
       ON CONFLICT (${conflictTarget}) DO UPDATE SET ${setClause}`;
    await client.query(sql, params);
  }
}

async function main(): Promise<void> {
  const { institutions, reports } = buildDemoData();
  const { indicators, exceptions } = computeAnalytics(institutions, reports);
  const pool = getPool();
  let reconciledCount = 0;

  await withTransaction(async (client) => {
    await insertBatch(
      client,
      'institutions',
      ['institution_id', 'institution_name', 'institution_type', 'region', 'tier', 'status'],
      institutions.map((institution) => [
        institution.id,
        institution.name,
        institution.type,
        institution.region,
        institution.tier,
        institution.status,
      ]),
      'institution_id',
      [
        'institution_name = EXCLUDED.institution_name',
        'institution_type = EXCLUDED.institution_type',
        'region = EXCLUDED.region',
        'tier = EXCLUDED.tier',
        'status = EXCLUDED.status',
      ],
      100,
    );

    await insertBatch(
      client,
      'indicator_definitions',
      ['indicator_id', 'label', 'unit', 'formula', 'description', 'version', 'is_training_configuration'],
      INDICATOR_DEFINITIONS.map((definition) => [
        definition.id,
        definition.label,
        definition.unit,
        definition.formula,
        definition.description,
        1,
        true,
      ]),
      'indicator_id',
      [
        'label = EXCLUDED.label',
        'unit = EXCLUDED.unit',
        'formula = EXCLUDED.formula',
        'description = EXCLUDED.description',
      ],
      100,
    );

    await insertBatch(
      client,
      'threshold_configurations',
      ['threshold_id', 'indicator_id', 'label', 'operator', 'threshold_value', 'severity', 'rationale', 'enabled', 'is_training_configuration'],
      TRAINING_THRESHOLDS.map((threshold) => [
        threshold.id,
        threshold.indicatorId,
        threshold.label,
        threshold.operator,
        threshold.value,
        threshold.severity,
        threshold.rationale,
        true,
        true,
      ]),
      'threshold_id',
      [
        'indicator_id = EXCLUDED.indicator_id',
        'label = EXCLUDED.label',
        'operator = EXCLUDED.operator',
        'threshold_value = EXCLUDED.threshold_value',
        'severity = EXCLUDED.severity',
        'rationale = EXCLUDED.rationale',
      ],
      100,
    );

    await insertBatch(
      client,
      'institution_reports',
      [
        'report_id',
        'institution_id',
        'reporting_period',
        'deposits_tzs_billions',
        'loans_tzs_billions',
        'capital_adequacy_ratio_percent',
        'liquidity_ratio_percent',
        'npl_ratio_percent',
        'report_completeness_percent',
        'late_submission_days',
        'records_submitted',
        'records_rejected',
        'source_record_ids',
        'submitted_at',
        'synthetic',
      ],
      reports.map((report) => [
        report.id,
        report.institutionId,
        report.period,
        report.depositsTzsBillions,
        report.loansTzsBillions,
        report.capitalAdequacyRatioPercent,
        report.liquidityRatioPercent,
        report.nplRatioPercent,
        report.reportCompletenessPercent,
        report.lateSubmissionDays,
        report.recordsSubmitted,
        report.recordsRejected,
        report.sourceRecordIds,
        report.submittedAtISO,
        true,
      ]),
      'report_id',
      [
        'institution_id = EXCLUDED.institution_id',
        'reporting_period = EXCLUDED.reporting_period',
        'deposits_tzs_billions = EXCLUDED.deposits_tzs_billions',
        'loans_tzs_billions = EXCLUDED.loans_tzs_billions',
        'capital_adequacy_ratio_percent = EXCLUDED.capital_adequacy_ratio_percent',
        'liquidity_ratio_percent = EXCLUDED.liquidity_ratio_percent',
        'npl_ratio_percent = EXCLUDED.npl_ratio_percent',
        'report_completeness_percent = EXCLUDED.report_completeness_percent',
        'late_submission_days = EXCLUDED.late_submission_days',
        'records_submitted = EXCLUDED.records_submitted',
        'records_rejected = EXCLUDED.records_rejected',
        'source_record_ids = EXCLUDED.source_record_ids',
        'submitted_at = EXCLUDED.submitted_at',
      ],
      40,
    );

    await insertBatch(
      client,
      'supervisory_indicators',
      [
        'indicator_id',
        'grain',
        'reporting_period',
        'institution_id',
        'subject_key',
        'indicator_value',
        'unit',
        'formula',
        'source_report_ids',
      ],
      indicators.map((indicator) => {
        const grain = indicator.institutionId ? 'institution' : 'sector';
        const subjectKey = indicator.institutionId ?? 'SECTOR';
        return [
          indicator.indicatorId,
          grain,
          indicator.period,
          indicator.institutionId,
          subjectKey,
          indicator.value,
          indicator.unit,
          indicator.formula,
          indicator.sourceReportIds,
        ];
      }),
      'indicator_id, grain, reporting_period, subject_key',
      [
        'indicator_value = EXCLUDED.indicator_value',
        'unit = EXCLUDED.unit',
        'formula = EXCLUDED.formula',
        'source_report_ids = EXCLUDED.source_report_ids',
        'calculated_at = now()',
      ],
      100,
    );

    await insertBatch(
      client,
      'supervisory_exceptions',
      [
        'exception_id',
        'institution_id',
        'report_id',
        'reporting_period',
        'indicator_id',
        'observed_value',
        'threshold_value',
        'severity',
        'status',
        'message',
      ],
      exceptions.map((exception) => [
        exception.id,
        exception.institutionId,
        exception.reportId,
        exception.period,
        exception.indicatorId,
        exception.observedValue,
        exception.thresholdValue,
        exception.severity,
        exception.status,
        exception.message,
      ]),
      'exception_id',
      [
        'observed_value = EXCLUDED.observed_value',
        'threshold_value = EXCLUDED.threshold_value',
        'severity = EXCLUDED.severity',
        'message = EXCLUDED.message',
        'updated_at = now()',
      ],
      100,
    );

    const exceptionIds = exceptions.map((exception) => exception.id);
    const reconciled = await client.query(
      `UPDATE supervisory_exceptions
       SET status = 'resolved',
         message = message || ' · reconciled: breach no longer holds',
         updated_at = now()
       WHERE status = 'open' AND exception_id <> ALL($1::text[])`,
      [exceptionIds],
    );
    reconciledCount = reconciled.rowCount ?? 0;

    const demoUsername = process.env.DEMO_USERNAME?.trim() || 'demo.supervisor';
    const demoRoleRaw = process.env.DEMO_ROLE?.trim() || 'supervisor';
    const demoRole = ['viewer', 'supervisor', 'admin'].includes(demoRoleRaw) ? demoRoleRaw : 'supervisor';
    await client.query(
      `INSERT INTO users (user_id, role_id, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id) DO NOTHING`,
      [demoUsername, demoRole],
    );

    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'system:seed',
        'synthetic_dataset_seeded',
        'dataset',
        randomUUID(),
        JSON.stringify({
          institutions: institutions.length,
          reports: reports.length,
          indicators: indicators.length,
          exceptions: exceptions.length,
          reconciled: reconciledCount,
          synthetic: true,
        }),
      ],
    );
    await client.query(
      `INSERT INTO system_events (event_type, payload)
       VALUES ($1, $2)`,
      [
        'synthetic_seed_completed',
        JSON.stringify({ institutions: institutions.length, reports: reports.length }),
      ],
    );
  });

  console.info(
    `Seeded ${institutions.length} synthetic institutions, ${reports.length} reports, ${indicators.length} indicators and ${exceptions.length} illustrative exceptions, and resolved ${reconciledCount} stale open exception(s) during reconciliation.`,
  );
  await pool.query('SELECT 1');
}

main()
  .catch((error: unknown) => {
    console.error(
      'Synthetic seed failed:',
      error instanceof Error ? error.message : 'Unexpected error',
    );
    process.exitCode = 1;
  })
  .finally(closePool);
