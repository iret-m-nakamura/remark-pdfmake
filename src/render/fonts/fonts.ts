import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as fontkit from "fontkit";
import type { TFontDictionary } from "../pdfmakeTypes.ts";

/**
 * フォントに関する関心事（実ファイルの取得・キャッシュ、名前ごとの束ね）を引き受ける層。
 * どのフォントを使うか（名前・取得元 URL）はここでは一切決めない。呼び出し側が
 * FontSourceMap で指示した内容を解決するだけにする（CLAUDE.md の「関心事の分離」参照）。
 */

export interface FontSpec {
  /** cacheDir 内でのファイル名 */
  filename: string;
  /** 取得元 URL */
  url: string;
}

/** 1フォントファミリーが持ちうる4書体の取得元。指定しなかった書体は TFontDictionary
 * 側にも登録しない（pdfmake は書体ごとの省略を許すため、埋め合わせの代用フォントを
 * こちらから選ばない。どの書体にどのファイルを使うかは呼び出し側の指示だけに従う）。 */
export interface FontFaceSources {
  normal: FontSpec;
  bold?: FontSpec;
  italics?: FontSpec;
  bolditalics?: FontSpec;
}

/** キー＝呼び出し側が決めるフォント名（`defaultStyle.font`・theme の `font` 値と
 * 一致させる名前をそのまま使う）。 */
export type FontSourceMap = Record<string, FontFaceSources>;

/** 取得中の宛先パスごとの Promise。同じファイルを複数の書体（normal/bold/italics/
 * bolditalics）に指定した場合、`loadFonts()` が並行して ensureFont() を呼ぶため、
 * 同じ宛先への fetch が重複しないよう進行中の Promise を共有する（完了後は
 * 削除し、失敗時の再試行やキャッシュ更新後の再実行を妨げない）。 */
const pendingFetches = new Map<string, Promise<string>>();

/** cacheDir にフォントが無ければ取得して保存し、パスを返す。あればダウンロードしない。 */
export async function ensureFont(cacheDir: string, spec: FontSpec): Promise<string> {
  const dest = join(cacheDir, spec.filename);
  if (existsSync(dest)) return dest;

  const pending = pendingFetches.get(dest);
  if (pending) return pending;

  const fetchAndSave = (async () => {
    mkdirSync(cacheDir, { recursive: true });
    process.stderr.write(`[pdfmake/fonts] フォントを取得中: ${spec.filename}\n`);
    const res = await fetch(spec.url);
    if (!res.ok) throw new Error(`フォント取得に失敗しました（${res.status}）: ${spec.filename}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return dest;
  })();
  pendingFetches.set(dest, fetchAndSave);
  try {
    return await fetchAndSave;
  } finally {
    pendingFetches.delete(dest);
  }
}

/**
 * 呼び出し側が指示した FontSourceMap を解決し、renderToBuffer()/renderToFile() に
 * そのまま渡せる TFontDictionary を組み立てる。どのフォントをどの名前で使うかは
 * 呼び出し側が sources のキー・値として決めたとおりにするだけで、この関数自身は
 * 名前も取得元も選ばない。
 */
export async function loadFonts(cacheDir: string, sources: FontSourceMap): Promise<TFontDictionary> {
  const fonts: TFontDictionary = {};
  await Promise.all(
    Object.entries(sources).map(async ([name, faces]) => {
      const resolve = (spec: FontSpec | undefined) => (spec ? ensureFont(cacheDir, spec) : undefined);
      const [normal, bold, italics, bolditalics] = await Promise.all([
        resolve(faces.normal),
        resolve(faces.bold),
        resolve(faces.italics),
        resolve(faces.bolditalics),
      ]);
      // 指定しなかった書体はキーごと省略する（FontFaceSources のコメント参照）。
      fonts[name] = {
        normal,
        ...(bold !== undefined ? { bold } : {}),
        ...(italics !== undefined ? { italics } : {}),
        ...(bolditalics !== undefined ? { bolditalics } : {}),
      };
    }),
  );
  return fonts;
}

/**
 * 指定したフォントファイルが、ある文字（Unicode コードポイント）のグリフを持つかどうかを
 * 判定する関数を返す。withFontFallback() の opts.supports にそのまま渡せる。特定の
 * フォント（等幅用途など）に限らず、解決済みの任意のフォントパスに対して使える。
 */
export function fontSupports(fontPath: string): (codePoint: number) => boolean {
  const font = fontkit.openSync(fontPath) as fontkit.Font;
  return (codePoint: number) => font.hasGlyphForCodePoint(codePoint);
}
