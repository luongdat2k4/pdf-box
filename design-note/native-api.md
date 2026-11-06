# Hợp đồng giữa WebView và tầng native

> Trạng thái: **bản nháp để thảo luận**. Bổ sung cho [`schema.md`](schema.md) và [`features/README.md`](features/README.md).
> **Phía Android đã được cài đặt** (mục 9) nhưng **WebView chưa gọi** và **chưa chạy trên thiết bị thật**.

## 1. Phân vai

Ba quyết định đã chốt:

| Quyết định | Nội dung |
|------------|----------|
| Native lo **dữ liệu và file** | SQLite (Room), nơi lưu file, nhập, xóa, đổi tên, xuất, chia sẻ, quyền truy cập |
| Hiển thị PDF **ở WebView** | `pdfjs-dist` giữ nguyên |
| Có **bản trình duyệt để dev** | Một lớp giả của hợp đồng này, chạy bằng IndexedDB |

Ranh giới cụ thể:

| Việc | Ở đâu | Ghi chú |
|------|-------|---------|
| Bảng `document`, truy vấn, sắp xếp | **Native** | Room |
| Lưu và đọc nội dung file, link `external`, quyền | **Native** | |
| Chọn file, chọn nơi lưu | **Native** | Hộp chọn của hệ thống |
| Xuất ra ngoài, chia sẻ | **Native** | Kotlin dùng được FileProvider, bỏ vòng base64 hiện tại |
| Cài đặt (`save_mode`...) | **Native** | DataStore |
| Hiển thị PDF, tìm chữ, thumbnail | WebView | `pdfjs-dist` |
| Ghép, tách, khóa, chú thích, ảnh ↔ PDF | WebView | `@cantoo/pdf-lib` đọc byte từ native, trả byte về native |
| Xem Word, Excel, Markdown; Word/Excel → PDF | WebView | `mammoth`, SheetJS, `marked`, `html2canvas` |
| Chụp ảnh | WebView | `@capacitor/camera` giữ nguyên |
| Lọc danh sách theo tên, theo loại | WebView | Trên bản sao danh sách trong Pinia, xem mục 5 |

Nguyên tắc: **WebView không giữ bản sao dữ liệu bền nào**. Mọi thứ bền đi qua hợp đồng; Pinia chỉ giữ bản chụp danh sách để vẽ giao diện.

## 2. Sơ đồ

```
┌────────────────── WebView: App/src (Vue) ──────────────────┐
│ pages / widgets / features   (UI, gần như không đổi)        │
│        │                                                    │
│ entities/file  ── useLibrary (Pinia, giữ nguyên chữ ký)     │
│        │                                                    │
│ entities/file/api/native-api.ts   ◄── hợp đồng (mục 3)      │
│        ├── adapter native  ──► Capacitor plugin  ──────┐    │
│        └── adapter mock    ──► idb-keyval (dev, web)   │    │
└────────────────────────────────────────────────────────┼────┘
                                                         │
┌─────────────────── Android (Kotlin) ───────────────────▼────┐
│ Plugin  ─► Repository ─┬─► Room: bảng document                │
│                        ├─► Kho nội dung: filesDir/documents/  │
│                        ├─► SAF: giữ quyền URI (external)      │
│                        └─► DataStore: cài đặt                 │
└──────────────────────────────────────────────────────────────┘
```

Chọn adapter bằng `isNative()` (`App/src/shared/lib/platform.ts`).

`useLibrary` (`App/src/entities/file/model/store.ts`) **giữ nguyên các hàm công khai** (`blobOf`, `bytesOf`, `addBlob`, `replaceBlob`, `remove`, `touch`, ...) và đổi ruột thành gọi hợp đồng. Nhờ đó các công cụ ghép, tách, khóa, ảnh, quét gần như không phải sửa.

## 3. Hợp đồng

Viết bằng TypeScript để làm chuẩn. Phía Kotlin cài đặt đúng từng lệnh này. Tên trường dùng camelCase; cột SQLite vẫn là snake_case trong [`schema.md`](schema.md).

