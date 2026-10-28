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

  private construct(type: string, id: string, params: readonly (number | string)[], fromTokens: boolean): Shape {
    switch (type) {
      case "rect":
        this.arity(type, params, 4, 5);
        return new Rect(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens),
          this.numeric(params[2], fromTokens), this.numeric(params[3], fromTokens), { fill: params[4] as string | undefined });
      case "circle":
        this.arity(type, params, 3, 4);
        return new Circle(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens),
          this.numeric(params[2], fromTokens), { fill: params[3] as string | undefined });
      case "ellipse":
        this.arity(type, params, 4, 5);
        return new Ellipse(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens),
          this.numeric(params[2], fromTokens), this.numeric(params[3], fromTokens), { fill: params[4] as string | undefined });
      case "line":
        this.arity(type, params, 4, 5);
        return new Line(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens),
          this.numeric(params[2], fromTokens), this.numeric(params[3], fromTokens), { stroke: params[4] as string | undefined });
      case "text":
        this.arity(type, params, 3, 3);
        return new Text(id, this.numeric(params[0], fromTokens), this.numeric(params[1], fromTokens), params[2] as string);
      case "g":
        this.arity(type, params, 0, 0);
        return new Group(id);
      default:
        throw new Error(`unknown shape type: ${type} (is the plugin loaded?)`);
    }
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
