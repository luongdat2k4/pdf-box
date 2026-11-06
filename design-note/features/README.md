# Chức năng của app theo kiến trúc "native giữ dữ liệu, WebView là giao diện"

> Trạng thái: **bản nháp để thảo luận**. Căn cứ: [`../schema.md`](../schema.md), [`../native-api.md`](../native-api.md) và code hiện có trong `App/src/`.
> Mỗi chức năng một file. File này chứa phần chung, để các file chức năng ngắn gọn.

## 1. Cách đọc bộ tài liệu

Mỗi file chức năng có cùng bốn mục:

1. **Hiện trạng**: app đang làm gì, kèm đường dẫn code thật.
2. **Dữ liệu (`document`)**: cột nào được đọc hoặc ghi, theo tên cột trong `schema.md`.
3. **Thay đổi cần làm**: ghi **"Không đổi"** nếu chức năng không phải sửa gì.
4. **Rủi ro và câu hỏi mở**.

Đường dẫn code viết tắt từ thư mục gốc dự án, ví dụ `App/src/entities/file/model/store.ts`.

## 2. Danh sách chức năng

| # | Chức năng | Route / vị trí | Mức thay đổi |
|---|-----------|----------------|--------------|
| 01 | [Thư viện file](01-library.md) | `/`, `/history`, `/favorites` | Nhỏ |
| 02 | [Nhập file](02-import-files.md) | nút Import ở Home và các màn công cụ | **Lớn** |
| 03 | [Tìm file theo tên](03-file-name-search.md) | `/search` | Không đổi |
| 04 | [Đọc PDF](04-pdf-reader.md) | `/reader/:id` | **Vừa** |
| 05 | [Xem Office, văn bản, ảnh](05-office-image-viewer.md) | `/office/:id` | Nhỏ |
| 06 | [Tìm chữ trong PDF](06-pdf-text-search.md) | trong trang đọc | Không đổi |
| 07 | [Chú thích PDF](07-pdf-annotate.md) | trong trang đọc | Nhỏ |
| 08 | [Ghép PDF](08-merge-pdf.md) | `/tool/merge` | Không đổi |
| 09 | [Tách PDF](09-split-pdf.md) | `/tool/split` | Không đổi |
| 10 | [Khóa / mở khóa PDF](10-lock-unlock-pdf.md) | `/tool/lock` | Nhỏ |
| 11 | [Ảnh → PDF](11-image-to-pdf.md) | `/tool/img2pdf` | Không đổi |
| 12 | [PDF → ảnh](12-pdf-to-image.md) | `/tool/pdf2img` | Không đổi |
| 13 | [Word, Excel, TXT, Markdown → PDF](13-doc-to-pdf.md) | `/tool/doc2pdf` | Không đổi |
| 14 | [Quét bằng camera → PDF](14-scan-document.md) | `/tool/scan` | Không đổi |
| 15 | [Xóa file](15-delete-files.md) | `/tool/delete` và menu file | Nhỏ |
| 16 | [Chia sẻ và xuất ra ngoài](16-share-and-export.md) | menu file, bảng kết quả | **Vừa** |
| 17 | [Cài đặt nơi lưu file tạo ra](17-save-location-setting.md) | chưa có màn Cài đặt | **Mới** |

"Không đổi" chỉ đúng khi `useLibrary` giữ nguyên các hàm công khai (mục 5).

## 3. Kiến trúc đã chốt

| Quyết định | Nội dung |
|------------|----------|
| Native Android (Kotlin) giữ **SQLite (Room) và file** | Bảng `document`, nội dung file, link `external`, xuất, chia sẻ, cài đặt |
| `App/src` là giao diện và xử lý tài liệu | `pdfjs-dist`, `@cantoo/pdf-lib`, `mammoth`, SheetJS, `html2canvas` giữ nguyên ở WebView |
| Hiển thị PDF trong WebView | Giữ `pdfjs-dist` |
| Có bản trình duyệt để dev | Adapter mock bằng IndexedDB, chỉ `storage = 'app'` |

Chi tiết phân vai và hợp đồng: [`../native-api.md`](../native-api.md).

### Điều này thay đổi gì so với code hiện tại

| Hiện tại | Sau khi chuyển |
|----------|----------------|
| Mọi file là Blob trong IndexedDB (`App/src/entities/file/api/db.ts`) | Nội dung do native giữ; IndexedDB chỉ còn làm adapter mock |
| Nhập bằng `<input type="file">`, chỉ ra bản sao | Native mở hộp chọn, **chọn được chế độ `copy` hoặc `link`** |
| Lưu ra ngoài bằng `Filesystem.writeFile` + base64 (`App/src/shared/lib/platform.ts`) | Native lo, dùng FileProvider |
| `FileMeta.kind` được lưu | Không lưu, suy ra bằng `kindOf(name)` |
| Khóa `id` là UUID | Giữ UUID, native sinh |

### Câu hỏi mở của `schema.md` mà code đã trả lời sẵn

