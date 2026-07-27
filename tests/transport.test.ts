import { PassThrough, Writable } from "node:stream";
import { serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import {
  BoundedStdioServerTransport,
  STDIO_JSON_RPC_FRAME_MAX_BYTES,
  StdioFrameTooLargeError
} from "../src/transport.js";

function notificationFrameOfSize(byteLength: number): string {
  const prefix = '{"jsonrpc":"2.0","method":"test/frame","params":{"padding":"';
  const suffix = '"}}';
  const paddingBytes = byteLength - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  if (paddingBytes < 0) {
    throw new Error(`Cannot construct a ${byteLength}-byte notification frame`);
  }
  return `${prefix}${"a".repeat(paddingBytes)}${suffix}`;
}

function collectTransport(
  input = new PassThrough(),
  output = new PassThrough()
): {
  input: PassThrough;
  output: PassThrough;
  transport: BoundedStdioServerTransport;
  messages: JSONRPCMessage[];
  errors: Error[];
  closeCount: () => number;
} {
  const transport = new BoundedStdioServerTransport(input, output);
  const messages: JSONRPCMessage[] = [];
  const errors: Error[] = [];
  let closes = 0;

  transport.onmessage = (message) => messages.push(message);
  transport.onerror = (error) => errors.push(error);
  transport.onclose = () => {
    closes += 1;
  };

  return {
    input,
    output,
    transport,
    messages,
    errors,
    closeCount: () => closes
  };
}

describe("BoundedStdioServerTransport framing", () => {
  it("reassembles split chunks without corrupting multibyte UTF-8", async () => {
    const harness = collectTransport();
    await harness.transport.start();
    const frame = Buffer.from(
      `${JSON.stringify({
        jsonrpc: "2.0",
        method: "test/multibyte",
        params: { value: "café 🚀" }
      })}\n`,
      "utf8"
    );
    const rocket = Buffer.from("🚀", "utf8");
    const rocketOffset = frame.indexOf(rocket);

    harness.input.write(frame.subarray(0, rocketOffset + 2));
    expect(harness.messages).toEqual([]);
    harness.input.write(frame.subarray(rocketOffset + 2));

    expect(harness.messages).toEqual([
      {
        jsonrpc: "2.0",
        method: "test/multibyte",
        params: { value: "café 🚀" }
      }
    ]);
    expect(harness.errors).toEqual([]);
    await harness.transport.close();
  });

  it("processes multiple LF and CRLF frames from one chunk", async () => {
    const harness = collectTransport();
    await harness.transport.start();

    harness.input.write(
      Buffer.from(
        [
          `${JSON.stringify({ jsonrpc: "2.0", method: "test/one" })}\r\n`,
          `${JSON.stringify({ jsonrpc: "2.0", method: "test/two" })}\n`
        ].join("")
      )
    );

    expect(harness.messages).toEqual([
      { jsonrpc: "2.0", method: "test/one" },
      { jsonrpc: "2.0", method: "test/two" }
    ]);
    expect(harness.errors).toEqual([]);
    await harness.transport.close();
  });

  it("accepts exactly 262,144 payload bytes plus terminal CR and LF", async () => {
    const harness = collectTransport();
    await harness.transport.start();
    const frame = notificationFrameOfSize(STDIO_JSON_RPC_FRAME_MAX_BYTES);

    expect(Buffer.byteLength(frame)).toBe(262_144);
    harness.input.write(Buffer.from(`${frame}\r\n`));

    expect(harness.messages).toHaveLength(1);
    expect(harness.errors).toEqual([]);
    expect(harness.closeCount()).toBe(0);
    await harness.transport.close();
  });

  it("rejects 262,145 payload bytes before parsing and closes once", async () => {
    const harness = collectTransport();
    await harness.transport.start();
    const frame = notificationFrameOfSize(STDIO_JSON_RPC_FRAME_MAX_BYTES + 1);

    harness.input.write(Buffer.from(`${frame}\n`));

    expect(harness.messages).toEqual([]);
    expect(harness.errors).toHaveLength(1);
    expect(harness.errors[0]).toBeInstanceOf(StdioFrameTooLargeError);
    expect(harness.closeCount()).toBe(1);
    expect(harness.input.listenerCount("data")).toBe(0);
  });

  it("closes without retaining an unterminated oversized frame", async () => {
    const harness = collectTransport();
    await harness.transport.start();

    harness.input.write(Buffer.alloc(STDIO_JSON_RPC_FRAME_MAX_BYTES * 4, 0x61));

    expect(harness.errors).toHaveLength(1);
    expect(harness.errors[0]).toBeInstanceOf(StdioFrameTooLargeError);
    expect(harness.closeCount()).toBe(1);
    expect(harness.input.listenerCount("data")).toBe(0);
  });

  it("rejects the first unterminated byte over the ceiling unless it is a possible terminal CR", async () => {
    const oversized = collectTransport();
    await oversized.transport.start();
    oversized.input.write(
      Buffer.alloc(STDIO_JSON_RPC_FRAME_MAX_BYTES + 1, 0x61)
    );

    expect(oversized.errors[0]).toBeInstanceOf(StdioFrameTooLargeError);
    expect(oversized.closeCount()).toBe(1);

    const possibleCrLf = collectTransport();
    await possibleCrLf.transport.start();
    const frame = notificationFrameOfSize(STDIO_JSON_RPC_FRAME_MAX_BYTES);
    possibleCrLf.input.write(Buffer.from(`${frame}\r`));
    expect(possibleCrLf.errors).toEqual([]);
    expect(possibleCrLf.closeCount()).toBe(0);
    possibleCrLf.input.write(Buffer.from("\n"));
    expect(possibleCrLf.messages).toHaveLength(1);
    await possibleCrLf.transport.close();
  });

  it("reports malformed JSON and continues with the next delimited frame", async () => {
    const harness = collectTransport();
    await harness.transport.start();
    const valid = JSON.stringify({ jsonrpc: "2.0", method: "test/valid" });

    harness.input.write(Buffer.from(`not-json\n${valid}\n`));

    expect(harness.errors).toHaveLength(1);
    expect(harness.messages).toEqual([{ jsonrpc: "2.0", method: "test/valid" }]);
    expect(harness.closeCount()).toBe(0);
    await harness.transport.close();
  });
});

describe("BoundedStdioServerTransport lifecycle", () => {
  it("starts once, removes only its listeners, and closes idempotently", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const unrelatedDataListener = (): void => {};
    input.on("data", unrelatedDataListener);
    const harness = collectTransport(input, output);

    await harness.transport.start();
    await expect(harness.transport.start()).rejects.toThrow(/already started/i);
    expect(input.listenerCount("data")).toBe(2);

    await harness.transport.close();
    await harness.transport.close();

    expect(harness.closeCount()).toBe(1);
    expect(input.listeners("data")).toEqual([unrelatedDataListener]);
    expect(input.listenerCount("error")).toBe(0);
    expect(input.listenerCount("end")).toBe(0);
    expect(input.listenerCount("close")).toBe(0);
    expect(output.listenerCount("error")).toBe(0);
    expect(output.listenerCount("close")).toBe(0);
    input.off("data", unrelatedDataListener);
  });

  it("forwards stream errors and closes when stdin ends", async () => {
    const harness = collectTransport();
    await harness.transport.start();
    const streamError = new Error("input failed");

    harness.input.emit("error", streamError);
    expect(harness.errors).toEqual([streamError]);

    const originalOnClose = harness.transport.onclose;
    const closed = new Promise<void>((resolve) => {
      harness.transport.onclose = () => {
        originalOnClose?.();
        resolve();
      };
    });
    harness.input.end();
    await closed;

    expect(harness.closeCount()).toBe(1);
    expect(harness.input.listenerCount("data")).toBe(0);
  });

  it("serializes protocol messages only to the configured stdout stream", async () => {
    const harness = collectTransport();
    const message = {
      jsonrpc: "2.0",
      id: 7,
      result: { ok: true }
    } satisfies JSONRPCMessage;
    await harness.transport.start();

    await harness.transport.send(message);

    const outputChunk: unknown = harness.output.read();
    expect(Buffer.isBuffer(outputChunk) ? outputChunk.toString("utf8") : outputChunk).toBe(
      serializeMessage(message)
    );
    await harness.transport.close();
    await expect(harness.transport.send(message)).rejects.toThrow(/closed stdio transport/i);
  });

  it("rejects a backpressured send when the transport closes", async () => {
    const input = new PassThrough();
    const output = new Writable({
      highWaterMark: 1,
      write: () => {
        // Deliberately retain backpressure until the transport closes.
      }
    });
    const transport = new BoundedStdioServerTransport(input, output);
    await transport.start();
    const pendingSend = expect(
      transport.send({
        jsonrpc: "2.0",
        id: 9,
        result: { padding: "x".repeat(128) }
      })
    ).rejects.toThrow(/pending send/i);

    await Promise.resolve();
    await transport.close();
    await pendingSend;
    output.destroy();
  });
});
