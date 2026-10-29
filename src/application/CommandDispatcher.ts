import { EditorSession } from "./EditorSession.js";
import { CreateCommand } from "./commands/CreateCommand.js";
import { MoveCommand } from "./commands/MoveCommand.js";
import { ScaleCommand } from "./commands/ScaleCommand.js";
import { SetCommand } from "./commands/SetCommand.js";
import { DeleteCommand } from "./commands/DeleteCommand.js";
import { AddToCommand } from "./commands/AddToCommand.js";
import { FrontCommand } from "./commands/FrontCommand.js";
import { BackCommand } from "./commands/BackCommand.js";
import { GroupCommand } from "./commands/GroupCommand.js";
import { UngroupCommand } from "./commands/UngroupCommand.js";
import { NumericArgument } from "./NumericArgument.js";

export interface CommandRequest {
  readonly name: string;
  readonly args: readonly string[];
  readonly argsQuoted?: readonly boolean[];
}

/** 课程允许的集中命令名分派点，后续编辑操作将委托独立 Command。 */
export class CommandDispatcher {
  private readonly commands = [
    { name: "help", syntax: "help", min: 0, max: 0, implemented: true, needsDocument: false },
    { name: "init", syntax: "init [w] [h]", min: 0, max: 2, implemented: true, needsDocument: false },
    { name: "read", syntax: "read <file.svg>", min: 1, max: 1, implemented: false, needsDocument: false },
    { name: "save", syntax: "save [file.svg]", min: 0, max: 1, implemented: true, needsDocument: true },
    { name: "canvas", syntax: "canvas [w h]", min: 0, max: 2, implemented: true, needsDocument: true },
    { name: "create", syntax: "create <type> <id> [params…] [in <containerId>]", min: 2, max: Infinity, implemented: true, needsDocument: true },
    { name: "delete", syntax: "delete <id>", min: 1, max: 1, implemented: true, needsDocument: true },
    { name: "move", syntax: "move <id> <dx> <dy>", min: 3, max: 3, implemented: true, needsDocument: true },
    { name: "scale", syntax: "scale <id> <factor>", min: 2, max: 2, implemented: true, needsDocument: true },
    { name: "set", syntax: "set <id> <attr> <value>", min: 3, max: 3, implemented: true, needsDocument: true },
    { name: "group", syntax: "group <newGid> <id1> <id2>…", min: 2, max: Infinity, implemented: true, needsDocument: true },
    { name: "ungroup", syntax: "ungroup <gid>", min: 1, max: 1, implemented: true, needsDocument: true },
    { name: "addto", syntax: "addto <gid> <id>", min: 2, max: 2, implemented: true, needsDocument: true },
    { name: "front", syntax: "front <id>", min: 1, max: 1, implemented: true, needsDocument: true },
    { name: "back", syntax: "back <id>", min: 1, max: 1, implemented: true, needsDocument: true },
    { name: "tree", syntax: "tree [id]", min: 0, max: 1, implemented: true, needsDocument: true },
    { name: "show", syntax: "show <id>", min: 1, max: 1, implemented: true, needsDocument: true },
    { name: "undo", syntax: "undo", min: 0, max: 0, implemented: true, needsDocument: true },
    { name: "redo", syntax: "redo", min: 0, max: 0, implemented: true, needsDocument: true },
  ] as const;

  public constructor(private readonly session: EditorSession) {}

  public dispatch(request: CommandRequest): string {
    const entry = this.commands.find(command => command.name === request.name);
    if (!entry) throw new Error(`unknown command: ${request.name}`);
    if (entry.needsDocument && !this.session.hasDocument) {
      throw new Error("no document. use 'init' or 'read' first");
    }
    if (request.args.length < entry.min || request.args.length > entry.max) {
      throw new Error(`invalid arguments; usage: ${entry.syntax}`);
    }
    switch (entry.name) {
      case "help":
        return this.commands.map(command =>
          `[${command.implemented ? "已实现" : "暂未实现"}] ${command.syntax}`,
        ).join("\n") + "\ncreate types: rect <id> <x> <y> <w> <h> [fill]; circle <id> <cx> <cy> <r> [fill]\n"
          + "ellipse <id> <cx> <cy> <rx> <ry> [fill]; line <id> <x1> <y1> <x2> <y2> [stroke]\n"
          + 'text <id> <x> <y> "content"; g <id> (all support optional in <containerId>)';
      case "init": {
        const width = request.args[0] === undefined ? 800 : this.dimension(request.args[0]);
        const height = request.args[1] === undefined ? 600 : this.dimension(request.args[1]);
        const document = this.session.init(width, height);
        return `canvas ${document.width}x${document.height} created`;
      }
      case "create":
        return this.create(request);
      case "save":
        return this.session.save(request.args[0]);
      case "delete":
        return this.session.execute(new DeleteCommand(request.args[0]));
      case "group":
        return this.session.execute(new GroupCommand(request.args[0], request.args.slice(1)));
      case "ungroup":
        return this.session.execute(new UngroupCommand(request.args[0]));
      case "addto":
        return this.session.execute(new AddToCommand(request.args[0], request.args[1]));
      case "front":
        return this.session.execute(new FrontCommand(request.args[0]));
      case "back":
        return this.session.execute(new BackCommand(request.args[0]));
      case "canvas": {
        if (request.args.length === 1) throw new Error(`invalid arguments; usage: ${entry.syntax}`);
        if (request.args.length === 0) {
          const document = this.session.describe();
          return `canvas ${document.width}x${document.height}`;
        }
        const document = this.session.resizeCanvas(this.dimension(request.args[0]), this.dimension(request.args[1]));
        return `canvas ${document.width}x${document.height} resized`;
      }
      case "move":
        return this.session.execute(new MoveCommand(request.args[0],
          NumericArgument.parse(request.args[1], "dx"), NumericArgument.parse(request.args[2], "dy")));
      case "scale":
        return this.session.execute(new ScaleCommand(request.args[0], NumericArgument.parse(request.args[1], "scale factor")));
      case "set":
        return this.session.execute(new SetCommand(request.args[0], request.args[1], request.args[2]));
      case "tree":
        return this.session.tree(request.args[0]);
      case "show":
        return this.session.show(request.args[0]);
      case "undo":
        return this.session.undo();
      case "redo":
        return this.session.redo();
      default:
        throw new Error(`command not implemented yet: ${entry.name}`);
    }
  }

  private create(request: CommandRequest): string {
    const args = request.args;
    const suffix = args.length - 2;
    const hasParent = suffix >= 2 && args[suffix] === "in" && !request.argsQuoted?.[suffix];
    const params = args.slice(2, hasParent ? suffix : args.length);
    const command = new CreateCommand(args[0], args[1], params, hasParent ? args.at(-1)! : null);
    return this.session.execute(command);
  }

  private dimension(value: string): number {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
      throw new Error("canvas dimension must be a decimal number");
    }
    return Number(value);
  }
}
