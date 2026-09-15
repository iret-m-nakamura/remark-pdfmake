import type { Plugin } from "unified";
import type * as dd from "ddast";
import { DEFAULT_THEME, contentWidthOf, type PdfmakeTheme } from "./theme.ts";

/**
 * ddast → ddast（見た目の確定）。ARCHITECTURE.md 参照。
 *
 * rehypeDdast.ts が残した role タグ（見出し・引用など、HTML の意味をそのまま写しただけの
 * 素の構造）を受け取り、theme を見て初めて決まる構造の組み立て（見出しに左バーを付けるか
 * 下線にするか、引用に左バーを付けるかどうか等）と、各ノードの Decoration
 * （style/fillColor/margin/pageBreak/noWrap。加えてセルは border/borderColor も、
 * pdfmake 自身のプロパティ名を使う）を両方ここで確定させる。compiler.ts はここで確定した
 * 値・構造を pdfmake の形（キー名・shape）
 * へ転写するだけの層になり、theme を一切参照しない。
 *
 * 見出しレベルごとの出現回数を数える必要があるため（h2 の pageBreak 判定）、文書全体を
 * 通した状態（occurrence）は rehypeDdast.ts が既に各見出しノードに埋めている
 * （ddast.ts の TextBlock.occurrence 参照）。ここではその値と theme を突き合わせるだけで、
 * 独自に数え直しはしない。
 */

/**
 * `code` run（`role: "code"`）には theme.code.paddingChars 個の半角スペースを前後に足す。
 * pdfmake のインライン要素には padding が無いため、ハイライト背景と文字の間に余白を作る
 * 疑似的な手段。子が単一の文字列に解決される場合は1つの文字列に結合し、複数要素の場合は
 * 前後にパディング用の文字列を別要素として足す（compiler.ts 側の collapse() は
 * どちらの形でも同じ見た目になる）。
 */
function styleCodeChildren(children: dd.Inline[], theme: PdfmakeTheme): dd.Inline[] {
  const pad = " ".repeat(Math.max(0, theme.code.paddingChars));
  const styled = children.map((c) => styleInline(c, theme));
  if (!pad) return styled;
  const padText: dd.Text = { type: "text", value: pad };
  if (styled.length === 1 && styled[0].type === "text") {
    return [{ type: "text", value: `${pad}${styled[0].value}${pad}` }];
  }
  return [padText, ...styled, padText];
}

function styleInline(inline: dd.Inline, theme: PdfmakeTheme): dd.Inline {
  if (inline.type === "text") return inline;
  if (inline.type === "break") return inline;
  if (inline.type === "run" && inline.role === "code") return { ...inline, children: styleCodeChildren(inline.children, theme) };
  return { ...inline, children: inline.children.map((c) => styleInline(c, theme)) };
}

/** h1〜h6 の named style 名。styles 辞書のキーと一致させる（theme.ts の styleDictionary 参照） */
function headingStyleName(depth: number): string {
  return `h${depth}`;
}

function styleHeadingCore(node: dd.TextBlock, theme: PdfmakeTheme, marginOverride?: [number, number, number, number]): dd.TextBlock {
  return {
    ...node,
    children: node.children.map((c) => styleInline(c, theme)),
    style: headingStyleName(node.depth!),
    margin: marginOverride ?? theme.heading.margin,
  };
}

function headingPageBreak(theme: PdfmakeTheme, depth: number, occurrence: number): "before" | undefined {
  return theme.heading.pageBreakBefore(depth, occurrence) ? "before" : undefined;
}

/** 「左に色付きの縦バーを添える」構成（CSS の border-left 相当）のバー側セル。
 * 本文を持たない、幅と塗り色だけのセル。本文側のセルは呼び出し側が組み立てる
 * （table を使う理由は ddast.ts のコメント参照）。 */
function sidebarBar(width: number, color: string): dd.TableCell {
  return { type: "tableCell", role: "sidebarBar", width, fillColor: color, children: [] };
}

/** sidebar table の本文側セル。バーと並べる1行2セルの行を作るために、本文ブロックを
 * TableCell で包むだけ（装飾はバー側と違って持たない）。 */
function sidebarBody(body: dd.Block): dd.TableCell {
  return { type: "tableCell", children: [body] };
}

