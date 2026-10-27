import { Shape, type ShapeDescription, type ShapeStyle } from "../Shape.js";

export class Ellipse extends Shape {
  #geometry: { cx: number; cy: number; rx: number; ry: number };

  public constructor(id: string, cx: number, cy: number, rx: number, ry: number, style: ShapeStyle = {}) {
    super(id, style);
    this.#geometry = this.checked({ cx, cy, rx, ry });
  }

  public move(dx: number, dy: number): void {
    this.finite(dx, "dx");
    this.finite(dy, "dy");
    // 先计算并校验全部结果，再替换，避免后一个坐标溢出时留下部分修改。
    this.#geometry = this.checked({
      ...this.#geometry,
      cx: this.#geometry.cx + dx,
      cy: this.#geometry.cy + dy,
    });
  }

  public scale(factor: number): void {
    this.scaleFactor(factor);
    this.#geometry = this.checked({
      cx: this.#geometry.cx * factor,
      cy: this.#geometry.cy * factor,
      rx: this.#geometry.rx * factor,
      ry: this.#geometry.ry * factor,
    });
  }

  public clone(): Ellipse {
    return new Ellipse(this.id, this.#geometry.cx, this.#geometry.cy, this.#geometry.rx, this.#geometry.ry, this.copyStyle());
  }

  public describe(): ShapeDescription {
    return this.description("ellipse", this.#geometry);
  }

  protected setGeometry(attribute: string, value: string | number): void {
    if (!["cx","cy","rx","ry"].includes(attribute)) {
      throw new Error(`unknown attribute: ${attribute}`);
    }
    const number = this.finite(value, attribute);
    this.#geometry = this.checked({ ...this.#geometry, [attribute]: number });
  }

  private checked(geometry: { cx: number; cy: number; rx: number; ry: number }): { cx: number; cy: number; rx: number; ry: number } {
    this.finite(geometry.cx, "cx");
    this.finite(geometry.cy, "cy");
    this.nonNegative(geometry.rx, "rx");
    this.nonNegative(geometry.ry, "ry");
    return geometry;
  }
}
