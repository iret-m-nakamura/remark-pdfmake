import { createHash } from "node:crypto";
import { toText } from "hast-util-to-text";
import type { Comment, Element, ElementContent, Root as HastRoot, RootContent as HastRootContent } from "hast";
import type { Plugin } from "unified";
import type { Block, Image, Inline, Root, Size, Table, TableCell, TableRow } from "../ddast/ddast.ts";
import { createSlugger } from "./slug.ts";

/**
 * hast → ddast の変換（ddast.ts の型定義とは別ファイルに分離してある。「木の型」と
 * 「その木への変換」を疎結合にするため。ddast.ts のコメント参照）。
 *
 * ここは HTML の意味（見出し・引用・強調...）を ddast の語彙（pdfmake の要素）に対応させる
 * だけの層で、**1:1 の対応表としてのタグ付け**（`<strong>` → role "strong"、見出し →
 * role "heading" 等）に留める。「見出しに左バーを付けるか下線にするか」「引用に左バーを
 * 付けるか」といった、theme（見た目の設定）を見て初めて決まる構造の組み立ては styler.ts の
 * 仕事であり、ここでは行わない（ARCHITECTURE.md 参照）。
 *
 * compiler.ts は ddast に書き込まれている情報をそのまま pdfmake の形に転写するだけで、
 * 新しい値を計算しない。この hast → ddast の変換は、hast の意味論（HTML）から ddast の
 * 語彙（pdfmake）へ決定を下す一方向の変換として許容される場所であり、内部リンクの
 * 着地点名のハッシュ化（下記 pdfDestinationName 参照）もここで行う。
 */

/**
 * 内部リンクの着地点名（pdfmake の `id`／`linkToDestination`。実体は PDF の
 * `/Root /Names /Dests` のキー文字列）を、見出しの slug（marked 互換、日本語混じり・
 * 数字始まりを含む。slug.ts 参照）から sha1 ハッシュ化した短い ASCII 文字列に
 * 置き換える一方向変換。
 *
 * slug をそのまま着地点名として使うと、一部の汎用 PDF ビューアでリンクが機能しない
 * （原因はビューア側の Name Tree 実装にあると推測されるが特定できていない。PDF
 * ファイル自体の構造・ソート順・encoding・宛先ページ・id と linkToDestination の
 * バイト一致は pdf-lib で検証しても正しい）。ASCII のハッシュ値に置き換えることで
 * この問題を避けられるため、この変換を恒久的に行う。
 *
 * ハッシュという不可逆処理であるため、ddast → docDefinition（compiler.ts）ではなく、
 * ここ（hast → ddast）でのみ適用する。見出しの slug 算出自体（marked 互換, slug.ts）は
 * この変換の入力を作るための別の関心事として変えずに残す。
 */
function pdfDestinationName(slug: string): string {
  return createHash("sha1").update(slug, "utf8").digest("hex").slice(0, 16);
}

/** internal link の href フラグメントを着地点名のハッシュ化前の生テキストへ戻す。
 * remark は非 ASCII なフラグメントを percent-encode するため、decode してから使う。 */
function decodeFragment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // 不正な % エンコーディングは稀だが、その場合は生のフラグメントのまま使う（クラッシュさせない）
    return raw;
  }
}

function mapInlines(nodes: ElementContent[]): Inline[] {
  return nodes.map(mapInline);
}

function mapInline(node: ElementContent): Inline {
  if (node.type === "text") return { type: "text", value: node.value };
  if (node.type !== "element") return { type: "text", value: "" };

  const children = mapInlines(node.children);
  switch (node.tagName) {
    case "strong":
    case "b":
      return { type: "run", role: "strong", children };
    case "em":
    case "i":
      return { type: "run", role: "em", children };
    case "del":
    case "s":
      return { type: "run", role: "del", children };
    case "u":
      return { type: "run", role: "u", children };
    case "code":
      return { type: "run", role: "code", children };
    case "small":
      return { type: "run", role: "small", children };
    case "a": {
      const href = node.properties.href;
      const rawUrl = typeof href === "string" ? href : "";
      const internal = rawUrl.startsWith("#");
      const url = internal ? pdfDestinationName(decodeFragment(rawUrl.slice(1))) : rawUrl;
      return { type: "link", url, internal, children };
    }
    case "br":
      return { type: "break" };
    default:
      // markdown の語彙に無い未知のタグ（hast は HTML そのものなので任意のタグを受け取りうる）。
      // ここで役割を持たない透過ノードに握りつぶすと styler.ts 側で二度と復元できなくなるため、
      // tagName をそのまま role として残す（styler.ts がそれをどう解釈するかは別の関心事）。
      return { type: "run", role: node.tagName, children };
  }
}

