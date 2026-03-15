import fs from "node:fs";
import path from "node:path";

const LOGS_DIR = "logs";

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function datetimeString(d: Date): string {
  return d.toISOString().slice(0, 19);
}

export class RunLogger {
  readonly runId: string;
  readonly hash: string;
  readonly datetime: string;
  private readonly path: string;

  constructor(options?: { logDir?: string }) {
    const now = new Date();
    const epochSec = Math.floor(now.getTime() / 1000);
    this.hash = epochSec.toString(16).slice(-6).padStart(6, "0");
    const date = dateString(now);
    this.datetime = datetimeString(now);
    this.runId = `${date}-${this.hash}`;

    const logDir = options?.logDir ?? path.join(process.cwd(), LOGS_DIR);
    fs.mkdirSync(logDir, { recursive: true });
    this.path = path.join(logDir, `${this.runId}.log`);

    this.writeLine("RUN", `runId=${this.runId} started=${this.datetime}`);
  }

  private stepTag(stageName: string | undefined, stepIndex: number): string {
    return stageName !== undefined ? `${stageName}:${stepIndex}` : String(stepIndex);
  }

  private prefix(tag: string): string {
    return `[${this.hash}][${this.datetime}][${tag}]`;
  }

  private writeLine(tag: string, body: string): void {
    const line = `${this.prefix(tag)} ${body}\n`;
    fs.appendFileSync(this.path, line);
  }

  private writeBlock(tag: string, lines: string): void {
    const prefix = this.prefix(tag);
    const content = lines.split("\n");
    for (const line of content) {
      fs.appendFileSync(this.path, `${prefix} ${line}\n`);
    }
  }

  appendStep(
    stageName: string | undefined,
    stepIndex: number,
    stepLabel: string,
    input: string,
    output: string
  ): void {
    const tag = this.stepTag(stageName, stepIndex);
    this.writeLine(tag, `--- Step ${stepIndex + 1}: ${stepLabel} ---`);
    this.writeLine(tag, "INPUT:");
    this.writeBlock(tag, input);
    this.writeLine(tag, "OUTPUT:");
    this.writeBlock(tag, output);
  }

  appendStage(name: string, resolvedVars: Record<string, string>): void {
    const tag = `STAGE:${name}`;
    const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
    const summary = Object.entries(resolvedVars)
      .map(([k, v]) => {
        const val = v.length > 80 ? `${v.slice(0, 80)}...` : v;
        return `${k}=${oneLine(val)}`;
      })
      .join(", ");
    this.writeLine(tag, `--- Stage: ${name} --- ${summary}`);
  }
}
