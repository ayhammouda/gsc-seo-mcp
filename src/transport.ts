import { deserializeMessage, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import process from "node:process";
import type { Readable, Writable } from "node:stream";

export const STDIO_JSON_RPC_FRAME_MAX_BYTES = 262_144;

const CARRIAGE_RETURN = 0x0d;
const LINE_FEED = 0x0a;

export class StdioFrameTooLargeError extends RangeError {
  readonly code = "STDIO_FRAME_TOO_LARGE";
  readonly maxBytes = STDIO_JSON_RPC_FRAME_MAX_BYTES;

  constructor() {
    super(`stdio JSON-RPC frame exceeds ${STDIO_JSON_RPC_FRAME_MAX_BYTES} bytes`);
    this.name = "StdioFrameTooLargeError";
  }
}

/**
 * Newline-delimited stdio transport with a hard byte ceiling applied before
 * UTF-8 decoding and JSON/schema parsing.
 */
export class BoundedStdioServerTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private readonly frameBuffer = Buffer.allocUnsafe(STDIO_JSON_RPC_FRAME_MAX_BYTES + 1);
  private frameBytes = 0;
  private started = false;
  private closed = false;
  private readonly pendingSendCancellations = new Set<
    (error: Error) => void
  >();
  private readonly ownsProcessInput: boolean;

  constructor(
    private readonly stdin: Readable = process.stdin,
    private readonly stdout: Writable = process.stdout
  ) {
    this.ownsProcessInput = stdin === process.stdin;
  }

  private readonly handleData = (chunk: Buffer | Uint8Array | string): void => {
    if (this.closed) return;

    const bytes =
      typeof chunk === "string"
        ? Buffer.from(chunk, "utf8")
        : Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk);

    let offset = 0;
    while (offset < bytes.length && !this.closed) {
      const lineFeedIndex = bytes.indexOf(LINE_FEED, offset);
      const segmentEnd = lineFeedIndex === -1 ? bytes.length : lineFeedIndex;

      if (!this.appendFrameBytes(bytes.subarray(offset, segmentEnd))) {
        return;
      }

      if (lineFeedIndex === -1) {
        return;
      }

      if (!this.finishFrame()) {
        return;
      }
      offset = lineFeedIndex + 1;
    }
  };

  private readonly handleInputError = (error: Error): void => {
    this.onerror?.(error);
  };

  private readonly handleOutputError = (error: Error): void => {
    this.onerror?.(error);
  };

  private readonly handleStreamClose = (): void => {
    void this.close();
  };

  start(): Promise<void> {
    if (this.started) {
      return Promise.reject(
        new Error(
          "BoundedStdioServerTransport already started; McpServer.connect() starts transports automatically"
        )
      );
    }
    if (this.closed) {
      return Promise.reject(new Error("BoundedStdioServerTransport is closed"));
    }

    this.started = true;
    this.stdin.on("data", this.handleData);
    this.stdin.on("error", this.handleInputError);
    this.stdin.on("end", this.handleStreamClose);
    this.stdin.on("close", this.handleStreamClose);
    this.stdout.on("error", this.handleOutputError);
    this.stdout.on("close", this.handleStreamClose);
    return Promise.resolve();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      throw new Error("Cannot send on a closed stdio transport");
    }

    const serialized = serializeMessage(message);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const handleDrain = (): void => {
        succeed();
      };
      const handleError = (error: Error): void => {
        fail(error);
      };
      const cleanup = (): void => {
        this.stdout.off("drain", handleDrain);
        this.stdout.off("error", handleError);
        this.pendingSendCancellations.delete(fail);
      };
      const succeed = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      this.pendingSendCancellations.add(fail);
      this.stdout.once("error", handleError);
      try {
        if (this.stdout.write(serialized)) {
          succeed();
        } else {
          this.stdout.once("drain", handleDrain);
        }
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new Error("Failed to write stdio JSON-RPC frame", { cause: error })
        );
      }
    });
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;

    const closeError = new Error(
      "Stdio transport closed before a pending send completed"
    );
    for (const cancel of [...this.pendingSendCancellations]) {
      cancel(closeError);
    }

    this.stdin.off("data", this.handleData);
    this.stdin.off("error", this.handleInputError);
    this.stdin.off("end", this.handleStreamClose);
    this.stdin.off("close", this.handleStreamClose);
    this.stdout.off("error", this.handleOutputError);
    this.stdout.off("close", this.handleStreamClose);

    if (this.stdin.listenerCount("data") === 0) {
      this.stdin.pause();
    }

    this.frameBytes = 0;
    this.onclose?.();
    return Promise.resolve();
  }

  private appendFrameBytes(segment: Buffer): boolean {
    if (segment.length === 0) return true;

    const remainingCapacity = this.frameBuffer.length - this.frameBytes;
    if (segment.length > remainingCapacity) {
      this.rejectOversizedFrame();
      return false;
    }

    segment.copy(this.frameBuffer, this.frameBytes);
    this.frameBytes += segment.length;
    if (
      this.frameBytes > STDIO_JSON_RPC_FRAME_MAX_BYTES &&
      this.frameBuffer[this.frameBytes - 1] !== CARRIAGE_RETURN
    ) {
      this.rejectOversizedFrame();
      return false;
    }
    return true;
  }

  private finishFrame(): boolean {
    const hasTerminalCarriageReturn =
      this.frameBytes > 0 && this.frameBuffer[this.frameBytes - 1] === CARRIAGE_RETURN;
    const payloadBytes = this.frameBytes - (hasTerminalCarriageReturn ? 1 : 0);

    if (payloadBytes > STDIO_JSON_RPC_FRAME_MAX_BYTES) {
      this.rejectOversizedFrame();
      return false;
    }

    const line = this.frameBuffer.toString("utf8", 0, payloadBytes);
    this.frameBytes = 0;

    try {
      const message = deserializeMessage(line);
      this.onmessage?.(message);
    } catch (error) {
      this.onerror?.(
        error instanceof Error ? error : new Error("Invalid stdio JSON-RPC frame", { cause: error })
      );
    }
    return !this.closed;
  }

  private rejectOversizedFrame(): void {
    this.frameBytes = 0;
    try {
      this.onerror?.(new StdioFrameTooLargeError());
    } finally {
      try {
        void this.close();
      } finally {
        if (this.ownsProcessInput) {
          process.exitCode = 1;
          this.stdin.destroy();
          const inputWithUnref = this.stdin as Readable & {
            unref?: () => void;
          };
          inputWithUnref.unref?.();
        }
      }
    }
  }
}

export async function serveStdio(server: McpServer): Promise<void> {
  await server.connect(new BoundedStdioServerTransport());
}
