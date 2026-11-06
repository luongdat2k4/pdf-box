# 07. Chú thích PDF

> Phần chung và các điểm lệch với schema: xem [README](README.md). Chức năng này **trả lời câu hỏi mở số 3 của `schema.md`**: chú thích ghi thẳng vào PDF, nên không cần bảng chú thích.

## Hiện trạng

- Logic: `App/src/features/pdf-annotate/model/use-annotations.ts`; thanh công cụ `ui/AnnotateBar.vue`; ghép trong trang đọc.
- Công cụ: highlight, gạch chân, gạch ngang, bút vẽ; 5 màu; undo/redo; lưu.
- Toạ độ lưu **chuẩn hóa 0..1, gốc ở góc trên trái của trang** (`Annotation.pts`, `App/src/entities/pdf/lib/ops.ts`), không phải toạ độ màn hình hay point của PDF, nên zoom không làm lệch.
- Chú thích chỉ nằm trong bộ nhớ (`annots`) cho đến khi bấm **Save**:
  1. `applyAnnotations` "in" vào trang bằng phép vẽ vector của `@cantoo/pdf-lib` (không phải annotation PDF chuẩn).
  2. `lib.replaceBlob(id, blob)` **ghi đè** nội dung file, cập nhật `size`.
  3. Mở lại PDF từ bytes mới; chú thích đã in vào trang, không sửa được nữa.
- Nếu file có mật khẩu, kết quả được mã hóa lại bằng chính mật khẩu đó.
- Rời trang khi còn chú thích chưa lưu thì hỏi "Discard annotations?".
- README ghi giới hạn: chỉ hỗ trợ trang không bị xoay, chọn vùng bằng kéo thả, không bám theo dòng chữ.

## Dữ liệu (`document`)

| Lúc | Cột |
|-----|-----|
| Lưu | ghi `size_bytes` (nội dung đổi) |
| Các cột khác | không đổi (`page_count`, `location`, `display_name`) |

Không có bảng `annotation` hay `annotation_shape`.

## Thay đổi cần làm

1. `replaceBlob` gọi `replaceContent(id, data)` của native; **giữ nguyên `location`** nên mọi liên kết còn nguyên. Native ghi ra file tạm rồi đổi tên.
2. Khi `storage = 'external'`: ghi đè cần quyền ghi. Native trả `NO_WRITE_PERMISSION` thì giao diện chuyển thành **"Lưu bản sao"** (`saveOutput`, tạo `document` mới), không báo lỗi khó hiểu.
3. Nên cho **lưu thành bản sao** ngay cả với file `app`, vì "in" vào trang là không thể hoàn tác sau khi lưu. Hiện tại chỉ có ghi đè.

## Rủi ro và câu hỏi mở

- Ghi đè là thao tác nguy hiểm: nếu ghi dở dang (app bị tắt) có thể hỏng file. Ghi tạm rồi đổi tên giảm rủi ro với `app`; với `external` việc đổi tên nguyên tử phụ thuộc nhà cung cấp lưu trữ nên chưa chắc đảm bảo được.
- PDF đã nằm trong bộ nhớ WebView nên byte phải đi ngược về native qua cầu nối; chi phí xem [`native-api.md`](../native-api.md) mục 5.
- Chú thích đã in thì file mở bằng app khác vẫn thấy (ưu điểm), nhưng không còn sửa hoặc xóa từng nét (nhược điểm).
- Câu hỏi: có cần giữ chú thích ở dạng sửa được (lưu trong DB) cho bản sau không? Nếu có, thêm bảng `annotation` là một migration độc lập, không đụng `document`.