/**
 * pdfmake 専用の指示は、独自タグ（`<pdf-width>` 等）ではなく HTML コメントで表現する。
 * 独自タグは HTML5 のパース仕様上「void element」の決め打ちリストに無いため自己終了
 * （`<tag />`）が効かず後続の内容を子要素として飲み込んでしまう、かつ CommonMark の
 * HTML ブロック判定も同様に決め打ちのタグ名リスト（div/table 等）に頼っているため
 * ブロックレベルでの使用が信頼できない。HTML コメントはどちらの
 * 問題も持たない（`-->` で必ず閉じる、CommonMark 上も独立したブロック種別として
 * 無条件に認識される）上、`div`/`span` のような実在要素の意味を借用しない。
 */
const PAGE_BREAK_COMMENT = "pdf-page-break";
const WIDTH_COMMENT_PATTERN = /^width="(.*)"$/;

/**
 * width コメント（`<!-- width="..." -->`）の中身を pdfmake の Size 相当の値に変換する。
 * "*"・"auto" はそのまま、数値だけの文字列（"100" 等）は pt 数値に変換し、
 * それ以外（"30%" 等）は文字列のまま返す（pdfmake は Size をこの形で受け取る）。
 */
function parseWidthValue(raw: string): Size {
  if (raw === "*" || raw === "auto") return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function isPageBreakComment(node: Comment): boolean {
  return node.value.trim() === PAGE_BREAK_COMMENT;
}

/**
 * セルの子要素から `<!-- width="..." -->` コメントを取り出す。
 * GFM のテーブル構文には列幅を指定する記法が無いため、コメントで表現している
 * （他の Markdown ビューアで開いても見た目には何も表示されない）。
 */
function extractWidthMarker(children: ElementContent[]): { width?: Size; children: ElementContent[] } {
  let width: Size | undefined;
  const rest = children.filter((c) => {
    if (c.type !== "comment") return true;
    const match = WIDTH_COMMENT_PATTERN.exec(c.value.trim());
    if (!match) return true;
    width = parseWidthValue(match[1]);
    return false;
  });
  return { width, children: rest };
}

/**
 * 段落中の `<a id="..."></a>`（中身が空の目印要素）を取り出す。他セクションから
 * 相互参照できるように、独立した1行（`<a id="section-1"></a>`）として空アンカーを
 * 埋め込む用途に対応する。
 */
function extractAnchorId(children: ElementContent[]): { id?: string; children: ElementContent[] } {
  let id: string | undefined;
  const rest = children.filter((c) => {
    if (c.type === "element" && c.tagName === "a" && c.children.length === 0 && typeof c.properties.id === "string") {
      id = c.properties.id;
      return false;
    }
    return true;
  });
  return { id, children: rest };
}

/**
 * `<img>` を Image ノードにする（ddast.ts の Image コメント参照）。src が無い
 * `<img>`（属性の壊れた入力）は表示しようがないので null にする。
 *
 * src がローカルファイルパスの場合の絶対パス解決（markdown ファイル自身の場所からの
 * 相対パスとして扱う）は、ここでは行わない。ddast は「何が書かれていたか」を
 * そのまま運ぶ層で、パスをどう解決するかは compiler.ts の関心事
 * （compiler.ts の resolveLocalImageSrc() 参照）。
 */
function mapImage(node: Element): Image | null {
  const src = node.properties.src;
  if (typeof src !== "string" || src === "") return null;
  const width = typeof node.properties.width === "number" ? node.properties.width : undefined;
  const height = typeof node.properties.height === "number" ? node.properties.height : undefined;
  // unist は「値を持たないプロパティはキー自体を省略する」規約（unist-util-assert が
  // 明示的な `undefined` 値を JSON 化不可として拒否する）。値が無い場合はキーごと外す。
  return { type: "image", src, ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}) };
}

/** table 直下から thead/tbody 内の tr 要素を取り出す */
function collectRows(table: Element, sectionTag: "thead" | "tbody"): Element[] {
  const section = table.children.find((c): c is Element => c.type === "element" && c.tagName === sectionTag);
  if (!section) return [];
  return section.children.filter((c): c is Element => c.type === "element" && c.tagName === "tr");
}

/**
 * tr 1行を TableRow にする。セルは TableCell ノードで包み、中身（インライン内容だけの
 * TextBlock）をその children に持たせる（pdfmake 自身にセル専用のノード型は無いが、
 * unist の Parent に合わせて1階層挟む。ddast.ts の TableCell コメント参照）。
 * 「th か td か」は pdfmake 自体には無い区別なのでここでは持たせず、行位置と
 * headerRowCount の比較で styler.ts が決める。
 */
