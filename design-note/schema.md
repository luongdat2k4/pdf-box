# Thiết kế schema cho app đọc, chỉnh sửa và tạo tài liệu

> Trạng thái: **bản nháp để thảo luận**, chưa chốt.
> Hướng thiết kế: **SQLite và logic dữ liệu nằm ở tầng native Android; `App/src` là giao diện.** Một bảng `document`.
> Hợp đồng giữa hai tầng: [`native-api.md`](native-api.md). Tài liệu từng chức năng: [`features/README.md`](features/README.md).

## Tổng quan cấu trúc

Dữ liệu chia thành **bốn tầng**, theo mức độ bền:

```
┌─ 1. BỀN: NẰM Ở TẦNG NATIVE (mất khi gỡ app, trừ file `external`) ────────────────┐
│                                                                                  │
│  A. SQLite (Room)  ── bảng document                                              │
│       khóa = id (UUID)                                                           │
│                          │ document.location  (quan hệ 1 – 1)                    │
│                          ▼                                                       │
│  B. Nội dung file                                                                │
│       storage = 'app'      ─► filesDir/documents/<id>.<đuôi>                     │
│       storage = 'external' ─► file của người dùng, giữ bằng content:// URI       │
│                                                                                  │
│  C. Cài đặt (DataStore):  save_mode, save_folder_uri                             │
└──────────────────────────────────────────────────────────────────────────────────┘
┌─ 2. TẠM (xóa được, app tự tạo lại) ──────────────────────────────────────────────┐
│  cacheDir/…    bản sao dùng khi chia sẻ                                          │
└──────────────────────────────────────────────────────────────────────────────────┘
┌─ 3. NGOÀI APP (do người dùng giữ, không còn thuộc DB) ───────────────────────────┐
│  Documents/PDFToolbox/<tên>   bản xuất ra ("Save to device")                     │
│  vị trí do người dùng chọn    khi save_mode = ask / folder                       │
└──────────────────────────────────────────────────────────────────────────────────┘
┌─ 4. TẦNG WEBVIEW (không phải nguồn sự thật) ─────────────────────────────────────┐
│  Pinia `items`  bản chụp danh sách để vẽ giao diện, nạp lại từ native            │
│  localStorage "pdftoolbox.fabOffset"   vị trí nút công cụ (chỉ giao diện)        │
│  chỉ trong bộ nhớ: chú thích chưa lưu, kết quả tìm chữ, ảnh quét nháp,           │
│                    tài liệu pdf.js đang mở, MẬT KHẨU PDF                         │
│  Bản trình duyệt (dev): thay tầng 1 bằng IndexedDB qua adapter mock              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Tất cả các thực thể

| Thực thể | Nơi lưu | Khóa | Tầng | Trạng thái |
|----------|---------|------|------|------------|
| `document` (metadata một file) | SQLite (Room), native | `id` | Bền | Có sẵn dưới dạng `FileMeta` ở IndexedDB, **chuyển sang native** |
| Nội dung file `app` | `filesDir/documents/` | `location` | Bền | Có sẵn ở IndexedDB, **chuyển sang native** |
| Nội dung file `external` | Nơi người dùng giữ file | `location` (URI) | Bền | **Mới** |
| `save_mode`, `save_folder_uri` | DataStore, native | tên khóa | Bền | **Mới** |
| Số phiên bản schema | Cơ chế migration của Room | — | Bền | **Mới** |
| Vị trí nút công cụ | `localStorage` | tên khóa | WebView | Có sẵn, chỉ là giao diện |
| Bản sao chia sẻ | `cacheDir` | tên file | Tạm | Có sẵn (đổi sang native) |
| Bản xuất ra ngoài | `Documents/PDFToolbox/` | tên file | Ngoài app | Có sẵn |
| Chú thích, bookmark, phiên quét, lịch sử thao tác, thẻ, thư mục | — | — | — | **Không có**, xem mục 7 |

Trong tầng bền chỉ có **một bảng** `document`.

### Quan hệ và bất biến

- Mỗi `document` có **đúng một** nội dung (mục B), nối bằng `location`. Với `external`, "nội dung" là file của người dùng mà app chỉ giữ link.
- Giữ đúng khi bị ngắt giữa chừng:
  - **Tạo:** ghi **nội dung trước**, dòng `document` sau. Hỏng ở giữa thì chỉ còn nội dung mồ côi (vô hại, dọn được).
  - **Xóa:** xóa **dòng `document` trước**, nội dung sau. Với `external` **chỉ xóa dòng và nhả quyền URI, không đụng file gốc**. Code hiện tại xóa theo thứ tự ngược lại (`removeFile`), cần đổi.
- **Dọn mồ côi** khi khởi động: nội dung `app` không có `document` thì xóa.
- Nội dung có thể đổi tại chỗ mà `location` giữ nguyên (lưu chú thích); khi đó chỉ `size_bytes` đổi.

### Vòng đời của một file

```
 Nhập / tạo ─► ghi nội dung ─► ghi document ─► hiện trong danh sách
                                                   │
   mở ─► đọc nội dung, cập nhật last_opened_at, last_page ◄──┤
   chú thích ─► ghi đè nội dung, cập nhật size_bytes         │
   xuất ra ngoài ─► sao chép ra Documents/PDFToolbox          │
   xóa ─► xóa document ─► xóa nội dung (chỉ với app) ◄────────┘
