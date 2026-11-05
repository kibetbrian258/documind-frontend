/**
 * Turns an answer's text into blocks the template can show safely.
 *
 * The AI writes light Markdown: paragraphs, "1." and "-" lists, **bold** and
 * citation markers like [1] or [1, 3]. Instead of inserting HTML (which could
 * let a document smuggle in a script), the text is split into plain pieces and
 * the template turns each into an element. Unclosed **bold** while the answer
 * is still streaming simply shows as bold up to the end.
 */

export type Inline =
  { type: 'text'; text: string; bold: boolean } | { type: 'cite'; number: number };

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'heading'; content: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] };

const LIST_ITEM = /^\s*(?:([-*•])|(\d{1,3})[.)])\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const CITATIONS = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;

export function parseAnswer(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const endParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      endParagraph();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      blocks.push({ type: 'heading', content: parseInline(heading[1]) });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      endParagraph();
      const ordered = item[2] !== undefined;
      const last = blocks.at(-1);
      if (last?.type === 'list' && last.ordered === ordered) {
        last.items.push(parseInline(item[3]));
      } else {
        blocks.push({
          type: 'list',
          ordered,
          start: ordered ? Number(item[2]) : 1,
          items: [parseInline(item[3])],
        });
      }
      continue;
    }

    // A wrapped line straight after a list item belongs to that item.
    const last = blocks.at(-1);
    if (paragraph.length === 0 && last?.type === 'list' && /^\s{2,}/.test(line)) {
      last.items[last.items.length - 1].push(...parseInline(' ' + line.trim()));
      continue;
    }

    paragraph.push(line.trim());
  }
  endParagraph();
  return blocks;
}

/** **bold** and [n] citation markers inside one line or paragraph. */
export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  // Every other piece between "**" is bold.
  text.split('**').forEach((piece, index) => {
    const bold = index % 2 === 1;
    let position = 0;
    for (const match of piece.matchAll(CITATIONS)) {
      pushText(result, piece.slice(position, match.index), bold);
      for (const number of match[1].split(',')) {
        result.push({ type: 'cite', number: Number(number.trim()) });
      }
      position = match.index + match[0].length;
    }
    pushText(result, piece.slice(position), bold);
  });
  return result;
}

function pushText(result: Inline[], text: string, bold: boolean): void {
  if (text) {
    result.push({ type: 'text', text, bold });
  }
}

/** The answer as plain text for "Copy": no ** and no [n] markers. */
export function plainAnswer(text: string): string {
  return text
    .replace(CITATIONS, '')
    .replaceAll('**', '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
