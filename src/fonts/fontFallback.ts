import type { Content } from "pdfmake";
import type { TDocumentDefinitions } from "../pdfmakeTypes.ts";

/**
 * ある named style（例: "code"）で表示するテキストのうち、そのフォントにグリフが無い
 * 文字だけを別フォントに差し替える（例: 等幅の code フォントに和文グリフが無いケースへの対応）。
 *
 * なぜここで「ASCII かどうか」のような文字種の推測をしないか:
 * 実際にどの文字が表示できるかはフォントファイル自体（cmap）にしかない情報であり、
 * 文字種の推測はフォントの組み合わせを変えた瞬間に成立しなくなる（例えば等幅フォントを
 * 差し替えたら ASCII 判定の前提が崩れる）。compiler.ts / styler.ts はフォントファイルに
 * 一切触れない設計にしているため（index.ts のコメント参照）、実際のグリフ有無に基づく
 * フォールバックは、フォントファイルにアクセスできる呼び出し側がこの関数を通して
 * render 直前に適用する。`supports` は呼び出し側が fontkit 等で実フォントの
 * `hasGlyphForCodePoint()` を使って組み立てる（このモジュール自体はフォントを読まない）。
 *
 * `font` ではなく `style` で対象を探す理由: compiler.ts の compileRun() は `code` 要素を
 * `{ text, style: "code" }` として出力し、実際のフォント名は pdfmake の named style
 * （styles.code.font。呼び出し側が theme 経由で決める）経由でしか登録されない。
 * ノード自身に直接 `font` プロパティを持たせているわけではないため、`node.font === X`
 * で探すと実際の出力には一致しない（fontFallback.test.ts 参照）。
 *
 * @param dd markdownToDocDefinition() の出力（あるいは同じ形の TDocumentDefinitions）
 * @param opts.style 対象にする pdfmake の named style 名（例: "code"）。
 * @param opts.fallbackFont supports() が false を返した文字に当てるフォント名。
 * @param opts.supports 1文字（コードポイント）がフォントに存在するかを返す関数。
 * @returns 新しい TDocumentDefinitions（入力は変更しない）
 */
export interface FontFallbackOptions {
  style: string;
  fallbackFont: string;
  supports: (codePoint: number) => boolean;
}

export function withFontFallback(dd: TDocumentDefinitions, opts: FontFallbackOptions): TDocumentDefinitions {
  return { ...dd, content: mapContentList(dd.content as Content[] | Content, opts) as Content[] };
}

function mapContentList(content: Content[] | Content, opts: FontFallbackOptions): Content[] | Content {
  if (Array.isArray(content)) return content.map((c) => mapContent(c, opts));
  return mapContent(content, opts);
}

/**
 * テキストをフォント別の連続区間に分割する（フォントが同じ隣接文字はまとめて1つの run にする）。
 *
 * 各区間には `style: opts.style` を明示的に付ける（supports() を満たす区間も含めて）。
 * 「区間を素の文字列のままにして、親の style から継承させる」設計は使えない: pdfmake の
 * `flattenTextArray()`（TextInlines.js）には「ラッパーの `text` が配列だと、ラッパー自身の
 * style は捨てられ、子要素それぞれが持つプロパティしか残らない」という未修整の既知の制限が
 * あり（pdfmake 自身のソースに `// TODO: Styling in nested text` というコメントがある）、
 * 背景色・フォントの両方が効かなくなる。そのため、分割後の配列を持つ側（呼び出し元で
 * `{ text: 配列, style: opts.style }` になるノード）の style は分割後には当てにできず、
 * 各区間が自分自身で style を持つ必要がある。
 */
function splitByFontSupport(text: string, opts: FontFallbackOptions): Content[] {
  const segments: { supported: boolean; chars: string[] }[] = [];
  for (const ch of text) {
    const supported = opts.supports(ch.codePointAt(0) as number);
    const last = segments[segments.length - 1];
    if (last && last.supported === supported) last.chars.push(ch);
    else segments.push({ supported, chars: [ch] });
  }
  return segments.map((s) => {
    const joined = s.chars.join("");
    return s.supported ? { text: joined, style: opts.style } : { text: joined, style: opts.style, font: opts.fallbackFont };
  });
}

/** 単一の Content ノードを再帰的に走査し、対象 style の text ノードだけ分割する */
function mapContent(node: Content, opts: FontFallbackOptions): Content {
  if (typeof node === "string" || node === null || node === undefined) return node;
  if (Array.isArray(node)) return node.map((c) => mapContent(c, opts));

  const obj = node as unknown as Record<string, unknown>;

  // このノード自身が対象 style の単一文字列 text を持つ場合は分割する。
  // ネストした text 配列（run の中に run がある形）は今のところ発生させていない
  // （compiler.ts の compileRun()/collapse() が単一文字列に畳み込む設計のため）。
  if (obj.style === opts.style && typeof obj.text === "string") {
    const parts = splitByFontSupport(obj.text, opts);
    // 1区間だけ、かつ font 上書きが無ければ全文字が対象フォントに存在する場合なので、
    // node をそのまま返す（余計な入れ子を作らない）。
    if (parts.length === 1 && !("font" in (parts[0] as object))) return node;
    return { ...obj, text: parts } as Content;
  }

  // 子を持つコンテナ（p/h*/li の text 配列、stack、table セル等）は再帰的に処理する
  const next: Record<string, unknown> = { ...obj };
  if (Array.isArray(obj.text)) next.text = obj.text.map((c: Content) => mapContent(c, opts));
  if (Array.isArray(obj.stack)) next.stack = obj.stack.map((c: Content) => mapContent(c, opts));
  if (Array.isArray(obj.ul)) next.ul = obj.ul.map((c: Content) => mapContent(c, opts));
  if (Array.isArray(obj.ol)) next.ol = obj.ol.map((c: Content) => mapContent(c, opts));
  if (obj.table && typeof obj.table === "object") {
    const table = obj.table as Record<string, unknown>;
    if (Array.isArray(table.body)) {
      next.table = {
        ...table,
        body: (table.body as Content[][]).map((row) => row.map((cell) => mapContent(cell, opts))),
      };
    }
  }
  return next as unknown as Content;
}
