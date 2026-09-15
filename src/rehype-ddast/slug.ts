/**
 * 見出しテキストから見出し ID（アンカー）を生成する。
 *
 * marked の Slugger（v4系）と同じ規則で見出しテキストから ID を生成する（新規に
 * `marked` を依存に追加しないため、ロジックをそのまま再実装している）。
 * 挙動は slug.test.ts で検証している。
 */

const UNICODE_PUNCTUATION_RANGES = "\u2000-\u206F\u2E00-\u2E7F";
const ASCII_PUNCTUATION = "\\'!\"#$%&()*+,./:;<=>?@[\\]^`{|}~";
const REMOVE_CHARS = new RegExp(`[${UNICODE_PUNCTUATION_RANGES}${ASCII_PUNCTUATION}]`, "g");

function serialize(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/<[!/a-z].*?>/gi, "")
    .replace(REMOVE_CHARS, "")
    .replace(/\s/g, "-");
}

/**
 * 1つの Markdown 文書内で見出し ID の重複を避けるための状態（marked の Slugger インスタンス相当）。
 * 同一テキストの見出しが複数回現れた場合、2回目以降は `-1`, `-2`, ... を付与する。
 */
export function createSlugger(): (text: string) => string {
  const seen: Record<string, number> = {};

  function getNextSafeSlug(originalSlug: string): string {
    let slug = originalSlug;
    let occurrence = 0;
    if (Object.prototype.hasOwnProperty.call(seen, slug)) {
      occurrence = seen[originalSlug];
      do {
        occurrence++;
        slug = `${originalSlug}-${occurrence}`;
      } while (Object.prototype.hasOwnProperty.call(seen, slug));
    }
    seen[originalSlug] = occurrence;
    seen[slug] = 0;
    return slug;
  }

  return (text: string) => getNextSafeSlug(serialize(text));
}
