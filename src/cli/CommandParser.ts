import type { CommandRequest } from "../application/CommandDispatcher.js";

export class CommandParser {
  public parse(line: string): CommandRequest | undefined {
    const source = line.trim();
    if (source === "" || source.startsWith("#")) return undefined;
    const tokens: string[] = [];
    const quotedTokens: boolean[] = [];
    let token = "";
    let quoted = false;
    let started = false;
    let closed = false;
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (quoted) {
        if (char === '"') {
          quoted = false;
          closed = true;
        } else if (char === "\\" && ['"', "\\"].includes(source[index + 1])) {
          token += source[++index];
        } else token += char;
      } else if (/\s/.test(char)) {
        if (started) {
          tokens.push(token);
          quotedTokens.push(closed);
        }
        token = "";
        started = false;
        closed = false;
      } else if (char === '"') {
        if (started) throw new Error("quoted arguments must be separated by whitespace");
        quoted = true;
        started = true;
      } else {
        if (closed) throw new Error("quoted arguments must be separated by whitespace");
        token += char;
        started = true;
      }
    }
    if (quoted) throw new Error("unclosed double quote");
    if (started) {
      tokens.push(token);
      quotedTokens.push(closed);
    }
    if (!tokens[0]) throw new Error("command name must not be empty");
    const argsQuoted = quotedTokens.slice(1);
    return Object.freeze({
      name: tokens[0], args: Object.freeze(tokens.slice(1)),
      ...(argsQuoted.some(Boolean) ? { argsQuoted: Object.freeze(argsQuoted) } : {}),
    });
  }
}
