/**
 * Message body tokenizer.
 *
 * Deliberately not a full markdown parser: chat bodies support a small, fixed
 * grammar, and hand-rolling it keeps the output fully controlled (no raw HTML
 * ever reaches the DOM) and the bundle small.
 *
 * Grammar: fenced code blocks, inline code, bold, italic, strikethrough,
 * links, @user mentions, #channel references and bare emoji.
 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "strike"; value: string }
  | { type: "link"; href: string; label: string }
  | { type: "mention"; username: string }
  | { type: "channel"; name: string };

export type BlockToken =
  | { type: "paragraph"; tokens: InlineToken[] }
  | { type: "codeblock"; language: string | null; value: string }
  | { type: "quote"; tokens: InlineToken[] }
  | { type: "bullet"; tokens: InlineToken[] };

const FENCE = /^```([a-z0-9+#-]*)\n([\s\S]*?)```$/gim;

/**
 * Ordered so the greediest delimiters win: inline code is matched before
 * emphasis so `**` inside a code span stays literal.
 */
const INLINE_PATTERN = new RegExp(
  [
    "`([^`\\n]+)`", // 1 code
    "\\*\\*([^*\\n]+)\\*\\*", // 2 bold
    "~~([^~\\n]+)~~", // 3 strike
    "\\*([^*\\n]+)\\*", // 4 italic
    "<(https?://[^|>\\s]+)\\|([^>]+)>", // 5,6 labelled link
    "(https?://[^\\s<>]+)", // 7 bare link
    "@([a-z0-9._-]+)", // 8 mention
    "#([a-z0-9-]+)", // 9 channel
  ].join("|"),
  "gi",
);

export function parseInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;

  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_PATTERN.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: input.slice(lastIndex, match.index) });
    }

    const [, code, bold, strike, italic, linkHref, linkLabel, bareLink, mention, channel] = match;

    if (code !== undefined) tokens.push({ type: "code", value: code });
    else if (bold !== undefined) tokens.push({ type: "bold", value: bold });
    else if (strike !== undefined) tokens.push({ type: "strike", value: strike });
    else if (italic !== undefined) tokens.push({ type: "italic", value: italic });
    else if (linkHref !== undefined) tokens.push({ type: "link", href: linkHref, label: linkLabel });
    else if (bareLink !== undefined) tokens.push({ type: "link", href: bareLink, label: bareLink });
    else if (mention !== undefined) tokens.push({ type: "mention", username: mention });
    else if (channel !== undefined) tokens.push({ type: "channel", name: channel });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    tokens.push({ type: "text", value: input.slice(lastIndex) });
  }

  return tokens;
}

export function parseMessage(body: string): BlockToken[] {
  const blocks: BlockToken[] = [];
  let cursor = 0;

  FENCE.lastIndex = 0;
  let fence: RegExpExecArray | null;

  const pushTextRegion = (region: string) => {
    for (const line of region.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("> ")) {
        blocks.push({ type: "quote", tokens: parseInline(trimmed.slice(2)) });
      } else if (/^[-•]\s+/.test(trimmed)) {
        blocks.push({ type: "bullet", tokens: parseInline(trimmed.replace(/^[-•]\s+/, "")) });
      } else {
        blocks.push({ type: "paragraph", tokens: parseInline(trimmed) });
      }
    }
  };

  while ((fence = FENCE.exec(body)) !== null) {
    pushTextRegion(body.slice(cursor, fence.index));
    blocks.push({
      type: "codeblock",
      language: fence[1] || null,
      value: fence[2].replace(/\n$/, ""),
    });
    cursor = fence.index + fence[0].length;
  }

  pushTextRegion(body.slice(cursor));
  return blocks;
}

/** Plain-text projection used for search snippets, previews and copy. */
export function toPlainText(body: string): string {
  return body
    .replace(/```[a-z0-9+#-]*\n([\s\S]*?)```/gi, "$1")
    .replace(/[`*~]/g, "")
    .replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, "$2")
    .trim();
}

/**
 * True when a body is nothing but emoji (up to three). Those render large and
 * without a bubble, the way every modern chat client does.
 */
export function isJumboEmoji(body: string): boolean {
  const stripped = body.trim();
  if (!stripped) return false;
  const emoji = [...stripped.matchAll(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu)];
  if (emoji.length === 0 || emoji.length > 3) return false;
  return stripped.replace(/\s/g, "").length === emoji.join("").replace(/\s/g, "").length;
}
