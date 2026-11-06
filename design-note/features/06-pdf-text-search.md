# 06. Tìm chữ trong PDF

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Logic ở `App/src/features/pdf-search/model/use-doc-search.ts`, thanh tìm ở `ui/SearchBar.vue`, ghép vào trang đọc.
- Quét lần lượt từng trang bằng pdf.js `getTextContent`, tìm chuỗi con (không phân biệt hoa thường), đo độ rộng chữ bằng canvas để tính ô tô sáng cho đúng đoạn.
- Có token hủy để một lần tìm mới ngắt lần tìm cũ; chuyển giữa các kết quả bằng `step(±1)`.
- Toàn bộ trạng thái (`hits`, `hitIndex`, `query`) chỉ nằm trong bộ nhớ, đóng thanh tìm là xóa.
- Giới hạn đã biết (README): chỉ khớp trong **một đoạn chữ liền** của pdf.js; PDF chỉ chứa ảnh (như bản quét, hoặc PDF từ [13](13-doc-to-pdf.md)) không có chữ để tìm và app báo "No matches".

## Dữ liệu (`document`)

Không đọc, không ghi cột nào. Làm việc trên tài liệu pdf.js đã mở.

## Thay đổi cần làm

**Không đổi.**

## Rủi ro và câu hỏi mở

- Đây **không** phải tìm kiếm toàn văn xuyên nhiều file. Muốn thế cần FTS5 và trích xuất văn bản (giả định 5 của `schema.md`), ngoài phạm vi bản đầu.
- Muốn PDF tạo từ Word/Excel/quét tìm được chữ cần OCR hoặc dựng PDF có lớp chữ; ngoài phạm vi.
