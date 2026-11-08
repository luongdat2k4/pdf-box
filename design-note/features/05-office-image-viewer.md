# 05. Xem Office, văn bản, ảnh

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

Trang `App/src/pages/office-viewer/ui/OfficeViewerPage.vue`, route `/office/:id`.

- **Ảnh:** đọc Blob, tạo `URL.createObjectURL`, hiển thị trực tiếp; thu hồi URL khi rời trang.
- **Word, TXT, Markdown:** `officeToHtml(kind, blob, name)` (`App/src/entities/office/lib/office-to-html.ts`) tạo HTML đã qua DOMPurify rồi hiển thị.
- **Excel (`kind = excel`, gồm `.xlsx`/`.xls`):** dùng `SpreadsheetViewer` (`App/src/entities/office/ui/SpreadsheetViewer.vue`), không ghép tất cả sheet thành HTML. `readSpreadsheet` chuyển ArrayBuffer sang worker chạy SheetJS; worker được dừng khi đọc xong, lỗi, hoặc rời/chuyển file.
- View Excel là lưới chỉ đọc: tab sheet phía dưới, tiêu đề A/B/C và số dòng, chọn ô để đọc nội dung/công thức đầy đủ, zoom 50–200%, tùy chọn cố định dòng 1/cột A. Lưu vị trí cuộn và ô đang chọn cho từng sheet trong phiên xem; mở sheet mới ở vùng có dữ liệu. Sheet ẩn không hiện trong tab.
- Virtual scroll theo cả hai chiều chỉ dựng ô trong viewport và vùng đệm, gồm ô gộp có neo nằm ngoài viewport. Giới hạn chiều dài spacer DOM và ánh xạ tọa độ cuộn để vẫn tới dòng 1.048.576 mà không vượt giới hạn kích thước CSS. Dùng phím mũi tên để chọn ô, Enter mở/đóng chi tiết.
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
- View Excel ưu tiên đọc dữ liệu: giữ giá trị số/ngày đã định dạng và ô gộp; chưa tái tạo toàn bộ phông/màu/đồ thị/ảnh, trạng thái ẩn dòng/cột hoặc chiều cao dòng gốc. Công thức dùng **kết quả được lưu trong file**, không tính lại. Luồng xuất PDF tiếp tục dùng `officeToHtml` cũ.
- Worker tránh phân tích file trên luồng UI, nhưng workbook vẫn được phân tích toàn bộ trong bộ nhớ. Virtual scroll giới hạn DOM; không phải đọc từng phần file. Cần đo bộ nhớ và kiểm tra thao tác chạm/cuộn trên Android thật.
- Câu hỏi: có muốn xem `.ppt` ngay hay để sau?
