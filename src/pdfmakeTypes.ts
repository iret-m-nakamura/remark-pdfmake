import type { createPdf } from "pdfmake";

/**
 * pdfmake の公開型のうち、`pdfmake` パッケージへの bare import（`from "pdfmake"`）だけでは
 * 得られないものを、実在する値の型から導出して補う置き場所。
 *
 * `pdfmake`（実体）は package.json に `exports` を持たないため、Node.js の nodenext
 * モジュール解決ではサブパス import（`pdfmake/interfaces`）を型として解決できない
 * （`@types/pdfmake` による型のシャドーイングはパッケージの bare 名にしか働かず、
 * サブパスには及ばない）。一方 bare import は解決できるため、公開 API の型は
 * ここを経由して bare import から辿れる型だけを使い、`pdfmake/interfaces` への
 * 参照を公開面に残さない。
 *
 * ここで定義する型は pdfmake の型を複製するのではなく、`createPdf()`/`addFonts()` の
 * 実際のシグネチャから導出する（値の型を引用するだけで、形を手で書き写さない）。
 */

/** pdfmake に渡す文書定義。createPdf() の第1引数の型をそのまま使う。 */
export type TDocumentDefinitions = Parameters<typeof createPdf>[0];
