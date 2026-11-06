# 13. Word, Excel, TXT, Markdown → PDF

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Màn `App/src/features/doc-to-pdf/ui/DocToPdf.vue`, route `/tool/doc2pdf`; cũng vào được từ nút "To PDF" ở trang xem ([05](05-office-image-viewer.md)).
- Danh sách nguồn: `lib.documents` bỏ `ppt` (nghĩa là Word, Excel, TXT, Markdown).
- Luồng: `officeToHtml` dựng HTML → vẽ vào một vùng ẩn ngoài màn hình → `elementToPdf` (`html2canvas`) cắt thành các trang A4.
- **PDF kết quả chỉ chứa ảnh**, không chọn hay tìm được chữ (có ghi chú ngay trên màn hình và trong README).
- Kết quả: `<tên gốc>.pdf` qua `savePdf`; `ResultSheet` ("Converted successfully").

## Dữ liệu (`document`)

- **Đọc:** nội dung file nguồn.
- **Ghi:** một dòng mới `application/pdf`. Không có cột liên kết bản PDF với file gốc (`source_document_id` đã bị bỏ khỏi schema tối giản).

## Thay đổi cần làm

**Không đổi.**

## Rủi ro và câu hỏi mở

- Tìm chữ ([06](06-pdf-text-search.md)) không dùng được trên PDF này.
- Tên đầu ra là `stripExt(name)`, có thể trùng tên file khác trong thư viện. Không gây lỗi vì khóa là UUID nhưng dễ gây nhầm; cân nhắc thêm hậu tố thời gian như các công cụ khác.
- Chuyển đổi chạy trên luồng giao diện và có thể chậm với tài liệu dài; đã có thông báo tiến độ.
