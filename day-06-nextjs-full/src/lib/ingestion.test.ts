import { describe, expect, it } from 'vitest';
import { RequestValidationError } from './api-errors';
import {
  ACCEPTED_TYPES,
  buildChunks,
  chunkText,
  MAX_BYTES,
  parseCsv,
  parseJson,
  sha256Hex,
  validateUpload,
} from './ingestion';

describe('ingestion module', () => {
  describe('ACCEPTED_TYPES and validateUpload', () => {
    it('accepts .txt, .csv, and .json files within size limits', () => {
      expect(ACCEPTED_TYPES['text/plain']).toBe('.txt');
      expect(ACCEPTED_TYPES['text/csv']).toBe('.csv');
      expect(ACCEPTED_TYPES['application/json']).toBe('.json');

      expect(validateUpload('report.txt', 'text/plain', 500)).toEqual({ ok: true });
      expect(validateUpload('data.csv', 'text/csv', 1000)).toEqual({ ok: true });
      expect(validateUpload('payload.json', 'application/json', 2000)).toEqual({ ok: true });
      expect(validateUpload('payload.JSON', 'application/json; charset=utf-8', 2000)).toEqual({ ok: true });
    });

    it('rejects unsupported extensions', () => {
      expect(() => validateUpload('doc.pdf', 'text/plain', 100)).toThrow(
        RequestValidationError,
      );
      expect(() => validateUpload('data.xlsx', 'text/csv', 100)).toThrow(
        'Unsupported file extension. Only .txt, .csv, and .json files are accepted.',
      );
    });

    it('rejects unsupported MIME types', () => {
      expect(() => validateUpload('test.txt', 'application/pdf', 100)).toThrow(
        'Unsupported content type. Upload a text/plain, text/csv, or application/json file.',
      );
    });

    it('rejects empty files or invalid sizes', () => {
      expect(() => validateUpload('empty.txt', 'text/plain', 0)).toThrow(
        'The uploaded file is empty.',
      );
      expect(() => validateUpload('invalid.txt', 'text/plain', -1)).toThrow(
        'The uploaded file size is invalid.',
      );
      expect(() => validateUpload('large.txt', 'text/plain', MAX_BYTES + 1)).toThrow(
        'The uploaded file is too large. Maximum size is 2 MB.',
      );
    });
  });

  describe('parseJson', () => {
    it('rejects empty and whitespace strings', () => {
      expect(() => parseJson('')).toThrow('JSON content is empty.');
      expect(() => parseJson('   \n  \t ')).toThrow('JSON content is empty.');
    });

    it('rejects malformed JSON', () => {
      expect(() => parseJson('{ invalid json }')).toThrow('JSON is malformed');
      expect(() => parseJson('{"key": 123,}')).toThrow('JSON is malformed');
    });

    it('rejects primitives and null', () => {
      expect(() => parseJson('null')).toThrow('JSON must contain a root object or array.');
      expect(() => parseJson('12345')).toThrow('JSON must contain a root object or array.');
      expect(() => parseJson('"hello"')).toThrow('JSON must contain a root object or array.');
      expect(() => parseJson('true')).toThrow('JSON must contain a root object or array.');
    });

    it('parses valid objects and arrays', () => {
      expect(parseJson('{"name": "CRDB", "tier": 1}')).toEqual({ name: 'CRDB', tier: 1 });
      expect(parseJson('[{"id": 1}, {"id": 2}]')).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe('buildChunks', () => {
    it('builds chunks for plain text', () => {
      const buffer = Buffer.from('This is a test supervisory document for training.');
      const result = buildChunks('text/plain', buffer);
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.extractedCharacters).toBe(buffer.length);
    });

    it('builds chunks for CSV documents with headers', () => {
      const csv = 'institution_id,deposits,loans\nTZ001,150.5,120.2\nTZ002,200.1,180.4';
      const buffer = Buffer.from(csv);
      const result = buildChunks('text/csv', buffer);
      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0]).toContain('institution_id=TZ001');
      expect(result.chunks[0]).toContain('deposits=150.5');
      expect(result.extractedCharacters).toBeGreaterThan(0);
    });

    it('builds chunks for JSON arrays with individual object records', () => {
      const json = JSON.stringify([
        { institutionId: 'TZ001', assets: 500 },
        { institutionId: 'TZ002', assets: 750 },
      ]);
      const buffer = Buffer.from(json);
      const result = buildChunks('application/json', buffer);
      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0]).toBe('{"institutionId":"TZ001","assets":500}');
      expect(result.chunks[1]).toBe('{"institutionId":"TZ002","assets":750}');
      expect(result.extractedCharacters).toBe(
        result.chunks[0].length + result.chunks[1].length,
      );
    });

    it('splits large items in JSON array when exceeding chunk size', () => {
      const largeRecord = { institutionId: 'TZ001', details: 'A'.repeat(2500) };
      const json = JSON.stringify([largeRecord]);
      const buffer = Buffer.from(json);
      const result = buildChunks('application/json', buffer);
      expect(result.chunks.length).toBeGreaterThan(1);
    });

    it('handles empty JSON array or empty JSON object gracefully', () => {
      expect(buildChunks('application/json', Buffer.from('[]'))).toEqual({
        chunks: [],
        extractedCharacters: 0,
      });
      expect(buildChunks('application/json', Buffer.from('{}'))).toEqual({
        chunks: [],
        extractedCharacters: 0,
      });
    });

    it('builds formatted chunks for JSON root objects', () => {
      const obj = {
        title: 'Supervisory Guidance',
        version: '1.0',
        sections: ['liquidity', 'capital adequacy'],
      };
      const buffer = Buffer.from(JSON.stringify(obj));
      const result = buildChunks('application/json', buffer);
      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0]).toContain('"title": "Supervisory Guidance"');
      expect(result.extractedCharacters).toBe(result.chunks[0].length);
    });
  });

  describe('sha256Hex', () => {
    it('computes 64-character sha256 hex checksum', () => {
      const checksum = sha256Hex(Buffer.from('test data'));
      expect(checksum).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(checksum)).toBe(true);
    });
  });
});
