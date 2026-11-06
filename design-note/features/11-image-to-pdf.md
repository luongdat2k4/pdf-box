# 11. Ảnh → PDF

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Màn `App/src/features/image-to-pdf/ui/ImageToPdf.vue`, route `/tool/img2pdf`.
- Chọn nhiều ảnh từ `lib.images` (thứ tự chọn là thứ tự trang), chọn khổ giấy trong A3, A4, A5, A6, B4, B5 (`PAGE_SIZES`, `App/src/entities/pdf/model/types.ts`).
- Mỗi ảnh qua `normalizeImage` (chuyển sang JPEG hoặc PNG mà `pdf-lib` nhúng được) rồi `imagesToPdf` đặt **mỗi ảnh một trang**, co vừa khít và căn giữa.
- Kết quả: `images_<timestamp>.pdf` qua `savePdf`; `ResultSheet` ("PDF created").

## Dữ liệu (`document`)

- **Đọc:** nội dung các ảnh nguồn.
- **Ghi:** một dòng mới, `page_count` = số ảnh.

## Thay đổi cần làm

**Không đổi.**

## Rủi ro và câu hỏi mở

- Phải **nhập ảnh vào thư viện trước** mới ghép được. Nhập ở chế độ `link` ([02](02-import-files.md)) giúp việc này không tốn thêm dung lượng, vì ảnh chỉ được giữ link.
- Ảnh từ [12](12-pdf-to-image.md) quay lại thư viện dưới dạng ảnh JPEG, có thể ghép lại, tạo thành vòng PDF → ảnh → PDF.