```ts
interface DocumentRecord {
  id: string                      // UUID, native sinh
  storage: 'app' | 'external'
  location: string                // app: đường dẫn tương đối | external: content:// URI
  displayName: string
  mimeType: string
  sizeBytes: number | null
  pageCount: number | null
  isEncrypted: boolean
  isFavorite: boolean
  lastPage: number
  lastZoom: number | null
  lastOpenedAt: number | null
  addedAt: number
}

type DocumentPatch = Partial<Pick<DocumentRecord,
  'displayName' | 'pageCount' | 'isEncrypted' | 'isFavorite' | 'lastPage' | 'lastZoom' | 'lastOpenedAt' | 'sizeBytes'>>

interface NativeApi {
  // ---- thư viện ----
  listDocuments(): Promise<DocumentRecord[]>
  updateDocument(id: string, patch: DocumentPatch): Promise<DocumentRecord>
  removeDocuments(ids: string[]): Promise<void>        // theo storage: xem mục 4

  // ---- nhập, tạo ----
  importFromDevice(opts: { accept: string[]; multiple: boolean; mode: 'copy' | 'link' }):
    Promise<{ added: DocumentRecord[]; skipped: string[] }>
  saveOutput(opts: { name: string; mimeType: string; data: Blob }): Promise<DocumentRecord>

  // ---- nội dung ----
  readContent(id: string): Promise<Blob>
  replaceContent(id: string, data: Blob): Promise<DocumentRecord>

  // ---- ra ngoài ----
  exportDocument(id: string): Promise<{ where: string }>
  shareDocument(id: string): Promise<void>

  // ---- cài đặt ----
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
}

interface Settings {
  saveMode: 'app' | 'ask' | 'folder'
  saveFolderUri: string | null
}
```

Ghi chú:

- `importFromDevice` mở hộp chọn **bên native**, thay cho `<input type="file">` ở `HomePage.vue` và `FileSelect.vue`. Danh sách đuôi hỗ trợ **do JS truyền xuống** (từ `EXT_KIND` ở `App/src/entities/file/model/types.ts`), native không giữ bản sao riêng, tránh hai nơi lệch nhau.
- `saveOutput` là điểm duy nhất để file mới ra đời. Native tự quyết nơi lưu theo `saveMode` ([`features/17-save-location-setting.md`](features/17-save-location-setting.md)); với `ask` thì hiện hộp chọn nơi lưu.
- `replaceContent` chỉ dành cho lưu chú thích. Native ghi ra file tạm rồi đổi tên, và với `external` kiểm tra quyền ghi.
- `kind` **không có** trong `DocumentRecord`; JS suy ra bằng `kindOf(displayName)`.
- Danh sách trả về toàn bộ, không phân trang: đủ cho hàng nghìn file; xem lại nếu lớn hơn.
- `importFromDevice`: `skipped` chứa **cả file không thuộc `accept` lẫn file nhập lỗi** (không phân biệt lý do). Chỉ khi **không nhập được file nào** mới trả `IO_ERROR`.
- `importFromDevice` ở chế độ `link`: nếu nhà cung cấp file **không cho giữ quyền lâu dài**, native **tự chuyển sang `copy`** cho file đó; giao diện biết qua `storage` của kết quả.
- `readContent` và `saveOutput` không truyền `Blob` qua cầu nối; xem "Lệnh của plugin `Library`" ngay dưới.

### Lệnh của plugin `Library`

`Blob` không đi qua được cầu nối Capacitor, nên mỗi lệnh của `NativeApi` ứng với một hoặc nhiều lệnh thật của plugin tên `Library`. Adapter native ở WebView (`native.ts`) lo việc ghép và chia khúc.