```

## 1. Phạm vi và giả định

Chức năng của app:

- Đọc file PDF, Office, văn bản, ảnh
- Quét tài liệu bằng camera để tạo PDF
- Chú thích PDF
- Ghép, tách, khóa / mở khóa PDF, chuyển đổi giữa ảnh, Word/Excel/TXT/Markdown và PDF

Giả định (cần xác nhận):

| # | Giả định | Ghi chú |
|---|----------|---------|
| 1 | **Native Android (Kotlin) giữ SQLite (Room) và file**; `App/src` (Vue + Capacitor) là giao diện, gọi API cục bộ | Đã chốt. Xem [`native-api.md`](native-api.md) |
| 2 | **Xử lý và hiển thị tài liệu ở WebView**: `pdfjs-dist`, `@cantoo/pdf-lib`, `mammoth`, SheetJS | Đã chốt. Native chỉ lo dữ liệu và file |
| 3 | **Có bản trình duyệt để dev**, dùng adapter mock bằng IndexedDB | Đã chốt. Mock chỉ có `storage = 'app'` |
| 4 | Local-first, chưa đồng bộ cloud | Nếu có cloud, thêm `updated_at`, `deleted_at`, `sync_state` |
| 5 | Chú thích **ghi thẳng vào PDF** | Đúng với code hiện có (mục 5), không cần bảng chú thích |
| 6 | Nhập file có hai chế độ: **sao chép vào app** (`app`) hoặc **giữ link** (`external`) | Cả hai làm được nhờ native (mục 3). Chế độ mặc định chưa chốt, xem mục 8 |
| 7 | Chưa có tìm kiếm toàn văn xuyên nhiều file | Thêm sau, không ảnh hưởng schema hiện tại |

## 2. Nguyên tắc thiết kế

1. **App là app làm việc với file, không phải app quản lý tài liệu.** DB chỉ nhớ: file nào đã có, đọc đến đâu, file nào được yêu thích.
2. **Native là nguồn sự thật duy nhất của dữ liệu bền.** WebView không giữ bản sao bền nào; Pinia chỉ là bản chụp để vẽ giao diện.
3. **Metadata và nội dung tách riêng.** Liệt kê danh sách không phải đọc nội dung file.
4. **Khóa chính là UUID**, đã nằm trong URL `/reader/:id` và `/office/:id`. Native sinh `id`.
5. **Không phụ thuộc định dạng.** Loại file suy ra từ tên file ở WebView (`kindOf`), **không lưu thành cột**. Các cột chỉ có nghĩa với một số định dạng (`page_count`, `is_encrypted`) cho phép `NULL`. Danh sách đuôi hỗ trợ do WebView truyền xuống, native không giữ bản sao riêng.
6. **Thêm bảng khi có tính năng yêu cầu thật**, kèm migration của Room.
7. **Không lưu mật khẩu tài liệu** ở bất kỳ đâu.

## 3. Hai nơi lưu file

| | `app` (kho riêng của app) | `external` (vị trí người dùng chọn) |
|---|---|---|
| Trạng thái | Làm được | **Làm được nhờ native** |
| Truy cập | Native đọc ghi trực tiếp | URI do hệ thống cấp, native giữ quyền |
| Link hỏng | Hiếm, chỉ khi app tự xóa | Có thể, file bị xóa hoặc di chuyển ngoài app |
| Vòng đời | **Mất khi gỡ app hoặc xóa dữ liệu** | Tồn tại độc lập với app |
| Giá trị `location` | Đường dẫn **tương đối**, ví dụ `documents/<id>.pdf` | `content://` URI |
| Chia sẻ sang app khác | Native dùng FileProvider | Mở trực tiếp bằng URI |

Quy tắc:

