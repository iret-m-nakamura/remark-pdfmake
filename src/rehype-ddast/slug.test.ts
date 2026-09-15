import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSlugger } from "./slug.ts";

describe("createSlugger()", () => {
  it("数字・英字・全角文字が混在する見出しから marked 互換のスラッグを生成する（数字始まり・記号除去・全角括弧の非除去・括弧内の「+」が二重ハイフンになる、を網羅）", () => {
    const cases: [heading: string, expected: string][] = [
      ["1. Example セクション", "1-example-セクション"],
      ["サンプル見出し", "サンプル見出し"],
      ["付録 A. サンプル詳細", "付録-a-サンプル詳細"],
      ["付録 B. サンプル 詳細（Example Details）", "付録-b-サンプル-詳細（example-details）"],
      ["付録 C. サンプル 全件（Foo + Bar）", "付録-c-サンプル-全件（foo--bar）"],
    ];
    for (const [heading, expected] of cases) {
      assert.equal(createSlugger()(heading), expected, heading);
    }
  });

  it("全角括弧は除去せず、ASCII の記号・空白は除去してハイフンに畳み込む", () => {
    const slug = createSlugger();
    assert.equal(slug("A（B）"), "a（b）");
    assert.equal(slug("A + B"), "a--b");
  });

  it("同一文書内で同じ見出しが複数回現れた場合は -1, -2 ... を付与する（marked の Slugger と同じ）", () => {
    const slug = createSlugger();
    assert.equal(slug("Section (Detail)"), "section-detail");
    assert.equal(slug("Section (Detail)"), "section-detail-1");
    assert.equal(slug("Section (Detail)"), "section-detail-2");
  });

  it("createSlugger() の呼び出しごとに独立した状態を持つ（文書をまたいで重複カウントを引きずらない）", () => {
    const a = createSlugger();
    const b = createSlugger();
    assert.equal(a("見出し"), "見出し");
    assert.equal(b("見出し"), "見出し");
  });
});
