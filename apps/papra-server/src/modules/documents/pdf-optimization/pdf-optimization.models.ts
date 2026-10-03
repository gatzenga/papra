// OCRmyPDF plugin replacing its progress bar by one JSON line per update on stderr
export const PROGRESS_PLUGIN_SOURCE = `
import json
import sys

from ocrmypdf import hookimpl


class JsonProgressBar:
    def __init__(self, *, total=None, desc=None, unit=None, disable=False, **kwargs):
        self.total = total
        self.desc = desc
        self.n = 0
        self._emit()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        if self.total is not None:
            self.n = self.total
        self._emit()
        return False

    def update(self, n=1, *, completed=None):
        self.n += n
        self._emit()

    def _emit(self):
        print(json.dumps({"progress": {"desc": self.desc, "n": self.n, "total": self.total}}), file=sys.stderr, flush=True)


@hookimpl
def get_progressbar_class():
    return JsonProgressBar
`;

export function buildOcrmypdfArguments({
  languages,
  pluginPath,
  inputPath,
  outputPath,
}: {
  languages: string;
  pluginPath: string;
  inputPath: string;
  outputPath: string;
}) {
  return [
    // Pages that already have text stay untouched, only scanned pages are processed
    '--skip-text',
    '--rotate-pages',
    '--deskew',
    '--output-type',
    'pdf',
    '-l',
    languages,
    '--plugin',
    pluginPath,
    inputPath,
    outputPath,
  ];
}

export type PdfOptimizationStage = { keyword: string; weight: number };

// The share of the whole job each OCRmyPDF step represents, by the step description
const STAGES: PdfOptimizationStage[] = [
  { keyword: 'scan', weight: 0.1 },
  { keyword: 'ocr', weight: 0.75 },
  { keyword: 'graft', weight: 0.05 },
  { keyword: 'linear', weight: 0.1 },
];

export function parseProgressLine({ line }: { line: string }) {
  try {
    const parsed = JSON.parse(line) as {
      progress?: { desc?: string | null; n?: number; total?: number | null };
    };

    if (parsed.progress === undefined) {
      return undefined;
    }

    return {
      desc: String(parsed.progress.desc ?? '').toLowerCase(),
      n: Number(parsed.progress.n ?? 0),
      total: parsed.progress.total === null ? undefined : Number(parsed.progress.total),
    };
  } catch {
    return undefined;
  }
}

// Overall progress between 0 and 1 from the per-step fractions reported so far
export function computeOverallProgress({ stepFractions }: { stepFractions: Map<string, number> }) {
  let progress = 0;

  for (const { keyword, weight } of STAGES) {
    const fraction =
      [...stepFractions.entries()].find(([desc]) => desc.includes(keyword))?.[1] ?? 0;
    progress += weight * fraction;
  }

  return Math.min(1, Math.max(0, progress));
}