- `app`: lưu **đường dẫn tương đối**, ghép với thư mục gốc lúc chạy. Đường dẫn tuyệt đối có thể đổi khi khôi phục máy.
- `external`: native mở hộp chọn file của hệ thống (`ACTION_OPEN_DOCUMENT`) và gọi `takePersistableUriPermission` ngay khi chọn, nếu không sẽ mất quyền sau khi khởi động lại. Theo tài liệu Android, hệ thống giới hạn số URI được giữ quyền (khoảng 128, tăng lên 512 từ Android 11); **cần xác nhận lại khi làm**.
- Khi mất quyền hoặc file không còn: native trả mã lỗi `PERMISSION_LOST` hoặc `NOT_FOUND`, giao diện cho người dùng bỏ khỏi danh sách. Trạng thái này **tính lúc chạy**, không lưu thành cột.
- **Ghi vào `external`** (lưu chú thích) cần quyền ghi; nếu không có thì đề nghị "Lưu bản sao" (`NO_WRITE_PERMISSION`).

### Nơi lưu file do app tạo ra (quét, ghép, tách, khóa, chuyển đổi)

Tuỳ chọn người dùng, lưu thành **cài đặt** (DataStore, không phải dữ liệu trong DB):

| `save_mode` | Hành vi |
|-------------|---------|
| `app` (mặc định) | Lưu vào kho riêng của app |
| `ask` | Hỏi vị trí lưu mỗi lần (`ACTION_CREATE_DOCUMENT`) |
| `folder` | Lưu vào một thư mục cố định do người dùng chọn một lần (`ACTION_OPEN_DOCUMENT_TREE`), kèm `save_folder_uri` |

Chế độ `folder` đáng làm: chỉ xin quyền **một lần cho cả thư mục**, mọi file tạo ra trong đó không tốn dần hạn mức URI.

File tạo ra ở `ask` và `folder` có `storage = 'external'`. Vì mặc định là `app`, cần nút **"Xuất ra ngoài"** rõ ràng (đã có dưới tên "Save to device") và lời nhắc rằng gỡ app sẽ mất file `app`. Chi tiết: [`features/16-share-and-export.md`](features/16-share-and-export.md), [`features/17-save-location-setting.md`](features/17-save-location-setting.md).

## 4. Schema (SQLite / Room)

```sql
CREATE TABLE document (
  id              TEXT PRIMARY KEY,           -- UUID, native sinh
  storage         TEXT NOT NULL CHECK (storage IN ('app', 'external')),
  location        TEXT NOT NULL,              -- app: đường dẫn tương đối | external: content:// URI
  display_name    TEXT NOT NULL,
  mime_type       TEXT NOT NULL,              -- application/pdf, docx, xlsx, image/*...
  size_bytes      INTEGER,
  page_count      INTEGER,                    -- NULL nếu định dạng không có khái niệm trang
  is_encrypted    INTEGER NOT NULL DEFAULT 0, -- 1 = cần mật khẩu để mở (chủ yếu cho PDF)
  is_favorite     INTEGER NOT NULL DEFAULT 0,
  last_page       INTEGER NOT NULL DEFAULT 0, -- trang đang đọc dở
  last_zoom       REAL,
  last_opened_at  INTEGER,                    -- epoch mili giây
  added_at        INTEGER NOT NULL,
  UNIQUE (storage, location)
);
CREATE INDEX idx_doc_recent ON document(last_opened_at DESC);
```

Ánh xạ với `FileMeta` hiện có (`App/src/entities/file/model/types.ts`) và với `DocumentRecord` trong [`native-api.md`](native-api.md):

| `FileMeta` (cũ) | `document` | `DocumentRecord` |
|-----------------|------------|------------------|
| `id` | `id` | `id` |
| — | `storage`, `location` (mới) | `storage`, `location` |
| `name` | `display_name` | `displayName` |
| `kind` | bỏ, suy ra bằng `kindOf(name)` | không có |
| `size`, `mime` | `size_bytes`, `mime_type` | `sizeBytes`, `mimeType` |
| `addedAt`, `openedAt`, `favorite` | `added_at`, `last_opened_at`, `is_favorite` | `addedAt`, `lastOpenedAt`, `isFavorite` |
| — | `page_count`, `is_encrypted`, `last_page`, `last_zoom` (mới) | `pageCount`, `isEncrypted`, `lastPage`, `lastZoom` |

Ghi chú:

- `UNIQUE (storage, location)` đảm bảo mỗi nội dung chỉ có một dòng. Với `app`, vì `location` dựa trên `id` nên **không chặn được nhập trùng**. Với `external`, nó **chặn** nhập cùng một file hai lần (cùng URI) nếu native dùng lại đúng URI; thực tế cùng một file có thể ra URI khác nhau tùy cách chọn, nên cũng không đảm bảo hoàn toàn.
- Đổi tên chỉ sửa `display_name`, không đụng `location`.
- Trạng thái đọc gộp vào `document` vì mỗi file chỉ có một bộ giá trị.
- `page_count`, `is_encrypted` **không tính lúc nhập** để nhập nhiều file không bị chậm; WebView điền qua `updateDocument` khi mở lần đầu.
- Kiểu `INTEGER` 0/1 cho cờ ở SQL; phía hợp đồng trả về `boolean`.
- Dữ liệu cũ trong IndexedDB: xem [`native-api.md`](native-api.md) mục 8.

