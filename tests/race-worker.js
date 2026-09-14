import { parentPort, workerData } from "node:worker_threads";
import { openDatabase } from "../src/db.js";
import { OrderService } from "../src/services.js";
const db = openDatabase(workerData.path),
  service = new OrderService(db),
  gate = new Int32Array(workerData.gate);
parentPort.postMessage({
  ready: true,
});
Atomics.wait(gate, 0, 0);
try {
  const c = workerData.command;
  const result =
    c.action === "prepare"
      ? await service.transition(
          await db.prepare("SELECT * FROM users WHERE role='staff'").get(),
          c.id,
          {
            status: "preparing",
            expected_status: "pending",
          },
        )
      : await service.checkout(
          await db.prepare("SELECT * FROM users WHERE role='customer'").get(),
          c.data,
        );
  parentPort.postMessage({
    ok: true,
    id: result.id,
  });
} catch (e) {
  parentPort.postMessage({
    ok: false,
    status: e.status,
    error: e.message,
  });
} finally {
  db.close();
}