| Lệnh của plugin | Tham số | Trả về | Ứng với `NativeApi` |
|-----------------|---------|--------|---------------------|
| `listDocuments` | — | `{ documents }` | `listDocuments` |
| `updateDocument` | `{ id, patch }` | `{ document }` | `updateDocument` |
| `removeDocuments` | `{ ids }` | — | `removeDocuments` |
| `importFromDevice` | `{ accept, multiple, mode }` | `{ added, skipped }` | `importFromDevice` |
| `readChunk` | `{ id, offset, length }` | `{ data, eof, size }` (`data` là base64) | `readContent` (lặp tới `eof`) |
| `writeBegin` | — | `{ token }` | mở phiên ghi |
| `writeChunk` | `{ token, data }` (base64) | — | gửi từng khúc, **theo thứ tự** |
| `writeCommit` | `{ token, name, mimeType?, fallbackToApp? }` hoặc `{ token, id }` | `{ document }` | `saveOutput` (có `name`) hoặc `replaceContent` (có `id`) |
| `writeAbort` | `{ token }` | — | hủy phiên, xóa file tạm |
| `exportDocument` | `{ id }` | `{ where }` | `exportDocument` |
| `shareDocument` | `{ id }` | — | `shareDocument` |
| `getSettings` | — | `{ saveMode, saveFolderUri }` | `getSettings` |
| `setSettings` | `{ saveMode?, saveFolderUri? }` | như trên | `setSettings` |
| `pickSaveFolder` | — | như trên | **mới**, xem dưới |

Quy ước:

- **`readChunk`:** `length` tối đa **4 MiB** mỗi lệnh; WebView tự chọn kích thước khúc. `size` có thể là `null` nếu nhà cung cấp không báo.
- **`writeCommit` với `ask`:** native mở hộp "tạo tài liệu" và **giữ phiên ghi** cho tới khi xong. Nếu người dùng hủy, lệnh trả `CANCELLED` và **phiên vẫn còn**, để WebView gọi lại với `fallbackToApp: true` (lưu vào app) thay vì mất kết quả vừa tạo, hoặc gọi `writeAbort`.
- **`pickSaveFolder`** là lệnh **thêm so với hợp đồng gốc**: `setSettings` không thể tự đặt `saveFolderUri` vì JavaScript không có quyền truy cập thư mục. Hộp chọn thư mục phải do native mở để giữ quyền, rồi tự chuyển `saveMode` sang `folder`. `setSettings({ saveMode: 'folder' })` bị từ chối (`INVALID_ARGUMENT`) nếu chưa có thư mục đã được cấp quyền.
- **`exportDocument`:** Android 10 trở lên ghi vào `Documents/PDFToolbox` qua MediaStore (không cần quyền lưu trữ); Android 9 trở xuống mở hộp "tạo tài liệu" để người dùng chọn nơi lưu.
- **`shareDocument`:** với file `app`, native **sao chép sang bộ nhớ đệm dưới đúng tên hiển thị** rồi chia sẻ (tên lưu trên đĩa là UUID, người nhận sẽ thấy nhầm); với `external` chia sẻ thẳng bằng URI.
- Mọi lệnh bị từ chối đều có `code` là một trong các mã dưới đây.

### Mã lỗi

Mọi lệnh có thể từ chối (reject) với một mã cố định, để giao diện hiện đúng thông báo:

| Mã | Khi nào |
|----|---------|
| `NOT_FOUND` | Không có `document`, hoặc nội dung không còn |
| `PERMISSION_LOST` | `external` đã mất quyền URI |
| `NO_WRITE_PERMISSION` | `external` không ghi được (giao diện đề nghị "Lưu bản sao") |
| `UNSUPPORTED_TYPE` | Loại file không nằm trong `accept` |
| `CANCELLED` | Người dùng đóng hộp chọn (không phải lỗi, không hiện thông báo) |
| `IO_ERROR` | Lỗi đọc, ghi khác |
| `INVALID_ARGUMENT` | Yêu cầu sai: thiếu trường, giá trị ngoài phạm vi, mã phiên không tồn tại, đặt chế độ thư mục khi chưa có quyền. **Thêm so với hợp đồng gốc** |

## 4. Quy tắc phía native

Giữ các bất biến ở [`schema.md`](schema.md) mục "Tổng quan cấu trúc":

- **Tạo:** ghi nội dung trước, rồi thêm dòng `document` (trong một giao dịch Room cho phần metadata).
- **Xóa:** xóa dòng `document` trước, nội dung sau. Với `external` **chỉ xóa dòng và nhả quyền URI**, không đụng file gốc của người dùng.
- **Khởi động:** dọn nội dung mồ côi trong `filesDir/documents/`.
- **Luồng:** mọi lệnh chạy ngoài luồng chính (`Dispatchers.IO`).
- **Đồng thời:** các lệnh ghi cùng một `id` xếp hàng, tránh hai lần lưu chú thích chồng nhau.
- **Số phiên bản:** dùng cơ chế migration của Room, thay cho khóa `schemaVersion` đã đề xuất cho `idb-keyval`.

