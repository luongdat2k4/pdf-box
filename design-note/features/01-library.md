# 01. Thư viện file

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Trang chủ có 3 tab, mỗi tab là một route của cùng một trang: `/` (Home), `/history`, `/favorites`. Chip lọc theo loại nằm trên URL dạng `?type=pdf`. Code: `App/src/pages/home/ui/HomePage.vue`.
- Danh sách lấy từ Pinia store `useLibrary` (`App/src/entities/file/model/store.ts`):
  - Home = `all`, sắp theo `addedAt` giảm dần.
  - History = `recent`, chỉ file có `openedAt`, sắp theo `openedAt` giảm dần.
  - Favorites = `favorites`.
- Menu từng file (`App/src/widgets/file-menu/ui/FileMenu.vue`): Open, Rename, Favorite, Share, Save to device, Details, Delete. Hộp Details hiện tên, dung lượng, loại, ngày thêm.
- Mở file gọi `lib.touch(id)` để ghi `openedAt`. Riêng **ảnh** từ Home thì chuyển trang ngay, không gọi `touch`, nên ảnh không vào History khi mở từ Home (nhưng có vào khi mở từ trang tìm kiếm). Đây là điểm không nhất quán sẵn có.

## Dữ liệu (`document`)

| Thao tác | Cột |
|----------|-----|
| Liệt kê | `id`, `display_name`, `size_bytes`, `mime_type`, `is_favorite`, `added_at`, `last_opened_at` |
| Mở file | ghi `last_opened_at` |
| Yêu thích | ghi `is_favorite` |
| Đổi tên | ghi `display_name` (giữ nguyên đuôi file) |

Index `idx_doc_recent ON document(last_opened_at DESC)` trong `schema.md` ứng với tab History. Hiện store lọc và sắp trong bộ nhớ sau khi nạp toàn bộ metadata. Sau khi chuyển, native trả danh sách đã sắp (có index thật); WebView vẫn lọc theo loại và tab trên bản chụp trong Pinia, ổn với vài nghìn file.

## Thay đổi cần làm

1. `FileMeta` đổi theo bảng ánh xạ ở [README mục 4](README.md#4-ánh-xạ-filemeta-sang-document): thêm `storage`, `location`; bỏ `kind` khỏi dữ liệu lưu, suy ra bằng `kindOf(name)` khi nạp. Danh sách lấy từ `listDocuments()`; `touch`, `toggleFavorite`, `rename` gọi `updateDocument`.
2. Hộp **Details** thêm dòng "Nơi lưu" (`app` hoặc `external`). Với `app` nên nhắc "Mất khi gỡ app", theo `schema.md` mục 3.
3. Khi native trả `NOT_FOUND` hoặc `PERMISSION_LOST` lúc mở (file `external` bị xóa, mất quyền), giao diện báo rõ và cho **bỏ khỏi danh sách**, thay vì lỗi chung. Trạng thái này **tính lúc chạy**, không lưu thành cột (schema tối giản không có `file_status`). Kiểm tra trước cho cả danh sách tốn kém nên chỉ kiểm tra lúc mở.
4. Sửa nhỏ: cho ảnh cũng gọi `touch` khi mở từ Home để nhất quán với tìm kiếm.

## Rủi ro và câu hỏi mở

- Nạp toàn bộ metadata khi khởi động là cách làm hiện tại. Chấp nhận được; chỉ cần xem lại nếu thư viện lên hàng chục nghìn file.
- Dữ liệu `app` trên Android mất khi gỡ app. Cần lời nhắc ở lần đầu, xem [16](16-share-and-export.md).
