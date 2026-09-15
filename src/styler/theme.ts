import type { Size, Style } from "pdfmake";
import type { PageSize } from "../pdfmakeTypes.ts";
import { pageWidthPt } from "./pageSizes.ts";

/**
 * styler.ts が ddast（構造）に theme を適用して見た目を確定させる際に使う設定一式。
 * 色・幅・余白・フォント・ページサイズなど、レイアウトに関する決定はすべてここに
 * 集約し、styler.ts 本体には埋め込まない。呼び出し側は `mergeTheme(DEFAULT_THEME, {...})` で
 * 部分的に上書きできる（`opts.styles` で named style を個別に差し替えられるのと同じ考え方）。
 *
 * フォント名（`code.font` 等）は styler.ts 自身が発明せず、呼び出し側が渡す値をそのまま
 * 受け取る（CLAUDE.md の「関心事の分離」参照）。`DEFAULT_THEME` では `code.font` を未指定に
 * しており、その場合 pdfmake は自身のフォールバック（`"Roboto"`）を使う。等幅フォントを
 * 使いたい場合は `mergeTheme(DEFAULT_THEME, { code: { font: "<呼び出し側が決めた名前>" } })` で
 * 上書きし、その名前で実ファイルを登録した `TFontDictionary` を render 側に渡す
 * （fonts.ts の `loadFonts()` 参照）。
 */

export interface BarTheme {
  color: string;
  /** バーの太さ（pt） */
  width: number;
}

export interface HeadingLevelTheme {
  fontSize: number;
  bold: boolean;
  italics?: boolean;
  color?: string;
}

export interface HeadingDecoration {
  /** その見出しレベルの下に引く水平線（CSS の border-bottom 相当）。無ければ省略 */
  rule?: BarTheme & { marginTop: number };
  /**
   * その見出しレベルの左に引く縦バー（CSS の border-left 相当）。無ければ省略。
   * gap はバーと見出しテキストの間の余白（CSS の padding-left 相当）で、
   * バーの太さ（width）とは独立に指定する。
   */
  bar?: BarTheme & { gap: number };
}

export interface PdfmakeTheme {
  /** pdfmake の TDocumentDefinitions.pageSize / pageMargins にそのまま渡す値。
   * hr・見出しの下線などに使う水平線の長さ（本文の使用可能幅）は、ここから
   * contentWidthOf() が導出するため、別途値を持たせない（二重管理を避ける）。 */
  page: {
    size: PageSize;
    /** [left, top, right, bottom]（pt） */
    margins: [number, number, number, number];
  };

  body: {
    /** 本文全体の行間（CSS の `line-height` 相当）。
     * pdfmake の既定値は 1（行間無し）で、CSS の一般的な値よりかなり詰まって見えるため必須で指定する */
    lineHeight: number;
  };

  heading: {
    levels: Record<1 | 2 | 3 | 4 | 5 | 6, HeadingLevelTheme>;
    /** 見出しレベルごとの装飾（下線・左バー）。既定値は h1 に下線、h2 に左バーを付ける */
    decorations: Partial<Record<number, HeadingDecoration>>;
    /** 見出しの前後マージン（全レベル共通） */
    margin: [number, number, number, number];
    /**
     * この見出し（レベルと、そのレベル内での何番目の出現か）の直前で改ページするかどうか。
     * 既定値は h2 の直前で改ページする。ただし文書内で最初に現れる h2 だけは改ページしない
     * （CSS の `h2:first-of-type { page-break-before: auto }` と同じ考え方）。
     */
    pageBreakBefore: (level: number, occurrenceOfLevel: number) => boolean;
  };

  blockquote: {
    /** 左バー（CSS の border-left 相当）。無ければ null */
    bar: BarTheme | null;
    /** 背景色（CSS の background 相当）。無ければ null */
    background: string | null;
    /** 内側の余白（CSS の padding 相当） */
    padding: [number, number, number, number];
    /** ブロック全体の前後マージン（CSS の margin 相当） */
    margin: [number, number, number, number];
  };

  list: {
    /** ul/ol 全体の余白。pdfmake は既定でほぼ余白が無く、左インデントも詰まっているため補う */
    margin: [number, number, number, number];
  };

  code: {
    /** インライン code に使うフォント名。未指定なら pdfmake 自身のフォールバック
     * （`"Roboto"`）が使われる。等幅フォントにしたい場合、呼び出し側がこの名前で
     * `TFontDictionary`（`renderToBuffer()` に渡すもの）に実ファイルを登録すること
     * （fonts.ts の `loadFonts()` 参照） */
    font?: string;
    background: string;
    fontSize: number;
    /**
     * 前後に挿入する無破断スペース（U+00A0）の数。pdfmake のインライン要素には
     * padding が無いため、文字とハイライト背景の間に余白を作る疑似的な手段として使う。
     */
    paddingChars: number;
  };

  codeBlock: {
    background: string;
    fontSize: number;
    margin: [number, number, number, number];
  };

  image: {
    margin: [number, number, number, number];
  };

  rule: BarTheme;

  table: {
    header: { fill: string; color: string; bold: boolean };
    /** tbody の縞模様の色（偶数行）。無ければ null */
    zebraFill: string | null;
    /** セル境界線の色 */
    ruleColor: string;
    padding: { left: number; right: number; top: number; bottom: number };
    /** `<!-- width="..." -->` 指定が無い列に使う既定幅。テーブル全体で指定が1つも無い
     * 場合でも、指定していない以上はこの既定幅のままにする（呼び出し側が幅を指定して
     * いないのに最後の列だけ広げるような、頼まれていない調整はしない）。 */
    defaultColumnWidth: Size;
    margin: [number, number, number, number];
    /** CSS の `tr { page-break-inside: avoid }` 相当。true にすると、複数行にまたがる
     * セルを含む行でもページの途中では改ページされず、行ごと次ページへ送られる
     * （pdfmake の table.dontBreakRows にそのまま渡す）。 */
    dontBreakRows: boolean;
  };

