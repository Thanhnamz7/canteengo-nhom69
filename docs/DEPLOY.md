# CanteenGo trên GitHub và Vercel

- GitHub private: https://github.com/thanhnam710/canteengo-nhom69
- Vercel project: https://vercel.com/namnamnam/canteengo-nhom69
- Database: Turso `canteengo-nhom69`, tạo qua Vercel Marketplace, kết nối với project cùng tên.

## Lưu trữ

Local mặc định lưu tại `F:\CanteenGo-Nhom69\CanteenGo\data\canteengo.sqlite` (hoặc `data/canteengo.sqlite` bên trong bản project đang chạy). Vercel dùng `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN` trong biến môi trường, tự bật cookie Secure. Không dùng filesystem tạm của Vercel để lưu database.

Hai nguồn dữ liệu độc lập. Database online khởi tạo bằng dữ liệu mẫu, không sao chép tài khoản, phiên đăng nhập hoặc đơn hàng từ file local. Deploy lại không đặt lại database. Không đưa `.env*`, `.vercel`, database hay token lên GitHub; `.env.example` chỉ chứa tên biến và ví dụ.

## Triển khai lại

Yêu cầu Node.js 24 và tài khoản có quyền với project Vercel.

```sh
npm ci
npm run check
npm test
npx vercel link --project canteengo-nhom69 --scope namnamnam
npx vercel deploy --prod --scope namnamnam
```

`vercel.json` phục vụ static từ `public/`, chuyển `/api/*` tới `api/index.js`, chạy tại Singapore. Module API khởi tạo kết nối khi có yêu cầu, tự thử lại nếu lần khởi tạo trước thất bại. Dữ liệu được lưu trên Turso, giao dịch ghi có commit/rollback. Schema và dữ liệu mẫu được tạo theo cách an toàn khi nhiều instance cùng khởi động.

## Chế độ demo

Ví là giả lập. Trang đăng nhập có ba tài khoản mẫu, gồm quyền quản trị để thuyết trình. Khi chuyển sang sử dụng thực tế, cần bỏ đăng nhập nhanh, đổi thông tin tài khoản mẫu, cấu hình `DEMO_MODE=false`, xác minh email và tích hợp thanh toán thật. Không dùng bản demo để lưu dữ liệu cá nhân thực tế.
