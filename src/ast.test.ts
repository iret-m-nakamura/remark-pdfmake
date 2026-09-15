import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "./ast.ts";
import type { Element } from "hast";

describe("parseMarkdown()", () => {
  it("見出しを h1〜h6 の element ノードとして解析する", () => {
    const root = parseMarkdown("## 見出し");
    const node = root.children[0] as Element;
    assert.equal(node.type, "element");
    assert.equal(node.tagName, "h2");
  });

  it("GFM テーブルを table > thead/tbody > tr > th/td 構造として解析する", () => {
    const root = parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n");
    const table = root.children.find((c): c is Element => c.type === "element" && c.tagName === "table")!;
    assert.ok(table, "table 要素が見つかること");
    const sections = table.children.filter((c): c is Element => c.type === "element");
    const [thead, tbody] = sections;
    assert.equal(thead.tagName, "thead");
    assert.equal(tbody.tagName, "tbody");
  });

  it("箇条書きを ul > li として解析する（li の間の空白テキストノードは無視する）", () => {
    const root = parseMarkdown("- a\n- b\n");
    const node = root.children.find((c): c is Element => c.type === "element" && c.tagName === "ul")!;
    assert.ok(node, "ul 要素が見つかること");
    const items = node.children.filter((c): c is Element => c.type === "element" && c.tagName === "li");
    assert.equal(items.length, 2);
  });

  it("引用を blockquote 要素として解析する", () => {
    const root = parseMarkdown("> quote\n");
    assert.equal((root.children[0] as Element).tagName, "blockquote");
  });

  it("区切り線を hr 要素として解析する", () => {
    const root = parseMarkdown("---\n");
    assert.equal((root.children[0] as Element).tagName, "hr");
  });

  it("本文中の生 HTML（<br>）をネストした element ノードとして解釈する（mdast にはできない）", () => {
    const root = parseMarkdown("1行目<br>2行目");
    const p = root.children[0] as Element;
    const br = p.children.find((c) => c.type === "element" && c.tagName === "br");
    assert.ok(br, "<br> が element として見つかること");
  });

  it("ペアタグ（<small>...</small>）を開始・終了が対応した element として解釈する", () => {
    const root = parseMarkdown("<small>小さい文字</small>");
    const p = root.children[0] as Element;
    const small = p.children.find((c) => c.type === "element" && c.tagName === "small") as Element;
    assert.ok(small, "<small> が element として見つかること");
    assert.equal(small.children.length, 1);
    assert.equal((small.children[0] as { value: string }).value, "小さい文字");
  });
});
