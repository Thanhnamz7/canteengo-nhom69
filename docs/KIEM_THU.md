# Báo cáo kiểm thử CanteenGo

Ngày chạy: **14/09/2026**. Môi trường: Windows, Node.js **24.14.0**, SQLite **3.51.2**, Node test runner; trình duyệt Codex In-app Browser cho kiểm tra UI.

## Kết quả tự động

**39 ca chạy, 39 đạt, 0 không đạt, 0 bỏ qua.** Lần chạy được lưu có thời lượng khoảng 2,50 giây. Đây là thời gian chạy bộ test trên máy hiện tại, không phải số liệu tải sản xuất hay thời gian phục vụ khách.

- 21 ca TC01–TC21 đối chiếu Test Plan mục G của tài liệu.
- 8 ca EX01–EX08 bổ sung nghiệp vụ biên, bảo vệ dữ liệu và phân quyền.
- 7 ca HTTP01–HTTP07 kiểm tra API, cookie, SSE và luồng tích hợp.

Kết quả thô: [TEST_RESULTS.tap](TEST_RESULTS.tap). Lệnh tái hiện: `npm test`. Kiểm tra cú pháp mã nguồn: `npm run check` — đạt.

| Nhóm | Phạm vi xác nhận | Kết quả |
|---|---|---|
| TC01–03 | Đăng nhập, giới hạn thử sai, định danh không hợp lệ | 3/3 đạt |
| TC04–07 | Số lượng, hết món, slot đầy/quá giờ | 4/4 đạt |
| TC08–10 | Trừ ví, thiếu tiền, chống thanh toán lặp | 3/3 đạt |
| TC11–13 | Nhận/từ chối, hoàn tiền, thứ tự trạng thái, không giao lại | 3/3 đạt |
| TC14–16 | Doanh thu, ngày trống, điều kiện đánh giá | 3/3 đạt |
| TC17–20 | Recipe, thiếu nguyên liệu, trừ kho, hoàn snapshot sau sửa Recipe | 4/4 đạt |
| TC21 | Hai nhân viên/kết nối đồng thời tranh nguyên liệu | 1/1 đạt |
| EX01 | Hai kết nối tranh chỗ cuối của slot | Đạt |
| EX02 | Cộng gộp nguyên liệu nhiều món | Đạt |
| EX03 | Recipe trùng, sai đơn vị, sai lượng; bảo toàn Recipe cũ | Đạt |
| EX04 | Giá đổi, ngày không bán, snapshot giá | Đạt |
| EX05 | Phân quyền, chủ sở hữu và tự thay quyền admin | Đạt |
| EX06 | Nạp ví/nhập kho lặp, đơn vị thập phân, xuất vượt tồn | Đạt |
| EX07 | Đăng ký, miền trường, email/SĐT trùng, không tự cấp admin | Đạt |
| EX08 | Thiếu Recipe và bảo toàn lịch sử sau xóa món | Đạt |
| HTTP01 | Cookie HttpOnly/SameSite, phiên và đăng xuất | Đạt |
| HTTP02 | Chặn origin lạ, JSON sai, truy cập trái quyền | Đạt |
| HTTP03 | Trang, ảnh cục bộ và security headers | Đạt |
| HTTP04 | Đặt → chuẩn bị → sẵn sàng → hoàn tất → đánh giá → báo cáo | Đạt |
| HTTP05 | SSE báo thay đổi, payload không lộ thông tin người khác | Đạt |
| HTTP06 | Khóa tài khoản thu hồi phiên | Đạt |
| HTTP07 | Đăng xuất khi SSE còn mở; máy chủ tiếp tục phục vụ | Đạt |

TC04 kiểm tra dữ liệu và tổng tiền ở service; thao tác giỏ phía giao diện được kiểm tra riêng dưới đây. Fixture của TC17–20 đặt Recipe đúng ví dụ đặc tả gồm 150g gạo và 100g thịt gà; Recipe demo có thêm rau củ. TC21 dùng hai Node worker với hai kết nối DB file riêng, cùng chờ hàng rào rồi bắt đầu; không chỉ gọi nối tiếp hai hàm trong cùng một vòng lặp.

## Kiểm tra giao diện thực tế

| Thao tác trên trình duyệt | Kết quả quan sát |
|---|---|
| Mở thực đơn và ảnh | Hiển thị 7 món, giá và còn/hết; ảnh tải được |
| Đăng nhập khách demo | Đúng vai trò, ví 200.000đ |
| Thêm Cơm gà và Phở bò | Giỏ có 2 dòng, tổng 75.000đ |
| Tăng Cơm gà lên 2 suất | Tổng 110.000đ |
| Ghi chú “Không hành, ít cay” | Hiển thị ở xác nhận và đơn phía bếp |
| Xác nhận thanh toán | Đơn CG-CB97E970 chờ xử lý; ví còn 90.000đ |
| Đăng nhập nhân viên, Nhận đơn | Đơn chuyển cột Đang chuẩn bị |
| Chuyển Sẵn sàng giao | Đơn xuất hiện ở cột Sẵn sàng |
| Nhập mã nhận và giao đủ món | Đơn Hoàn tất, xuất hiện trong lịch sử |
| Admin xem báo cáo | 1 đơn, 110.000đ; Cơm gà 2 suất, Phở bò 1 suất |
| Đối chiếu kho | Trừ 300g gạo, 200g gà, 100g bò, 200g bánh phở, 130g rau; chênh lệch sổ 0 |
| Admin mở và lưu Recipe Cơm gà | Đúng 100g gà, 150g gạo, 50g rau; lưu thành công |
| Giao diện desktop và viewport 390×844 | Đã xem ảnh màn hình; sửa chồng chữ thanh điều hướng mobile; không tràn ngang toàn trang |

## Lỗi phát hiện và đã sửa

1. Dọn file DB kiểm thử đồng thời trước khi kết nối/worker kết thúc trên Windows gây EPERM. Sửa thứ tự đóng DB, đợi worker thoát rồi dọn thư mục test. Các assertion dữ liệu được giữ nguyên.
2. Đăng xuất kết thúc SSE nhưng client còn trong danh sách broadcast, gây `ERR_STREAM_WRITE_AFTER_END`. Xóa client trước khi kết thúc stream, kiểm tra writableEnded/destroyed và dọn theo sự kiện close/error. Thêm HTTP07 tái hiện lỗi.
3. Thanh điều hướng mobile hiển thị cả nhãn Hồ sơ/Đăng xuất cạnh logo, gây chồng chữ. Chuyển các nút phụ thành icon có nhãn truy cập ở màn hình nhỏ.
4. Khi quá giờ bán hôm nay, giỏ tự chọn ngày kế tiếp nhưng thực đơn có thể còn theo ngày cũ. Chọn ngày từ slot trước khi tải thực đơn.

## Giới hạn kiểm thử

Chưa thử tải số lượng lớn, kiểm toán bảo mật độc lập, email/OTP thật, thanh toán thật, nhiều replica, mọi trình duyệt/thiết bị hay đo thời gian chờ tại căn tin. Chưa kiểm thử tự động mọi tương tác frontend; bảng UI ghi riêng các thao tác đã quan sát. Không suy rộng 39 ca đạt thành cam kết không còn lỗi.

## Bổ sung sửa lỗi khởi động trùng cổng

START01–START03 đều đạt: tự chọn cổng kế tiếp khi EADDRINUSE, giữ nguyên dịch vụ đang chiếm cổng, thông báo rõ khi hết khoảng thử, và từ chối PORT không hợp lệ. Launcher hiển thị địa chỉ thật sau khi máy chủ lắng nghe thành công.