| Câu hỏi | Code hiện tại |
|---------|---------------|
| Chú thích lưu ở đâu? | **Ghi thẳng vào PDF**, xem [07](07-pdf-annotate.md). Không cần bảng chú thích. |
| Xóa tài liệu `app` thì xóa file không? | Có, xem [15](15-delete-files.md). |
| Cần bookmark không? | App **chưa có tính năng bookmark**. Không thêm bảng `bookmark` lúc này. |
| Office có chuyển PDF để xem không? | Không. Xem bằng HTML; chuyển PDF là công cụ riêng, **không lưu liên kết** giữa bản gốc và bản PDF. |

## 4. Ánh xạ `FileMeta` sang `document`

`FileMeta` ở `App/src/entities/file/model/types.ts`. Cột mới in đậm.

| `FileMeta` (code) | `document` (schema) | Ghi chú |
|-------------------|---------------------|---------|
| `id` | `id` | Giữ UUID chuỗi, native sinh |
| — | **`storage`** | `'app'` hoặc `'external'` |
| — | **`location`** | `app`: đường dẫn tương đối. `external`: `content://` URI |
| `name` | `display_name` | Đổi tên chỉ sửa cột này, không đụng `location` |
| `kind` | — | **Bỏ**, suy ra từ tên file |
| `size` | `size_bytes` | |
| `mime` | `mime_type` | |
| `addedAt` | `added_at` | |
| `openedAt` | `last_opened_at` | |
| `favorite` | `is_favorite` | |
| — | **`page_count`** | `NULL` với file không có trang |
| — | **`is_encrypted`** | Chủ yếu cho PDF |
| — | **`last_page`**, **`last_zoom`** | Phục hồi vị trí đọc |

## 5. Điểm nghẽn: chỗ duy nhất cần đổi

Mọi chức năng chỉ chạm vào file qua một vài hàm của `useLibrary()` (`App/src/entities/file/model/store.ts`):

| Hàm | Vai trò | Ai gọi | Sau khi chuyển gọi |
|-----|---------|--------|--------------------|
| `blobOf`, `bytesOf` | **Mọi lần đọc** nội dung | Reader, viewer, các công cụ, chia sẻ | `readContent` |
| `addBlob` | **Mọi lần tạo file mới** | `savePdf` (mọi công cụ PDF), `pdf-to-image` gọi trực tiếp | `saveOutput` |
| `importFiles` | Nhập từ thiết bị | Home, `FileSelect` | `importFromDevice` (đổi từ nhận `File[]` sang gọi hộp chọn native) |
| `replaceBlob` | Ghi đè tại chỗ, **duy nhất** | Lưu chú thích | `replaceContent` |
| `touch`, `toggleFavorite`, `rename` | Sửa metadata | Menu file, trang đọc | `updateDocument` |
| `remove` | Xóa | Xóa file, menu file | `removeDocuments` |

Giữ nguyên **tên và chữ ký** các hàm này, chỉ đổi ruột sang `NativeApi` (`App/src/entities/file/api/`), thì các công cụ ghép, tách, ảnh, quét không phải sửa. Ngoại lệ duy nhất là `importFiles`, vì nó nhận `File[]` từ `<input>` mà native thì tự mở hộp chọn; hai nơi gọi (`HomePage.vue`, `FileSelect.vue`) phải đổi.

## 6. Thứ tự triển khai đề xuất

| Giai đoạn | Việc | Hành vi thay đổi |
|-----------|------|------------------|
| 0 | Định nghĩa `NativeApi` (kiểu TypeScript) và **adapter mock** bọc kho IndexedDB hiện có; đổi `useLibrary` gọi qua hợp đồng | Không (chỉ cấu trúc) |
| 1 | Native: Room `document`, kho `app`, lệnh thư viện, nhập `copy`, đọc nội dung | App chạy trên dữ liệu native |
| 2 | Lưu `last_page`, `last_zoom`, `page_count`, `is_encrypted` | Mở lại file đúng chỗ đã đọc |
| 3 | Xuất, chia sẻ bằng native; màn Cài đặt tối thiểu; nhắc việc mất file khi gỡ app | Bỏ vòng base64 ở chia sẻ |
| 4 | Link `external`, `save_mode = ask / folder` | Nhập giữ link, chọn nơi lưu |
| 5 | Di chuyển dữ liệu cũ từ IndexedDB (nếu cần) | Chỉ khi đã có người dùng thật |

Giai đoạn 1 nên chạy trên **máy thật sớm**, vì app chưa từng được thử trên Android.

## 7. Câu hỏi cần chốt

1. **Chế độ nhập mặc định là `link` hay `copy`?** (cũng là câu 1 của `schema.md` mục 8)
2. **Cách truyền nhị phân** giữa WebView và native: chọn sau khi đo với PDF lớn trên máy thật.
3. **Đã có người dùng thật với dữ liệu trong IndexedDB chưa?** Quyết định có cần giai đoạn 5.
4. Có phát hiện nhập trùng file và thùng rác khi xóa không? (đang ngoài schema tối giản)

## 8. Chưa kiểm chứng

- README của app ghi rõ **chưa chạy trên thiết bị hoặc emulator Android thật**. Mọi giả định về nơi lưu, FileProvider, quyền URI chưa được thử.
- Mình chưa đo chi phí truyền nhị phân giữa WebView và native.
