# 05. Xem Office, văn bản, ảnh

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

Trang `App/src/pages/office-viewer/ui/OfficeViewerPage.vue`, route `/office/:id`.

- **Ảnh:** đọc Blob, tạo `URL.createObjectURL`, hiển thị trực tiếp; thu hồi URL khi rời trang.
- **Word, Excel, TXT, Markdown:** `officeToHtml(kind, blob, name)` (`App/src/entities/office/lib/office-to-html.ts`) tạo HTML đã qua DOMPurify rồi hiển thị.
- Markdown có hai tab Preview và Source.
- Nút "To PDF" chuyển sang công cụ chuyển PDF ([13](13-doc-to-pdf.md)).
- PowerPoint (`.ppt`) có `kind = 'ppt'` và vào được thư viện, nhưng **README ghi chưa xem được**. Cần xác nhận hành vi khi mở.
- Trang này **không gọi `touch`** khi mở; việc ghi `openedAt` do nơi gọi (Home, Search) làm.

## Dữ liệu (`document`)

Chỉ đọc nội dung qua `blobOf` và `display_name`, `mime_type`. `page_count` là `NULL` (không có khái niệm trang); không dùng `last_page`, `last_zoom`.

## Thay đổi cần làm

Gần như **không đổi**:

1. `blobOf` giữ nguyên chữ ký; bên dưới gọi `readContent` của native. Việc dựng HTML (`mammoth`, SheetJS, `marked`) vẫn ở WebView.
2. Lỗi "This file no longer exists." đã có sẵn (`error` ref). Giữ làm chỗ xử lý link hỏng, khớp [01](01-library.md).
3. Cân nhắc để chính trang này gọi `touch`, thay vì mỗi nơi gọi tự làm, để không sót như trường hợp ảnh ở Home.

## Rủi ro và câu hỏi mở

- Chưa có chú thích cho Office và ảnh. Nếu sau này cần, "ghi thẳng vào file" chỉ làm được theo từng định dạng; xem `schema.md` mục 5 và [07](07-pdf-annotate.md).
- Câu hỏi: có muốn xem `.ppt` ngay hay để sau?
