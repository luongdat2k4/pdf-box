# 15. Xóa file và đồng bộ thư viện

Hai đường vào dùng chung `useLibrary().remove(ids)`: menu từng file và màn `/tool/delete`.

- Hộp xác nhận nêu rõ file sẽ bị xóa vĩnh viễn khỏi thiết bị và thư viện.
- Native xóa nội dung thật trước, rồi mới xóa bản ghi. `app` xóa file riêng của app; `external` xóa URI gốc bằng SAF hoặc ContentResolver.
- Nếu thiếu quyền hoặc provider từ chối xóa, file và bản ghi được giữ lại; UI hiển thị lỗi.
- Khi xóa nhiều file, các file đã xóa thành công vẫn biến mất ngay cả khi file sau đó thất bại. Native gửi `documentsRemoved` theo nhóm; frontend tải lại kết quả thực tế khi có lỗi.
- File nhập bằng chế độ `copy` là bản sao độc lập: xóa bản sao trong app không xóa file nguồn không được liên kết.

`LibraryWatcher` theo dõi thư mục chứa file đã lập chỉ mục bằng `FileObserver` và content provider bằng `ContentObserver`. Khi phát hiện xóa/di chuyển, native đối chiếu sự tồn tại và gửi `documentsRemoved`; Pinia cập nhật danh sách chung, lịch sử, yêu thích và vùng chọn mà không cần tải lại trang.

Việc theo dõi dừng khi app ở background, chạy lại và đối chiếu khi trở về foreground. Có đối chiếu dự phòng mỗi 30 giây ở foreground cho provider không phát thông báo. Mất quyền truy cập, provider không truy vấn được hoặc tháo thẻ nhớ không phải bằng chứng file bị xóa.

Quét, xóa và đối chiếu dùng chung `scanGate`; thao tác trên từng tài liệu dùng chung khóa ID. Frontend bỏ phản hồi tải danh sách cũ và không đưa ID đã xóa trở lại do phản hồi đến muộn.

Kiểm tra hồi quy: `npm run test:library`. Trên thiết bị cần kiểm tra xóa file thường, SAF, file không có quyền ghi, xóa nhiều file thất bại một phần, xóa từ trình quản lý tệp và tháo/lắp thẻ nhớ.
