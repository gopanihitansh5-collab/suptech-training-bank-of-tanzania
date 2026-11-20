import { describe, expect, it } from 'vitest';
import { buildEvidencePacket, composeValidatedSummary, validateDraftAgainstEvidence } from './evidence-composer';

describe('evidence-bound composition', () => {
  it('distinguishes empty, single-row and multi-row evidence', () => {
    expect(buildEvidencePacket('none', []).rowCount).toBe(0);
    const single = buildEvidencePacket('one', [{ institutionId: 'TZ004', nplRatio: 7.2 }]);
    expect(composeValidatedSummary(single).text).toContain('One row');
    const many = buildEvidencePacket('many', [{ period: '2026-09' }, { period: '2026-10' }]);
    expect(composeValidatedSummary(many).text).toContain('2 rows');
  });

  it('rejects draft numbers absent from the evidence packet', () => {
    const packet = buildEvidencePacket('NPL', [{ period: '2026-10', nplRatio: 7.2 }]);
    expect(validateDraftAgainstEvidence('The NPL ratio is 99.9% in 2026-10.', packet).valid).toBe(false);
    expect(validateDraftAgainstEvidence('The period is 2026-10 and the ratio is 7.2.', packet).valid).toBe(true);
  });

  it('repairs unsupported drafts with a data-only summary', () => {
    const packet = buildEvidencePacket('NPL', [{ nplRatio: 7.2 }]);
    const result = composeValidatedSummary(packet, 'The NPL ratio rose to 88.8.');
    expect(result.validated).toBe(false);
    expect(result.text).toContain('One row');
  });
});
