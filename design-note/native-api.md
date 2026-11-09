# Hợp đồng giữa WebView và tầng native

> Trạng thái: **bản nháp để thảo luận**. Bổ sung cho [`schema.md`](schema.md) và [`features/README.md`](features/README.md).
> Android và WebView đã nối với nhau; hợp đồng đồng bộ theo sự kiện cập nhật ngày 09/11/2026. Phạm vi kiểm chứng ghi tại [`file-library-sync.md`](file-library-sync.md).

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

### Thư viện theo sự kiện (09/11/2026)

**Danh sách lớn:** Home, trang tìm kiếm và `FileSelect` dùng `VirtualList` với dòng cao 64px, chỉ mount vùng nhìn thấy và đệm 5 dòng mỗi phía. Đổi tab, loại file hoặc truy vấn sẽ đưa danh sách về đầu. Tìm metadata chờ 160ms sau khi gõ, chuẩn hóa tiếng Việt không dấu, so khớp từng từ trong tên đầy đủ/đuôi file/MIME/loại file. Chuỗi chuẩn hóa được cache theo file, tự cập nhật khi đổi tên. Lọc tìm kiếm chạy theo đợt 512 file, nhường event loop và bỏ kết quả cũ khi truy vấn thay đổi. Store cache bảng tra theo ID và nhóm loại file; trạng thái chọn dùng Map. Nội dung file không được đọc để lọc/tìm. Hiện vẫn tải toàn bộ **metadata** vào bộ nhớ; virtual scroll giới hạn DOM, chưa phân trang ở native.

Vòng đời thư viện thuộc `App.vue` và `LibraryWatcher`, độc lập với màn hình Home:

| Lệnh | Tham số | Kết quả |
|------|---------|---------|
| `getLibraryAccess` | — | `{ hasAccess: boolean, prompted: boolean }` |
| `requestLibraryAccess` | — | Xin quyền bộ nhớ qua hệ thống rồi trả trạng thái thực tế như trên |
| `syncLibrary` | `{ accept: string[] }` | `LibrarySyncState`; chỉ khởi tạo toàn bộ nếu chưa hoàn tất, các lần sau kiểm tra bù |
| `scanLibrary` | `{ accept: string[] }` | `LibrarySyncState`; yêu cầu quét lại toàn bộ có chủ đích |
| `listDocuments` | — | `{ documents: DocumentRecord[], revision: number }`; snapshot nhất quán, chỉ đọc Room |

