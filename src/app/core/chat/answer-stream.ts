import { HttpXsrfTokenExtractor } from '@angular/common/http';
import { inject, Service } from '@angular/core';

import {
  API,
  AskRequest,
  CitationsEvent,
  ProblemDetail,
  SearchedEvent,
  StreamErrorEvent,
  TokenEvent,
} from '../api/api.models';

/** What to do with each event while an answer streams in. */
export interface AnswerStreamHandlers {
  searched(event: SearchedEvent): void;
  token(event: TokenEvent): void;
  citations(event: CitationsEvent): void;
  error(event: StreamErrorEvent): void;
}

/**
 * The request was refused before any answer started, e.g. 429 (daily limit
 * reached) or 404 (conversation deleted). `status` 0 means the backend couldn't be reached.
 */
export class AskRefusedError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Sends a question and reads the answer as it is written.
 *
 * Why not HttpClient or EventSource? EventSource can only make GET requests,
 * and HttpClient hands over the response only once it is complete. fetch()
 * gives us the response body piece by piece, so words appear as the AI
 * writes them. Because fetch() skips Angular's interceptors, the CSRF header
 * is added here by hand.
 */
@Service()
export class AnswerStreamClient {
  private readonly xsrf = inject(HttpXsrfTokenExtractor);

  /**
   * Resolves when the answer is complete. Rejects with AskRefusedError if the
   * backend said no before streaming, or with an AbortError if `signal` was aborted (Stop).
   */
  async ask(
    conversationId: string,
    request: AskRequest,
    handlers: AnswerStreamHandlers,
    signal: AbortSignal,
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    const csrfToken = this.xsrf.getToken();
    if (csrfToken) {
      headers['X-XSRF-TOKEN'] = csrfToken;
    }

    let response: Response;
    try {
      response = await fetch(`${API}/conversations/${conversationId}/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        credentials: 'same-origin',
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      throw new AskRefusedError(
        0,
        "Can't reach DocuMind right now. Check your connection and try again.",
      );
    }

    if (!response.ok || !response.body) {
      throw new AskRefusedError(response.status, await problemDetail(response));
    }

    let finished = false;
    const dispatch = (name: string, data: string): void => {
      const payload: unknown = JSON.parse(data);
      switch (name) {
        case 'searched':
          handlers.searched(payload as SearchedEvent);
          break;
        case 'token':
          handlers.token(payload as TokenEvent);
          break;
        case 'citations':
          finished = true;
          handlers.citations(payload as CitationsEvent);
          break;
        case 'error':
          finished = true;
          handlers.error(payload as StreamErrorEvent);
          break;
      }
    };

    await readEvents(response.body, dispatch);

    if (!finished) {
      // The connection closed without a final event (server restarted, or the stream timed out).
      handlers.error({ message: 'The answer stopped before it was finished.' });
    }
  }
}

/**
 * Reads a text/event-stream body. Events are separated by a blank line; each
 * has an "event:" line and one or more "data:" lines.
 */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  dispatch: (name: string, data: string) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder(); // keeps a character split across two pieces intact
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      parseBlock(block, dispatch);
    }
  }
  if (buffer.trim()) {
    parseBlock(buffer, dispatch);
  }
}

function parseBlock(block: string, dispatch: (name: string, data: string) => void): void {
  let name = 'message';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      name = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (data.length > 0) {
    dispatch(name, data.join('\n'));
  }
}

async function problemDetail(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as Partial<ProblemDetail>;
    const firstFieldError = problem.errors ? Object.values(problem.errors)[0] : undefined;
    return firstFieldError ?? problem.detail ?? 'Something went wrong. Please try again.';
  } catch {
    return 'Something went wrong. Please try again.';
  }
}
