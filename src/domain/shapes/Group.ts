import { Shape, type ShapeDescription, type ShapeStyle } from "../Shape.js";

/** 独占子节点副本；没有可从外部修改的父指针或子节点集合。 */
export class Group extends Shape {
  #children: Shape[];

  public constructor(id: string, children: readonly Shape[] = [], style: ShapeStyle = {}) {
    super(id, style);
    const candidate = children.map(child => child.clone());
    const ids = new Set([id]);
    for (const child of candidate) this.checkIds(child.describe(), ids);
    this.#children = candidate;
  }

  public override get isContainer(): boolean { return true; }

  public override get children(): readonly Shape[] {
    return Object.freeze(this.#children.map(child => child.clone()));
  }

  public override withChildren(children: readonly Shape[]): Group {
    return new Group(this.id, children, this.copyStyle());
  }

  public move(dx: number, dy: number): void {
    this.finite(dx, "dx");
    this.finite(dy, "dy");
    const candidate = this.#children.map(child => child.clone());
    for (const child of candidate) child.move(dx, dy);
    this.#children = candidate;
  }

  public scale(factor: number): void {
    this.scaleFactor(factor);
    const candidate = this.#children.map(child => child.clone());
    for (const child of candidate) child.scale(factor);
    this.#children = candidate;
  }

  public clone(): Group {
    return this.withChildren(this.#children);
  }

  public describe(): ShapeDescription {
    return Object.freeze({
      ...this.description("g", {}),
      children: Object.freeze(this.#children.map(child => child.describe())),
    });
  }

  protected setGeometry(attribute: string, _value: string | number): void {
    throw new Error(`unknown attribute: ${attribute}`);
  }

  private checkIds(node: ShapeDescription, ids: Set<string>): void {
    if (ids.has(node.id)) throw new Error(`id already exists: ${node.id}`);
    ids.add(node.id);
    for (const child of node.children ?? []) this.checkIds(child, ids);
  }
}