- Khởi động: đăng ký `documentsChanged` và `librarySyncState`, hiển thị snapshot DB trước, rồi kiểm tra quyền/khởi tạo. Lần đầu chưa hỏi quyền thì app tự xin một lần. Android 11+ dùng `MANAGE_EXTERNAL_STORAGE`; Android 10 trở xuống dùng quyền đọc/ghi (manifest giới hạn đến API 29, Android 10 bật `requestLegacyExternalStorage`).
- Không dựa vào `RESULT_OK` của Settings: kiểm tra `Environment.isExternalStorageManager()` khi quay lại. Từ chối quyền vẫn giữ thư viện và nút “Cấp quyền”, không tự hỏi liên tục. DataStore giữ `device_storage_prompted`, độc lập với `save_mode`/`save_folder_uri`.
- `DeviceStorage` quét bộ nhớ dùng chung và các volume gắn ngoài mà Android cho truy cập, bỏ qua thư mục bị bảo vệ như Android/data và Android/obb. Kiểm tra quyền và hủy coroutine trong lúc quét. Chỉ đọc metadata của file có đuôi do WebView truyền xuống.
- File tìm thấy được lưu với `storage = external`, `location` là `content://` URI do FileProvider của app cấp cho file gốc trên bộ nhớ dùng chung. Không sao chép nội dung, không giữ quyền URI riêng từng file. Quyền đọc phụ thuộc quyền bộ nhớ của app; khi thu hồi quyền thì trả `PERMISSION_LOST`.
- Vào Home/chuyển tab không gọi đồng bộ. Resume được xử lý native: đăng ký lại observer từ checkpoint, so mtime thư mục để phát hiện thay đổi thành viên; chỉ liệt kê thư mục đổi và cây con mới. Nút “Cập nhật” gọi `syncLibrary`; Cài đặt có “Quét lại toàn bộ bộ nhớ”. Không có vòng quét 30 giây hoặc foreground service.
- FileObserver đăng ký cả thư mục chưa có tài liệu, trước khi đọc nội dung. Theo dõi CREATE/CLOSE_WRITE/ATTRIB/MOVED_TO/MOVED_FROM/DELETE và các sự kiện self. Gom theo đường dẫn 250ms; file chưa ổn định thử lại tối đa 3 lần. Hàng đợi native dùng chung cho sự kiện, kiểm tra bù và lệnh đồng bộ. Theo dõi thay đổi volume khi foreground.
- Android 11+: MediaStore checkpoint theo volume/version/generation; generation không đổi thì không truy vấn bản ghi. Khi thay đổi, truy vấn delta và inventory ID riêng để xác nhận xóa. Android 10 trở xuống truy vấn collection khi kiểm tra bù, không duyệt lại toàn bộ hệ thống file. Nguồn không truy cập được không được tiến checkpoint.
- `documentsChanged` có `{ revision, upserted: DocumentRecord[], removedIds: string[] }`, phát sau commit. Room invalidation bao gồm cả tạo/import/sửa/xóa trong app; `documentsRemoved` vẫn giữ để tương thích. Pinia chỉ đăng ký kênh mới, loại sự kiện cũ/trùng, hợp nhất thay đổi trong lúc tải snapshot. Phản hồi thay đổi từng document có `revision` để sự kiện trễ không hoàn tác thao tác mới.
- `LibrarySyncState`: `{ hasAccess, initialization, phase, processed, observers, directoriesRead, filesRead, syncTasks, lastSuccessAt, error }`. `initialization` = `not_started|running|complete|interrupted`; `phase` = `idle|permission_required|indexing|updating|error`. Tiến trình là số tài liệu đã xử lý; không ước lượng phần trăm khi chưa biết tổng số.
- URI nhập/lưu từ provider cục bộ được gắn `local_path` khi chứng minh được đường dẫn; observer không tạo thêm bản ghi của cùng file. Đổi tên/di chuyển giữ ID khi MediaStore chứng minh identity bằng volume/version/ID/generation-added. File tạm mất được ẩn bằng tombstone để giữ metadata trong khi chờ thông báo di chuyển. Không suy đoán identity theo tên/kích thước. File không có identity ổn định được xử lý xóa/thêm.
- Mất quyền, volume tháo rời hoặc provider tạm lỗi giữ metadata. Snapshot luôn chỉ đọc DB. Trình duyệt dev dùng IndexedDB và không xin quyền bộ nhớ.

