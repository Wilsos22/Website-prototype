const LEADING_LIST_MARKER = /^(?:(?:[-*]|\u2022|\u25e6|\u25aa|\u25cf)\s+|\d{1,3}[.)]\s+)/;
const EMOJI_CHARACTERS = /(?:[\u{1F1E6}-\u{1F1FF}]{2}|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}])/gu;
const EMOJI_JOINERS = /[\u200d\ufe0e\ufe0f]/g;
const SENTENCE_END = /[.!?]/;

const SENTENCE_ABBREVIATIONS = [
  "dr.",
  "e.g.",
  "etc.",
  "i.e.",
  "mr.",
  "mrs.",
  "ms.",
  "vs.",
] as const;

function cleanNoteText(value: string): string {
  return value
    .replace(EMOJI_CHARACTERS, "")
    .replace(EMOJI_JOINERS, "")
    .replace(LEADING_LIST_MARKER, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceItems(value: string): string[] {
  const items: string[] = [];
  let sentenceStart = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (!SENTENCE_END.test(value[index])) continue;

    let punctuationEnd = index + 1;
    while (punctuationEnd < value.length && SENTENCE_END.test(value[punctuationEnd])) {
      punctuationEnd += 1;
    }

    let nextStart = punctuationEnd;
    while (nextStart < value.length && /\s/.test(value[nextStart])) nextStart += 1;
    if (nextStart === punctuationEnd || nextStart >= value.length) continue;

    const candidate = value.slice(sentenceStart, punctuationEnd).trim();
    const lowerCandidate = candidate.toLowerCase();
    if (SENTENCE_ABBREVIATIONS.some((abbreviation) => lowerCandidate.endsWith(abbreviation))) {
      index = punctuationEnd - 1;
      continue;
    }

    if (candidate) items.push(candidate);
    sentenceStart = nextStart;
    index = nextStart - 1;
  }

  const remainder = value.slice(sentenceStart).trim();
  if (remainder) items.push(remainder);
  return items;
}

export function speakerNoteItems(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];

  const items: string[] = [];
  for (const line of value.replace(/\r\n?/g, "\n").split(/\n+/)) {
    const cleanLine = cleanNoteText(line);
    if (!cleanLine) continue;
    items.push(...sentenceItems(cleanLine));
  }
  return items;
}
