/**
 * TypeScript versions of the backend's request and response shapes.
 * Each type mirrors a Java record in com.backend.documind.dto, so if a record
 * changes on the backend, change the matching type here.
 *
 * Dates arrive as ISO strings (e.g. "2026-10-31T10:15:00Z") and ids as UUID strings.
 */

/** Base path of every API call. The dev server proxies it to Spring Boot (proxy.conf.json). */
export const API = '/api/v1';

// ---------------------------------------------------------------- errors

/** Every backend error (RFC 9457 problem details), from GlobalExceptionHandler. */
export interface ProblemDetail {
  status: number;
  title: string;
  detail?: string;
  /** Validation errors: field name -> message. */
  errors?: Record<string, string>;
}

// ---------------------------------------------------------------- accounts

export type Role = 'USER' | 'ADMIN';

export interface UserResponse {
  id: string;
  /** Null for accounts created before names were added. */
  fullName: string | null;
  email: string;
  role: Role;
  dailyLimit: number;
  questionsRemainingToday: number;
  /** When today's questions refill: the next midnight in the backend's daily-limit time zone. */
  questionsResetAt: string;
  createdAt: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  /** "Keep me signed in for 7 days"; false means until the browser closes. */
  rememberMe: boolean;
}

// ---------------------------------------------------------------- documents

export type DocumentStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface DocumentResponse {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** PDFs only; null for DOCX and TXT, and until processing finishes. */
  pageCount: number | null;
  status: DocumentStatus;
  failureReason: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------- chat

export interface ConversationResponse {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationRequest {
  title?: string;
}

export interface RenameConversationRequest {
  title: string;
}

export type MessageRole = 'USER' | 'ASSISTANT';
export type FeedbackRating = 'UP' | 'DOWN';

export interface CitationResponse {
  /** Matches the [n] in the answer text. */
  number: number;
  documentId: string;
  fileName: string;
  /** PDF page to open at; null for DOCX and TXT. */
  page: number | null;
  /** The passage the answer used (older answers: its first 300 characters). */
  snippet: string;
  /** 0 to 1; shown as "89% match". */
  similarity: number;
}

export interface MessageResponse {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  citations: CitationResponse[];
  feedback: FeedbackRating | null;
  /** True for the honest "I couldn't find that in your documents" reply. */
  notFound: boolean;
}

export interface AskRequest {
  question: string;
  /** Optional: only search these documents (FR-11). */
  documentIds?: string[];
}

export interface FeedbackRequest {
  rating: FeedbackRating;
  comment?: string;
}

/** Server-Sent Events from POST /conversations/{id}/ask (ChatEvents.java), in this order. */
export interface SearchedEvent {
  /** Relevant passages found; 0 means the answer will be "not found". */
  passages: number;
  /** How many different documents those passages come from. */
  documents: number;
}

export interface TokenEvent {
  text: string;
}

export interface CitationsEvent {
  messageId: string;
  notFound: boolean;
  citations: CitationResponse[];
}

export interface StreamErrorEvent {
  message: string;
}

// ---------------------------------------------------------------- admin

export interface AdminUsageResponse {
  days: number;
  timeZone: string;
  from: string;
  totals: {
    questions: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    avgCostPerQuestionUsd: number | null;
    medianFirstTokenMs: number | null;
    activeUsers: number;
  };
  byDay: {
    day: string;
    userId: string;
    email: string;
    questions: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    avgFirstTokenMs: number | null;
  }[];
  overview: {
    totalUsers: number;
    newUsers: number;
    documentsReady: number;
    documentsProcessing: number;
    documentsFailed: number;
    thumbsUp: number;
    thumbsDown: number;
    satisfactionPercent: number | null;
  };
}

/** GET /admin/users (AdminUserResponse.java). */
export interface AdminUserResponse {
  id: string;
  fullName: string | null;
  email: string;
  role: Role;
  dailyLimit: number;
  /** Questions the AI answered for them today; what counts towards the limit. */
  questionsToday: number;
  documents: number;
  createdAt: string;
}

export interface UpdateDailyLimitRequest {
  /** 0 to 1000; 0 pauses asking for that user. */
  dailyLimit: number;
}

export type EvalCaseStatus = 'PASSED' | 'FAILED' | 'SKIPPED';
export type EvalRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface EvalCaseResult {
  id: string;
  question: string;
  status: EvalCaseStatus;
  reason: string | null;
  answer: string | null;
  expectNotFound: boolean;
  answeredNotFound: boolean;
  keywordCoverage: number | null;
  missingKeywords: string[];
  citedPages: number[];
  expectedPages: number[];
  citationCorrect: boolean | null;
  latencyMs: number | null;
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  passRatePercent: number | null;
  answerCorrectnessPercent: number | null;
  citationAccuracyPercent: number | null;
  notFoundAccuracyPercent: number | null;
  medianLatencyMs: number | null;
}

export interface EvalRunResponse {
  id: string;
  status: EvalRunStatus;
  startedAt: string;
  finishedAt: string | null;
  totalCases: number;
  completedCases: number;
  summary: EvalSummary | null;
  error: string | null;
  results: EvalCaseResult[];
}