**Giới hạn kiểm tra bù:** mtime thư mục phát hiện thêm/xóa/đổi tên, kể cả bản sao giữ ngày sửa cũ. Thay đổi nội dung tại chỗ khi app tắt chỉ tự bắt kịp nếu provider/MediaStore có thông báo hoặc generation phù hợp; file ngoài MediaStore có thể cần “Quét lại toàn bộ”. Không coi mtime thư mục là nhật ký tuyệt đối nếu công cụ bên ngoài tự khôi phục cả thời gian thư mục. Bao phủ observer, giới hạn tài nguyên, Android 10 và thẻ nhớ cần đo theo thiết bị; xem kết quả tại [`file-library-sync.md`](file-library-sync.md).

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
  modifiedAt: number | null // thời gian sửa đổi gốc của file, epoch milliseconds
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
| `listDocuments` | — | `{ documents, revision }` | `getLibrarySnapshot` / `listDocuments` |
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
| sự kiện `documentOpened` | — | `{ document?, skipped, error? }` | **mới**: file do app khác mở bằng "Open with"; native đã nhập sẵn (link nếu được cấp quyền lâu dài, nếu không thì copy). Sự kiện được giữ lại cho tới khi WebView đăng ký nghe, nên lần mở đầu tiên khi app chưa chạy không bị mất |

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
- **Xóa:** xóa file thật trước cho cả `app` và `external`, rồi xóa dòng `document` và nhả quyền URI riêng. Khi không xóa được file, giữ bản ghi và báo lỗi. Native gửi các ID đã xóa qua `documentsRemoved`, kể cả khi một file sau đó thất bại.
- **Khởi động:** dọn nội dung mồ côi trong `filesDir/documents/`.
- **Luồng:** mọi lệnh chạy ngoài luồng chính (`Dispatchers.IO`).
- **Đồng thời:** các lệnh ghi cùng một `id` xếp hàng, tránh hai lần lưu chú thích chồng nhau.
- **Số phiên bản:** dùng cơ chế migration của Room, thay cho khóa `schemaVersion` đã đề xuất cho `idb-keyval`.
- **Thời gian file (v2):** `modified_at` lưu thời gian sửa đổi thực tế của file, không lấy `added_at` để sắp xếp. File thường dùng `File.lastModified()`, SAF dùng `COLUMN_LAST_MODIFIED` (milliseconds), MediaStore dùng `DATE_MODIFIED` (seconds, đổi sang milliseconds). Migration 1 → 2 giữ nguyên dữ liệu; lúc tải thư viện native đọc lại thời gian từ file và cập nhật bản ghi. Không có thời gian thì để `NULL` và xếp cuối. Bản sao mới nhập giữ thời gian nguồn khi nguồn cung cấp; với bản sao cũ đã mất liên kết nguồn chỉ đọc được thời gian của bản sao hiện tồn tại.

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
| `db/` | Room: `AppDatabase` (phiên bản 2, migration 1 → 2 thêm `modified_at` và chỉ mục), `DocumentDao`, `Converters` |
| `model/` | `DocumentEntity`, `DocumentPatch`, `Settings`, `ErrorCode`, `Storage`, `ImportMode` |
| `files/AppContentStore.kt` | Nội dung `app` trong `filesDir/documents/`; chặn đường dẫn thoát khỏi thư mục |
| `files/ExternalContentStore.kt` | Nội dung `external` qua `content://`: giữ và nhả quyền, đọc theo đoạn, ghi đè, tạo trong thư mục |
| `files/WriteSessions.kt` | Phiên ghi theo khúc, mỗi phiên một file tạm |
| `SettingsStore.kt` | `save_mode`, `save_folder_uri` trong DataStore |

Quy tắc đã được cài đặt đúng như mục 4:

- **Thứ tự và an toàn khi bị ngắt:** tạo thì ghi nội dung rồi mới thêm dòng; xóa thì xóa file rồi mới xóa dòng. Bản ghi trỏ tới file đã mất được đối chiếu bởi `LibraryWatcher`. `contentGate` bảo vệ cặp tạo file/bản ghi và dọn mồ côi; `scanGate` bảo vệ quét, xóa và đối chiếu file mất.
- **Thay nội dung `app`:** ghi ra file tạm rồi đổi tên (nguyên tử trên cùng hệ thống file). **Với `external` không nguyên tử được**: dùng chế độ `"wt"` (ghi và cắt bớt) để PDF ngắn hơn không còn đuôi cũ, nhưng nếu ngắt giữa chừng thì file đích bị cắt dở.
- **Xóa `external`:** dùng `DocumentsContract.deleteDocument` cho SAF hoặc `ContentResolver.delete` cho các URI khác; cần quyền ghi/xóa của provider. Không nhả quyền thư mục chung. Với file nhập theo chế độ `copy`, chỉ xóa bản sao do app quản lý; file nguồn độc lập không nằm trong bản ghi.
- **Cùng một `id`:** các lệnh ghi xếp hàng bằng khóa theo `id`.
- **Chặn đường dẫn:** `location` của file `app` được kiểm tra, từ chối `..`, đường dẫn tuyệt đối, thư mục con; đuôi file lấy từ tên hiển thị chỉ được gồm `a-z0-9`, tối đa 10 ký tự.
- **Dọn mồ côi:** chạy một lần mỗi khi plugin tải, ở luồng nền, không chặn khởi động; thêm xóa file tạm bị bỏ quên quá một ngày.

### Còn thiếu

- **WebView chưa gọi** plugin này: chưa có `native.ts`, `mock.ts`, `native-api.ts`. Plugin chưa từng được gọi từ JavaScript.
- **Chưa chạy trên thiết bị hoặc giả lập.** Phần giao diện hệ thống (hộp chọn, quyền URI, MediaStore, chia sẻ) chưa được kiểm chứng.
- **Chưa có kiểm thử tự động nào** cho phần native (đã bỏ các bài kiểm thử đơn vị). Room và `LibraryRepository` cần thiết bị hoặc Robolectric để kiểm thử.
