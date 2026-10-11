// 工坊畫面：材料放進格子、點兩格搬動或合成、商品賣掉。

export class WorkshopView {
  constructor({ materials, grid, products }, recipes, icons, act) {
    this.materialsRoot = materials;
    this.gridRoot = grid;
    this.productsRoot = products;
    this.recipes = recipes;
    this.icons = icons;
    this.act = act;
    this.picked = null;
  }

  chip(chain, tier, text, onClick) {
    const chip = document.createElement("button");
    chip.className = "item";
    const icon = document.createElement("span");
    icon.className = "icon";
    this.icons.apply(icon, chain, tier);
    chip.append(icon, text);
    chip.onclick = onClick;
    return chip;
  }

  setState(state) {
    this.materialsRoot.replaceChildren(...Object.entries(state.materials).map(([chain, count]) => {
      const label = document.createElement("span");
      label.innerHTML = `${this.recipes[chain]?.label ?? chain}<span class="count">×${count}</span>`;
      return this.chip(chain, 0, label, () => this.act({ kind: "workshop_put", chain }));
    }));
    if (!this.materialsRoot.children.length) this.materialsRoot.textContent = "沒有材料了，去三消消一盤。";

    const cells = state.workshop.cells.map((item, index) => {
      const cell = document.createElement("div");
      cell.className = "cell" + (item ? " filled" : "") + (this.picked === index ? " on" : "");
      if (item) {
        const recipe = this.recipes[item.chain];
        const icon = document.createElement("div");
        icon.className = "cell-icon";
        this.icons.apply(icon, item.chain, item.tier);
        const tier = document.createElement("div");
        tier.className = "tier";
        tier.textContent = `${recipe?.tiers[item.tier] ?? item.chain} ${item.tier + 1}/${(recipe?.tiers.length ?? 1) - 1}`;
        cell.append(icon, tier);
      }
      cell.onclick = () => this.tap(index, item);
      if (item) cell.onpointerdown = (e) => this.dragStart(e, index, cell);
      return cell;
    });
    this.gridRoot.replaceChildren(...cells);

    this.productsRoot.replaceChildren(...Object.entries(state.products).map(([chain, count]) => {
      const recipe = this.recipes[chain];
      const label = document.createElement("span");
      label.innerHTML = `${recipe?.tiers.at(-1) ?? chain}<span class="count">×${count}</span><span class="price">$${recipe?.price ?? "?"}</span>`;
      return this.chip(chain, (recipe?.tiers.length ?? 1) - 1, label, () => {});
    }));
    if (!this.productsRoot.children.length) this.productsRoot.textContent = "還沒做出商品。";
    else this.productsRoot.title = "商品在咖啡廳賣給客人";
  }

  /** 拖曳搬動或合成：按住有東西的格子拖到別格放開；拖得很短就交給 click 當點一下。 */
  dragStart(e, index, cell) {
    const startX = e.clientX, startY = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
        ghost = cell.cloneNode(true);
        ghost.classList.add("ghost");
        const rect = cell.getBoundingClientRect();
        ghost.style.width = `${rect.width}px`; ghost.style.height = `${rect.height}px`;
        document.body.append(ghost);
        cell.classList.add("lifted");
      }
      ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`;
    };
    const finish = (ev) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish);
      if (!ghost) return;
      ghost.remove(); cell.classList.remove("lifted");
      this.dragged = true; setTimeout(() => { this.dragged = false; }, 0);   // 只擋掉緊接著的那一下 click
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".cell");
      const to = target ? [...this.gridRoot.children].indexOf(target) : -1;
      this.picked = null;
      if (to >= 0 && to !== index) this.act({ kind: "workshop_move", from: index, to });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  tap(index, item) {
    if (this.dragged) { this.dragged = false; return; }
    if (this.picked === null) { if (item) this.picked = index; }
    else { const from = this.picked; this.picked = null; if (from !== index) this.act({ kind: "workshop_move", from, to: index }); }
    [...this.gridRoot.children].forEach((cell, i) => cell.classList.toggle("on", i === this.picked));
  }
}
