/**
 * pdfmake の CommonJS 実装（js/ 配下）は @types/pdfmake（DefinitelyTyped）の型定義の
 * カバー範囲外（interfaces.d.ts はパッケージ本体の型のみ提供し、`pdfmake/js/*.js` への
 * サブパス import は宣言されていない）。render.ts はこれらを実体（クラス）としてのみ
 * 使い、以降は unknown 経由でアサーションして扱うため、ここでは「any でモジュールが
 * 存在すること」だけを宣言する。
 */
declare module "pdfmake/js/Printer.js" {
  const value: unknown;
  export default value;
}

declare module "pdfmake/js/URLResolver.js" {
  const value: unknown;
  export default value;
}

declare module "pdfmake/js/virtual-fs.js" {
  const value: unknown;
  export default value;
}

declare module "pdfmake/js/standardPageSizes.js" {
  const value: unknown;
  export default value;
}
