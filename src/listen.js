// Bind first, then announce the actual URL. Never terminate the process owning a port.
export async function listenAvailable(
  server,
  { host = "127.0.0.1", port = 3000, maxAttempts = 20, onBusy = () => {} } = {},
) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT phải là số nguyên từ 1 đến 65535.");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1)
    throw new Error("Số lần thử cổng không hợp lệ.");
  for (
    let attempt = 0;
    attempt < maxAttempts && port + attempt <= 65535;
    attempt++
  ) {
    const candidate = port + attempt;
    try {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          server.removeListener("error", failed);
          server.removeListener("listening", ready);
        };
        const failed = (error) => {
          cleanup();
          reject(error);
        };
        const ready = () => {
          cleanup();
          resolve();
        };
        server.once("error", failed);
        server.once("listening", ready);
        try {
          server.listen(candidate, host);
        } catch (error) {
          failed(error);
        }
      });
      return candidate;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      onBusy(candidate);
    }
  }
  throw new Error(
    `Các cổng từ ${port} đến ${Math.min(65535, port + maxAttempts - 1)} đều đang được sử dụng. Đặt biến PORT thành cổng khác rồi chạy lại.`,
  );
}
