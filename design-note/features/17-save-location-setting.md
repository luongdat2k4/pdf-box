# 17. Cài đặt nơi lưu file tạo ra (chức năng mới)

> Phần chung: xem [README](README.md) và [`native-api.md`](../native-api.md). Đây là chức năng **chưa có trong code**, xuất phát từ `schema.md` mục 3. Nhờ có tầng native, cả ba chế độ nay đều làm được.

## Mục tiêu

Người dùng chọn file do app tạo ra (quét, ghép, tách, khóa, chuyển đổi) được lưu ở đâu:

| `save_mode` | Hành vi | `storage` của file tạo ra |
|-------------|---------|---------------------------|
| `app` (mặc định) | Lưu vào kho riêng của app, đúng như hiện nay | `app` |
| `ask` | Hỏi vị trí lưu mỗi lần (`ACTION_CREATE_DOCUMENT`) | `external` |
| `folder` | Lưu vào thư mục cố định người dùng chọn một lần (`ACTION_OPEN_DOCUMENT_TREE`) | `external` |

## Hiện trạng

- **Chưa có màn Cài đặt** và chưa có route cho nó (`App/src/app/router/index.ts`).
- Mọi công cụ lưu kết quả bằng `savePdf` → `addBlob`, tức luôn là chế độ `app`. Điểm gom chung là `useRunner` và `savePdf` ở `App/src/entities/file/model/use-runner.ts`; `pdf-to-image` gọi `addBlob` trực tiếp.
- `ResultSheet` đang ghi cố định "Saved to your library."
- Cài đặt giao diện hiện lưu bằng `localStorage` (khóa `pdftoolbox.fabOffset` trong `App/src/shared/lib/use-drag-fab.ts`). Cài đặt nghiệp vụ mới sẽ ở **native (DataStore)**, không dùng `localStorage`.

## Dữ liệu

Cài đặt **không** nằm trong bảng `document`:

| Khóa | Giá trị | Nơi lưu |
|------|---------|---------|
| `save_mode` | `app` \| `ask` \| `folder` | DataStore (native) |
| `save_folder_uri` | chỉ dùng khi `save_mode = folder` | DataStore (native) |

Đọc và ghi qua `getSettings()` và `setSettings(patch)` ([`native-api.md`](../native-api.md) mục 3).

## Thay đổi cần làm

1. **Một chỗ quyết định duy nhất ở native:** `saveOutput` đọc `save_mode` và tự chọn nơi lưu; WebView không tự xử lý từng chế độ. Nhờ vậy `savePdf` và `pdf-to-image` đều tự đúng mà không phải sửa từng công cụ.
2. **Màn Cài đặt** (route mới): chọn `save_mode`; với `folder` thì mở hộp chọn thư mục của hệ thống và gọi `takePersistableUriPermission`. Hiển thị thư mục đang dùng.
3. Chế độ `folder` chỉ cần **một quyền cho cả cây thư mục**, không tốn hạn mức URI cho từng file ([`schema.md`](../schema.md) mục 3).
4. **Khi mất quyền thư mục** (người dùng thu hồi, thư mục bị xóa): `saveOutput` trả `PERMISSION_LOST`; giao diện đề nghị chọn lại thư mục hoặc **lưu tạm vào `app`**, không làm mất kết quả vừa tạo.
5. Với `ask`: người dùng hủy hộp chọn trả `CANCELLED`; kết quả đang xử lý cần có lựa chọn "lưu vào app" để không mất công.
6. Sửa câu trong `ResultSheet` theo chế độ đã chọn.
7. Kèm nút "Xuất tất cả" và lời nhắc mất file khi gỡ app (xem [16](16-share-and-export.md)).
8. **Bản trình duyệt (mock):** chỉ `app`; màn Cài đặt ẩn hoặc vô hiệu hai chế độ còn lại.

## Rủi ro và câu hỏi mở

- File `external` do chính app tạo ra cũng có thể bị xóa ngoài app; đi qua cùng xử lý link hỏng ở [01](01-library.md).
- Ghi đè file `external` (lưu chú thích) cần quyền ghi; xem [07](07-pdf-annotate.md).
- Câu hỏi: khi `save_mode = folder`, đặt tên trùng với file đã có thì sao? Cần quy tắc (tự thêm hậu tố thời gian giống các công cụ hiện có là đơn giản nhất).
