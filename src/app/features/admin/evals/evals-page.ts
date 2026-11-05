import { HttpClient } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { API, EvalCaseResult, EvalRunResponse } from '../../../core/api/api.models';
import { problemMessage } from '../../../core/http/problem';
import { count, duration, percent, shortDay, when } from '../admin-format';

const POLL_MS = 2000;

interface Metric {
  label: string;
  value: string;
  detail: string;
  /** 0 to 100, for the bar; null when there were no questions of this kind. */
  percent: number | null;
  /** Where the target mark sits on the bar; null if there is no target. */
  target: number | null;
  targetText: string;
  /** true = meets target, false = below, null = no target or no data. */
  pass: boolean | null;
}

/**
 * Evals (US-12, FR-17): run the eval suite and see how good the answers are,
 * question by question. Runs are kept by the backend until it restarts.
 */
@Component({
  selector: 'app-evals-page',
  imports: [MatIconModule],
  templateUrl: './evals-page.html',
  styleUrls: ['../admin-common.css', './evals-page.css'],
})
export class EvalsPage {
  private readonly http = inject(HttpClient);

  /** Newest first, as the backend lists them. */
  protected readonly runs = signal<EvalRunResponse[]>([]);
  protected readonly loadState = signal<'loading' | 'loaded' | 'error'>('loading');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly startError = signal<string | null>(null);
  protected readonly filter = signal<'all' | 'failed'>('failed');

  protected readonly count = count;
  protected readonly percent = percent;
  protected readonly shortDay = shortDay;

  private pollTimer?: ReturnType<typeof setTimeout>;

  protected readonly run = computed(() => {
    const runs = this.runs();
    return runs.find((r) => r.id === this.selectedId()) ?? runs[0] ?? null;
  });

  protected readonly anyRunning = computed(() => this.runs().some((r) => r.status === 'RUNNING'));

  /** "Run #3 · today 13:20 · 42 questions · took 2 min 18 s" */
  protected readonly subtitle = computed(() => {
    const run = this.run();
    if (!run) {
      return '';
    }
    const parts = [`Run #${this.runNumber(run)}`, when(run.startedAt)];
    if (run.status === 'RUNNING') {
      parts.push(`answering ${run.completedCases} of ${run.totalCases} questions…`);
    } else {
      parts.push(`${count(run.totalCases)} questions`);
      if (run.finishedAt) {
        parts.push(
          `took ${duration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())}`,
        );
      }
    }
    return parts.join(' · ');
  });

  /** The four headline cards, with counts worked out the same way as EvalService.summarise. */
  protected readonly metrics = computed<Metric[]>(() => {
    const run = this.run();
    if (!run?.summary) {
      return [];
    }
    const s = run.summary;
    const evaluated = run.results.filter((r) => r.status !== 'SKIPPED');
    const answerable = evaluated.filter((r) => !r.expectNotFound);
    const unanswerable = evaluated.filter((r) => r.expectNotFound);
    const withPages = answerable.filter((r) => r.citationCorrect !== null);
    const passed = (list: EvalCaseResult[]) => list.filter((r) => r.status === 'PASSED').length;

    return [
      metric(
        'Answer correctness',
        s.answerCorrectnessPercent,
        85,
        `${passed(answerable)} of ${answerable.length}`,
        'Target ≥ 85%',
      ),
      metric(
        'Citation accuracy',
        s.citationAccuracyPercent,
        90,
        `${withPages.filter((r) => r.citationCorrect).length} of ${withPages.length} cited the right page`,
        'Target ≥ 90%',
      ),
      metric(
        'Honest “not found”',
        s.notFoundAccuracyPercent,
        100,
        `${passed(unanswerable)} of ${unanswerable.length}`,
        'Target 100%',
      ),
      {
        label: 'Overall pass rate',
        value: percent(s.passRatePercent),
        detail: `${s.passed} of ${s.passed + s.failed}`,
        percent: s.passRatePercent,
        target: null,
        targetText:
          (s.skipped > 0 ? `${s.skipped} skipped · ` : '') +
          (s.medianLatencyMs !== null ? `median answer ${duration(s.medianLatencyMs)}` : ''),
        pass: null,
      },
    ];
  });

  protected readonly failedCount = computed(
    () => this.run()?.results.filter((r) => r.status === 'FAILED').length ?? 0,
  );

  protected readonly results = computed(() => {
    const results = this.run()?.results ?? [];
    return this.filter() === 'failed' ? results.filter((r) => r.status === 'FAILED') : results;
  });

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pollTimer));
  }

  protected runNumber(run: EvalRunResponse): number {
    const runs = this.runs();
    return runs.length - runs.findIndex((r) => r.id === run.id);
  }

  protected async load(): Promise<void> {
    this.loadState.set('loading');
    try {
      this.runs.set(await firstValueFrom(this.http.get<EvalRunResponse[]>(`${API}/admin/evals`)));
      this.loadState.set('loaded');
      this.pollWhileRunning();
    } catch {
      this.loadState.set('error');
    }
  }

  protected async start(): Promise<void> {
    this.starting.set(true);
    this.startError.set(null);
    try {
      const run = await firstValueFrom(
        this.http.post<EvalRunResponse>(`${API}/admin/evals/run`, {}),
      );
      this.runs.update((runs) => [run, ...runs]);
      this.selectedId.set(run.id);
      this.filter.set('all');
      this.pollWhileRunning();
    } catch (error) {
      this.startError.set(problemMessage(error, "The eval suite couldn't be started."));
    } finally {
      this.starting.set(false);
    }
  }

  protected select(run: EvalRunResponse): void {
    this.selectedId.set(run.id);
  }

  /** "answered, p.3" / "not found" / "p.14, p.16" */
  protected got(result: EvalCaseResult): string {
    if (result.status === 'SKIPPED') {
      return 'skipped';
    }
    if (result.answeredNotFound) {
      return 'not found';
    }
    const pages = result.citedPages.map((p) => `p.${p}`).join(', ');
    if (result.expectNotFound) {
      return pages ? `answered, ${pages}` : 'answered';
    }
    return pages || 'no page cited';
  }

  protected expected(result: EvalCaseResult): string {
    if (result.expectNotFound) {
      return 'not found';
    }
    return result.expectedPages.length
      ? result.expectedPages.map((p) => `p.${p}`).join(', ')
      : 'any page';
  }

  /** Bar length in the run history: answer correctness. */
  protected historyPercent(run: EvalRunResponse): number | null {
    return run.summary?.answerCorrectnessPercent ?? null;
  }

  /** Checks running runs every 2 seconds until they finish. */
  private pollWhileRunning(): void {
    clearTimeout(this.pollTimer);
    const running = this.runs().filter((r) => r.status === 'RUNNING');
    if (running.length === 0) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      for (const run of running) {
        try {
          const fresh = await firstValueFrom(
            this.http.get<EvalRunResponse>(`${API}/admin/evals/${run.id}`),
          );
          this.runs.update((runs) => runs.map((r) => (r.id === fresh.id ? fresh : r)));
        } catch {
          // Try again on the next tick.
        }
      }
      this.pollWhileRunning();
    }, POLL_MS);
  }
}

function metric(
  label: string,
  value: number | null,
  target: number,
  detail: string,
  targetText: string,
): Metric {
  return {
    label,
    value: percent(value),
    detail: value === null ? 'No questions of this kind' : detail,
    percent: value,
    target,
    targetText,
    pass: value === null ? null : value >= target,
  };
}
