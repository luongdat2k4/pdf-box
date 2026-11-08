# Xử lý phát hiện bảo mật PowerPoint — 08/11/2026

Tham chiếu [báo cáo ban đầu](web-ppt-review-2026-11-08.md).

## Cách sửa

Không sửa bundle minified trong `node_modules` và không thêm postinstall patch.
Thay vào đó, mọi lần mở PowerPoint trong app đi qua lớp kiểm tra do app quản lý trước
khi gọi `@web-ppt/core`. Cài lại dependency không làm mất lớp bảo vệ này.
**Đây là biện pháp bảo vệ đường đọc của app, không phải bản vá cho gói npm upstream.**

### F1: PPT nhỏ gây khuếch đại cấp phát bộ nhớ

`App/src/entities/office/lib/validate-cfb.ts` chạy trong worker, trước `parse()`:

- Kiểm tra chữ ký CFB đầy đủ, major version/sector shift, mini-sector shift, byte order và cutoff.
- Suy ra số sector thực từ độ dài file. Chặn chỉ số ngoài file, bảng FAT/DIFAT quá cỡ và marker sai.
- Phát hiện sector đã dùng, từ chối chu trình và chuỗi physical sector chồng lấn.
- Kiểm tra chiều dài chuỗi khớp kích thước stream; chặn stream khai báo lớn hơn file.
- Kiểm tra MiniFAT theo kích thước root mini-stream, phát hiện chu trình và mini-sector dùng trùng.
- Chặn directory vượt hạn mức, nhiều root, tên/entry sai và stream vượt ngân sách byte.

Mẫu gốc 5.632 byte có FAT directory tự trỏ về chính nó hiện trả
`PRESENTATION_INVALID_CFB` trước khi parser upstream được gọi. Kiểm thử worker thật cũng
trả mã này, không chạm bộ chặn cấp phát 32 MiB đặt riêng trong worker của bài kiểm thử.

Lớp kiểm tra dựa trên [đặc tả header CFB của Microsoft](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/05060311-bfce-4b12-874d-71fd4ce63aea)
và [quy tắc sector chain không được tạo chu trình](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/9d33df18-7aee-4065-9121-4eabe41c29d4).

### F2: Hạn mức và thời gian xử lý

`presentation-limits.ts` là nguồn cấu hình chung:

| Hạn mức | Giá trị |
|---|---|
| File đầu vào | 32 MiB |
| Slide | 5.000 |
| Directory CFB | 4.096 entry |
| Tổng byte stream CFB | 64 MiB |
| ZIP | 4.096 entry, 16 MiB/entry, 64 MiB tổng, tỷ lệ nén 200 |
| Watchdog mở file | 20 giây |
| Watchdog render một slide | 8 giây |

Trang đọc kiểm tra metadata trước khi lấy nội dung. `NativeApi.readContent(id, maxBytes?)`
và store `blobOf(id, maxBytes?)` cho phép chặn cả byte thực qua bridge, kể cả size của provider
không có hoặc không đúng. Đường mock cũng kiểm tra Blob size. Các định dạng khác giữ hạn mức
cũ nếu không truyền tham số này. Reader còn từ chối chunk rỗng không có EOF để tránh vòng đọc vô hạn.

`readPresentation` kiểm tra Blob size trước `arrayBuffer()`, kiểm tra lại độ dài buffer, đặt
watchdog cho từng yêu cầu đã gửi. Timeout sẽ terminate worker, xóa timer/cache và reject cả
render hiện tại lẫn thumbnail đang đợi bằng `PRESENTATION_TIMEOUT`. Bỏ qua phản hồi đến muộn.

Thông báo tiếng Việt/Anh phân biệt file quá lớn, CFB sai, vượt ngân sách và timeout.

## Kiểm chứng

`npm run test:presentation` có 13 kiểm thử, gồm các nhóm:

- File PPT/PPTX thật và PPT chứa ảnh vẫn đọc/render được; xử lý file mật khẩu và file hỏng.
- 12 kiểu CFB hỏng: vòng FAT directory, vòng stream, vòng MiniFAT, DIFAT hỏng, sector ngoài
  file, header sai, size giả, stream rỗng còn chuỗi, root/stream chồng lấn. Spy xác nhận **0 lần
  gọi upstream parser** cho các mẫu bị chặn.
- Header/sector CFB v4 hợp lệ và các fixture v3 được chấp nhận.
- ZIP nén cao chứa entry vượt 16 MiB bị từ chối trước inflate.
- Blob quá lớn không được gọi `arrayBuffer()`; worker không trả lời bị terminate khi mở/render,
  đồng thời các yêu cầu trong cache queue đều được kết thúc.
- Worker thật từ chối chính mẫu gây yêu cầu buffer 512.000.000 byte ở lần rà soát trước.
- Adapter native chặn size báo lớn, size không biết và luồng không tiến triển.
- Điều hướng, zoom, vuốt, thumbnail virtual scroll, cache, hủy và lưu tiến độ vẫn hoạt động.

Chạy thêm `npm run test:spreadsheet`, `npm run test:library` và `npm run build` để kiểm tra hồi quy.

## Giới hạn còn lại

Không cam kết parser upstream đã hết mọi lỗi. Các ngưỡng byte/time là biện pháp giảm rủi ro,
không phải hạn mức RAM cứng cho toàn bộ WebView. Chưa fuzz mọi cấu trúc XML, hình ảnh, font
và chưa đo trên Android ít RAM. CFB quá lớn, sai chuẩn hoặc có cách đóng gói không được lớp
kiểm tra chấp nhận sẽ bị từ chối thay vì cố mở. Cần giữ các regression test khi nâng dependency
và chỉ dùng thư viện qua `PresentationEngine`, không gọi `parse()` trực tiếp từ đường đọc mới.
