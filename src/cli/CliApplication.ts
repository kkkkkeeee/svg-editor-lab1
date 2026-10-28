import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { ReadStream } from "node:tty";
import { CommandDispatcher } from "../application/CommandDispatcher.js";
import { CommandParser } from "./CommandParser.js";
import { ConsoleRenderer } from "./ConsoleRenderer.js";

export class CliApplication {
  public constructor(
    private readonly dispatcher: CommandDispatcher,
    private readonly parser: CommandParser,
    private readonly renderer: ConsoleRenderer,
    private readonly input: Readable,
    private readonly output: Writable,
    private readonly terminal = false,
  ) {}

  public run(): Promise<void> {
    this.renderer.welcome();
    return new Promise(resolve => {
      const reader = createInterface({
        input: this.input, output: this.output, terminal: this.terminal, crlfDelay: Infinity,
      });
      const stop = (): void => reader.close();
      process.on("SIGINT", stop);
      reader.on("SIGINT", stop);
      reader.on("line", line => {
        try {
          const command = this.parser.parse(line);
          if (command) this.renderer.show(this.dispatcher.dispatch(command));
        } catch (error) {
          this.renderer.error(error);
        }
        reader.prompt();
      });
      reader.once("close", () => {
        process.removeListener("SIGINT", stop);
        // Windows TTY 的输入句柄可能在 close 后继续维持事件循环。
        this.input.pause();
        if (this.input instanceof ReadStream) {
          this.input.unref();
          this.input.destroy();
        }
        this.renderer.show("");
        resolve();
      });
      reader.setPrompt(this.renderer.prompt);
      reader.prompt();
    });
  }
}
