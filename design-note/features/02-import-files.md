# 02. Nhập file

> Phần chung: xem [README](README.md) và [`native-api.md`](../native-api.md). Đây là chức năng **thay đổi nhiều nhất** khi chuyển sang native.

## Hiện trạng

Có hai nơi chọn file, cùng gọi `useLibrary().importFiles`:

| Nơi chọn | Code |
|----------|------|
| Nút Import ở Home và bảng công cụ (sự kiện `import` của `ToolsSheet`) | `App/src/pages/home/ui/HomePage.vue` (`onPicked`) |
| Nút Import trong danh sách chọn file của mọi màn công cụ | `App/src/entities/file/ui/FileSelect.vue` (`onPicked`) |

Luồng: `<input type="file">` trả về `File` → `importFiles` bỏ qua loại không hỗ trợ (`kindOf` trả `null`) và báo tên file bị bỏ qua → `addBlob` tạo `FileMeta` với UUID mới và **ghi cả Blob vào IndexedDB** (`App/src/entities/file/api/db.ts`).

`FileSelect` còn tự chọn sẵn các file vừa nhập nếu khớp loại mà màn công cụ cần, và báo nếu có file không dùng được ở màn đó.

## Dữ liệu (`document`)

Mỗi file nhập tạo một dòng mới do **native** sinh:

| Cột | Chế độ `copy` | Chế độ `link` |
|-----|---------------|---------------|
| `id` | UUID mới | UUID mới |
| `storage` | `'app'` | `'external'` |
| `location` | `documents/<id>.<đuôi>` | `content://` URI đã được giữ quyền |
| `display_name`, `mime_type`, `size_bytes` | từ file được chọn | từ file được chọn |
| `added_at` | thời điểm nhập | thời điểm nhập |
| `last_opened_at` | `NULL` | `NULL` |
| `page_count`, `is_encrypted` | `NULL` / `0`, **chưa tính lúc nhập** | như bên trái |

## Thay đổi cần làm

1. **Hộp chọn do native mở**, thay cho `<input type="file">`: gọi `importFromDevice({ accept, multiple, mode })` ([`native-api.md`](../native-api.md) mục 3). Hai nơi gọi (`HomePage.vue`, `FileSelect.vue`) đổi từ nhận `File[]` sang gọi hàm mới; `useLibrary.importFiles` đổi theo.
2. **Danh sách đuôi hỗ trợ do JS truyền xuống** (`accept`, lấy từ `EXT_KIND`), native không giữ bản sao. Loại không hỗ trợ trả về trong `skipped`, giao diện giữ thông báo hiện có.
3. **Chế độ `copy` / `link`:** `copy` sao chép vào kho `app`; `link` giữ quyền URI (`takePersistableUriPermission`) và không sao chép. Chế độ mặc định chưa chốt ([README mục 7](README.md#7-câu-hỏi-cần-chốt)). Cần chọn cách cho người dùng đổi: cài đặt chung ([17](17-save-location-setting.md)) hoặc hỏi lúc nhập.
4. `page_count` và `is_encrypted` **không tính lúc nhập**, để nhập nhiều file không bị chậm. WebView điền qua `updateDocument` khi mở lần đầu ([04](04-pdf-reader.md)).
5. Người dùng đóng hộp chọn trả về `CANCELLED`, không phải lỗi, không hiện thông báo.
6. **Bản trình duyệt (mock):** vẫn dùng `<input type="file">` và chỉ chế độ `copy`.

## Rủi ro và câu hỏi mở

- **Trùng file:** nhập cùng một file hai lần ở chế độ `copy` tạo hai dòng (hiện tại cũng vậy). Ở chế độ `link`, `UNIQUE (storage, location)` chặn được nếu cùng URI, nhưng cùng một file có thể ra URI khác nhau. Có cần phát hiện trùng (tên + dung lượng) không?
- **Hạn mức quyền URI** ở chế độ `link`: hệ thống giới hạn số URI được giữ quyền ([`schema.md`](../schema.md) mục 3). Người dùng nhập hàng trăm file bằng `link` có thể chạm giới hạn; cần xử lý khi đầy.
- **Dung lượng:** chế độ `copy` làm file chiếm chỗ hai lần trên máy.
- **Nhập hàng loạt** nhiều file lớn ở chế độ `copy` có thể chậm; cần báo tiến độ.