function mapTableRow(tr: Element): TableRow {
  const children = tr.children
    .filter((c): c is Element => c.type === "element" && (c.tagName === "th" || c.tagName === "td"))
    .map((cell): TableCell => {
      const { width, children } = extractWidthMarker(cell.children);
      return { type: "tableCell", ...(width !== undefined ? { width } : {}), children: [{ type: "textBlock", children: mapInlines(children) }] };
    });
  return { type: "tableRow", children };
}

/** 矩形化のための穴埋め用の空セル。表示内容を持たない、幅の希望値も無い最小限のセル。 */
function emptyTableCell(): TableCell {
  return { type: "tableCell", children: [{ type: "textBlock", children: [] }] };
}

/**
 * 生 HTML の `<table>` は行ごとにセル数が異なっていても構文として妥当だが、pdfmake の
 * `Table.body: TableCell[][]` は行の長さが揃っていることを要求する（揃わないと
 * `Malformed table row, a cell is undefined` で例外を投げる。pdfmake/js/DocMeasure.js
 * 参照）。ddast.ts の Table コメントで宣言している「各行は同じ長さ」という不変条件を
 * ここで作る。列数は全行のうち最大のセル数とし、足りない行だけ空セルで埋める
 * （どのセルも削らない。入力を握りつぶして消してよいわけではない。
 * ARCHITECTURE.md の rehypeDdast.ts の項参照）。
 */
function padRowsToRectangle(rows: TableRow[]): TableRow[] {
  const columnCount = Math.max(0, ...rows.map((row) => row.children.length));
  return rows.map((row) => {
    if (row.children.length >= columnCount) return row;
    const padding = Array.from({ length: columnCount - row.children.length }, emptyTableCell);
    return { ...row, children: [...row.children, ...padding] };
  });
}

function mapTable(node: Element): Table {
  const headRows = collectRows(node, "thead").map(mapTableRow);
  const bodyRows = collectRows(node, "tbody").map(mapTableRow);
  return { type: "table", headerRowCount: headRows.length, children: padRowsToRectangle([...headRows, ...bodyRows]) };
}

/**
 * 文書全体を通して見出し ID を振るための状態。
 * - slug: marked の Slugger 互換の規則で見出しテキストから ID を振る（slug.ts 参照）。
 *   目次・相互参照リンクの着地点になる。
 * - depthCounts: 見出しレベルごとの出現回数。改ページ判定は styler.ts の Theme に委ねる。
 */
interface BuildContext {
  slug: (text: string) => string;
  depthCounts: Partial<Record<number, number>>;
}