## 5. Dữ liệu nhị phân

Đây là chỗ dễ làm chậm. Plugin Capacitor truyền JSON; file lớn dạng base64 tốn khoảng một phần ba bộ nhớ thêm và đã là nguyên nhân rủi ro ở chia sẻ, lưu file hiện tại (`blobToBase64` trong `App/src/shared/lib/platform.ts`).

| Hướng | Cách | Trạng thái |
|-------|------|------------|
| Native → WebView (`readContent`) | **Đã chọn cho bản đầu:** `readChunk`, base64 theo khúc tới 4 MiB | Đã cài đặt. Phục vụ bằng **URL** (để pdf.js tải trực tiếp) **không dùng được ngay**: `capacitor.config.ts` đang trỏ `server.url` vào máy dev, và nội dung `external` là `content://` nên không thành URL tệp |
| WebView → native (`saveOutput`, `replaceContent`) | **Đã chọn cho bản đầu:** `writeBegin` / `writeChunk` / `writeCommit` | Đã cài đặt, base64 theo khúc |

Cách truyền này là phương án đơn giản nhất chạy được. **Chưa đo với PDF lớn trên máy thật.** Lớp hợp đồng che giấu cách truyền, nên đổi sau (ví dụ phục vụ qua URL) không ảnh hưởng giao diện.

Đọc nội dung bằng URL còn mở ra khả năng để pdf.js tải **từng phần** thay vì nạp cả file vào bộ nhớ như `openPdf(bytes)` hiện nay. Đó là cải tiến sau, không cần cho bản đầu.

## 6. Bản trình duyệt (adapter mock)

- Cài `NativeApi` bằng `idb-keyval` và tái sử dụng gần như nguyên `App/src/entities/file/api/db.ts` hiện có.
- **Giới hạn có chủ đích:** chỉ có `storage = 'app'`; `importFromDevice` dùng `<input type="file">` nên chỉ chế độ `copy`; `saveMode` chỉ `app`; `exportDocument` là tải xuống; `shareDocument` dùng Web Share.
- Mục đích duy nhất của mock: **dev giao diện nhanh trên trình duyệt**. Hành vi thật (quyền, link hỏng, `external`) chỉ kiểm thử được trên Android.
- Rủi ro: mock và native lệch nhau theo thời gian. Giảm bằng cách giữ chung **một bộ kiểu TypeScript** (mục 3) và viết vài bài kiểm thử hợp đồng chạy cho cả hai.

## 7. Vị trí trong cấu trúc Feature-Sliced Design

Giữ đúng quy tắc lớp của dự án (`npm run lint:fsd`, `App/scripts/check-fsd.mjs`):

```
App/src/entities/file/api/
  native-api.ts      # kiểu + chọn adapter
  native.ts          # adapter gọi plugin Capacitor
  mock.ts            # adapter IndexedDB (dev)
App/src/entities/file/model/store.ts   # useLibrary, facade giữ nguyên chữ ký
```

Phía Android: xem mục 9.

## 8. Rủi ro

- **Chưa chạy trên Android thật.** README của app ghi rõ điều này, mà hướng này đặt phần quan trọng nhất lên chính tầng đó. Cần kiểm thử trên máy thật từ giai đoạn đầu.
- **Dữ liệu cũ trong IndexedDB:** nếu đã có người dùng thật, cần một lần di chuyển: WebView đọc IndexedDB và gửi sang native qua `saveOutput`/nhập. Nếu chỉ có dữ liệu thử nghiệm thì bỏ qua. **Cần bạn xác nhận.**
- **iOS:** nếu thêm sau này, toàn bộ tầng native phải viết lại bằng Swift. README hiện ghi iOS chưa được thêm.
- **Hai nơi cùng biết "loại file hỗ trợ"** nếu không truyền từ JS xuống (mục 3).
- **Chi phí nhị phân** (mục 5) chưa đo.

