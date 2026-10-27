import { Shape, type ShapeDescription, type ShapeStyle } from "../Shape.js";

export class Line extends Shape {
  #geometry: { x1: number; y1: number; x2: number; y2: number };

  public constructor(id: string, x1: number, y1: number, x2: number, y2: number, style: ShapeStyle = {}) {
    super(id, style);
    this.#geometry = this.checked({ x1, y1, x2, y2 });
  }

  public move(dx: number, dy: number): void {
    this.finite(dx, "dx");
    this.finite(dy, "dy");
    // 先计算并校验全部结果，再替换，避免后一个坐标溢出时留下部分修改。
    this.#geometry = this.checked({
      ...this.#geometry,
      x1: this.#geometry.x1 + dx,
      y1: this.#geometry.y1 + dy,
      x2: this.#geometry.x2 + dx,
      y2: this.#geometry.y2 + dy,
    });
  }

  public scale(factor: number): void {
    this.scaleFactor(factor);
    this.#geometry = this.checked({
      x1: this.#geometry.x1 * factor,
      y1: this.#geometry.y1 * factor,
      x2: this.#geometry.x2 * factor,
      y2: this.#geometry.y2 * factor,
    });
  }

  public clone(): Line {
    return new Line(this.id, this.#geometry.x1, this.#geometry.y1, this.#geometry.x2, this.#geometry.y2, this.copyStyle());
  }

  public describe(): ShapeDescription {
    return this.description("line", this.#geometry);
  }

  protected setGeometry(attribute: string, value: string | number): void {
    if (!["x1","y1","x2","y2"].includes(attribute)) {
      throw new Error(`unknown attribute: ${attribute}`);
    }
    const number = this.finite(value, attribute);
    this.#geometry = this.checked({ ...this.#geometry, [attribute]: number });
  }

  private checked(geometry: { x1: number; y1: number; x2: number; y2: number }): { x1: number; y1: number; x2: number; y2: number } {
    this.finite(geometry.x1, "x1");
    this.finite(geometry.y1, "y1");
    this.finite(geometry.x2, "x2");
    this.finite(geometry.y2, "y2");
    return geometry;
  }
}
