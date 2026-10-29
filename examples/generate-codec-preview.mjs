// 仅验证 SvgCodec 的 UTF-8 输出，不是应用的 save 命令。先运行 npm run build。
import { writeFileSync } from "node:fs";
import { SvgDocument } from "../dist/domain/SvgDocument.js";
import { ShapeFactory } from "../dist/domain/ShapeFactory.js";
import { SvgCodec } from "../dist/infrastructure/SvgCodec.js";

const document = new SvgDocument(640, 260);
const factory = new ShapeFactory();
document.add(factory.create("rect", "background", [0, 0, 640, 260, "#f7f9fc"]));
document.add(factory.create("g", "diagram"));
document.add(factory.create("rect", "start", [40, 70, 190, 90, "#4a90d9"]), "diagram");
document.add(factory.create("text", "label", [55, 120, '开始 & <检查> "XML"']), "diagram");
document.set("label", "fill", "white");
document.add(factory.create("line", "edge", [230, 115, 400, 115, "#34495e"]), "diagram");
document.set("edge", "stroke-width", 3);
document.add(factory.create("g", "nested"), "diagram");
document.add(factory.create("circle", "end", [455, 115, 55, "#f5a623"]), "nested");
document.add(factory.create("text", "end-label", [435, 120, "完成"]), "nested");
document.add(factory.create("ellipse", "badge", [560, 205, 40, 15, "#75c9a3"]));
document.add(factory.create("text", "caption", [40, 210, "M6-A：嵌套容器 / UTF-8 中文 / 特殊字符"]));
writeFileSync(new URL("codec-preview.svg", import.meta.url), new SvgCodec().serialize(document), "utf8");
console.log("Generated examples/codec-preview.svg for codec validation only.");
