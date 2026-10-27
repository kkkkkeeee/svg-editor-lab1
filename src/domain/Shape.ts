export interface ShapeStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly "stroke-width"?: number;
}

export interface ShapeDescription {
  readonly id: string;
  readonly type: string;
  readonly attributes: Readonly<Record<string, string | number>>;
  readonly text?: string;
  readonly children?: readonly ShapeDescription[];
}

/** 图形行为的公共契约；不负责终端、文件或文档级 id 唯一性。 */
export abstract class Shape {
  readonly #id: string;
  #style: ShapeStyle = {};

  protected constructor(id: string, style: ShapeStyle = {}) {
    if (typeof id !== "string" || id.length === 0 || /\s/.test(id)) {
      throw new Error("id must be non-empty and contain no whitespace");
    }
    this.#id = id;
    for (const [attribute, value] of Object.entries(style)) {
      if (!["fill", "stroke", "stroke-width"].includes(attribute)) {
        throw new Error(`unknown attribute: ${attribute}`);
      }
      if (value !== undefined) this.setStyle(attribute, value);
    }
  }

  public get id(): string { return this.#id; }
  public abstract move(dx: number, dy: number): void;
  public abstract scale(factor: number): void;
  public abstract describe(): ShapeDescription;
  public abstract clone(): Shape;

  /** 查询返回独立副本；叶子没有孩子。 */
  public get children(): readonly Shape[] { return Object.freeze([]); }
  public get isContainer(): boolean { return false; }

  /** 结构变更产生新节点，不修改原节点。 */
  public withChildren(_children: readonly Shape[]): Shape {
    throw new Error(`not a container: ${this.id}`);
  }

  protected copyStyle(): ShapeStyle { return { ...this.#style }; }

  public set(attribute: string, value: string | number): void {
    if (["fill", "stroke", "stroke-width"].includes(attribute)) {
      this.setStyle(attribute, value);
      return;
    }
    this.setGeometry(attribute, value);
  }

  protected abstract setGeometry(attribute: string, value: string | number): void;

  protected finite(value: unknown, name: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number`);
    }
    return value;
  }

  protected nonNegative(value: unknown, name: string): number {
    const number = this.finite(value, name);
    if (number < 0) throw new Error(`${name} must be non-negative`);
    return number;
  }

  protected scaleFactor(value: number): number {
    this.finite(value, "scale factor");
    if (value <= 0) throw new Error("scale factor must be positive");
    return value;
  }

  protected description(
    type: string, geometry: Readonly<Record<string, number>>, text?: string,
  ): ShapeDescription {
    const attributes = Object.freeze({ ...geometry, ...this.#style });
    return Object.freeze({
      id: this.id, type, attributes,
      ...(text === undefined ? {} : { text }),
    });
  }

  private setStyle(attribute: string, value: string | number): void {
    if (attribute === "stroke-width") {
      const width = this.nonNegative(value, attribute);
      this.#style = { ...this.#style, "stroke-width": width };
    } else {
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${attribute} must be a non-empty string`);
      }
      this.#style = { ...this.#style, [attribute]: value };
    }
  }
}
