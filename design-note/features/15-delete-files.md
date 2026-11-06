# 15. Xóa file

> Phần chung: xem [README](README.md) và [`native-api.md`](../native-api.md). Chức năng này **trả lời câu hỏi mở về xóa** của `schema.md` cho file `app`.

## Hiện trạng

Hai đường vào, cùng gọi `useLibrary().remove(ids)`:

| Đường | Code | Xác nhận |
|-------|------|----------|
| Màn xóa nhiều file, route `/tool/delete` | `App/src/features/delete-files/ui/DeleteFiles.vue` | "N file(s) will be permanently removed. This can't be undone." |
| Mục Delete trong menu từng file | `useFileActions().remove` (`App/src/entities/file/model/use-file-actions.ts`) | "… will be permanently removed from the library." |

`remove` xóa Blob rồi xóa metadata (`removeFile`, `App/src/entities/file/api/db.ts`) và loại khỏi danh sách trong bộ nhớ. Hiện xóa khỏi thư viện **đồng nghĩa với xóa luôn nội dung**, vì nội dung chỉ tồn tại trong kho của app.

## Dữ liệu (`document`)

- **Xóa** dòng `document`.
- Với `storage = 'app'`: xóa cả nội dung.
- Với `storage = 'external'`: **chỉ xóa dòng và nhả quyền URI**, file gốc của người dùng còn nguyên.
- Không có bảng phụ phải dọn (không có `bookmark`, `annotation` trong schema tối giản).

## Thay đổi cần làm

1. `remove` gọi `removeDocuments(ids)` của native. Native làm trong một luồng: xóa dòng `document` (giao dịch Room) **trước**, rồi xóa nội dung `app`. Thứ tự này đảo ngược với code hiện tại, để lỡ bị ngắt giữa chừng chỉ còn file mồ côi (vô hại) chứ không còn dòng trỏ vào nội dung đã mất.
2. **Dọn file mồ côi** lúc khởi động: nội dung trong `filesDir/documents/` không có dòng `document` thì xóa (phía native).
3. **Câu xác nhận phải khác nhau theo `storage`**:
   - `app`: "Sẽ bị xóa vĩnh viễn, không thể hoàn tác."
   - `external`: "Chỉ xóa khỏi danh sách, file gốc vẫn còn trên thiết bị."
   Khi xóa nhiều file lẫn cả hai loại, hiển thị số lượng từng loại.
4. Giao diện chỉ cập nhật danh sách trong Pinia sau khi native báo thành công.

## Rủi ro và câu hỏi mở

- Không có thùng rác (schema tối giản bỏ `deleted_at`). Xóa nhầm file `app` là mất. Có muốn thêm thùng rác không?
- Nếu muốn thêm lựa chọn "xóa cả file gốc" với `external`, việc xóa file người dùng đòi hỏi quyền ghi và xác nhận rất rõ; mặc định **không** làm.
- Xóa file là nguồn của file khác (ví dụ ảnh dùng để tạo PDF) không ảnh hưởng gì vì không có liên kết nguồn.
