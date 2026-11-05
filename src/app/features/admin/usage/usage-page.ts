import { httpResource } from '@angular/common/http';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { AdminUserResponse, AdminUsageResponse, API } from '../../../core/api/api.models';
import { AdminUsersStore } from '../admin-users.store';
import { compact, count, duration, initials, money, percent } from '../admin-format';
import { LimitDialog } from '../limit-dialog/limit-dialog';

type Range = 1 | 7 | 30;

/** PRD success metrics (section 12). */
const COST_TARGET_USD = 0.01;
const FIRST_WORD_TARGET_MS = 2000;
const SATISFACTION_TARGET = 80;

interface DayBar {
  key: string;
  label: string;
  /** Long form for the tooltip and the screen-reader table, e.g. "Thu, Oct 30". */
  longLabel: string;
  questions: number;
  isToday: boolean;
  showValue: boolean;
  showLabel: boolean;
}

interface TopUser {
  userId: string;
  email: string;
  questions: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  /** "Hit limit Thu" when they used their whole limit on a day in the period. */
  hitLimit: string | null;
}

/**
 * Usage & cost (US-11, FR-16): questions, AI cost, speed and ratings for a
 * period, questions per day, and the heaviest users with their daily limits.
 */
@Component({
  selector: 'app-usage-page',
  imports: [MatIconModule, RouterLink],
  templateUrl: './usage-page.html',
  styleUrls: ['../admin-common.css', './usage-page.css'],
})
export class UsagePage {
  private readonly dialog = inject(MatDialog);
  protected readonly users = inject(AdminUsersStore);

  protected readonly range = signal<Range>(7);
  protected readonly ranges: { value: Range; label: string }[] = [
    { value: 1, label: 'Today' },
    { value: 7, label: 'Last 7 days' },
    { value: 30, label: '30 days' },
  ];

  protected readonly usage = httpResource<AdminUsageResponse>(
    () => `${API}/admin/usage?days=${this.range()}`,
  );
  /** "Today" alone makes a one-bar chart, so the chart then shows the last 7 days. */
  private readonly weekForChart = httpResource<AdminUsageResponse>(() =>
    this.range() === 1 ? `${API}/admin/usage?days=7` : undefined,
  );

  /** Keeps the previous numbers on screen while a new period loads. */
  protected readonly data = linkedSignal<
    AdminUsageResponse | undefined,
    AdminUsageResponse | undefined
  >({
    source: () => this.usage.value(),
    computation: (value, previous) => value ?? previous?.value,
  });
  private readonly chartData = computed(() =>
    this.range() === 1 ? (this.weekForChart.value() ?? undefined) : this.data(),
  );

  protected readonly count = count;
  protected readonly compact = compact;
  protected readonly money = money;
  protected readonly initials = initials;

  constructor() {
    void this.users.load();
  }

  // ------------------------------------------------------------ KPI cards

  protected readonly kpis = computed(() => {
    const data = this.data();
    if (!data) {
      return null;
    }
    const { totals, overview } = data;
    const perQuestion = totals.avgCostPerQuestionUsd;
    const firstWord = totals.medianFirstTokenMs;
    const ratings = overview.thumbsUp + overview.thumbsDown;
    return {
      questions: count(totals.questions),
      activeUsers: `${count(totals.activeUsers)} active user${totals.activeUsers === 1 ? '' : 's'}`,
      cost: money(totals.estimatedCostUsd),
      costNote:
        perQuestion === null
          ? 'No questions in this period'
          : `${money(perQuestion)} per question · target < $0.01`,
      costGood: perQuestion === null ? null : perQuestion < COST_TARGET_USD,
      firstWord: firstWord === null ? '—' : duration(firstWord),
      firstWordGood: firstWord === null ? null : firstWord <= FIRST_WORD_TARGET_MS,
      satisfaction: percent(overview.satisfactionPercent),
      satisfactionNote:
        ratings === 0
          ? 'No answers rated yet · target ≥ 80%'
          : `${count(overview.thumbsUp)} of ${count(ratings)} rated helpful · target ≥ 80%`,
      satisfactionGood:
        overview.satisfactionPercent === null
          ? null
          : overview.satisfactionPercent >= SATISFACTION_TARGET,
    };
  });

  // ------------------------------------------------------------ questions per day

