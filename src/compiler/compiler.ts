import { isAbsolute, join } from "node:path";
import type { Content as PdfContent, Style } from "pdfmake";
import { z } from "zod";
// Content の具体的な亜種（ContentText 等）は compileNode()/PdfObject という、公開 API から
// 参照されない内部実装だけが使う。pdfmake 本体には package.json の exports が無く、この
// サブパスは nodenext 解決の利用者には届かない（pdfmakeTypes.ts 参照）ため、公開面に出る
// 型（Content/Style/TDocumentDefinitions）とは別に、ここに閉じて import する。
import type { ContentCanvas, ContentImage, ContentOrderedList, ContentStack, ContentTable, ContentText, ContentUnorderedList } from "pdfmake/interfaces";
import type { Plugin } from "unified";
import type { TDocumentDefinitions } from "./pdfmakeTypes.ts";
import type * as dd from "ddast";
import type { PdfmakeTheme } from "ddast-util-style";
import { DEFAULT_THEME } from "ddast-util-style";

/**
 * ddast（既に styler.ts で見た目が確定済み）を pdfmake の Content/TDocumentDefinitions の
 * 形（キー名・shape）に転写する。ARCHITECTURE.md 参照。
 *
 * このファイルは theme を一切参照しない（named style 辞書の組み立てのみ例外。下記
 * `ddastToDocDefinition` 参照）。ddast ノードに既に書き込まれている値
 * （`Decoration`: style/fillColor/margin/pageBreak/border/borderColor/noWrap や、
 * canvas の座標、table の widths/padding）を pdfmake が要求するキー名・shape へ
 * 移し替えるだけで、新しい値を計算する処理を持ってはいけない。
 */

/**
 * pdfmake の `Content` はプリミティブ（string/number）・配列・{@link ContentSection} 等
 * このモジュールが一切作らない亜種まで含む巨大な union で、スプレッド（`{...x, margin}`）や
 * 追加プロパティの付与をしようとすると TS がそれら全部との整合性チェックをしてしまい、
 * 実際には作らない亜種（margin を持たない ContentSection 等）に引っかかってエラーになる。
 * このファイルが実際に作るのはこの6種類だけなので、それだけの union に絞って使う。
 */
type PdfObject = ContentText | ContentStack | ContentTable | ContentCanvas | ContentUnorderedList | ContentOrderedList | ContentImage;

// ---- 小さなヘルパー ---------------------------------------------------------

/**
 * ddast ノードの Decoration（styler.ts が theme を使って既に確定させた pdfmake 固有の
 * プロパティ）を、値が存在するものだけ抜き出す。theme も
 * 計算も一切介さない、単なるフィールドのコピー。
 */
function decorationProps(node: dd.Decoration): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (node.style !== undefined) out.style = node.style;
  if (node.fillColor !== undefined) out.fillColor = node.fillColor;
  if (node.margin !== undefined) out.margin = node.margin;
  if (node.pageBreak !== undefined) out.pageBreak = node.pageBreak;
  if (node.noWrap !== undefined) out.noWrap = node.noWrap;
  return out;
}

/**
 * TableCell 固有の罫線プロパティ（pdfmake の `TableCellProperties.border`/`borderColor`）。
 * Decoration（`Style`/`ContentBase` 由来）には含まれない、セル専用のプロパティのため
 * decorationProps() とは別の転写にする（ddast.ts の TableCell コメント参照）。
 */
function cellBorderProps(cell: dd.TableCell): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (cell.border !== undefined) out.border = cell.border;
  if (cell.borderColor !== undefined) out.borderColor = cell.borderColor;
  return out;
}

/**
 * pdfmake は実行時には content 要素の `id`（内部リンク先、pdfmake/js/LayoutBuilder.js の
 * processLeaf 参照）を読み取るが、@types/pdfmake の型定義には現状 `id` が含まれていない。
 * ここでは型定義の欠落を型アサーションで迂回し、id が無ければ何もしない。
 *
 * `id` を付ける対象の `text` が空（`[]`／`""`）だと、pdfmake が実際の描画行（line）を
 * 1つも生成せず、id→着地点の登録処理自体が発火しない（pdfmake/js/LayoutBuilder.js の
 * processLeaf は `line` が truthy な場合にしか id を見ない）。
 * これは `<a id="...">` だけの空アンカー段落で実際に起きるケースなので、その場合だけ
 * 半角スペースを差し込んで回避する（pageBreak は行の有無に関係なくノード種別によらず
 * 処理されるので、この問題は起きない）。
 * theme に依存しない、pdfmake の実装都合による固定の回避策なのでここに置く。
 */
