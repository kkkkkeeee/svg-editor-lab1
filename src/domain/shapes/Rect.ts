import { Shape, type ShapeDescription, type ShapeStyle } from "../Shape.js";

export class Rect extends Shape {
  #geometry: { x: number; y: number; width: number; height: number };

  public constructor(id: string, x: number, y: number, width: number, height: number, style: ShapeStyle = {}) {
    super(id, style);
    this.#geometry = this.checked({ x, y, width, height });
  }

  public move(dx: number, dy: number): void {
    this.finite(dx, "dx");
    this.finite(dy, "dy");
    // 先计算并校验全部结果，再替换，避免后一个坐标溢出时留下部分修改。
    this.#geometry = this.checked({
      ...this.#geometry,
      x: this.#geometry.x + dx,
      y: this.#geometry.y + dy,
    });
  }

  public scale(factor: number): void {
    this.scaleFactor(factor);
    this.#geometry = this.checked({
      x: this.#geometry.x * factor,
      y: this.#geometry.y * factor,
      width: this.#geometry.width * factor,
      height: this.#geometry.height * factor,
    });
  }

  public clone(): Rect {
    return new Rect(this.id, this.#geometry.x, this.#geometry.y, this.#geometry.width, this.#geometry.height, this.copyStyle());
  }

  public describe(): ShapeDescription {
    return this.description("rect", this.#geometry);
  }

  protected setGeometry(attribute: string, value: string | number): void {
    if (!["x","y","width","height"].includes(attribute)) {
      throw new Error(`unknown attribute: ${attribute}`);
    }
    const number = this.finite(value, attribute);
    this.#geometry = this.checked({ ...this.#geometry, [attribute]: number });
  }

  private checked(geometry: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    this.finite(geometry.x, "x");
    this.finite(geometry.y, "y");
    this.nonNegative(geometry.width, "width");
    this.nonNegative(geometry.height, "height");
    return geometry;
  }
}
