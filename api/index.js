import { createApp } from "../src/server.js";

let appPromise;
export default async function handler(req, res) {
  try {
    appPromise ||= createApp().catch((error) => {
      appPromise = undefined;
      throw error;
    });
    const app = await appPromise;
    return await app.handler(req, res);
  } catch (error) {
    console.error("CanteenGo initialization failed:", error.message);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        error: "Chưa kết nối được cơ sở dữ liệu. Vui lòng thử lại sau.",
      }),
    );
  }
}
