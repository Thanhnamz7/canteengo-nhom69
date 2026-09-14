# Phân tích đặc tả CanteenGo

Nguồn: tài liệu **NHÓM 69.docx** do người dùng cung cấp. Yêu cầu trực tiếp là phân tích và xây dựng project theo tài liệu. Nội dung về phân công thành viên, lịch sprint, quy tắc PR và biểu mẫu họp là bối cảnh dự án; không được hiểu là yêu cầu tự tạo tài khoản bên ngoài, gửi tin cho thành viên, công bố mã nguồn hay lập biên bản giả.

## Kết luận phạm vi

CanteenGo giải quyết việc xếp hàng giờ cao điểm bằng đặt món trước, thanh toán ví nội bộ giả lập và chọn khung giờ nhận. Phạm vi bàn giao gồm MVP cùng phần mở rộng kho, Recipe, báo cáo và đánh giá. Bốn tác nhân trong đặc tả được ánh xạ thành ba vai trò kỹ thuật: hai loại khách (`school`, `external`) dùng chung quyền `customer`; vận hành dùng `staff` và `admin`.

Tài liệu không bắt buộc Java, C#, PHP, React hay một hệ quản trị CSDL cụ thể. Chọn Node.js 24, giao diện JavaScript không framework và SQLite để người nhận có thể chạy project trên Windows với ít bước cài đặt. Hệ thống giữ ba lớp giao diện, nghiệp vụ và dữ liệu như mục F.1.

## Các quyết định cần làm rõ

| Điểm trong tài liệu | Cách xử lý trong project |
|---|---|
| Mục giá trị nói dưới 5 phút; Project Charter nói dưới 3 phút | Giữ đây là mục tiêu vận hành cần đo. Không tuyên bố phần mềm đã đạt SLA |
| Email trường chưa có miền cụ thể hay quy trình xác thực | Miền cấu hình `SCHOOL_EMAIL_DOMAIN`; mặc định minh họa `school.edu.vn`. Chưa xác minh hộp thư |
| Ví nội bộ không mô tả nạp tiền | Thêm nạp thử có nhãn giả lập, chỉ mở trong DEMO_MODE; không gọi cổng thanh toán |
| Sức chứa slot chưa định lượng | Mặc định 20 đơn / 15 phút; một đơn giữ một chỗ; giờ 10:30–14:00 và trước 7 ngày |
| Kho nằm ở giai đoạn 2 | Bản bàn giao tích hợp giai đoạn 2; Recipe bắt buộc khi bếp nhận đơn |
| Hủy sau chế biến hoàn kho theo giả lập | Chỉ nhân viên/admin hủy ở `preparing`; hoàn từ bút toán xuất thực tế, không đọc Recipe mới |
| Thời điểm ghi doanh thu chưa chốt hoàn toàn | Ghi theo `completed_at` và múi giờ Asia/Ho_Chi_Minh; chỉ đơn `completed` |
| Báo cáo thất thoát thiếu quy trình kiểm kê thực tế | Hiển thị xuất thủ công, lý do, tiêu hao, hoàn và chênh lệch sổ. Không suy đoán thất thoát |
| Tổng ưu tiên backlog ghi 14 Phải có, 10 Nên có, 5 Có thể có | Đếm các dòng thực tế là **13 Phải có, 13 Nên có, 3 Có thể có**; vẫn tổng 29 user story |

## Đối chiếu 29 user story

