# sample/generate.ts が埋め込むフォントのライセンス

remark-pdfmake 自体はどのフォントを使うか決めない（`fonts.ts` は呼び出し側が指示した
`FontSourceMap` を取得するだけ。ARCHITECTURE.md の「関心事の分離」参照）。このディレクトリ
には、`sample/generate.ts` が選んでダウンロード・埋め込みに使うフォントのライセンス原文を
そのまま置く（`notofonts/noto-cjk` / `google/fonts` の配布元から取得したファイルをそのまま
コピーしたもの。要約や書き起こしはしていない）。

## sample/generate.ts が選ぶフォントとライセンス

| 用途 | フォント | ウェイト | ライセンス | 配布元 |
|---|---|---|---|---|
| 本文・見出し | Noto Sans CJK JP | Light（normal）/ Medium（bold） | SIL Open Font License 1.1 | `notofonts/noto-cjk`（`Sans/OTF/Japanese/`） |
| code インライン | Roboto Mono | Regular | SIL Open Font License 1.1 | `google/fonts`（`ofl/robotomono/`） |

`google/fonts` リポジトリはライセンス別ディレクトリ（`apache/` / `ofl/` / `ufl/`）で
構成されており、Roboto Mono は `ofl/robotomono/` 配下にある（`OFL-RobotoMono.txt`
参照）。Apache License 2.0 のフォントではない。

## 埋め込み・配布が許諾されている根拠

`OFL-NotoSansCJK.txt` / `OFL-RobotoMono.txt`（いずれも取得元の原文そのまま）に、
以下の記載がある（両ファイル共通、抜粋・原文まま）:

> As long as they are not sold by themselves, the fonts, including any derivative
> works, can be bundled, embedded, redistributed and/or sold with any software
> provided that any reserved names are not used by derivative works. The fonts
> and derivatives, however, cannot be released under any other type of license.
> The requirement for fonts to remain under this license does not apply to any
> document created using the fonts or their derivatives.

これにより、
1. フォント（のサブセットを含む派生物）を**アプリケーションに埋め込んで配布してよい**こと、
2. **フォントを使って作成した文書（`sample/generate.ts` が生成する PDF）には OFL の継承
   義務が及ばない**こと

の2点が明示されている。したがって、生成した PDF に Noto Sans CJK JP / Roboto Mono の
サブセットを埋め込んだままエンドユーザーに配布してよい。

## フォントファイル自体の調達方法

フォントファイル本体（各ウェイト 15MB 超）はリポジトリにはコミットしない。
`sample/generate.ts` がこの2書体・取得元 URL を指定し、`fonts.ts` の `loadFonts()` が
初回実行時に配布元から取得して、指定した `cacheDir`（git 管理外）にキャッシュする。
2回目以降はキャッシュを再利用し、ネットワークアクセスは発生しない。

生成された PDF に埋め込まれるのは pdfkit によるサブセット埋め込み（実際に使用した
グリフのみ）であり、フォントファイル全体を配布するものではない。

## 設計上の補足

- 本文フォントのウェイトは Regular/Bold ではなく Light/Medium を採用している。
- Noto Sans CJK JP に Italic/BoldItalic は存在しない（CJK フォント共通の仕様）。
  `sample/generate.ts` は Light/Medium をそのまま流用するよう指定している
  （斜体表示にはならない）。
