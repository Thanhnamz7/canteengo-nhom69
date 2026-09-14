import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { listenAvailable } from "../src/listen.js";

const close = (server) => new Promise((resolve) => server.close(resolve));
async function occupied(t) {
  const blocker = http.createServer((req, res) => res.end("existing service"));
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  t.after(() => close(blocker));
  return blocker.address().port;
}
test("START01 — cổng bận tự chuyển sang cổng khác, không dừng dịch vụ đang chạy", async (t) => {
  const port = await occupied(t),
    busy = [];
  const server = http.createServer((req, res) => res.end("CanteenGo"));
  t.after(() => close(server));
  const actual = await listenAvailable(server, {
    port,
    onBusy: (p) => busy.push(p),
  });
  assert.ok(actual > port);
  assert.equal(busy[0], port);
  assert.equal(
    await (await fetch(`http://127.0.0.1:${port}`)).text(),
    "existing service",
  );
  assert.equal(
    await (await fetch(`http://127.0.0.1:${actual}`)).text(),
    "CanteenGo",
  );
  assert.equal(server.listenerCount("error"), 0);
});
test("START02 — hết cổng trong khoảng thử trả lỗi có hướng dẫn", async (t) => {
  const port = await occupied(t);
  const server = http.createServer();
  await assert.rejects(
    listenAvailable(server, { port, maxAttempts: 1 }),
    /Đặt biến PORT/,
  );
  assert.equal(server.listening, false);
  assert.equal(server.listenerCount("error"), 0);
});
test("START03 — từ chối cổng cấu hình sai", async () => {
  for (const port of [NaN, 0, -1, 65536, 1.5])
    await assert.rejects(
      listenAvailable(http.createServer(), { port }),
      /PORT phải/,
    );
});
