import { describe, expect, test } from 'vitest';
import {
  buildOcrmypdfArguments,
  computeOverallProgress,
  parseProgressLine,
} from './pdf-optimization.models';

describe('pdf-optimization models', () => {
  describe('buildOcrmypdfArguments', () => {
    test('pages with text are skipped, scanned pages are rotated, straightened and recognized', () => {
      const args = buildOcrmypdfArguments({
        languages: 'deu+eng',
        pluginPath: '/tmp/plugin.py',
        inputPath: '/tmp/in.pdf',
        outputPath: '/tmp/out.pdf',
      });

      expect(args).to.include.members(['--skip-text', '--rotate-pages', '--deskew']);
      expect(args.slice(args.indexOf('-l'), args.indexOf('-l') + 2)).to.eql(['-l', 'deu+eng']);
      expect(args.slice(-2)).to.eql(['/tmp/in.pdf', '/tmp/out.pdf']);
    });
  });

  describe('parseProgressLine', () => {
    test('progress lines are parsed, any other line is ignored', () => {
      expect(
        parseProgressLine({ line: '{"progress": {"desc": "OCR", "n": 1.5, "total": 3}}' }),
      ).to.eql({ desc: 'ocr', n: 1.5, total: 3 });
      expect(parseProgressLine({ line: 'Postprocessing...' })).to.eql(undefined);
      expect(parseProgressLine({ line: '{"other": true}' })).to.eql(undefined);
    });
  });

  describe('computeOverallProgress', () => {
    test('the OCR step carries most of the progress and it never leaves 0..1', () => {
      expect(computeOverallProgress({ stepFractions: new Map() })).to.eql(0);
      expect(
        computeOverallProgress({
          stepFractions: new Map([
            ['scanning contents', 1],
            ['ocr', 0.5],
          ]),
        }),
      ).to.be.closeTo(0.475, 1e-9);
      expect(
        computeOverallProgress({
          stepFractions: new Map([
            ['scanning contents', 1],
            ['ocr', 1],
            ['linearizing', 1],
            ['grafting', 1],
          ]),
        }),
      ).to.eql(1);
    });
  });
});
