import { Shape, type ShapeDescription } from "./Shape.js";

export interface DocumentDescription {
  readonly width: number;
  readonly height: number;
  readonly children: readonly ShapeDescription[];
}

/** 所有权边界：输入及查询都是副本，写操作按 id 作用于文档。 */
export class SvgDocument {
  #width: number;
  #height: number;
  #roots: Shape[] = [];

  public constructor(width = 800, height = 600) {
    this.checkDimensions(width, height);
    this.#width = width;
    this.#height = height;
  }

  public get width(): number { return this.#width; }
  public get height(): number { return this.#height; }
  public get children(): readonly Shape[] {
    return Object.freeze(this.#roots.map(shape => shape.clone()));
  }

  public resize(width: number, height: number): void {
    this.checkDimensions(width, height);
    this.#width = width;
    this.#height = height;
  }

  public find(id: string): Shape | undefined {
    return this.findIn(this.#roots, id)?.clone();
  }

  public getParentId(id: string): string | null {
    this.requireShape(id);
    return this.parentIn(this.#roots, id, null)!;
  }

  /** index 是目标孩子列表中的插入位置；省略表示末尾。null 表示画布根。 */
  public add(shape: Shape, parentId: string | null = null, index?: number): void {
    const children = this.targetChildren(this.#roots, parentId);
    const candidateChildren = this.insert(children, shape.clone(), index);
    const candidate = this.replaceChildren(this.#roots, parentId, candidateChildren);
    this.commit(candidate);
  }

  public delete(id: string): Shape {
    const removed = this.requireShape(id).clone();
    this.commit(this.removeFrom(this.#roots, id));
    return removed;
  }

  /** 移入容器或调整同级顺序。index 按移除源节点后的目标列表解释。 */
  public reparent(id: string, parentId: string | null, index?: number): void {
    const moving = this.requireShape(id);
    this.targetChildren(this.#roots, parentId);
    if (parentId !== null && this.findIn([moving], parentId)) {
      throw new Error(`cannot move a container into itself or its descendant: ${id}`);
    }
    const withoutSource = this.removeFrom(this.#roots, id);
    const children = this.targetChildren(withoutSource, parentId);
    const inserted = this.insert(children, moving.clone(), index);
    this.commit(this.replaceChildren(withoutSource, parentId, inserted));
  }

  public move(id: string, dx: number, dy: number): void {
    this.edit(id, shape => shape.move(dx, dy));
  }

  public scale(id: string, factor: number): void {
    this.edit(id, shape => shape.scale(factor));
  }

  public set(id: string, attribute: string, value: string | number): void {
    this.edit(id, shape => shape.set(attribute, value));
  }

  public clone(): SvgDocument {
    const copy = new SvgDocument(this.#width, this.#height);
    copy.#roots = this.#roots.map(shape => shape.clone());
    return copy;
  }

  public describe(): DocumentDescription {
    return Object.freeze({
      width: this.#width, height: this.#height,
      children: Object.freeze(this.#roots.map(shape => shape.describe())),
    });
  }

  private edit(id: string, operation: (shape: Shape) => void): void {
    const candidate = this.requireShape(id).clone();
    operation(candidate);
    this.commit(this.replace(this.#roots, id, candidate));
  }

  private requireShape(id: string): Shape {
    const shape = this.findIn(this.#roots, id);
    if (!shape) throw new Error(`no such shape: ${id}`);
    return shape;
  }

  private findIn(nodes: readonly Shape[], id: string): Shape | undefined {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = this.findIn(node.children, id);
      if (found) return found;
    }
    return undefined;
  }

  private parentIn(nodes: readonly Shape[], id: string, parent: string | null): string | null | undefined {
    for (const node of nodes) {
      if (node.id === id) return parent;
      const found = this.parentIn(node.children, id, node.id);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  private targetChildren(nodes: readonly Shape[], parentId: string | null): readonly Shape[] {
    if (parentId === null) return nodes;
    const parent = this.findIn(nodes, parentId);
    if (!parent) throw new Error(`no such container: ${parentId}`);
    if (!parent.isContainer) throw new Error(`not a container: ${parentId}`);
    return parent.children;
  }

  private insert(nodes: readonly Shape[], shape: Shape, index = nodes.length): Shape[] {
    if (!Number.isInteger(index) || index < 0 || index > nodes.length) {
      throw new Error("child index out of range");
    }
    const result = [...nodes];
    result.splice(index, 0, shape);
    return result;
  }

  private replaceChildren(nodes: readonly Shape[], parentId: string | null, children: readonly Shape[]): Shape[] {
    if (parentId === null) return [...children];
    const parent = this.findIn(nodes, parentId)!;
    return this.replace(nodes, parentId, parent.withChildren(children));
  }

  private replace(nodes: readonly Shape[], id: string, replacement: Shape): Shape[] {
    return nodes.map(node => {
      if (node.id === id) return replacement;
      return node.isContainer ? node.withChildren(this.replace(node.children, id, replacement)) : node;
    });
  }

  private removeFrom(nodes: readonly Shape[], id: string): Shape[] {
    return nodes.filter(node => node.id !== id).map(node =>
      node.isContainer ? node.withChildren(this.removeFrom(node.children, id)) : node,
    );
  }

  /** 先完整验证并复制，再替换根；失败时文档仍持有原树。 */
  private commit(candidate: readonly Shape[]): void {
    const ids = new Set<string>();
    for (const shape of candidate) this.checkIds(shape.describe(), ids);
    const owned = candidate.map(shape => shape.clone());
    this.#roots = owned;
  }

  private checkIds(node: ShapeDescription, ids: Set<string>): void {
    if (ids.has(node.id)) throw new Error(`id already exists: ${node.id}`);
    ids.add(node.id);
    for (const child of node.children ?? []) this.checkIds(child, ids);
  }

  private checkDimensions(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("canvas dimensions must be finite positive numbers");
    }
  }
}