/**
 * 見出し（role: "heading"）に theme.heading.decorations[depth] を適用する。
 * 「左バー付きの sidebar table にするか」「下線付きの headingWithRule stack にするか」
 * 「装飾無しの見出しのみにするか」という構造の決定は、theme を見て初めて可能になるため
 * ここで行う（rehypeDdast.ts はこれを知らない）。
 */
function styleHeading(node: dd.TextBlock, theme: PdfmakeTheme): dd.Block {
  const depth = node.depth!;
  const decoration = theme.heading.decorations[depth];
  const pageBreak = headingPageBreak(theme, depth, node.occurrence!);

  if (decoration?.bar) {
    const { bar } = decoration;
    const styledBody = styleHeadingCore(node, theme, [bar.gap, 0, 0, 0]);
    return {
      type: "table",
      role: "sidebar",
      headerRowCount: 0,
      widths: [bar.width, "*"],
      margin: theme.heading.margin,
      // unist-util-assert は明示的な `undefined` 値を JSON 化不可として拒否するため、
      // 値が無い場合はキーごと外す（値が無いことを undefined という値で表現しない）。
      ...(pageBreak !== undefined ? { pageBreak } : {}),
      children: [{ type: "tableRow", children: [sidebarBar(bar.width, bar.color), sidebarBody(styledBody)] }],
    };
  }

  if (decoration?.rule) {
    const { rule } = decoration;
    const styledHeading = styleHeadingCore(node, theme);
    const ruleNode: dd.Canvas = {
      type: "canvas",
      role: "headingRule",
      x1: 0,
      y1: 0,
      x2: contentWidthOf(theme),
      y2: 0,
      lineWidth: rule.width,
      lineColor: rule.color,
      margin: [0, rule.marginTop, 0, 0],
    };
    return { type: "stack", role: "headingWithRule", margin: theme.heading.margin, ...(pageBreak !== undefined ? { pageBreak } : {}), children: [styledHeading, ruleNode] };
  }

  return { ...styleHeadingCore(node, theme, theme.heading.margin), ...(pageBreak !== undefined ? { pageBreak } : {}) };
}

/**
 * 引用（role: "blockquoteBody"）に theme.blockquote.bar を適用する。バーが設定されて
 * いれば左バー付きの sidebar table に組み立て、無ければバー無しのまま
 * background/padding/margin だけを適用する（「バー無し引用」への切り替えが theme だけで
 * 完結する。バーを付けるかどうかは rehypeDdast.ts は知らない）。
 */
function styleBlockquote(node: dd.Stack, theme: PdfmakeTheme): dd.Block {
  const children = node.children.map((c) => styleNode(c, theme));
  const styled: dd.Stack = { ...node, children, style: "blockquoteText", margin: theme.blockquote.padding };
  const withFill: dd.Stack = theme.blockquote.background ? { ...styled, fillColor: theme.blockquote.background } : styled;

  const decoration = theme.blockquote.bar;
  if (!decoration) return { ...withFill, margin: theme.blockquote.margin };

  return {
    type: "table",
    role: "sidebar",
    headerRowCount: 0,
    widths: [decoration.width, "*"],
    margin: theme.blockquote.margin,
    children: [{ type: "tableRow", children: [sidebarBar(decoration.width, decoration.color), sidebarBody(withFill)] }],
  };
}

/** セル自身に見た目（ヘッダー塗り・ゼブラ模様・罫線・named style）を確定させる。中身
 * （TextBlock）ではなくセルが持つ（ddast.ts の TableCell コメント参照）。 */
function styleTableCell(cell: dd.TableCell, opts: { isHeader: boolean; fillColor: string | null; ruleColor: string; theme: PdfmakeTheme }): dd.TableCell {
  const { isHeader, fillColor, ruleColor } = opts;
  return {
    ...cell,
    children: cell.children.map((c) => styleNode(c, opts.theme)),
    style: isHeader ? "th" : "td",
    ...(isHeader ? { noWrap: true } : {}),
    ...(fillColor ? { fillColor } : {}),
    border: [false, false, false, true],
    borderColor: [ruleColor, ruleColor, ruleColor, ruleColor],
  };
}

