import type { PageSize } from "./pdfmakeTypes.ts";
// pdfmake/js/standardPageSizes.js は `exports.default = {...}` という CJS の書き方をしている。
// render.ts と同じ理由（実行環境によって default 解決結果が変わる）で unwrap する。
import standardPageSizesPkg from "pdfmake/js/standardPageSizes.js";

type PageWidthHeightPt = Record<string, [width: number, height: number]>;

export const STANDARD_PAGE_SIZES: PageWidthHeightPt =
  (standardPageSizesPkg as { default?: PageWidthHeightPt }).default ?? (standardPageSizesPkg as PageWidthHeightPt);

/** PageSize（定義済みサイズ名、または {width, height} の CustomPageSize）の幅を pt で返す。 */
export function pageWidthPt(size: PageSize): number {
  if (typeof size === "string") {
    const wh = STANDARD_PAGE_SIZES[size];
    if (!wh) throw new Error(`未対応のページサイズです: ${size}`);
    return wh[0];
  }
  return size.width;
}