const INVISIBLE_PLACEHOLDER = " ";

function withId<T extends PdfContent>(content: T, id: string | undefined): T {
  if (!id) return content;
  const obj = content as unknown as { id: string; text?: unknown };
  obj.id = id;
  if (Array.isArray(obj.text) && obj.text.length === 0) obj.text = INVISIBLE_PLACEHOLDER;
  else if (obj.text === "") obj.text = INVISIBLE_PLACEHOLDER;
  return content;
}

/**
 * 外部リンク（`dd.Link.internal === false`）の href が満たすべき制約を宣言する。href は
 * markdown/HTML から直接受け取る文字列で、pdfmake はこれをそのまま PDF のリンク
 * アノテーションの遷移先として使うため、`javascript:`/`data:`/`file:` 等の scheme を
 * 許可すると PDF ビューアでの意図しない動作・ローカルリソースへのアクセスにつながりうる。
 * http(s)・mailto・tel の3 scheme のみ許可する。
 */
const externalLinkUrlSchema = z.url({ protocol: /^(https?|mailto|tel)$/ });

/** href（scheme 検証済みでない生の文字列）がリンクとして許可される scheme かどうか。 */
function isSafeExternalLinkUrl(url: string): boolean {
  return externalLinkUrlSchema.safeParse(url).success;
}

/**
 * pdfmake の run（インラインテキスト片）を組み立てる。子が単一のプレーン文字列に解決される
 * 場合は配列でラップせず、文字列そのものを `text` に入れる。pdfmake は「他の run と並んだ
 * 状態で、かつ自身の `text` が配列である run」だとスタイル適用に失敗する既知の挙動が
 * あるため。
 */
function collapse(children: PdfContent[], styleName?: string, extra: Record<string, unknown> = {}): PdfContent {
  const text = children.length === 1 && typeof children[0] === "string" ? children[0] : children;
  return { text, ...(styleName ? { style: styleName } : {}), ...extra };
}

function compileInline(inline: dd.Inline): PdfContent {
  switch (inline.type) {
    case "text":
      return inline.value;
    case "break":
      return "\n";
    case "run":
      return collapse(inline.children.map(compileInline), inline.role);
    case "link": {
      const children = inline.children.map(compileInline);
      // internal link の場合、url は既に rehypeDdast.ts 側で着地点名（heading の
      // id と同じ形式）に解決済み。ここでは値をそのまま転写するだけで、変換は行わない。
      if (inline.internal) return collapse(children, "a", { linkToDestination: inline.url });
      // 外部リンクは href が空（`[text]()`）、または scheme が許可リストに無い場合、
      // リンクとしての見た目（style: "a"・href）を持たないプレーンテキストとして残す。
      // markdown は信頼できるとは限らない入力であり、1つの不正なリンクのために文書
      // 全体の生成が失敗しないようにする（rehype-sanitize 等、エコシステムの慣習と
      // 同様に「その属性だけ落として中身は残す」を既定の挙動にする）。
      if (inline.url === "" || !isSafeExternalLinkUrl(inline.url)) return collapse(children);
      return collapse(children, "a", { link: inline.url });
    }
  }
}

// ---- テーブル ----------------------------------------------------------

/**
 * セル（ddast.ts の TableCell）を pdfmake の TableCell 相当に転写する。pdfmake 自身には
 * セル専用のノード型が無く、セルはただの Content にセル用のプロパティを足したもの
 * （`TableCell = Content & TableCellProperties`）なので、中身を転写した Content に
 * セル自身の Decoration をそのまま載せる。fillColor/border/borderColor/style/noWrap は
 * styler.ts が既にセルに確定させているので、ここでは読んで移すだけ。
 *
 * 中身は通常 1 つの TextBlock だが、loose な blockquote（複数段落・リスト）が sidebar
 * table の本文セルに入る場合は stack になり、バー列のセル（role: "sidebarBar"）のように
 * 中身を持たないセルもある。空セルは `{text: []}` にする（pdfmake はこれを高さだけを持つ
 * 空のセルとして描画する）。
 */
function compileCell(cell: dd.TableCell, baseDir: string | undefined): PdfContent {
  const content = compileCellContent(cell.children, baseDir);
  return { ...content, ...decorationProps(cell), ...cellBorderProps(cell) };
}

