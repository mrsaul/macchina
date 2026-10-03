import { INTENT_LINE_PREFIX, NO_INTENT } from "./prompt";

// The model starts each answer with "INTENTIONS: a, b" then a blank line.
// This splits that header off a text stream: it buffers until the first line
// is complete, then emits intent ids once and passes the rest through.
// If the model skips the header, everything is treated as answer text.

const MAX_HEADER_CHARS = 300;

export type IntentLineResult = { intents: string[] | null; text: string };

export function createIntentLineParser(knownIntentIds: string[]) {
  const known = new Set(knownIntentIds);
  let buffer = "";
  let headerDone = false;
  let trimLeading = false;

  function parseHeader(line: string): string[] | null {
    const match = line.trim().match(new RegExp(`^${INTENT_LINE_PREFIX}\\s*(.*)$`, "i"));
    if (!match) return null;
    return match[1]
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => id && id !== NO_INTENT && known.has(id));
  }

  function stripLeadingNewlines(text: string) {
    if (!trimLeading) return text;
    const stripped = text.replace(/^\s+/, "");
    if (stripped) trimLeading = false;
    return stripped;
  }

  return {
    /** Feed a text delta; returns intents (once, when the header resolves) and answer text. */
    push(delta: string): IntentLineResult {
      if (headerDone) return { intents: null, text: stripLeadingNewlines(delta) };

      buffer += delta;
      const newline = buffer.indexOf("\n");
      if (newline === -1 && buffer.length < MAX_HEADER_CHARS) return { intents: null, text: "" };

      headerDone = true;
      const firstLine = newline === -1 ? buffer : buffer.slice(0, newline);
      const intents = parseHeader(firstLine);
      if (intents === null) {
        // No header: the buffered text is the answer itself.
        const text = buffer;
        buffer = "";
        return { intents: [], text };
      }
      trimLeading = true;
      const rest = buffer.slice(newline + 1);
      buffer = "";
      return { intents, text: stripLeadingNewlines(rest) };
    },
    /** End of stream: flush a header-less short answer still in the buffer. */
    flush(): IntentLineResult {
      if (headerDone) return { intents: null, text: "" };
      headerDone = true;
      const intents = parseHeader(buffer);
      const text = intents === null ? buffer : "";
      buffer = "";
      return { intents: intents ?? [], text };
    },
  };
}
