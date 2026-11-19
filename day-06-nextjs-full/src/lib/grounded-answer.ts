import type { SearchHit } from './search';

export interface GroundedCitation {
  sourceId: string;
  title: string;
  kind: SearchHit['kind'];
  citation: SearchHit['citation'];
}

export interface GroundedAnswer {
  status: 'answered' | 'no_evidence' | 'unavailable';
  text: string;
  citations: GroundedCitation[];
  mode?: 'extractive' | 'unavailable';
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'what',
  'are',
  'was',
  'were',
  'how',
  'why',
  'when',
  'where',
  'which',
  'that',
  'this',
  'from',
  'into',
  'about',
  'does',
  'did',
  'has',
  'have',
  'had',
  'can',
  'could',
  'would',
  'should',
  'will',
  'shall',
  'may',
  'might',
  'not',
  'you',
  'your',
  'our',
  'their',
  'its',
  'please',
  'give',
  'show',
  'explain',
  'tell',
  'list',
  'all',
  'any',
  'synthetic',
  'training',
]);

function queryTerms(question: string): string[] {
  return [...new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9%]+/)
      .filter((term) => term.length >= 3 && !STOPWORDS.has(term)),
  )];
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 15);
}

function selectExtractiveSentences(
  question: string,
  sources: SearchHit[],
): Array<{ sourceId: string; text: string; hit: SearchHit }> {
  const terms = queryTerms(question);
  const selected: Array<{ sourceId: string; text: string; hit: SearchHit }> = [];
  const used = new Set<string>();

  for (let index = 0; index < sources.length && selected.length < 3; index += 1) {
    const hit = sources[index];
    for (const sentence of splitSentences(hit.excerpt)) {
      const lower = sentence.toLowerCase();
      const mentionsQuestion = terms.some((term) => lower.includes(term));
      if (!mentionsQuestion && !/\d/.test(sentence)) continue;
      if (used.has(lower)) continue;
      used.add(lower);
      selected.push({ sourceId: `S${index + 1}`, text: sentence, hit });
      break;
    }
  }

  return selected;
}

function citationsFor(
  sourceIds: string[],
  citationMap: Map<string, SearchHit>,
): GroundedCitation[] {
  return sourceIds.map((sourceId) => {
    const hit = citationMap.get(sourceId);
    if (!hit) {
      throw new Error('A retrieved citation could not be resolved.');
    }
    return {
      sourceId,
      title: hit.title,
      kind: hit.kind,
      citation: hit.citation,
    };
  });
}

export async function answerFromEvidence(
  question: string,
  hits: SearchHit[],
): Promise<GroundedAnswer> {
  const sources = hits.slice(0, 5);
  if (sources.length === 0) {
    return {
      status: 'no_evidence',
      mode: 'unavailable',
      text: 'I could not find matching evidence in the synthetic training corpus. Try a different institution, period, indicator, or phrase.',
      citations: [],
    };
  }

  const citationMap = new Map(
    sources.map((hit, index) => [`S${index + 1}`, hit]),
  );
  const selected = selectExtractiveSentences(question, sources.slice(0, 3));
  if (selected.length > 0) {
    const usedIds = [...new Set(selected.map((entry) => entry.sourceId))];
    return {
      status: 'answered',
      mode: 'extractive',
      text: selected
        .map((entry) => `[${entry.sourceId}] ${entry.text}`)
        .join(' '),
      citations: citationsFor(usedIds, citationMap),
    };
  }

  return {
    status: 'unavailable',
    mode: 'unavailable',
    text: 'The retrieved sources are available below, but no extractive sentence matched the question terms. Review the cited records directly.',
    citations: citationsFor([...citationMap.keys()], citationMap),
  };
}
