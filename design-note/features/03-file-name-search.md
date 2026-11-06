# 03. Tìm file theo tên

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Trang `/search` (`App/src/pages/search/ui/SearchPage.vue`): ô nhập tự lấy tiêu điểm, lọc trong bộ nhớ trên `lib.items`.
- Quy tắc khớp: chuỗi con, không phân biệt hoa thường, **bỏ phần đuôi file** (`stripExt(name)`).
- Chạm vào kết quả: gọi `lib.touch(id)` rồi mở đúng màn (ảnh và Office sang `/office/:id`, PDF sang `/reader/:id`).
- `FileSelect` (`App/src/entities/file/ui/FileSelect.vue`) có ô lọc riêng, khớp trên **tên đầy đủ kể cả đuôi**. Hai chỗ khớp theo hai quy tắc khác nhau.

## Dữ liệu (`document`)

Chỉ đọc `display_name`, cộng các cột hiển thị của dòng kết quả. Không ghi gì, ngoại trừ `last_opened_at` khi mở.

## Thay đổi cần làm

**Không đổi.** Lọc trong bộ nhớ trên metadata vẫn đúng với schema mới, không cần index.

Gợi ý nhỏ (không bắt buộc): dùng chung một hàm khớp tên cho cả `SearchPage` và `FileSelect` để hai nơi cho cùng kết quả.

## Rủi ro và câu hỏi mở

- Tìm theo **nội dung** xuyên nhiều file nằm ngoài phạm vi: cần bảng FTS5 và trích xuất văn bản (giả định 5 của `schema.md`). Tìm chữ trong **một** PDF đã có sẵn ở [06](06-pdf-text-search.md).
