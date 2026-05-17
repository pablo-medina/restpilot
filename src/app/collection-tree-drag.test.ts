import { describe, expect, it } from "vitest";
import { shouldOfferTreeRootDrop, treeRowAtPointer } from "./collection-tree-drag";

describe("collection-tree-drag", () => {
  it("does not offer root drop when the pointer is over a row", () => {
    const panel = document.createElement("div");
    const tree = document.createElement("section");
    tree.className = "tree";
    const row = document.createElement("div");
    row.className = "tree-row";
    row.dataset.treeId = "a";
    tree.append(row);
    panel.append(tree);
    document.body.append(panel);

    row.getBoundingClientRect = () =>
      ({
        left: 10,
        right: 110,
        top: 40,
        bottom: 66,
        width: 100,
        height: 26,
        x: 10,
        y: 40,
        toJSON: () => ({})
      }) as DOMRect;

    expect(treeRowAtPointer(tree, 50, 50)?.dataset.treeId).toBe("a");
    expect(shouldOfferTreeRootDrop(tree, panel, 50, 50)).toBe(false);

    panel.remove();
  });

  it("offers root drop on the toolbar only", () => {
    const panel = document.createElement("div");
    panel.innerHTML = `
      <div class="collection-sidebar-toolbar"></div>
      <section class="tree"><div class="tree-row" data-tree-id="a"></div></section>
    `;
    document.body.append(panel);

    const toolbar = panel.querySelector<HTMLElement>(".collection-sidebar-toolbar")!;
    const row = panel.querySelector<HTMLElement>(".tree-row")!;

    toolbar.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 200,
        top: 0,
        bottom: 32,
        width: 200,
        height: 32,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }) as DOMRect;

    row.getBoundingClientRect = () =>
      ({
        left: 10,
        right: 110,
        top: 40,
        bottom: 66,
        width: 100,
        height: 26,
        x: 10,
        y: 40,
        toJSON: () => ({})
      }) as DOMRect;

    panel.querySelector<HTMLElement>(".tree")!.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 200,
        top: 36,
        bottom: 200,
        width: 200,
        height: 164,
        x: 0,
        y: 36,
        toJSON: () => ({})
      }) as DOMRect;

    expect(shouldOfferTreeRootDrop(panel.querySelector(".tree")!, panel, 20, 16)).toBe(true);
    expect(shouldOfferTreeRootDrop(panel.querySelector(".tree")!, panel, 50, 50)).toBe(false);

    panel.remove();
  });
});
