# 16. Chia sẻ và xuất ra ngoài

> Phần chung: xem [README](README.md) và [`native-api.md`](../native-api.md). Chức năng này chính là nút **"Xuất ra ngoài"** mà `schema.md` mục 3 yêu cầu, và là nơi native thay thế vòng base64 hiện có.

## Hiện trạng

- Hai hành động trong `useFileActions` (`App/src/entities/file/model/use-file-actions.ts`), có mặt ở menu file, menu trong trang đọc và `ResultSheet` sau mỗi công cụ:
  - **Share:** `shareFile`.
  - **Save to device:** `saveCopy` → `saveToDevice`.
- Cài đặt ở `App/src/shared/lib/platform.ts`:

| | Android (native) | Web |
|---|------------------|-----|
| Save to device | `Filesystem.writeFile` vào `Documents/PDFToolbox/<tên>`, trả về URI | tải xuống |
| Share | ghi file vào `Cache/share/<tên>` rồi mở `Share.share` | `navigator.share` nếu hỗ trợ, nếu không thì tải xuống |

- Cả hai đọc **toàn bộ Blob rồi đổi sang base64** trước khi ghi (`blobToBase64`).
- Người dùng đóng hộp chia sẻ (`AbortError`) không bị coi là lỗi.

## Dữ liệu (`document`)

Chỉ đọc nội dung và `display_name`. Không ghi cột nào.

## Thay đổi cần làm

1. **Native lo cả hai việc**: `exportDocument(id)` và `shareDocument(id)`. Native đọc thẳng file từ kho và dùng FileProvider để chia sẻ, **không còn vòng WebView → base64 → Cache**. Đây là cải thiện lớn nhất của chức năng này. Cần kiểm tra cấu hình `App/android/app/src/main/res/xml/file_paths.xml` cho phép những thư mục cần chia sẻ.
2. **Với `external`:** chia sẻ trực tiếp bằng URI; xuất ra ngoài vẫn sao chép sang `Documents/PDFToolbox` nếu người dùng muốn một bản độc lập.
3. Đặt tên rõ nghĩa: **"Xuất ra ngoài"** (hoặc "Lưu ra thiết bị") và hiện nơi đã lưu, để người dùng hiểu đây là cách giữ bản sao ngoài vùng riêng của app.
4. **Nhắc ở lần đầu** (và trong hộp Details, xem [01](01-library.md)): file `app` mất khi gỡ app hoặc xóa dữ liệu. Có thể thêm nút "Xuất tất cả".
5. **Bản trình duyệt (mock):** giữ cách hiện tại (tải xuống, Web Share), chỉ để dev.
6. Người dùng đóng hộp chia sẻ trả về `CANCELLED`, không phải lỗi.

## Rủi ro và câu hỏi mở

- Chưa kiểm thử ghi vào `Documents` trên Android thật (README), kể cả hành vi cấp quyền ở các phiên bản Android mới.
- Xuất tất cả nhiều file lớn cần chạy nền và báo tiến độ.
- Câu hỏi: có muốn xuất kèm thao tác "mở thư mục chứa file" không?
