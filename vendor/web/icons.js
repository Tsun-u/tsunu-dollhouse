// 材料與商品的圖示：圖示表每列＝一條配方鏈、每欄＝階數。咖啡廳一張（4 欄 × 6 列），商店街一張（4 欄 × 11 列），配方的 sheet 決定用哪張。圖還沒到時退回色塊加字。

const SHEETS = {   // 相對頁面的網址：小屋與兒童版都從自己的根目錄找
  cafe: { url: "assets/items/materials_sheet.png", cols: 4, rows: 6 },
  street: { url: "assets/items/materials_sheet_street.png", cols: 4, rows: 11 },
};

export const MATERIAL_COLORS = {
  bean: { label: "豆", color: "#7a4a2a" }, milk: { label: "奶", color: "#9db8d9" }, sugar: { label: "糖", color: "#e0a94a" },
  flour: { label: "粉", color: "#c9b58a" }, fruit: { label: "果", color: "#d4605a" }, flower: { label: "花", color: "#c47ab0" },
  rice: { label: "米", color: "#efe6cf" }, egg: { label: "蛋", color: "#f2d6a2" }, tealeaf: { label: "茶", color: "#7c8f4e" }, candy: { label: "糖", color: "#f08fb3" },
  cotton: { label: "棉", color: "#e8e8e2" }, linen: { label: "麻", color: "#cdbb94" }, wool: { label: "毛", color: "#d9c3a5" },
  button: { label: "扣", color: "#c9a27a" }, denim: { label: "丹", color: "#4f6f9f" }, silk: { label: "絲", color: "#b89ac8" }, wheat: { label: "麥", color: "#d9b56a" },
};

export class IconSheet {
  /** version：接在圖示表網址後面，圖換了網址就變，Cloudflare 與瀏覽器不會沿用快取裡的舊圖。 */
  constructor(recipes, onReady, version = "") {
    this.recipes = recipes;
    this.images = {};
    this.urls = Object.fromEntries(Object.entries(SHEETS).map(([name, sheet]) => [name, version ? `${sheet.url}?v=${version}` : sheet.url]));
    for (const name of Object.keys(SHEETS)) {
      const image = new Image();
      image.onload = () => { image.ready = true; onReady(); };
      image.src = this.urls[name];
      this.images[name] = image;
    }
  }

  /** 這條鏈的圖示在哪張表的哪一列；表還沒載好就 null。 */
  cellOf(chain) {
    const recipe = this.recipes[chain];
    const name = recipe?.sheet ?? "cafe";
    const image = this.images[name];
    return recipe?.row !== undefined && image?.ready ? { image, sheet: SHEETS[name], url: this.urls[name], row: recipe.row } : null;
  }

  /** 在畫布上畫某條鏈第 tier 階的圖示；沒有圖示表就畫色塊。 */
  drawIcon(ctx, chain, tier, x, y, size) {
    const cell = this.cellOf(chain);
    if (cell) {
      const cw = cell.image.naturalWidth / cell.sheet.cols, ch = cell.image.naturalHeight / cell.sheet.rows;
      ctx.drawImage(cell.image, tier * cw, cell.row * ch, cw, ch, x, y, size, size);
    } else {
      ctx.fillStyle = MATERIAL_COLORS[chain]?.color ?? "#999"; ctx.fillRect(x, y, size, size);
    }
  }

  /** 把元素畫成某條鏈第 tier 階的圖示；沒有圖示表就上色塊與短字。 */
  apply(element, chain, tier) {
    const cell = this.cellOf(chain);
    if (cell) {
      const { sheet: { cols, rows }, url } = cell;
      element.style.background = `url(${url}) ${(tier / (cols - 1)) * 100}% ${(cell.row / (rows - 1)) * 100}% / ${cols * 100}% ${rows * 100}% no-repeat`;
      element.textContent = "";
    } else {
      element.style.background = MATERIAL_COLORS[chain]?.color ?? "#999";
      element.textContent = MATERIAL_COLORS[chain]?.label ?? chain;
    }
  }
}
