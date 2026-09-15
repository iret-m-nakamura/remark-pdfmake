import { writeFileSync } from "node:fs";
import type { TDocumentDefinitions, TFontDictionary } from "../pdfmakeTypes.ts";
// pdfmake の named export（pdfMake.createPdf 等）はブラウザ向けの Client API。
// Node で実際に PDF バイト列を生成するには、CommonJS 実装（js/配下）の
// PdfPrinter・URLResolver・virtual-fs を直接使う（README には Node 向けの明記が無い）。
// CJS の `exports.default = ...` は ESM の `import X from` では X = モジュール全体
// （{ default: ... }）になるため、型は unknown 経由でアサーションして実体（クラス／
// インスタンス）を取り出す。
import PdfPrinterPkg from "pdfmake/js/Printer.js";
import URLResolverPkg from "pdfmake/js/URLResolver.js";
import virtualFsPkg from "pdfmake/js/virtual-fs.js";
// pdfmake/js/*.js は `exports.default = X; exports.__esModule = true;` という CJS の書き方をしている。
// これを ESM から `import X from "..."` する際の default 解決結果は、実行環境（tsx が CJS へ
// トランスパイルするか、素の Node ESM ローダーで読むか）によって「モジュール全体」なのか
// 「既に unwrap 済みの X 自体」なのかが変わりうる。
// どちらでも動くように、`.default` があればそれを、無ければ渡された値自体を使う。
function unwrapDefault<T>(mod: T | { default: T }): T {
  return (mod as { default?: T }).default ?? (mod as T);
}

interface VirtualFs {
  existsSync(path: string): boolean;
  readFileSync(path: string): unknown;
  writeFileSync(path: string, data: unknown): void;
}

/**
 * pdfmake が自身のトップレベル API（`require("pdfmake").createPdf()`。js/base.js 参照）
 * から使っているのと同じ、バンドル同梱の仮想ファイルシステムをそのまま使う（自前で
 * 実装しない）。docDefinition.images に登録したリモート画像 URL は URLResolver が
 * `fetch()` してここに書き込み、PdfPrinter の `provideImage()` がここから読み戻す
 * （pdfmake/js/PDFDocument.js の provideImage/realImageSrc 参照）。
 *
 * pdfmake 自身はこれをプロセス全体で共有するシングルトンとして export しており（クラス
 * 自体は export されず、生成済みのインスタンスしか受け取れない）、内容を消す手段も無い。
 * `renderToBuffer()` を繰り返し呼ぶとフェッチした画像データが蓄積し続けるため、
 * リモート画像を多用する長期稼働プロセスでは無視できないメモリ使用量になりうる
 * （pdfmake 自身のトップレベル API を使った場合も同じ制約を持つ）。
 */
const virtualFs = unwrapDefault(virtualFsPkg as unknown as VirtualFs | { default: VirtualFs });

interface UrlResolverInstance {
  setUrlAccessPolicy(policy: ((url: string) => boolean) | undefined): void;
}
type UrlResolverCtor = new (fs: VirtualFs) => UrlResolverInstance;
const URLResolver = unwrapDefault(URLResolverPkg as unknown as UrlResolverCtor | { default: UrlResolverCtor });

interface PrinterInstance {
  createPdfKitDocument(dd: TDocumentDefinitions): Promise<NodeJS.ReadableStream & { end(): void }>;
}
type PdfPrinterCtor = new (
  fonts: TFontDictionary,
  virtualFs: VirtualFs,
  urlResolver: UrlResolverInstance,
  localAccessPolicy: ((path: string) => boolean) | undefined,
) => PrinterInstance;
const PdfPrinter = unwrapDefault(PdfPrinterPkg as unknown as PdfPrinterCtor | { default: PdfPrinterCtor });

/**
 * ローカルファイル・リモート URL への実際のアクセスを許可するかどうかを判定する関数。
 * pdfmake 自身が提供する `setLocalAccessPolicy()`/`setUrlAccessPolicy()`
 * （pdfmake/js/base.js・PDFDocument.js の validateLocalFile()・URLResolver.js 参照）に
 * そのまま渡すだけで、このモジュール自身は判定ロジックを持たない。
 *
 * 画像・フォント・添付ファイルの実体（ローカルファイル・リモート URL）を実際に
 * 解決する（読む・fetch する）のは compiler.ts の外、pdfmake 自身の仕事であり、
 * その可否を判断するポリシーも呼び出し側がここで指示する（CLAUDE.md の
 * 「関心事の分離」参照）。`renderToBuffer()`/`renderToFile()` はこの型を必須引数として
 * 要求する（省略できない）。無制限で構わない場合は `{}` を明示的に渡す——ライブラリが
 * 判断を代行してデフォルト値を選ぶ・その旨を勝手に console へ書き出すのではなく、
 * 呼び出し側に必ず一度この選択をさせるための設計。
 *
 * いずれかのコールバックが `false` を返すと、pdfmake は該当のファイル・URL を
 * 読み飛ばすのではなく例外を投げ、`renderToBuffer()`/`renderToFile()` 全体を失敗させる
 * （fail-closed。pdfmake/js/PDFDocument.js の validateLocalFile()・URLResolver.js の
 * fetchUrl() 参照）。信頼できない markdown から生成する場合、呼び出し側でこの例外を
 * 捕捉する前提で設計すること。
 */
export interface RenderPolicy {
  /** リモート画像 URL（fetch 先）ごとに許可するかどうかを返す。 */
  urlAccessPolicy?: (url: string) => boolean;
  /** ローカルファイルパス（画像・フォント・添付ファイル。baseDir 結合後の絶対パス）
   * ごとに許可するかどうかを返す。 */
  localAccessPolicy?: (path: string) => boolean;
}

/**
 * TDocumentDefinitions を実際の PDF バイト列にレンダリングする。
 *
 * pdfmake の PdfPrinter はコンストラクタで urlResolver を要求し、フォントファイルの
 * パスも（http(s) 以外は no-op とはいえ）必ず resolve() を呼び出す実装になっている
 * （pdfmake/js/Printer.js の resolveUrls 参照）。省略すると
 * `this.urlResolver.resolve is not a function` で例外になるため、ここで
 * 常に URLResolver を組み立てて隠蔽する。
 *
 * フォント自体の登録（日本語を含む TTF/OTF ファイルパスの指定）は呼び出し側の責務。
 * pdfmake 標準の Roboto ("Helvetica" 系)は日本語グリフを持たないため、
 * 日本語を含む文書では defaultStyle.font と一致する fonts を必ず渡すこと。
 */
export async function renderToBuffer(dd: TDocumentDefinitions, fonts: TFontDictionary, policy: RenderPolicy): Promise<Buffer> {
  const urlResolver = new URLResolver(virtualFs);
  urlResolver.setUrlAccessPolicy(policy.urlAccessPolicy);
  const printer = new PdfPrinter(fonts, virtualFs, urlResolver, policy.localAccessPolicy);
  const pdfDoc = await printer.createPdfKitDocument(dd);
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => {
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve());
    pdfDoc.on("error", reject);
  });
  pdfDoc.end();
  await done;
  return Buffer.concat(chunks);
}

/** renderToBuffer() の結果をファイルに書き出す薄いラッパー */
export async function renderToFile(dd: TDocumentDefinitions, fonts: TFontDictionary, output: string, policy: RenderPolicy): Promise<void> {
  const buffer = await renderToBuffer(dd, fonts, policy);
  writeFileSync(output, buffer);
}
