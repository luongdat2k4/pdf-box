# 10. Khóa / mở khóa PDF

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Màn `App/src/features/lock-pdf/ui/LockPdf.vue`, route `/tool/lock`.
- Chọn một PDF; app **dò** file đã khóa chưa bằng cách mở thử không mật khẩu: bắt `PasswordRequiredError` thì coi là đã khóa, mở được thì là chưa khóa. Nút đổi nhãn thành Lock hoặc Unlock tương ứng.
- **Khóa:** hỏi mật khẩu, `lockPdf` mã hóa AES-128 với mật khẩu người dùng và chủ sở hữu giống nhau (`App/src/entities/pdf/lib/ops.ts`). Kết quả là bản sao `<tên>_locked`.
- **Mở khóa:** hỏi mật khẩu để mở, `unlockPdf` ghi lại không mã hóa. Kết quả là bản sao `<tên>_unlocked`.
- Cả hai đều **tạo file mới, không sửa file gốc**, qua `savePdf`.
- Mật khẩu chỉ tồn tại trong bộ nhớ lúc xử lý, **không được lưu** ở đâu cả.

## Dữ liệu (`document`)

| Thao tác | Cột |
|----------|-----|
| Dò khóa | đọc nội dung; có thể ghi `is_encrypted` của file nguồn khi biết chắc |
| Khóa | tạo dòng mới với `is_encrypted = 1` |
| Mở khóa | tạo dòng mới với `is_encrypted = 0` |

Khớp nguyên tắc 5 của `schema.md`: DB chỉ có cờ `is_encrypted`, không có mật khẩu.

## Thay đổi cần làm

1. Cho `savePdf` nhận thêm thông tin phụ (ví dụ `page_count`, `is_encrypted`) để bản sao khóa/mở khóa có cờ đúng ngay, thay vì chờ mở lần đầu. Thay đổi nhỏ, đặt ở `App/src/entities/file/model/use-runner.ts`.
2. Khi dò ra trạng thái khóa của file nguồn, cập nhật `is_encrypted` để lần sau không phải dò lại.
3. Không thêm tính năng "nhớ mật khẩu". Nếu cần sau này: mã hóa bằng Keystore và để người dùng tự bật, không đưa vào DB (theo `schema.md` mục 6).

## Rủi ro và câu hỏi mở

- Mật khẩu người dùng và chủ sở hữu giống nhau: người có mật khẩu mở được thì cũng có toàn quyền (in, sao chép). Đây là lựa chọn có chủ đích của app (README), không đổi theo schema.
- Sau khi tạo bản `_locked`, file gốc chưa khóa vẫn còn trong thư viện. Người dùng có thể mong "khóa tại chỗ"; nếu muốn, cần thêm lựa chọn xóa bản gốc, đi qua [15](15-delete-files.md).
