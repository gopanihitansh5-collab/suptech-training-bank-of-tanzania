import type { SupervisoryException } from './types';

export interface InstitutionExceptionRank {
  rank: number;
  institutionId: string;
  exceptionCount: number;
  criticalCount: number;
  sourceRows: number[];
}

export type RankableException = Pick<
  SupervisoryException,
  'institution_id' | 'severity' | 'source_row_number'
>;

export function rankExceptionRecords(
  exceptions: readonly RankableException[],
): InstitutionExceptionRank[] {
  const grouped = new Map<
    string,
    { exceptionCount: number; criticalCount: number; sourceRows: Set<number> }
  >();

  for (const exception of exceptions) {
    if (!exception.institution_id) {
      continue;
    }

    const institution =
      grouped.get(exception.institution_id) ?? {
        exceptionCount: 0,
        criticalCount: 0,
        sourceRows: new Set<number>(),
      };
    institution.exceptionCount += 1;
    if (exception.severity === 'CRITICAL') {
      institution.criticalCount += 1;
    }
    if (exception.source_row_number !== null) {
      institution.sourceRows.add(exception.source_row_number);
    }
    grouped.set(exception.institution_id, institution);
  }

  const ordered = Array.from(grouped, ([institutionId, values]) => ({
    institutionId,
    ...values,
  })).sort(
    (left, right) =>
      right.exceptionCount - left.exceptionCount ||
      left.institutionId.localeCompare(right.institutionId),
  );

  let rank = 0;
  let previousCount: number | null = null;
  return ordered.map((institution, index) => {
    if (institution.exceptionCount !== previousCount) {
      rank = index + 1;
      previousCount = institution.exceptionCount;
    }
    return {
      ...institution,
      rank,
      sourceRows: Array.from(institution.sourceRows).sort((a, b) => a - b),
    };
  });
}
