import type { Position } from "./data";

const SVG = "http://www.w3.org/2000/svg";

export interface MapItem {
  key: string;
  kind: "sensor" | "cleaner";
  id: number;
  position: Position;
}

export interface MapView {
  selected: string;
  flagged: Set<string>;
  inUse: Set<string>;
  links: { to: string; miss?: boolean }[];
  labels: (key: string) => string;
}

interface Placed {
  item: MapItem;
  x: number;
  y: number;
  group: SVGGElement;
  label: SVGTextElement;
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}



// A plain equirectangular projection: longitude squeezed by cos(latitude) so the grid keeps
// roughly its real shape. It's only for drawing, the analysis uses the original distance.
export class SensorMap {
  private svg: SVGSVGElement;
  private linkLayer!: SVGGElement;
  private placed = new Map<string, Placed>();
  private view?: MapView;
  private sizeKey = "";
  private showAllIds = false;

  constructor(
    private container: HTMLElement,
    private items: MapItem[],
    private onSelect: (key: string) => void,
  ) {
    this.svg = el("svg", { role: "group", "aria-label": "Sensor map" });
    container.append(this.svg);
    new ResizeObserver(() => this.layout()).observe(container);
    window.addEventListener("resize", () => this.layout());
    this.layout();
  }

  private layout() {
    const available = Math.round(this.container.clientWidth);
    // On a wide screen the grid is limited by the window height, so the whole map fits without scrolling.
    const maxHeight = window.innerWidth >= 980 ? Math.max(380, window.innerHeight - 190) : Infinity;
    const sizeKey = `${available}x${maxHeight}`;
    if (available === 0 || sizeKey === this.sizeKey) return;
    this.sizeKey = sizeKey;
    const hadFocus = this.svg.contains(document.activeElement);

    const lats = this.items.map((i) => i.position.latitude);
    const lons = this.items.map((i) => i.position.longitude);
    const [latMin, latMax] = [Math.min(...lats), Math.max(...lats)];
    const [lonMin, lonMax] = [Math.min(...lons), Math.max(...lons)];
    const narrow = available < 520;
    const MARGIN = { top: 22, right: narrow ? 16 : 24, bottom: 40, left: narrow ? 46 : 64 };
    const squeeze = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
    const scale = Math.min(
      (available - MARGIN.left - MARGIN.right) / ((lonMax - lonMin) * squeeze),
      (maxHeight - MARGIN.top - MARGIN.bottom) / (latMax - latMin),
    );
    const width = Math.round((lonMax - lonMin) * squeeze * scale + MARGIN.left + MARGIN.right);
    const height = Math.round((latMax - latMin) * scale + MARGIN.top + MARGIN.bottom);
    const x = (lon: number) => MARGIN.left + (lon - lonMin) * squeeze * scale;
    const y = (lat: number) => MARGIN.top + (latMax - lat) * scale;

    this.svg.replaceChildren();
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.setAttribute("width", String(width));
    this.svg.setAttribute("height", String(height));

    const axes = el("g");
    for (let lat = Math.ceil(latMin); lat <= latMax; lat++) {
      axes.append(el("line", { class: "grid-line", x1: MARGIN.left - 16, x2: width - MARGIN.right, y1: y(lat), y2: y(lat) }));
      const tick = el("text", { class: "tick", x: MARGIN.left - (narrow ? 14 : 22), y: y(lat) + 4, "text-anchor": "end" });
      tick.textContent = `${lat}° N`;
      axes.append(tick);
    }
    for (let lon = Math.ceil(lonMin); lon <= lonMax; lon += 2) {
      axes.append(el("line", { class: "grid-line", x1: x(lon), x2: x(lon), y1: MARGIN.top - 6, y2: height - MARGIN.bottom + 6 }));
      const tick = el("text", { class: "tick", x: x(lon), y: height - 8, "text-anchor": "middle" });
      tick.textContent = lon === 0 ? "0°" : `${Math.abs(lon)}° ${lon < 0 ? "W" : "E"}`;
      axes.append(tick);
    }
    axes.setAttribute("aria-hidden", "true");
    this.linkLayer = el("g", { "aria-hidden": "true" });
    const itemLayer = el("g");
    this.svg.append(axes, this.linkLayer, itemLayer);

    const spacing = this.columnSpacing(x);
    const r = spacing < 40 ? 6 : 8;
    const hitSize = Math.max(spacing, 24);
    this.placed.clear();
    for (const item of this.items) {
      const px = x(item.position.longitude);
      const py = y(item.position.latitude);
      const group = el("g", { class: `item ${item.kind}`, role: "button", tabindex: -1 });
      group.append(el("rect", { class: "hit", x: px - hitSize / 2, y: py - hitSize / 2, width: hitSize, height: hitSize }));
      if (item.kind === "sensor") {
        group.append(el("circle", { class: "dot", cx: px, cy: py, r }));
        group.append(el("circle", { class: "ring", cx: px, cy: py, r: r + 4 }));
        group.append(el("circle", { class: "focus", cx: px, cy: py, r: r + 8 }));
      } else {
        const s = r * 2 + 2;
        group.append(el("rect", { class: "dot", x: px - s / 2, y: py - s / 2, width: s, height: s, rx: 1 }));
        group.append(el("rect", { class: "ring", x: px - s / 2 - 4, y: py - s / 2 - 4, width: s + 8, height: s + 8, rx: 1 }));
        group.append(el("rect", { class: "focus", x: px - s / 2 - 8, y: py - s / 2 - 8, width: s + 16, height: s + 16, rx: 1 }));
      }
      // Cleaners sit between grid rows, so their name goes underneath to stay clear of the sensor numbers.
      const label =
        item.kind === "sensor"
          ? el("text", { class: "label", x: px + r + 3, y: py - r - 2 })
          : el("text", { class: "label", x: px, y: py + r + 18, "text-anchor": "middle" });
      group.append(label);
      group.addEventListener("click", () => this.onSelect(item.key));
      group.addEventListener("keydown", (event) => this.onKey(event, item.key));
      itemLayer.append(group);
      this.placed.set(item.key, { item, x: px, y: py, group, label });
    }

    this.showAllIds = spacing >= 56;
    if (this.view) this.update(this.view);
    if (hadFocus) this.focusSelected();
  }

