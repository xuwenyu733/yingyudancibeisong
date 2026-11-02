/** 从「英语听力」移植的默写判分（精简版） */

export function splitCoreSenses(definitionZh: string): string[] {
  return definitionZh
    .split(/[；;、，,/｜|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^[nvadjprepconjint]+[.\s]*/i, "").trim())
    .filter(Boolean);
}

function normalizeZh(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[的地得了着过]/g, "");
}

export function wordHead(word: string): string {
  return word.split("/")[0]?.trim() || word;
}

/** 英译汉：答对任意核心释义即通过 */
export function judgeEnToZh(userInput: string, definitionZh: string): boolean {
  const answer = normalizeZh(userInput);
  if (!answer) return false;
  const senses = splitCoreSenses(definitionZh).map(normalizeZh);
  if (senses.some((s) => s === answer || s.includes(answer) || answer.includes(s))) {
    return true;
  }
  const full = normalizeZh(definitionZh);
  return full.includes(answer) && answer.length >= 2;
}

/** 汉译英：拼写与目标词（或同义可接受词）一致 */
export function judgeZhToEn(
  userInput: string,
  word: string,
  alsoAccept: string[] = [],
): boolean {
  const input = userInput.trim().toLowerCase().replace(/\s+/g, "");
  if (!input) return false;
  const heads = [word, ...alsoAccept].map((w) => wordHead(w).toLowerCase());
  return heads.includes(input);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 例句挖空：把目标词换成 ______ */
export function blankExampleSentence(
  sentenceEn: string | undefined | null,
  word: string,
): string {
  const head = wordHead(word);
  if (!sentenceEn?.trim()) return `______（约 ${head.length} 个字母）`;

  const bold = sentenceEn.match(/\*\*([^*]+)\*\*/);
  const plain = sentenceEn.replace(/\*\*/g, "");
  const candidates = [bold?.[1]?.trim(), head].filter(Boolean) as string[];

  for (const c of candidates) {
    const re = new RegExp(`\\b${escapeRegExp(c)}\\b`, "i");
    if (re.test(plain)) {
      return plain.replace(re, "______");
    }
  }
  return `${plain.replace(/\s+$/, "")} → ______`;
}

function definitionsOverlap(a: string, b: string): boolean {
  if (normalizeZh(a) === normalizeZh(b)) return true;
  const sa = splitCoreSenses(a).map(normalizeZh).filter((s) => s.length >= 2);
  const sb = splitCoreSenses(b).map(normalizeZh).filter((s) => s.length >= 2);
  if (sa.length === 0 || sb.length === 0) return false;
  return sa.some((x) =>
    sb.some(
      (y) =>
        x === y ||
        (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))),
    ),
  );
}

/** 本轮中与当前词释义相近的其他英文词（作汉译英可接受答案） */
export function sameMeaningPeers(
  current: { id: string; spelling: string; meaning: string },
  pool: Array<{ id: string; spelling: string; meaning: string }>,
): string[] {
  const head = wordHead(current.spelling).toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of pool) {
    if (w.id === current.id) continue;
    const h = wordHead(w.spelling);
    const key = h.toLowerCase();
    if (key === head || seen.has(key)) continue;
    if (!definitionsOverlap(current.meaning, w.meaning)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}