function compileCellContent(children: dd.Block[], baseDir: string | undefined): PdfObject {
  if (children.length === 0) return { text: [] };
  if (children.length === 1) return compileNode(children[0], baseDir);
  return { stack: children.map((c) => compileNode(c, baseDir)) };
}

/**
 * GFM テーブル。ヘッダー塗り・ゼブラ模様・セル罫線は styler.ts が各セルに焼き込んだ
 * fillColor/border/borderColor を pdfmake がそのまま描画する（table 全体の layout
 * コールバックでは計算しない）。padding だけは pdfmake がセル単位のプロパティを持たず、
 * layout コールバックの形でしか渡せないため、styler.ts が確定させた定数
 * （`node.padding`）を返すだけの、行・列を無視するコールバックとして組み立てる。
 *
 * hLineWidth は「線を引くかどうか」自体はセルの border が決めるため、0 でさえなければ
 * 何でもよい（pdfmake は `layout.hLineWidth(i)` が 0 だとその境界の線を完全にスキップする
 * ため、定数 1 を返す。実際に見えるかどうかは各セルの border フラグが決める。
 * pdfmake/js/TableProcessor.js の drawHorizontalLine 参照）。
 */
function compileGfmTable(node: dd.Table, baseDir: string | undefined): ContentTable {
  const body = compileTableBody(node, baseDir);
  const padding = node.padding!;
  return {
    // dontBreakRows は theme.table.dontBreakRows から styler.ts が確定させた値をそのまま転写する。
    table: { headerRows: node.headerRowCount, widths: node.widths!, body, dontBreakRows: node.dontBreakRows },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 0,
      paddingLeft: () => padding.left,
      paddingRight: () => padding.right,
      paddingTop: () => padding.top,
      paddingBottom: () => padding.bottom,
    },
    ...decorationProps(node),
  };
}

/**
 * 「左に色付きの縦バーを添える」table（role: "sidebar"）。バー・本文それぞれのセルの
 * fillColor は styler.ts が確定済み。罫線を一切引かない "noBorders" は theme に依存しない
 * 固定の構造上の定数（sidebar 構成である以上必ずこうなる）なのでここに直接書いてよい。
 */
function compileSidebarTable(node: dd.Table, baseDir: string | undefined): ContentTable {
  return {
    table: { widths: node.widths!, body: compileTableBody(node, baseDir) },
    layout: "noBorders",
    ...decorationProps(node),
  };
}

/** ddast の `TableRow[]`（各行が `TableCell[]`）を pdfmake の `TableCell[][]` に組み直す。
 * 行を表す独立したノードを持たない pdfmake の shape へ合わせるだけの、意味的に相同な変換。 */
function compileTableBody(node: dd.Table, baseDir: string | undefined): PdfContent[][] {
  return node.children.map((row) => row.children.map((cell) => compileCell(cell, baseDir)));
}

const DATA_OR_REMOTE_IMAGE_SRC = /^(data:|https?:\/\/)/i;

/**
 * 画像の src がローカルファイルパス（data: URI でも http(s) URL でもない）なら、baseDir と
 * 結合して絶対パスにする。`path.resolve()` は引数だけでは絶対パスにならない場合に
 * `process.cwd()` を補ってしまう仕様があるため使わず、`path.join()` で純粋に
 * baseDir + src を組み立てるだけにする（baseDir は呼び出し側が絶対パス
 * （例: `__dirname`）を渡す前提。cwd には一切依存しない）。
 *
 * baseDir 未指定（呼び出し側が opts.baseDir を渡さない）の場合は何もせず
 * src をそのまま使う。data: URI・http(s) URL・既に絶対パスのものは、
 * baseDir に対する相対パスという概念が無いため対象外。
 *
 * ローカルパス・リモート URL が実際にアクセスしてよいものかどうかの検証はここでは
 * 行わない。実際にファイルを読む・fetch するのは compiler.ts の外（pdfmake 自身）で
 * あり、その可否を判断するポリシーも呼び出し側が render.ts の
 * `RenderPolicy`（`localAccessPolicy`/`urlAccessPolicy`。pdfmake 自身の
 * `setLocalAccessPolicy()`/`setUrlAccessPolicy()` にそのまま渡す）で指示する
 * （CLAUDE.md の「関心事の分離」参照）。
 */
