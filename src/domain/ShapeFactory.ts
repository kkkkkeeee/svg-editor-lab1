import { Shape } from "./Shape.js";
import { Rect } from "./shapes/Rect.js";
import { Circle } from "./shapes/Circle.js";
import { Ellipse } from "./shapes/Ellipse.js";
import { Line } from "./shapes/Line.js";
import { Text } from "./shapes/Text.js";
import { Group } from "./shapes/Group.js";

/** 唯一的图形类型名分派点；按课程要求列为待重构，不提供插件注册。 */
export class ShapeFactory {
  public create(type: string, id: string, params: readonly (number | string)[] = []): Shape {
    return this.construct(type, id, params, false);
  }

  /** 文本参数的数值槽转换仍集中在同一个类型分派，样式和文本不强制转数值。 */
  public createFromTokens(type: string, id: string, params: readonly string[]): Shape {
    return this.construct(type, id, params, true);
  }

  /** 命名属性入口仍复用唯一类型分派；几何和样式合法性由领域对象校验。 */
  public createFromAttributes(type: string, id: string, attributes: Readonly<Record<string, string>>, text = ""): Shape {
    const shape = this.construct(type, id, [], true, attributes, text);
    for (const [name, value] of Object.entries(attributes)) {
      if (!Object.hasOwn(shape.describe().attributes, name) && !["fill", "stroke", "stroke-width"].includes(name)) {
        throw new Error(`unknown attribute: ${name}`);
      }
      const numeric = typeof shape.describe().attributes[name] === "number" || name === "stroke-width";
      shape.set(name, numeric ? this.numeric(value, true) : value);
    }
    return shape;
  }

  private construct(type: string, id: string, params: readonly (number | string)[], fromTokens: boolean, attributes?: Readonly<Record<string, string>>, text = ""): Shape {
    switch (type) {
      case "rect":
        if (attributes) params = ["x", "y", "width", "height"].map(name => this.requiredAttribute(attributes, name));
        this.arity(type, params, 4, 5);
        return new Rect(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens),
          this.numeric(params[2], fromTokens), this.numeric(params[3], fromTokens), { fill: params[4] as string | undefined });
      case "circle":
        if (attributes) params = ["cx", "cy", "r"].map(name => this.requiredAttribute(attributes, name));
        this.arity(type, params, 3, 4);
        return new Circle(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens),
          this.numeric(params[2], fromTokens), { fill: params[3] as string | undefined });
      case "ellipse":
        if (attributes) params = ["cx", "cy", "rx", "ry"].map(name => this.requiredAttribute(attributes, name));
        this.arity(type, params, 4, 5);
        return new Ellipse(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens),
          this.numeric(params[2], fromTokens), this.numeric(params[3], fromTokens), { fill: params[4] as string | undefined });
      case "line":
        if (attributes) params = ["x1", "y1", "x2", "y2"].map(name => this.requiredAttribute(attributes, name));
        this.arity(type, params, 4, 5);
        return new Line(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens),
          this.numeric(params[2], fromTokens), this.numeric(params[3], fromTokens), { stroke: params[4] as string | undefined });
      case "text":
        if (attributes) params = [...["x", "y"].map(name => this.requiredAttribute(attributes, name)), text];
        this.arity(type, params, 3, 3);
        return new Text(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens), params[2] as string);
      case "g":
        this.arity(type, params, 0, 0);
        return new Group(id);
      default:
        throw new Error(`unknown shape type: ${type} (is the plugin loaded?)`);
    }
  }

  private requiredAttribute(attributes: Readonly<Record<string, string>>, name: string): string {
    if (attributes[name] === undefined) throw new Error(`missing geometry attribute: ${name}`);
    return attributes[name];
  }

  private numeric(value: string | number, fromTokens: boolean): number {
    if (!fromTokens) return value as number;
    if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
      throw new Error("geometry parameter must be a decimal number");
    }
    return Number(value);
  }

  private arity(type: string, params: readonly (number | string)[], min: number, max: number): void {
    if (params.length < min || params.length > max) {
      throw new Error(`invalid parameters for shape: ${type}`);
    }
  }
}