function styleGfmTable(node: dd.Table, theme: PdfmakeTheme): dd.Table {
  const { header, zebraFill, ruleColor, defaultColumnWidth, dontBreakRows } = theme.table;

  // `<!-- width="..." -->` が指定された列はその値を、指定していない列は
  // defaultColumnWidth を使う。1列も指定が無いテーブルであっても、頼まれていないのに
  // 最後の列を "*" に広げるような調整はしない（呼び出し側が幅を決めていない以上、
  // 全列そのまま defaultColumnWidth にする）。
  const widths = (node.children[0]?.children ?? []).map((c) => c.width ?? defaultColumnWidth);

  const children = node.children.map((row, rowIndex): dd.TableRow => {
    const isHeaderRow = rowIndex < node.headerRowCount;
    const bodyRowIndex = rowIndex - node.headerRowCount;
    const fillColor = isHeaderRow ? header.fill : zebraFill && bodyRowIndex % 2 === 1 ? zebraFill : null;
    // 全行（最終行・ヘッダー行を含む）の下に線を引き、上端（ヘッダーの上）には引かない
    // （CSS の `td { border-bottom }` 相当）。「全行の border-bottom を true にし、
    // border-top は使わない」ことで、行 i の下端＝行 i+1 の上端という重複を避けつつ
    // 同じ見た目（境界 1..N が引かれ、境界 0 だけ引かれない）を表現できる。
    const cells = row.children.map((cell) => styleTableCell(cell, { isHeader: isHeaderRow, fillColor, ruleColor, theme }));
    return { type: "tableRow", children: cells };
  });

  return { ...node, widths, margin: theme.table.margin, padding: theme.table.padding, dontBreakRows, children };
}

/** ddast 1ノードに theme を適用し、Decoration を確定させたノードを返す */
export function styleNode(node: dd.Block, theme: PdfmakeTheme): dd.Block {
  switch (node.type) {
    case "textBlock": {
      const children = node.children.map((c) => styleInline(c, theme));
      if (node.role === "codeBlock") return { ...node, children, style: "codeBlock", margin: theme.codeBlock.margin };
      if (node.role === "pageBreakMarker") return { ...node, children, pageBreak: "before" };
      if (node.role === "heading") return styleHeading({ ...node, children }, theme);
      const style = node.role === "paragraph" ? "paragraph" : undefined;
      return { ...node, children, ...(style ? { style } : {}), margin: [0, 2, 0, 2] };
    }

    case "stack": {
      if (node.role === "blockquoteBody") return styleBlockquote(node, theme);
      const children = node.children.map((c) => styleNode(c, theme));
      return { ...node, children };
    }

    case "table":
      // ここに来る table は常に GFM の通常テーブル
      // （role: "sidebar" は styleHeading()/styleBlockquote() が theme を見て直接組み立てる）。
      return styleGfmTable(node, theme);

    case "ul":
    case "ol": {
      const children = node.children.map((c) => styleNode(c, theme));
      return { ...node, children, margin: theme.list.margin };
    }

    case "canvas":
      // role: "headingRule" はここには来ない（styleHeading() が直接組み立てる）。
      return { ...node, x1: 0, y1: 0, x2: contentWidthOf(theme), y2: 0, lineWidth: theme.rule.width, lineColor: theme.rule.color };

    case "image":
      // width/height が明示指定されていれば（rehypeDdast.ts が `<img width height>` から
      // 読み取った値）そのまま尊重する。指定が無ければ本文幅からはみ出さないよう、
      // fit で収める（高さは十分大きい値にして幅だけで制約し、アスペクト比を保つ）。
      return node.width !== undefined || node.height !== undefined
        ? { ...node, margin: theme.image.margin }
        : { ...node, fit: [contentWidthOf(theme), contentWidthOf(theme) * 10], margin: theme.image.margin };
  }
}

/** ddast のルート全体に theme を適用する */
export function styleDdast(root: dd.Root, theme: PdfmakeTheme): dd.Root {
  return { ...root, children: root.children.map((c) => styleNode(c, theme)) };
}

/**
 * unified の Transformer として使うための attacher（`.use(styleTransform, theme)`）。
 * ddast → ddast（木の種類は変えず、中身だけ変える）という、remark-gfm 等と同じ形の
 * Transformer（processor.ts 参照）。
 */
export const styleTransform: Plugin<[PdfmakeTheme?], dd.Root, dd.Root> = function (theme = DEFAULT_THEME) {
  return (tree) => styleDdast(tree, theme);
};
