/** CLI 数值文本边界；几何范围由领域对象验证。 */
export class NumericArgument {
  public static parse(value: string, name: string): number {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
      throw new Error(`${name} must be a finite decimal number`);
    }
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number`);
    return number;
  }
}
