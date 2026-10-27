import { Shape, type ShapeDescription, type ShapeStyle } from "../Shape.js";

export class Text extends Shape {
  #geometry: { x: number; y: number };
  #text: string;

  public constructor(id: string, x: number, y: number, text: string, style: ShapeStyle = {}) {
    super(id, style);
    this.#geometry = this.checked({ x, y });
    if (typeof text !== "string") throw new Error("text must be a string");
    this.#text = text;
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
    });
  }

  public clone(): Text {
    return new Text(this.id, this.#geometry.x, this.#geometry.y, this.#text, this.copyStyle());
  }

  public describe(): ShapeDescription {
    return this.description("text", this.#geometry, this.#text);
  }

  protected setGeometry(attribute: string, value: string | number): void {
    if (attribute === "text") {
      if (typeof value !== "string") throw new Error("text must be a string");
      this.#text = value;
      return;
    }
    if (!["x","y"].includes(attribute)) {
      throw new Error(`unknown attribute: ${attribute}`);
    }
    const number = this.finite(value, attribute);
    this.#geometry = this.checked({ ...this.#geometry, [attribute]: number });
  }

  private checked(geometry: { x: number; y: number }): { x: number; y: number } {
    this.finite(geometry.x, "x");
    this.finite(geometry.y, "y");
    return geometry;
  }
}
