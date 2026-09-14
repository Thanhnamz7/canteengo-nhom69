# CanteenGo — Nhóm 69

Ứng dụng web đặt món trước và quản lý vận hành nhà ăn, triển khai từ tài liệu **NHÓM 69.docx**. Project có giao diện tiếng Việt, máy chủ Node.js, SQLite khi chạy local và Turso khi chạy trên Vercel, dữ liệu mẫu và kiểm thử nghiệp vụ.

## Bản online

Mã nguồn được lưu trong repository GitHub riêng tư. Vercel chạy giao diện và API; database Turso lưu dữ liệu bền vững độc lập với mỗi lần deploy. Bản online cập nhật trạng thái mỗi 5 giây khi tab đang hiển thị. Dữ liệu online tách biệt với file `data/canteengo.sqlite` trên ổ F.

Xem [hướng dẫn triển khai và lưu trữ](docs/DEPLOY.md). Bản online đang ở chế độ demo với ví giả lập và các tài khoản mẫu bên dưới.

## Chạy nhanh

1. Cài **Node.js 24 LTS hoặc mới hơn** từ [nodejs.org](https://nodejs.org/).
2. Giải nén project, mở terminal trong thư mục chứa `package.json`.
3. Chạy `npm start`.
4. Mở địa chỉ được in sau dòng “CanteenGo đang chạy tại”, mặc định [http://127.0.0.1:3000](http://127.0.0.1:3000). Nếu cổng bị dùng, chương trình tự thử các cổng kế tiếp (tối đa 20 cổng).

Trên Windows có thể nhấp đúp **CHAY-CANTEENGO.cmd**. Giữ cửa sổ máy chủ mở trong lúc sử dụng; nhấn Ctrl+C để dừng. Không cần `npm install`, XAMPP, MySQL hay dịch vụ bên ngoài. Ảnh mẫu đi kèm project; sau khi có Node.js, bản demo hoạt động không cần Internet.

Node 24.14 có thể hiện `ExperimentalWarning` cho SQLite; đây là cảnh báo của runtime, không phải lỗi khởi động. API SQLite được dùng theo [tài liệu Node.js](https://nodejs.org/api/sqlite.html).

## Tài khoản demo

Mật khẩu chung: **Canteen@123**.

| Vai trò | Tài khoản | Màn hình chính |
|---|---|---|
| Khách hàng | student@school.edu.vn | Thực đơn, đơn của tôi, ví |
| Nhân viên | staff@canteengo.vn | Bảng đơn bếp, kho |
| Quản trị viên | admin@canteengo.vn | Báo cáo, thực đơn, Recipe, kho, nhà cung cấp, tài khoản |

Trang đăng nhập có nút chọn nhanh từng tài khoản. Khách hàng mẫu có 200.000đ trong ví giả lập; tài khoản tự đăng ký bắt đầu với 0đ và có thể dùng chức năng Nạp thử. Không có thanh toán tiền thật.

## Chức năng đã triển khai

- Đăng ký người trong trường hoặc khách bên ngoài; đăng nhập, phân quyền, cập nhật điện thoại và dị ứng; khóa sau 3 lần sai mật khẩu trong 60 giây.
- Xem thực đơn, ảnh minh họa, thành phần, đánh giá; tìm không dấu, lọc danh mục và giá, xem còn/hết và lịch bán.
- Giỏ nhiều món, điều chỉnh số lượng, ghi chú từng món; chọn ngày và slot 15 phút; thanh toán ví giả lập, lưu giá tại thời điểm đặt.
- Đơn cập nhật qua Server-Sent Events (SSE); khách tự hủy khi còn chờ xử lý; bếp nhận đơn, từ chối, báo sẵn sàng, đối chiếu mã và giao món.
- Quản trị món ăn, lịch phục vụ, định lượng nguyên liệu; trừ kho khi nhận đơn, chặn thiếu, hoàn theo lượng đã trừ khi hủy sau chế biến.
- Nhập/xuất thủ công có lý do, cảnh báo tồn thấp, nhà cung cấp, nhật ký kho và nhật ký quản trị.
- Đánh giá món từ đơn đã hoàn tất; báo cáo theo ngày, món bán chạy/chưa bán, đối chiếu tồn, xuất CSV.
- Băm mật khẩu bằng scrypt, cookie HttpOnly, kiểm tra quyền và dữ liệu phía máy chủ, truy vấn tham số, giao dịch SQLite và chống gửi lặp.

## Kiểm thử

```bash
npm ci
npm run check
npm test
```

41 kiểm thử tự động: TC01–TC21 theo đặc tả, 8 ca nghiệp vụ bổ sung, 7 ca HTTP, 3 ca khởi động khi trùng/sai cổng và 2 ca kiểm tra adapter/transaction bất đồng bộ. Các ca tranh tồn kho và chỗ cuối của slot dùng **hai worker với hai kết nối SQLite riêng** và hàng rào đồng bộ. Test dùng dữ liệu độc lập, không sửa cơ sở dữ liệu demo.

Xem [báo cáo kiểm thử](docs/KIEM_THU.md), [phân tích đặc tả](docs/PHAN_TICH.md), [thiết kế và API](docs/KIEN_TRUC_API.md), [kịch bản demo](docs/DEMO.md).

## Cấu trúc mã nguồn

```text
CanteenGo/
  public/                 Giao diện HTML, CSS, JavaScript và ảnh đi kèm
  src/server.js           HTTP API, phiên đăng nhập, SSE, static assets
  src/auth.js             Đăng ký, đăng nhập, scrypt, giới hạn thử sai
  src/services.js         Menu, Order, Payment, Inventory, Report Service
  src/db.js               Kết nối, giao dịch, khung giờ và múi giờ
  src/schema.sql          15 bảng, ràng buộc, khóa ngoại và chỉ mục
  src/seed.js             Tài khoản, món, công thức và tồn mẫu
  tests/                  Kiểm thử nghiệp vụ, HTTP và race condition
  docs/                   Phân tích, thiết kế, kiểm thử và hướng dẫn demo
  data/                   SQLite tự sinh ở lần chạy đầu; không nằm trong ZIP
```

## Cấu hình

Project đọc biến môi trường của tiến trình; `.env.example` chỉ là mẫu tham khảo, không tự được nạp.

```powershell
$env:PORT = '3001'
$env:SCHOOL_EMAIL_DOMAIN = 'ten-truong.edu.vn'
npm start
```

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| PORT | 3000 | Cổng máy chủ |
| HOST | 127.0.0.1 | Chỉ lắng nghe trên máy cục bộ |
| DB_PATH | data/canteengo.sqlite | Có thể trỏ đến file dữ liệu khác |
| DEMO_MODE | true | Seed dữ liệu nếu DB trống, mở nạp ví thử và đăng nhập nhanh |
| SCHOOL_EMAIL_DOMAIN | school.edu.vn | Miền email trường được chấp nhận |
| COOKIE_SECURE | false | Chỉ bật true khi phục vụ qua HTTPS |

Để bắt đầu buổi demo mới mà vẫn giữ dữ liệu cũ, dừng máy chủ rồi chạy với `DB_PATH` trỏ sang một tên file mới, ví dụ `data/demo-lan-2.sqlite`. Không cần xóa dữ liệu cũ. Sao lưu khi máy chủ đã dừng bằng cách sao chép thư mục `data`.

## Giới hạn của bản bàn giao

- Email trường chỉ kiểm tra tên miền; chưa tích hợp gửi email/OTP để chứng minh quyền sở hữu địa chỉ. Tên miền trường thực tế chưa được cung cấp.
- Đây là project học tập chạy cục bộ. Chưa triển khai máy chủ công khai, thanh toán thật, giao hàng, ứng dụng native hay quy trình khôi phục mật khẩu.
- Hoàn nguyên liệu sau chế biến là **quy tắc giả lập trong đặc tả**, không phải chính sách xử lý thực phẩm ngoài thực tế.
- Slot mặc định 10:30–14:00, mỗi 15 phút, 20 đơn/slot, sinh trước 7 ngày; một đơn chiếm một chỗ. Sức chứa không tính theo số suất. Có thể chỉnh tại `ensureSlots` trước khi sinh DB mới.
- Báo cáo tính doanh thu theo ngày **hoàn tất** tại múi giờ Việt Nam. Không cộng đơn hủy. Chênh lệch sổ không tự chứng minh thất thoát thực tế.
- Màn hình đơn giới hạn 300 đơn gần nhất cho khách và 500 cho vận hành; báo cáo truy vấn toàn bộ đơn trong kỳ. Mục tiêu giảm chờ dưới 3/5 phút cần đo tại căn tin, chưa được xác nhận bằng triển khai thực tế.
- SSE đồng bộ trong một tiến trình máy chủ; chạy nhiều replica cần kênh phát sự kiện chung. SQLite phù hợp bản cục bộ; chưa có thử tải sản xuất.

Ảnh được dùng làm minh họa nhóm món; tác giả, nguồn và giấy phép nằm trong [ASSETS.md](docs/ASSETS.md) và trang Nguồn ảnh trong ứng dụng.

