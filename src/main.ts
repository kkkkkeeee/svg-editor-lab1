import { EditorSession } from "./application/EditorSession.js";
import { CommandDispatcher } from "./application/CommandDispatcher.js";
import { CliApplication } from "./cli/CliApplication.js";
import { CommandParser } from "./cli/CommandParser.js";
import { ConsoleRenderer } from "./cli/ConsoleRenderer.js";
import { SvgFileStore } from "./infrastructure/SvgFileStore.js";

const session = new EditorSession(new SvgFileStore());
const dispatcher = new CommandDispatcher(session);
const renderer = new ConsoleRenderer(process.stdout);
await new CliApplication(
  dispatcher, new CommandParser(), renderer, process.stdin, process.stdout,
  Boolean(process.stdin.isTTY && process.stdout.isTTY),
).run();