## 9. Phía Android: đã cài đặt gì

Mã nằm ở `App/android/app/src/main/kotlin/vn/alf/pdftoolbox/library/`. Plugin được đăng ký trong `MainActivity.java` cạnh `WindowColorPlugin`.

| Thư mục / file | Vai trò |
|----------------|---------|
| `bridge/LibraryPlugin.kt` | Plugin Capacitor tên `Library`. Mỏng: đọc yêu cầu, gọi repository, đổi kết quả hoặc lỗi thành JSON hoặc `reject(msg, code)` |
| `bridge/Json.kt` | Chuyển đổi giữa mô hình native và JSON (ghi `null` bằng `JSONObject.NULL`, vì `put(key, null)` sẽ **xóa** khóa) |
| `LibraryRepository.kt` | **Toàn bộ logic**: nhập, tạo, thay nội dung, đọc khúc, xóa, xuất, chia sẻ, cài đặt, dọn mồ côi |
| `LibraryServices.kt` | Bản duy nhất (singleton) của DB, DataStore, phiên ghi |
| `db/` | Room: `AppDatabase` (phiên bản 1), `DocumentDao`, `Converters` |
| `model/` | `DocumentEntity`, `DocumentPatch`, `Settings`, `ErrorCode`, `Storage`, `ImportMode` |
| `files/AppContentStore.kt` | Nội dung `app` trong `filesDir/documents/`; chặn đường dẫn thoát khỏi thư mục |
| `files/ExternalContentStore.kt` | Nội dung `external` qua `content://`: giữ và nhả quyền, đọc theo đoạn, ghi đè, tạo trong thư mục |
| `files/WriteSessions.kt` | Phiên ghi theo khúc, mỗi phiên một file tạm |
| `SettingsStore.kt` | `save_mode`, `save_folder_uri` trong DataStore |

Quy tắc đã được cài đặt đúng như mục 4:

- **Thứ tự và an toàn khi bị ngắt:** tạo thì ghi nội dung rồi mới thêm dòng; xóa thì xóa dòng rồi mới xóa nội dung. Một khóa (`contentGate`) bao quanh cặp "đặt file vào chỗ + thêm dòng" và quá trình dọn mồ côi, để dọn dẹp không xóa nhầm file vừa tới.
- **Thay nội dung `app`:** ghi ra file tạm rồi đổi tên (nguyên tử trên cùng hệ thống file). **Với `external` không nguyên tử được**: dùng chế độ `"wt"` (ghi và cắt bớt) để PDF ngắn hơn không còn đuôi cũ, nhưng nếu ngắt giữa chừng thì file đích bị cắt dở.
- **Xóa `external`:** chỉ nhả quyền URI đã giữ riêng. File nằm trong thư mục người dùng đã cấp quyền cả cây **không** có quyền riêng nên không bị nhả; quyền thư mục cũng **không** bị nhả khi đổi thư mục, vì các file đã lưu ở đó sẽ mất truy cập.
- **Cùng một `id`:** các lệnh ghi xếp hàng bằng khóa theo `id`.
- **Chặn đường dẫn:** `location` của file `app` được kiểm tra, từ chối `..`, đường dẫn tuyệt đối, thư mục con; đuôi file lấy từ tên hiển thị chỉ được gồm `a-z0-9`, tối đa 10 ký tự.
- **Dọn mồ côi:** chạy một lần mỗi khi plugin tải, ở luồng nền, không chặn khởi động; thêm xóa file tạm bị bỏ quên quá một ngày.

### Còn thiếu

- **WebView chưa gọi** plugin này: chưa có `native.ts`, `mock.ts`, `native-api.ts`. Plugin chưa từng được gọi từ JavaScript.
- **Chưa chạy trên thiết bị hoặc giả lập.** Phần giao diện hệ thống (hộp chọn, quyền URI, MediaStore, chia sẻ) chưa được kiểm chứng.
- **Chưa có kiểm thử tự động nào** cho phần native (đã bỏ các bài kiểm thử đơn vị). Room và `LibraryRepository` cần thiết bị hoặc Robolectric để kiểm thử.