## 5. Chú thích: ghi thẳng vào PDF

Code hiện có đã chọn hướng **ghi thẳng vào file**: highlight, gạch chân, gạch ngang, bút được "in" vào trang bằng phép vẽ vector rồi ghi đè nội dung (`App/src/features/pdf-annotate/`). Vì vậy **không có bảng `annotation`**.

- Ưu điểm: file đi đâu chú thích đi đó, mở bằng app nào cũng thấy.
- Nhược điểm: sau khi lưu không sửa hoặc xóa từng nét được; ghi đè là thao tác nguy hiểm nếu bị ngắt giữa chừng.
- Với native: `replaceContent` ghi ra file tạm rồi đổi tên; với `external` kiểm tra quyền ghi (mục 3).
- Nếu sau này cần chú thích sửa được, thêm bảng `annotation` gắn với `document.id` là một migration Room độc lập, không đụng `document`.

Chi tiết: [`features/07-pdf-annotate.md`](features/07-pdf-annotate.md).

## 6. Rủi ro và lưu ý

- **Chưa chạy trên Android thật** (README của app ghi rõ), trong khi kiến trúc này đặt phần quan trọng nhất lên tầng native. Cần kiểm thử trên máy thật từ giai đoạn đầu.
- **Mất file `app` khi gỡ app** hoặc xóa dữ liệu. Cần nút xuất và lời nhắc.
- **Link `external` hỏng hoặc mất quyền.** Giao diện phải xử lý `NOT_FOUND`, `PERMISSION_LOST` mà không làm hỏng danh sách.
- **Xóa tài liệu `app` là xóa luôn nội dung;** `external` chỉ bỏ link.
- **Chuyển dữ liệu nhị phân** giữa WebView và native chưa đo; xem [`native-api.md`](native-api.md) mục 5.
- **Ảnh quét nháp** chưa xuất chỉ nằm trong bộ nhớ, không vào DB. Chỉ lưu nếu muốn tiếp tục phiên quét dở sau khi tắt app.
- **Bộ nhớ:** công cụ ghép đọc toàn bộ byte của mọi file nguồn cùng lúc; PDF lớn có thể gây áp lực trong WebView. Chưa đo.
- **Mock (trình duyệt) và native có thể lệch nhau;** giữ chung kiểu TypeScript và vài bài kiểm thử hợp đồng.

## 7. Chưa có trong schema (thêm khi cần)

| Khi có yêu cầu này | Thì thêm |
|--------------------|----------|
| Bookmark do người dùng tạo (app chưa có tính năng này) | Bảng `bookmark(document_id, page_index, label, created_at)` |
| Chú thích sửa được | Bảng `annotation` (mục 5) |
| Tiếp tục phiên quét dở sau khi tắt app | Bảng phiên quét, ảnh nháp lưu ở thư mục cache |
| Thùng rác, hoàn tác xóa | Cột `deleted_at` |
| Lịch sử ghép/tách/khóa | Bảng thao tác (job) |
| Phân loại ngay trong app | Thư mục ảo hoặc thẻ |
| Tìm nội dung xuyên nhiều file | Bảng tìm kiếm toàn văn, kèm trích xuất văn bản. Room hỗ trợ FTS3/FTS4; dùng FTS5 phải kiểm tra lại khi làm |
| Phát hiện nhập trùng chắc chắn | Cột `content_hash` |
| Đồng bộ nhiều thiết bị | `updated_at`, `deleted_at`, `sync_state` ở mọi bảng |

## 8. Câu hỏi còn mở

1. **Chế độ nhập mặc định là `link` hay `copy`?** `link` đúng ý ban đầu "chỉ lưu đường dẫn" nhưng có rủi ro link hỏng; `copy` an toàn hơn nhưng tốn dung lượng.
2. **Cách truyền nhị phân** giữa WebView và native (mục 5 của `native-api.md`): chọn sau khi đo.
3. **Đã có người dùng thật với dữ liệu trong IndexedDB chưa?** Quyết định có cần viết bước di chuyển hay không.
4. Có cần phát hiện nhập trùng file không?
5. Có cần thùng rác khi xóa file không?
6. Chú thích có cần sửa được sau khi lưu không?
7. Có tính năng bookmark ở các bản sau không?