function resolveLocalImageSrc(src: string, baseDir: string | undefined): string {
  if (!baseDir || DATA_OR_REMOTE_IMAGE_SRC.test(src) || isAbsolute(src)) return src;
  return join(baseDir, src);
}

// ---- ディスパッチ本体 ---------------------------------------------------------

/**
 * このファイル内でのみ使う（index.ts が再公開しない）。戻り値の PdfObject は
 * ContentText 等、pdfmake のサブパス（pdfmake/interfaces）にしか無い型を含み、これは
 * 公開 API の型には使えない（pdfmakeTypes.ts 参照）ため、公開面に出さない。
 */
function compileNode(node: dd.Block, baseDir?: string): PdfObject {
  switch (node.type) {
    case "textBlock": {
      if (node.role === "codeBlock") {
        const first = node.children[0];
        const text = first?.type === "text" ? first.value : "";
        return { text, preserveLeadingSpaces: true, ...decorationProps(node) };
      }
      if (node.role === "pageBreakMarker") return { text: "", ...decorationProps(node) };
      const inlines = node.children.map(compileInline);
      return withId({ text: inlines, ...decorationProps(node) }, node.id);
    }

    case "stack": {
      const stack = node.children.map((c) => compileNode(c, baseDir));
      return { stack, ...decorationProps(node) };
    }

    case "table":
      return node.role === "sidebar" ? compileSidebarTable(node, baseDir) : compileGfmTable(node, baseDir);

    case "ul":
    case "ol": {
      const items = node.children.map((c) => compileNode(c, baseDir));
      return node.type === "ol" ? { ol: items, ...decorationProps(node) } : { ul: items, ...decorationProps(node) };
    }

    case "canvas":
      return {
        canvas: [{ type: "line", x1: node.x1!, y1: node.y1!, x2: node.x2!, y2: node.y2!, lineWidth: node.lineWidth!, lineColor: node.lineColor! }],
        ...decorationProps(node),
      };

    case "image":
      return {
        image: resolveLocalImageSrc(node.src, baseDir),
        ...(node.width !== undefined ? { width: node.width } : {}),
        ...(node.height !== undefined ? { height: node.height } : {}),
        ...(node.fit ? { fit: node.fit } : {}),
        ...decorationProps(node),
      };
  }
}

const REMOTE_IMAGE_URL = /^https?:\/\//i;

/**
 * ddast 内の画像ノードのうち http(s) URL のものを集め、docDefinition.images 用の
 * エントリ（URL 自身をキーにもする）にする。data: URI は pdfmake が自動で
 * images 辞書に登録し（PDFDocument.js の convertIfBase64Image 参照）、ローカル
 * ファイルパスは登録無しでそのまま読めるため、ここで対応が要るのは http(s) URL だけ
 * （render.ts の URLResolver 参照）。
 */
function collectRemoteImages(node: dd.Block, out: Record<string, string>): void {
  if (node.type === "image") {
    if (REMOTE_IMAGE_URL.test(node.src)) out[node.src] = node.src;
    return;
  }
  if (node.type === "table") {
    for (const row of node.children) for (const cell of row.children) for (const child of cell.children) collectRemoteImages(child, out);
    return;
  }
  if (node.type === "stack" || node.type === "ul" || node.type === "ol") {
    for (const child of node.children) collectRemoteImages(child, out);
  }
  // "textBlock"・"canvas" はブロックの子を持たない（textBlock.children は Inline[] であり、
  // 画像は run になり得ない。ddast.ts の Image コメント参照）。
}

/** ddast のルート（styler.ts 適用済み）を pdfmake の Content 配列に転写する。
 * baseDir はローカルファイルパスの画像を解決する基準ディレクトリ
 * （resolveLocalImageSrc() 参照。省略時は画像パスを解決せずそのまま使う）。 */
export function ddastToContent(root: dd.Root, baseDir?: string): PdfContent[] {
  return root.children.map((c) => compileNode(c, baseDir));
}

// ---- named style 辞書 --------------------------------------------------------
// styles 辞書は content と分離された別データなので、theme から組み立てること自体は
// このファイルで行ってよい（content 側の各ノードにどの style を適用するかという決定は
// styler.ts が既に済ませている。ここは辞書の中身、つまり参照先の値を作るだけ）。

