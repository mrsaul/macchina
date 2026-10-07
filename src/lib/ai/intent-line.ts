import { INTENT_LINE_PREFIX, NO_INTENT, SOURCES_LINE_PREFIX } from "./prompt";

// The model frames each answer with two machine-readable lines:
//   INTENTIONS: a, b      ← first line
//   …answer…
//   SOURCES: e1, e4       ← last line
// This parser strips both from a text stream while letting the answer itself
// stream through. A line is only held back while it could still become the
// SOURCES line; newlines are emitted lazily so no trailing blank lines leak.

const MAX_HEADER_CHARS = 300;

export type ParseResult = { intents: string[] | null; text: string };

function parseIdList(raw: string, allowed: Set<string> | null) {
  return raw
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id && id !== NO_INTENT && (!allowed || allowed.has(id)));
}

const TRAILER = new RegExp(`^${SOURCES_LINE_PREFIX.replace(":", "")}\\s*:\\s*(.*)$`, "i");
const TRAILER_WORD = SOURCES_LINE_PREFIX.replace(":", "").toUpperCase();

/** Could this partial line still turn into "SOURCES: …"? */
function mayBeTrailer(partial: string) {
  const t = partial.trimStart().toUpperCase();
  return TRAILER_WORD.startsWith(t) || /^SOURCES\s*(:.*)?$/.test(t);
}

export function createAnswerParser(knownIntentIds: string[]) {
  const knownIntents = new Set(knownIntentIds);
  let header = "";
  let headerDone = false;
  let hold = ""; // partial line that might be the SOURCES line
  let lineIsText = false; // current line already proved to be plain text
  let pendingNewlines = 0;
  let started = false; // skip blank lines between the header and the answer
  let sourceIds: string[] | null = null;

  function emit(text: string) {
    if (!text) return "";
    const out = (started ? "\n".repeat(pendingNewlines) : "") + text;
    pendingNewlines = 0;
    started = true;
    return out;
  }

  function body(chunk: string): string {
    let buf = hold + chunk;
    hold = "";
    let out = "";
    while (buf.length) {
      const nl = buf.indexOf("\n");
      const segment = nl === -1 ? buf : buf.slice(0, nl);
      const complete = nl !== -1;

      if (lineIsText) {
        out += emit(segment);
      } else if (complete) {
        const match = segment.trimStart().match(TRAILER);
        if (match) sourceIds = parseIdList(match[1], null);
        else out += emit(segment);
      } else if (mayBeTrailer(segment)) {
        hold = segment;
      } else {
        out += emit(segment);
        lineIsText = true;
      }

      if (complete) {
        if (started) pendingNewlines++;
        lineIsText = false;
        buf = buf.slice(nl + 1);
      } else {
        buf = "";
      }
    }
    return out;
  }

  function parseHeader(line: string): string[] | null {
    const match = line.trim().match(new RegExp(`^${INTENT_LINE_PREFIX}\\s*(.*)$`, "i"));
    return match ? parseIdList(match[1], knownIntents) : null;
  }

  return {
    /** Feed a text delta; returns intents (once, when the header resolves) and answer text. */
    push(delta: string): ParseResult {
      if (headerDone) return { intents: null, text: body(delta) };

      header += delta;
      const newline = header.indexOf("\n");
      if (newline === -1 && header.length < MAX_HEADER_CHARS) return { intents: null, text: "" };

      headerDone = true;
      const firstLine = newline === -1 ? header : header.slice(0, newline);
      const intents = parseHeader(firstLine);
      // No header: everything buffered so far is answer text.
      const rest = intents === null ? header : header.slice(newline + 1);
      header = "";
      return { intents: intents ?? [], text: body(rest) };
    },

    /** End of stream: resolves a held line and a header-less short answer. */
    flush(): ParseResult {
      let intents: string[] | null = null;
      let text = "";
      if (!headerDone) {
        headerDone = true;
        intents = parseHeader(header);
        if (intents === null) text += body(header);
        intents ??= [];
      }
      if (hold) {
        const match = hold.trimStart().match(TRAILER);
        if (match) sourceIds = parseIdList(match[1], null);
        else text += emit(hold);
        hold = "";
      }
      return { intents, text };
    },

    /** Entry ids the model declared in its SOURCES line (null if it gave none). */
    sourceIds: () => sourceIds,
  };
}