  /** インライン要素の named style。呼び出し側の opts.styles でさらに個別上書きもできる */
  inline: {
    strong: Style;
    em: Style;
    del: Style;
    u: Style;
    small: Style;
    a: Style;
    /** 引用ブロック内のテキスト色（バー・背景は blockquote 側で描く） */
    blockquoteText: Style;
    th: Style;
    td: Style;
  };
}

export const DEFAULT_THEME: PdfmakeTheme = {
  // A4 の一般的な印刷余白（上 25mm・下/左/右 20mm 相当）を pt に換算した値。
  // 本文の使用可能幅（hr・見出し下線の長さに使う）は contentWidthOf() が
  // ここから導出するため、別途値を持たない。
  page: { size: "A4", margins: [56, 70, 56, 56] },

  // 本文の行間。
  body: { lineHeight: 1.3 },

  heading: {
    // 見出しレベルごとの色・サイズ
    levels: {
      1: { fontSize: 18, bold: true, color: "#1a3a5c" },
      2: { fontSize: 13, bold: true, color: "#1a3a5c" },
      3: { fontSize: 13, bold: true, color: "#2c5282" },
      4: { fontSize: 11, bold: true, color: "#2c5282" },
      5: { fontSize: 10, bold: true },
      6: { fontSize: 10, bold: true, italics: true },
    },
    // 見出し下線・バーの太さと色。
    decorations: {
      1: { rule: { color: "#1a3a5c", width: 1.5, marginTop: 4 } },
      2: { bar: { color: "#1a3a5c", width: 1, gap: 8 } },
    },
    margin: [0, 8, 0, 4],
    pageBreakBefore: (level, occurrence) => level === 2 && occurrence > 1,
  },

  blockquote: {
    // 引用の左バーの太さと色。
    bar: { color: "#b0bec5", width: 1 },
    background: "#f9fafb",
    padding: [10, 6, 6, 6],
    margin: [0, 4, 0, 8],
  },

  list: {
    margin: [16, 4, 0, 8],
  },

  code: {
    background: "#eeeeee",
    fontSize: 9,
    paddingChars: 1,
  },

  codeBlock: {
    background: "#f5f5f5",
    fontSize: 9,
    margin: [0, 2, 0, 2],
  },

  image: {
    margin: [0, 4, 0, 8],
  },

  rule: { color: "#cccccc", width: 0.5 },

  table: {
    header: { fill: "#1a3a5c", color: "#ffffff", bold: false },
    zebraFill: "#f8fafc",
    ruleColor: "#dde3ec",
    padding: { left: 8, right: 8, top: 4, bottom: 4 },
    defaultColumnWidth: "auto",
    margin: [0, 4, 0, 8],
    dontBreakRows: true,
  },

  inline: {
    strong: { bold: true },
    em: { italics: true },
    del: { decoration: "lineThrough" },
    u: { decoration: "underline" },
    // small 要素は本文より小さく・グレーで表示する（CSS の font-size: 60% 相当。本文 10pt 前提の 6pt）
    small: { fontSize: 6, color: "#6b7280" },
    // noWrap は必須。pdfmake は行送り計算のため CJK テキスト（スペース区切りが無い）を文字単位の
    // 「単語」に分割する（TextBreaker.js の splitWords 参照）。この分割単位はそのままリンクの
    // Annotation（クリック領域）の単位にもなるため、noWrap が無いと日本語のリンクが「1文字ごとに
    // 別々の Link annotation」に分かれる。
    a: { color: "blue", decoration: "underline", noWrap: true },
    blockquoteText: { color: "#444444" },
    // テーブルヘッダーの文字色・太さ（太字にしない）。
    th: { bold: false, fontSize: 9, color: "#ffffff" },
    td: { fontSize: 9 },
  },
};

type DeepPartial<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type ThemeOverrides = DeepPartial<PdfmakeTheme>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * base を overrides で再帰的にマージする。プレーンオブジェクトはキーごとに再帰し、
 * それ以外（配列・関数・プリミティブ）は overrides の値でまるごと置き換える
 * （例えば margin タプルの一部だけを差し替えることはできない。意図的な仕様: `[0,8,0,4]` の
 * ようなタプルを要素ごとにマージすると意味のない組み合わせが生まれうるため）。
 */
export function mergeTheme<T>(base: T, overrides?: DeepPartial<T>): T {
  if (overrides === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides as T;
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides)) {
    result[key] = mergeTheme((base as Record<string, unknown>)[key], (overrides as Record<string, unknown>)[key] as DeepPartial<unknown>);
  }
  return result as T;
}

/**
 * hr・見出しの下線などに使う「本文の使用可能幅」（pt）。theme.page（ページサイズ・左右余白）
 * から都度導出する。contentWidth を theme に独立したフィールドとして持たせると
 * page.margins を変えたときに手動で追従させる必要が生じる（値がずれると本文幅と
 * 合わなくなる）ため、単一の情報源（theme.page）から計算する関数として提供する。
 */
export function contentWidthOf(theme: PdfmakeTheme): number {
  const [left, , right] = theme.page.margins;
  return pageWidthPt(theme.page.size) - left - right;
}