function nextOccurrence(ctx: BuildContext, depth: number): number {
  const n = (ctx.depthCounts[depth] ?? 0) + 1;
  ctx.depthCounts[depth] = n;
  return n;
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** node.children 相当の配列を mapBlock() にかけ、1:多（画像混在段落の分割）を
 * 平坦化して null を取り除く。hastToDdast()・mapListItem()・blockquote で共通に使う。 */
function mapBlocks(nodes: HastRootContent[], ctx: BuildContext): Block[] {
  return nodes.flatMap((c) => mapBlock(c, ctx) ?? []);
}

function mapListItem(li: Element, ctx: BuildContext): Block {
  const BLOCK_TAGS = new Set(["p", "ul", "ol", "blockquote"]);
  const isLoose = li.children.some((c) => c.type === "element" && BLOCK_TAGS.has(c.tagName));
  if (!isLoose) {
    // tight なリスト項目（`- a\n- b`）はインライン内容のみの1つの text にする
    return { type: "textBlock", children: mapInlines(li.children) };
  }
  return { type: "stack", role: "listItem", children: mapBlocks(li.children as HastRootContent[], ctx) };
}

/**
 * 画像が他のテキストと混在する段落（例: 「文中に![img](url)入れる」）を、
 * 画像を独立したブロックとして挟み込む形に分割する。pdfmake の text 配列は
 * 画像を行内要素として描画できず（型定義上は受け付けるが実装が対応していない）、
 * 何もしなければ画像が黙って消える。ddast としてはそれを
 * そのまま許容せず、前後のテキストを別々の段落に分けてでも画像を出力する。
 *
 * `<a id>` から昇格した段落の id は、最初に生成される段落断片にだけ付ける
 * （複数箇所に同じ着地点を付けられないため）。
 */
function splitParagraphAtImages(children: ElementContent[], id: string | undefined): Block[] {
  const nodes: Block[] = [];
  let run: ElementContent[] = [];
  let idAssigned = false;

  const flushText = () => {
    const isBlank = run.every((c) => c.type === "text" && c.value.trim() === "");
    if (!isBlank) {
      const paragraphId = idAssigned ? undefined : id;
      nodes.push({ type: "textBlock", role: "paragraph", ...(paragraphId !== undefined ? { id: paragraphId } : {}), children: mapInlines(run) });
      idAssigned = true;
    }
    run = [];
  };

  for (const child of children) {
    if (child.type === "element" && child.tagName === "img") {
      flushText();
      const image = mapImage(child);
      if (image) nodes.push(image);
    } else {
      run.push(child);
    }
  }
  flushText();
  return nodes;
}

function mapBlock(node: HastRootContent, ctx: BuildContext): Block | Block[] | null {
  if (node.type === "text") {
    const text = node.value.trim();
    return text ? { type: "textBlock", children: [{ type: "text", value: text }] } : null;
  }
  if (node.type === "comment") {
    return isPageBreakComment(node) ? { type: "textBlock", role: "pageBreakMarker", children: [] } : null;
  }
  if (node.type !== "element") return null;

  if (HEADING_TAGS.has(node.tagName)) {
    const depth = Number(node.tagName[1]) as 1 | 2 | 3 | 4 | 5 | 6;
    const id = pdfDestinationName(ctx.slug(toText(node)));
    const occurrence = nextOccurrence(ctx, depth);
    // 左バー・下線を付けるかどうかは theme（見た目）を見て初めて決まるため、ここでは
    // 組み立てず styler.ts に委ねる（styler.ts の styleHeading() 参照）。
    return { type: "textBlock", role: "heading", depth, occurrence, id, children: mapInlines(node.children) };
  }

  switch (node.tagName) {
    case "p": {
      const { id, children } = extractAnchorId(node.children);
      const hashedId = id ? pdfDestinationName(id) : undefined;
      const hasImage = children.some((c) => c.type === "element" && c.tagName === "img");
      // 画像が無い（ほとんどの）段落は、1個の textBlock にする単純な経路。
      // 画像を含む段落だけ splitParagraphAtImages() で分割する（画像1個だけの段落 ―
      // markdown の `![alt](src)` の標準的な書き方 ― も、この経路で自然に
      // 「テキスト無し・画像1個」の配列になる）。
      if (!hasImage) return { type: "textBlock", role: "paragraph", ...(hashedId !== undefined ? { id: hashedId } : {}), children: mapInlines(children) };
      return splitParagraphAtImages(children, hashedId);
    }
    case "blockquote": {
      // 左バーを付けるかどうかは theme.blockquote.bar を見て styler.ts が決める
      // （styler.ts の styleBlockquote() 参照）。ここでは role のみ残す。
      return { type: "stack", role: "blockquoteBody", children: mapBlocks(node.children as HastRootContent[], ctx) };
    }
    case "ul":
    case "ol": {
      const children = node.children
        .filter((c): c is Element => c.type === "element" && c.tagName === "li")
        .map((li) => mapListItem(li, ctx));
      return { type: node.tagName, children };
    }
    case "table":
      return mapTable(node);
    case "img":
      // `![alt](src)` は remark-rehype が <p><img></p> にするため通常は `case "p":` の
      // 単独画像チェックで拾われるが、生 HTML の `<img>` はブロックレベル要素として
      // <p> に包まれず root 直下にそのまま出てくる（"div" 等と同じ扱い）。
      // その形で来た場合もここで拾わないと、default: に落ちて何も表示されず消える。
      return mapImage(node);
    case "hr":
      return { type: "canvas", role: "rule" };
    case "pre":
      // pre > code のブロックコード。ハイライトはせずプレーンテキストとして扱う
      return { type: "textBlock", role: "codeBlock", children: [{ type: "text", value: toText(node) }] };
    case "div": {
      const text = toText(node).trim();
      return text ? { type: "textBlock", children: [{ type: "text", value: text }] } : null;
    }
    default: {
      const text = toText(node).trim();
      return text ? { type: "textBlock", children: [{ type: "text", value: text }] } : null;
    }
  }
}

/** hast のルートを ddast のルートに変換する。構造（どの pdfmake 要素を使うか）は決めるが、
 * 色・幅・余白などの具体的な値は決めない（role のみ残す。compiler.ts 参照） */
export function hastToDdast(root: HastRoot): Root {
  const ctx: BuildContext = { slug: createSlugger(), depthCounts: {} };
  return { type: "root", children: mapBlocks(root.children as HastRootContent[], ctx) };
}

/**
 * unified の Transformer として使うための attacher（`.use(rehypeToDdast)`）。
 * remark-rehype が mdast→hast のように木の種類を変える Transformer であるのと同じ仕組みで、
 * hast→ddast へ木の種類を変える。
 */
export const rehypeToDdast: Plugin<[], HastRoot, Root> = function () {
  return (tree) => hastToDdast(tree);
};