  private columnSpacing(x: (lon: number) => number): number {
    const lons = [...new Set(this.items.filter((i) => i.kind === "sensor").map((i) => i.position.longitude))].sort(
      (a, b) => a - b,
    );
    return lons.length > 1 ? x(lons[1]) - x(lons[0]) : 60;
  }

  update(view: MapView) {
    this.view = view;
    for (const [key, p] of this.placed) {
      const selected = key === view.selected;
      const inUse = view.inUse.has(key);
      p.group.classList.toggle("selected", selected);
      p.group.classList.toggle("neighbour", inUse);
      p.group.classList.toggle("flagged", view.flagged.has(key));
      p.group.setAttribute("tabindex", selected ? "0" : "-1");
      p.group.setAttribute("aria-pressed", String(selected));
      p.group.setAttribute("aria-label", view.labels(key));
      const named = selected || inUse;
      // A cleaner's name only shows once it's selected, the legend already says what the squares are.
      const shown = p.item.kind === "cleaner" ? selected : named || this.showAllIds;
      p.label.textContent = shown ? this.shortName(p.item) : "";
      p.label.classList.toggle("strong", named);
    }

    this.linkLayer.replaceChildren();
    const from = this.placed.get(view.selected);
    if (!from) return;
    for (const link of view.links) {
      const to = this.placed.get(link.to);
      if (!to) continue;
      this.linkLayer.append(
        el("line", { class: link.miss ? "link miss" : "link", x1: from.x, y1: from.y, x2: to.x, y2: to.y }),
      );
    }
  }

  private shortName(item: MapItem): string {
    return item.kind === "sensor" ? String(item.id) : `Cleaner ${item.id}`;
  }

  focusSelected() {
    if (this.view) this.placed.get(this.view.selected)?.group.focus();
  }

  private onKey(event: KeyboardEvent, key: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.onSelect(key);
      return;
    }
    const direction = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const next = this.nearestInDirection(key, direction[0], direction[1]);
    if (next) {
      this.onSelect(next);
      this.focusSelected();
    }
  }

  private nearestInDirection(key: string, dx: number, dy: number): string | undefined {
    const from = this.placed.get(key)!;
    let best: string | undefined;
    let bestScore = Infinity;
    for (const [other, p] of this.placed) {
      if (other === key) continue;
      const along = (p.x - from.x) * dx + (p.y - from.y) * dy;
      if (along <= 1) continue;
      const across = Math.abs((p.x - from.x) * dy) + Math.abs((p.y - from.y) * dx);
      const score = along + 3 * across;
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    return best;
  }
}