| US | Nội dung | Màn hình / triển khai | Mức đáp ứng |
|---|---|---|---|
| 01 | Đăng ký email trường | Đăng ký, kiểm tra miền cấu hình | Có; xác minh hộp thư chưa tích hợp |
| 02 | Đăng ký khách bên ngoài | Email hoặc SĐT | Có |
| 03 | Đăng nhập theo vai trò | Auth, cookie session, điều hướng theo vai trò | Có |
| 04 | Cập nhật SĐT, dị ứng | Hồ sơ của tôi | Có |
| 05 | Xem thực đơn | Tên, giá, mô tả | Có |
| 06 | Tìm kiếm và lọc | Không dấu, danh mục, mức giá | Có |
| 07 | Còn/hết | Badge; kiểm tra lại phía máy chủ | Có |
| 08 | Chi tiết ảnh, thành phần | Hộp chi tiết món, ảnh minh họa đi kèm | Có |
| 09 | Giỏ và số lượng | Tăng/giảm, bỏ món, tổng tiền | Có |
| 10 | Ghi chú mỗi món | Ghi chú theo dòng giỏ | Có |
| 11 | Chọn khung nhận | Chọn ngày và slot, kiểm tra quá giờ/đầy | Có |
| 12 | Thanh toán ví | Thanh toán, nạp thử, lịch sử, chống lặp | Có, giả lập |
| 13 | Theo dõi đơn trực tiếp | SSE, trạng thái, lịch sử | Có |
| 14 | Khách hủy trước chế biến | Chỉ đơn thuộc mình ở `pending` | Có |
| 15 | Bếp nhận đơn mới | Bảng đơn, ưu tiên giờ nhận, ghi chú và dị ứng | Có |
| 16 | Cập nhật chế biến | Nhận đơn → chuẩn bị → sẵn sàng | Có |
| 17 | Xác nhận giao | Đối chiếu mã ở giao diện rồi hoàn tất | Có |
| 18 | Xem tồn nguyên liệu | Kho, đơn vị thống nhất | Có |
| 19 | Nhập/xuất thủ công | Số lượng, lý do, mã chống lặp, người thao tác | Có |
| 20 | Nguồn nguyên liệu | Gắn nhà cung cấp, thông tin liên hệ | Có |
| 21 | Cảnh báo dưới ngưỡng | Banner, trạng thái từng nguyên liệu | Có |
| 22 | Recipe | Thêm/bỏ dòng; kiểm tra trùng, số lượng, đơn vị | Có |
| 23 | Nhà cung cấp | Thêm, sửa và liên kết nguyên liệu | Có |
| 24 | Tổng quan tồn/thất thoát | Tồn, tiêu hao, xuất thủ công, chênh lệch sổ | Có trong giới hạn số liệu sổ sách |
| 25 | Quản lý món | Thêm, sửa, xóa mềm, giá, ảnh, trạng thái | Có |
| 26 | Lịch bán | Các ngày trong tuần, kiểm tra theo ngày nhận | Có |
| 27 | Đánh giá món | 1–5 sao và nhận xét, một lần/món/đơn hoàn tất | Có |
| 28 | Doanh thu theo thời gian | Khoảng ngày, biểu đồ, CSV | Có |
| 29 | Món bán chạy/ế | Số suất, doanh thu; giữ cả món không bán trong kỳ | Có |

## Bất biến nghiệp vụ

1. Đặt đơn thành công phải đồng thời có một thanh toán, đủ số dư và một chỗ nhận; lỗi thì không thay đổi dở dang.
2. Giá được xác nhận lại ở máy chủ; `order_items.price` và tên món là ảnh chụp tại lúc mua.
3. `pending → preparing` là thời điểm trừ nguyên liệu. Nhu cầu được cộng gộp giữa các món dùng chung nguyên liệu trước khi kiểm tra.
4. Chuyển trạng thái yêu cầu `expected_status`; thao tác của người khác làm yêu cầu cũ bị từ chối 409.
5. Đơn hủy hoàn tiền một lần và ngừng chiếm chỗ. Chỉ hoàn kho nếu có bút toán tiêu hao đã ghi.
6. Không tồn kho âm; một cặp món–nguyên liệu chỉ có một định lượng; đơn đã hoàn tất không được giao lại.
7. Người dùng tự đăng ký luôn là khách hàng; quyền vận hành chỉ do admin hiện có cấp.

## Ngoài phạm vi

Thanh toán thật, vận chuyển tận nơi, native app, xác thực email/OTP thực, triển khai nhiều máy chủ, video/slide bảo vệ và hoạt động phối hợp nhóm trên Trello/GitHub. Không tạo các chứng cứ họp nhóm, PR review hay chỉ số hiệu quả vận hành chưa xảy ra.
