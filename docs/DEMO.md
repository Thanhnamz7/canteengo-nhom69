# Kịch bản chạy và bảo vệ CanteenGo

## Chuẩn bị

Chạy `npm start`, mở địa chỉ cục bộ trong README. Dùng hai trình duyệt hoặc hai profile độc lập nếu cần xem khách và nhân viên đồng thời. Hai tab cùng profile dùng chung cookie; đăng xuất ở một tab có thể làm tab kia hết phiên.

Với DB mới, hệ thống có 7 món, 9 nguyên liệu, một nhà cung cấp minh họa và 3 tài khoản demo. Ví khách có 200.000đ. Sữa tươi đang tạm hết; nguyên liệu sữa dưới ngưỡng cảnh báo. Không có đơn giả được cài sẵn vào doanh thu.

Nếu hiện tại đã sau 14:00, chọn ngày kế tiếp. Slot quá giờ không xuất hiện và không thể chốt đơn.

## Luồng khách hàng

1. Đăng nhập khách `student@school.edu.vn` hoặc bấm **Khách hàng**.
2. Tìm `com ga` để minh họa tìm không dấu. Bỏ tìm kiếm, chọn danh mục và mức giá.
3. Mở chi tiết Cơm gà xé để xem giá, ảnh minh họa và thành phần.
4. Thêm 2 Cơm gà xé và 1 Trà đào; tổng 85.000đ. Ghi chú “Không hành, ít cay”.
5. Chọn ngày và khung giờ còn chỗ; mở xác nhận và thanh toán. Ví còn 115.000đ, đơn Chờ xử lý.
6. Đến Đơn của tôi để xem lịch sử và mã nhận món. Giữ màn hình này mở khi nhân viên xử lý ở trình duyệt khác để xem SSE.

## Luồng bếp và kho

1. Đăng nhập nhân viên `staff@canteengo.vn`. Bảng bếp hiển thị đơn, giờ nhận và ghi chú.
2. Xem Kho trước khi nhận. Với Recipe mẫu, 2 Cơm gà cần 300g gạo, 200g gà, 100g rau; Trà đào cần 300ml trà.
3. Bấm Nhận đơn. Đơn sang Đang chuẩn bị; kiểm tra kho và bút toán Chế biến.
4. Bấm Sẵn sàng giao. Khách đang xem Đơn của tôi nhận cập nhật trực tiếp.
5. Bấm Giao món; nhập đúng mã `CG-XXXXXXXX` đang hiển thị trên đơn để xác nhận đã giao đủ món.

## Thiếu nguyên liệu và hoàn kho

Dùng DB demo mới hoặc tạo một đơn nhỏ khác. Nhân viên ghi xuất thủ công lượng gạo sao cho còn 250g, với lý do “Kiểm thử thiếu nguyên liệu”. Đặt 2 suất Cơm gà và nhận đơn: máy chủ báo thiếu 50g gạo, giữ nguyên trạng thái và không trừ các nguyên liệu khác. Nhập bổ sung gạo rồi nhận lại để tiếp tục.

Để minh họa hoàn kho theo snapshot: nhận đơn, admin sửa Recipe của Cơm gà thành lượng khác, nhân viên hủy đơn đang chuẩn bị và nhập lý do. Ví được hoàn đúng tổng đơn, kho hoàn đúng lượng đã tiêu hao trước khi Recipe thay đổi. Đây là nghiệp vụ giả lập của bài tập.

Khách chỉ được hủy đơn của mình lúc Chờ xử lý. Từ chối đơn chưa nhận hoàn tiền nhưng không có bút toán hoàn kho.

## Đánh giá và báo cáo

Khách mở đơn Hoàn tất và đánh giá từng món. Admin đăng nhập, chọn khoảng ngày chứa ngày hoàn tất, kiểm tra doanh thu và số suất. Đơn hủy không được cộng vào doanh thu. Xuất CSV nếu cần đối chiếu. Mở đối chiếu kho để xem tiêu hao, hoàn, xuất thủ công và chênh lệch sổ.

## Trình bày kỹ thuật

- Giải thích transaction giữ thanh toán, chỗ nhận và đơn nhất quán.
- Nêu thời điểm trừ kho là Nhận đơn, không phải Thanh toán.
- Minh họa vì sao phải lưu giá và bút toán tiêu hao bất biến.
- Chạy `npm test` để trình bày số liệu thực tế; TC21 dùng hai kết nối tranh tồn kho.
- Nêu giới hạn: ví giả lập, chưa xác minh hộp thư, chưa đo thời gian chờ thực tế, chưa triển khai công khai.

Không đọc mật khẩu demo như mật khẩu thật của thành viên; không sử dụng thông tin cá nhân thực để điền dữ liệu kiểm thử.
