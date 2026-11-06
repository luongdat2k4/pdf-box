# 08. Ghép PDF

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Màn `App/src/features/merge-pdf/ui/MergePdf.vue`, route `/tool/merge`.
- Hai bước: **chọn** (từ `lib.pdfs`, thứ tự bấm chọn là thứ tự ghép, cần tối thiểu 2 file) rồi **sắp xếp** (mũi tên lên xuống, xóa, thêm file, đặt tên đầu ra, mặc định `merged_<timestamp>`).
- Với mỗi file, `loadPdfSource` mở bằng `openWithPassword` để lấy mật khẩu hoạt động; người dùng hủy ở bất kỳ file nào thì hủy cả lượt ghép.
- `mergePdfs` dùng `PDFDocument.copyPages` ghép toàn bộ trang theo thứ tự (`App/src/entities/pdf/lib/ops.ts`).
- Kết quả đi qua `savePdf` → `addBlob`, hiện `ResultSheet` ("Merged successfully"). Rời màn khi đang ở bước sắp xếp thì hỏi xác nhận.
- Dùng `useRunner` để chống chạy hai lần (`busy`).

## Dữ liệu (`document`)

- **Đọc:** nội dung của các file nguồn qua `bytesOf`.
- **Ghi:** một dòng `document` mới (UUID mới, `storage = 'app'`, `mime_type = application/pdf`). `page_count` có thể điền ngay bằng cách cộng `pageCount` mà `loadPdfSource` đã trả về cho từng file (hiện `merge()` đang bỏ giá trị này).
- Không ghi lại "file nào ghép từ file nào": không có bảng `job` (đã bỏ khỏi schema tối giản).

## Thay đổi cần làm

**Không đổi** ở phía màn hình. `savePdf` và `bytesOf` giữ nguyên chữ ký; bên dưới là `saveOutput` và `readContent` của native. Việc ghép vẫn chạy bằng `pdf-lib` trong WebView.

Tuỳ chọn nhỏ: truyền `page_count` vào `savePdf` để khỏi phải tính lại khi mở.

## Rủi ro và câu hỏi mở

- Toàn bộ byte của mọi file nguồn nằm trong bộ nhớ cùng lúc (`sources: PdfSource[]`). Ghép nhiều PDF lớn có thể gây áp lực bộ nhớ trong WebView. Chưa đo.
- File đầu ra luôn nằm trong kho `app`; muốn ra vị trí khác phải qua [16](16-share-and-export.md) hoặc [17](17-save-location-setting.md).
