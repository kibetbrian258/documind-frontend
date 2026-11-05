import { HttpClient, HttpEventType } from '@angular/common/http';
import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API, DocumentResponse } from '../api/api.models';
import { AuthService } from '../auth/auth.service';
import { problemMessage } from '../http/problem';
import { FileKind, fileKindFromName } from './document-format';

/** Same limits as the backend (FR-3); checked here first for instant feedback. */
export const MAX_DOCUMENTS = 50;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** A file on its way up, shown at the top of the table with a progress bar. */
export interface UploadItem {
  key: string;
  fileName: string;
  sizeBytes: number;
  kind: FileKind;
  /** 0 to 100 */
  progress: number;
}

/** A red "wasn't added" banner above the table. */
export interface UploadNotice {
  key: string;
  fileName: string;
  message: string;
}

/**
 * The signed-in user's documents, shared by the Library page, the sidebar
 * count and (in step 4) the chat's document picker.
 *
 * - Loads the list when someone signs in, and forgets it when they sign out.
 * - Listens to GET /documents/events, so Processing -> Ready/Failed shows up
 *   without refreshing (US-3).
 * - Uploads files with a live progress percentage.
 */
@Service()
export class DocumentsStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly list = signal<DocumentResponse[]>([]);
  private readonly inFlight = signal<UploadItem[]>([]);
  private readonly loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  private readonly noticeList = signal<UploadNotice[]>([]);

  /** Newest first, as the backend sends them. */
  readonly documents = this.list.asReadonly();
  readonly uploads = this.inFlight.asReadonly();
  readonly status = this.loadState.asReadonly();
  readonly notices = this.noticeList.asReadonly();

  readonly count = computed(() => this.list().length);
  readonly readyDocuments = computed(() => this.list().filter((d) => d.status === 'READY'));
  private readonly slotsLeft = computed(
    () => MAX_DOCUMENTS - this.list().length - this.inFlight().length,
  );

  private events: EventSource | null = null;
  private nextKey = 0;

  constructor() {
    // Start when someone signs in; clear everything when they sign out.
    effect(() => {
      const signedIn = this.auth.isSignedIn();
      untracked(() => (signedIn ? this.start() : this.stop()));
    });
  }

  async load(): Promise<void> {
    if (this.list().length === 0) {
      this.loadState.set('loading');
    }
    try {
      this.list.set(await firstValueFrom(this.http.get<DocumentResponse[]>(`${API}/documents`)));
      this.loadState.set('loaded');
    } catch {
      if (this.list().length === 0) {
        this.loadState.set('error');
      }
    }
  }

  /** Checks each file, then uploads the ones DocuMind can read. */
  upload(files: Iterable<File>): void {
    for (const file of files) {
      const problem = this.problemWith(file);
      if (problem) {
        this.addNotice(file.name, problem);
      } else {
        this.startUpload(file);
      }
    }
  }

  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${API}/documents/${id}`));
    this.list.update((docs) => docs.filter((d) => d.id !== id));
  }

  async retry(id: string): Promise<void> {
    this.upsert(
      await firstValueFrom(this.http.post<DocumentResponse>(`${API}/documents/${id}/retry`, {})),
    );
  }

  addNotice(fileName: string, message: string): void {
    const key = `notice-${++this.nextKey}`;
    this.noticeList.update((notices) => [...notices, { key, fileName, message }]);
  }

  dismissNotice(key: string): void {
    this.noticeList.update((notices) => notices.filter((n) => n.key !== key));
  }

  // ------------------------------------------------------------ internals

  private start(): void {
    void this.load();
    this.listenForStatusChanges();
  }

  private stop(): void {
    this.events?.close();
    this.events = null;
    this.list.set([]);
    this.inFlight.set([]);
    this.noticeList.set([]);
    this.loadState.set('idle');
  }

  /**
   * Server-Sent Events: the browser keeps this connection open (and reopens it
   * by itself if it drops). After a reconnect the list is reloaded, in case an
   * update was missed while disconnected.
   */
  private listenForStatusChanges(): void {
    this.events?.close();
    const source = new EventSource(`${API}/documents/events`);
    let connectedBefore = false;
    source.addEventListener('open', () => {
      if (connectedBefore) {
        void this.load();
      }
      connectedBefore = true;
    });
    source.addEventListener('document-status', (event) => {
      this.upsert(JSON.parse((event as MessageEvent<string>).data) as DocumentResponse);
    });
    this.events = source;
  }

  private problemWith(file: File): string | null {
    if (!fileKindFromName(file.name)) {
      return "wasn't added. DocuMind reads PDF, DOCX and TXT files — try exporting it as a PDF.";
    }
    if (file.size === 0) {
      return "wasn't added because the file is empty.";
    }
    if (file.size > MAX_FILE_BYTES) {
      return "wasn't added because it's larger than 20 MB.";
    }
    if (this.slotsLeft() <= 0) {
      return `wasn't added: you've reached the limit of ${MAX_DOCUMENTS} documents. Delete one to make room.`;
    }
    return null;
  }

  private startUpload(file: File): void {
    const key = `upload-${++this.nextKey}`;
    const kind = fileKindFromName(file.name) as FileKind;
    this.inFlight.update((items) => [
      { key, fileName: file.name, sizeBytes: file.size, kind, progress: 0 },
      ...items,
    ]);

    const body = new FormData();
    body.append('file', file);

    this.http
      .post<DocumentResponse>(`${API}/documents`, body, { reportProgress: true, observe: 'events' })
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total ? Math.round((100 * event.loaded) / event.total) : 0;
            this.inFlight.update((items) =>
              items.map((i) => (i.key === key ? { ...i, progress: percent } : i)),
            );
          } else if (event.type === HttpEventType.Response && event.body) {
            this.finishUpload(key);
            this.addIfMissing(event.body);
          }
        },
        error: (error: unknown) => {
          this.finishUpload(key);
          this.addNotice(file.name, `wasn't added. ${problemMessage(error)}`);
        },
      });
  }

  private finishUpload(key: string): void {
    this.inFlight.update((items) => items.filter((i) => i.key !== key));
  }

  /** Replaces the document if we have it (newer status), otherwise adds it at the top. */
  private upsert(document: DocumentResponse): void {
    this.list.update((docs) =>
      docs.some((d) => d.id === document.id)
        ? docs.map((d) => (d.id === document.id ? document : d))
        : [document, ...docs],
    );
  }

  /**
   * After an upload: a small TXT file can finish processing before the upload's
   * own response arrives, so a READY version from the live updates wins.
   */
  private addIfMissing(document: DocumentResponse): void {
    this.list.update((docs) =>
      docs.some((d) => d.id === document.id) ? docs : [document, ...docs],
    );
  }
}
