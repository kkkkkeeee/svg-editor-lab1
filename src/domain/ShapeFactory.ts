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
    // 类型断言不做运行时转换，实际值由对应图形的构造器验证。
    switch (type) {
      case "rect":
        this.arity(type, params, 4, 5);
        return new Rect(id, params[0] as number, params[1] as number,
          params[2] as number, params[3] as number, { fill: params[4] as string | undefined });
      case "circle":
        this.arity(type, params, 3, 4);
        return new Circle(id, params[0] as number, params[1] as number,
          params[2] as number, { fill: params[3] as string | undefined });
      case "ellipse":
        this.arity(type, params, 4, 5);
        return new Ellipse(id, params[0] as number, params[1] as number,
          params[2] as number, params[3] as number, { fill: params[4] as string | undefined });
      case "line":
        this.arity(type, params, 4, 5);
        return new Line(id, params[0] as number, params[1] as number,
          params[2] as number, params[3] as number, { stroke: params[4] as string | undefined });
      case "text":
        this.arity(type, params, 3, 3);
        return new Text(id, params[0] as number, params[1] as number, params[2] as string);
      case "g":
        this.arity(type, params, 0, 0);
        return new Group(id);
      default:
        throw new Error(`unknown shape type: ${type} (is the plugin loaded?)`);
    }
  }

  private arity(type: string, params: readonly (number | string)[], min: number, max: number): void {
    if (params.length < min || params.length > max) {
      throw new Error(`invalid parameters for shape: ${type}`);
    }
  }
}
