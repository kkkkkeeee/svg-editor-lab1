import type { Writable } from "node:stream";

export class ConsoleRenderer {
  public readonly prompt = "svg> ";
  public constructor(private readonly output: Writable) {}

  public welcome(): void {
    this.show("svg-editor 0.1 — type 'help' for commands");
  }

  public show(message: string): void { this.output.write(message + "\n"); }

  public error(error: unknown): void {
    const message = error instanceof Error ? error.message : "unexpected error";
    this.show("error: " + message.replace(/[\r\n]+/g, " "));
  }
}