/** h1〜h6 の named style（theme.heading.levels から生成） */
function headingStyles(theme: PdfmakeTheme): Record<string, Style> {
  const styles: Record<string, Style> = {};
  for (const [depth, levelTheme] of Object.entries(theme.heading.levels)) {
    styles[`h${depth}`] = {
      fontSize: levelTheme.fontSize,
      bold: levelTheme.bold,
      ...(levelTheme.italics ? { italics: levelTheme.italics } : {}),
      ...(levelTheme.color ? { color: levelTheme.color } : {}),
    };
  }
  return styles;
}

/** インライン要素・テーブル見出しセル・引用・地の文・コードブロックの named style */
function otherStyles(theme: PdfmakeTheme): Record<string, Style> {
  return {
    ...theme.inline,
    blockquoteText: theme.inline.blockquoteText,
    code: { background: theme.code.background, fontSize: theme.code.fontSize, ...(theme.code.font ? { font: theme.code.font } : {}) },
    paragraph: { lineHeight: theme.body.lineHeight },
    codeBlock: { fontSize: theme.codeBlock.fontSize, background: theme.codeBlock.background },
  };
}

export interface ToDocDefinitionOptions {
  /** 全体に適用するデフォルトスタイル（フォント指定など）。呼び出し側でフォント名を渡す */
  defaultStyle?: Style;
  /**
   * named style の追加・上書き。省略時は theme から生成した見出し・インラインスタイルが
   * そのまま使われる。例: `{ styles: { strong: { color: "red", bold: true } } }` で
   * strong の見た目だけ差し替え可能。
   */
  styles?: Record<string, Style>;
  /** レイアウトの設定一式。省略時は DEFAULT_THEME。部分上書きは mergeTheme() を使う */
  theme?: PdfmakeTheme;
  /**
   * ローカルファイルパスの画像（`![alt](./foo.png)` 等）を解決する基準ディレクトリ。
   * 省略時はパスを解決せずそのまま使う（＝実際にファイルを読む時点の
   * `process.cwd()` 基準になる。resolveLocalImageSrc() 参照）。
   * markdown ファイル自身と同じディレクトリの画像を参照したい場合、呼び出し側が
   * そのディレクトリを渡す（例: `markdownToDocDefinition(markdown, { baseDir: __dirname })`）。
   */
  baseDir?: string;
}

/** ddast のルート（styler.ts 適用済み）から pdfmake の TDocumentDefinitions を組み立てる */
export function ddastToDocDefinition(root: dd.Root, opts: ToDocDefinitionOptions = {}): TDocumentDefinitions {
  const theme = opts.theme ?? DEFAULT_THEME;
  const images: Record<string, string> = {};
  for (const node of root.children) collectRemoteImages(node, images);
  return {
    content: ddastToContent(root, opts.baseDir),
    defaultStyle: opts.defaultStyle,
    styles: { ...headingStyles(theme), ...otherStyles(theme), ...opts.styles },
    ...(Object.keys(images).length > 0 ? { images } : {}),
  };
}

declare module "unified" {
  interface CompileResultMap {
    TDocumentDefinitions: TDocumentDefinitions;
  }
}

/**
 * unified の Compiler として使うための attacher（`.use(pdfmakeCompiler, opts)`）。
 * Compiler は Transformer と異なり「木を別の木に変換する」のではなく「木を最終的な
 * 非木構造（ここでは pdfmake の TDocumentDefinitions）に変換する」役割を持つ
 * （unified はこれを `this.compiler = (tree) => result` で登録する規約になっている。
 * 大文字の `this.Compiler` は非推奨のエイリアスなので使わない）。
 * `processor.processSync(markdown).result` で結果を取り出せる（processor.ts 参照）。
 *
 * 見た目の確定（theme の適用）は styleTransform（styler.ts）が一段前で既に済ませている
 * 前提。opts.theme はこの層では named style 辞書の組み立てにしか使わない。
 */
export const pdfmakeCompiler: Plugin<[ToDocDefinitionOptions?], dd.Root, TDocumentDefinitions> = function (opts = {}) {
  // `this.compiler` の引数は unified の型上は汎用の unist Node にしか絞れない
  // （Plugin<...> の Input 型注釈と Processor#compiler の setter 型がここでは噛み合わない、
  // unified の型定義側の既知の制約）。実行時には processor.ts の配線により必ず
  // styleTransform の出力（styler 適用済み dd.Root）が渡ってくるため、ここでキャストする。
  this.compiler = (tree: unknown) => ddastToDocDefinition(tree as dd.Root, opts);
};
