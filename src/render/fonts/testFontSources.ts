import type { FontSourceMap } from "./fonts.ts";

/**
 * pipeline.test.ts・render.test.ts が実フォントで renderToBuffer() まで通すための、
 * テスト専用のフォント選定（sample/generate.ts と同じ Noto Sans CJK JP・Roboto Mono を
 * 使う。ライセンス根拠は sample/licenses/README.md 参照）。
 *
 * どのフォントを使うかは呼び出し側が決めるものであり fonts.ts 自身は持たない
 * （CLAUDE.md の「関心事の分離」参照）ため、この選定はテストコード側に置く。
 * `*.test.ts` にしていないのは、`node --test 'src/**\/*.test.ts'`（package.json）が
 * このファイル自体をテストスイートとして拾わないようにするため。
 */

export const TEST_BODY_FONT = "NotoSansJP";
export const TEST_CODE_FONT = "Mono";

const NOTO_SANS_CJK_JP_BASE = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese";

const NOTO_SANS_CJK_JP_LIGHT = { filename: "NotoSansCJKjp-Light.otf", url: `${NOTO_SANS_CJK_JP_BASE}/NotoSansCJKjp-Light.otf` };
const NOTO_SANS_CJK_JP_MEDIUM = { filename: "NotoSansCJKjp-Medium.otf", url: `${NOTO_SANS_CJK_JP_BASE}/NotoSansCJKjp-Medium.otf` };
const ROBOTO_MONO_REGULAR = {
  filename: "RobotoMono-Regular.ttf",
  url: "https://raw.githubusercontent.com/googlefonts/robotomono/main/fonts/ttf/RobotoMono-Regular.ttf",
};

export const TEST_FONT_SOURCES: FontSourceMap = {
  [TEST_BODY_FONT]: {
    // Noto Sans CJK JP に Italic/BoldItalic は存在しない（CJK フォント共通の仕様）ため、
    // 呼び出し側の判断として正体（Light/Medium）をそのまま流用する。
    normal: NOTO_SANS_CJK_JP_LIGHT,
    bold: NOTO_SANS_CJK_JP_MEDIUM,
    italics: NOTO_SANS_CJK_JP_LIGHT,
    bolditalics: NOTO_SANS_CJK_JP_MEDIUM,
  },
  [TEST_CODE_FONT]: {
    // code 要素は通常太字・斜体にならないが、pdfmake は使う可能性のある書体をすべて
    // 登録済みであることを要求するため、呼び出し側の判断として全書体に Regular を流用する。
    normal: ROBOTO_MONO_REGULAR,
    bold: ROBOTO_MONO_REGULAR,
    italics: ROBOTO_MONO_REGULAR,
    bolditalics: ROBOTO_MONO_REGULAR,
  },
};