  protected readonly bars = computed<DayBar[]>(() => {
    const data = this.chartData();
    if (!data) {
      return [];
    }
    const perDay = new Map<string, number>();
    for (const row of data.byDay) {
      perDay.set(row.day, (perDay.get(row.day) ?? 0) + row.questions);
    }
    const keyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: data.timeZone }); // 2026-10-30
    const start = new Date(data.from).getTime();
    const bars: DayBar[] = [];
    for (let i = 0; i < data.days; i++) {
      // Midday, so a daylight-saving change never lands on the wrong date.
      const date = new Date(start + i * 86_400_000 + 12 * 3_600_000);
      const key = keyFormat.format(date);
      const isToday = i === data.days - 1;
      bars.push({
        key,
        label: isToday
          ? 'Today'
          : date.toLocaleDateString('en-US', {
              timeZone: data.timeZone,
              weekday: 'short',
              day: 'numeric',
            }),
        longLabel: date.toLocaleDateString('en-US', {
          timeZone: data.timeZone,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
        questions: perDay.get(key) ?? 0,
        isToday,
        showValue: false,
        showLabel: data.days <= 7 || isToday || (data.days - 1 - i) % 5 === 0,
      });
    }
    // Every value fits for a week; for 30 days only the busiest day and today are labelled.
    const busiest = Math.max(...bars.map((b) => b.questions));
    for (const bar of bars) {
      bar.showValue = data.days <= 7 || bar.isToday || (bar.questions === busiest && busiest > 0);
    }
    return bars;
  });

  /** Round steps for the grid lines (50, 100, 150 …) and a top just above the busiest day. */
  private readonly scale = computed(() => {
    const busiest = Math.max(0, ...this.bars().map((b) => b.questions));
    const step = niceStep(Math.max(busiest, 4) / 4);
    return { step, max: Math.ceil(Math.max(busiest, 1) / step) * step };
  });
  protected readonly chartMax = computed(() => this.scale().max);
  protected readonly gridLines = computed(() => {
    const { step, max } = this.scale();
    const lines: number[] = [];
    for (let value = max; value > 0; value -= step) {
      lines.push(value);
    }
    return lines;
  });

  protected readonly chartRange = computed(() => {
    const bars = this.bars();
    return bars.length
      ? `${bars[0].longLabel.replace(/^\w+, /, '')} – ${bars.at(-1)!.longLabel.replace(/^\w+, /, '')}`
      : '';
  });

  protected barHeight(questions: number): number {
    const max = this.chartMax();
    return max === 0 ? 0 : (100 * questions) / max;
  }

  // ------------------------------------------------------------ where the money goes

  protected readonly spend = computed(() => {
    const data = this.data();
    if (!data) {
      return null;
    }
    const { totals, overview } = data;
    return {
      cost: money(totals.estimatedCostUsd),
      tokens: `${compact(totals.inputTokens)} input · ${compact(totals.outputTokens)} output tokens`,
      documents: overview,
    };
  });

  // ------------------------------------------------------------ top users

  protected readonly topUsersTitle = computed(() =>
    this.range() === 1
      ? 'Top users today'
      : this.range() === 7
        ? 'Top users this week'
        : 'Top users, last 30 days',
  );

  protected readonly topUsers = computed<TopUser[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const byUser = new Map<string, TopUser>();
    const limitDays = new Map<string, string>();
    for (const row of data.byDay) {
      const user = byUser.get(row.userId) ?? {
        userId: row.userId,
        email: row.email,
        questions: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        hitLimit: null,
      };
      user.questions += row.questions;
      user.inputTokens += row.inputTokens;
      user.outputTokens += row.outputTokens;
      user.cost += row.estimatedCostUsd;
      byUser.set(row.userId, user);

      // byDay is newest first, so the first day found is the most recent one.
      const limit = this.users.find(row.userId)?.dailyLimit;
      if (limit && row.questions >= limit && !limitDays.has(row.userId)) {
        limitDays.set(row.userId, dayName(row.day, data.timeZone));
      }
    }
    return [...byUser.values()]
      .map((user) => ({ ...user, hitLimit: limitDays.get(user.userId) ?? null }))
      .sort((a, b) => b.cost - a.cost || b.questions - a.questions)
      .slice(0, 5);
  });

  /** The person's name when the account has one; otherwise their email. */
  protected nameOf(user: TopUser): string {
    return this.users.find(user.userId)?.fullName?.trim() || user.email;
  }

  protected limitOf(userId: string): AdminUserResponse | undefined {
    return this.users.find(userId);
  }

  protected editLimit(userId: string): void {
    const user = this.users.find(userId);
    if (user) {
      this.dialog.open(LimitDialog, { width: '420px', data: user });
    }
  }
}

/** The nearest "round" step at or above a value: 1, 2, 5, 10, 20, 50 … (53.75 -> 100, 41 -> 50). */
function niceStep(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  const fraction = value / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

/** "2026-10-30" -> "Thu", or "today". */
function dayName(day: string, timeZone: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  if (day === today) {
    return 'today';
  }
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}
