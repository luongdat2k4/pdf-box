# 05. Xem Office, văn bản, ảnh

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

Trang `App/src/pages/office-viewer/ui/OfficeViewerPage.vue`, route `/office/:id`.

- **Ảnh:** đọc Blob, tạo `URL.createObjectURL`, hiển thị trực tiếp; thu hồi URL khi rời trang.
- **Word, TXT, Markdown:** `officeToHtml(kind, blob, name)` (`App/src/entities/office/lib/office-to-html.ts`) tạo HTML đã qua DOMPurify rồi hiển thị.
- **Excel (`kind = excel`, gồm `.xlsx`/`.xls`):** dùng `SpreadsheetViewer` (`App/src/entities/office/ui/SpreadsheetViewer.vue`), không ghép tất cả sheet thành HTML. `readSpreadsheet` chuyển ArrayBuffer sang worker chạy SheetJS; worker được dừng khi đọc xong, lỗi, hoặc rời/chuyển file.
- View Excel là lưới chỉ đọc: tab sheet phía dưới, tiêu đề A/B/C và số dòng, chọn ô để đọc nội dung/công thức đầy đủ, zoom 50–200%, tùy chọn cố định dòng 1/cột A. Lưu vị trí cuộn và ô đang chọn cho từng sheet trong phiên xem; mở sheet mới ở vùng có dữ liệu. Sheet ẩn không hiện trong tab.
- Virtual scroll theo cả hai chiều chỉ dựng ô trong viewport và vùng đệm, gồm ô gộp có neo nằm ngoài viewport. Giới hạn chiều dài spacer DOM và ánh xạ tọa độ cuộn để vẫn tới dòng 1.048.576 mà không vượt giới hạn kích thước CSS. Dùng phím mũi tên để chọn ô, Enter mở/đóng chi tiết.
- Markdown có hai tab Preview và Source.
- Nút "To PDF" chuyển sang công cụ chuyển PDF ([13](13-doc-to-pdf.md)); không hiện cho PowerPoint vì công cụ đó chưa hỗ trợ PPT.
- **PowerPoint `.ppt` và `.pptx`:** `PresentationViewer` dùng `@web-ppt/core` 0.8.0 (MIT), tự nhận diện định dạng nhị phân/OOXML theo nội dung. `PresentationEngine` sống trong worker cùng tài nguyên ảnh/font; PPTX phân tích slide khi cần. Không chuyển sang PDF và không dùng dịch vụ ngoài. Worker chỉ trả SVG/văn bản/ghi chú của slide được yêu cầu, không chuyển toàn bộ cây slide qua cầu nối.
- View PowerPoint có vừa màn hình, zoom, vuốt ngang khi vừa màn hình, trước/sau, nhập số slide, nội dung/ghi chú và danh sách thumbnail dùng `VirtualList`. Chỉ mount một iframe chính và số thumbnail trong viewport; mỗi iframe dùng sandbox không cho script, CSP chặn tài nguyên mạng. Cache markup tối đa 6 slide/4 MiB, ưu tiên slide chính và hủy thumbnail đã rời vùng nhìn thấy. Rời/chuyển file dừng worker và bỏ cache.
- `validate-cfb.ts` kiểm tra CFB trước khi gọi thư viện: header/sector hợp lệ, FAT/DIFAT/MiniFAT không chu trình/chồng lấn, stream nằm trong file và hạn mức directory/byte. Áp dụng cho PPT và OOXML mã hóa dạng CFB; không sửa tay `node_modules`.
- `presentation-limits.ts` quản lý hạn mức: đầu vào 32 MiB, tối đa 5.000 slide; ZIP 4.096 entry, 16 MiB mỗi entry, 64 MiB tổng, tỷ lệ nén 200. Kiểm tra metadata trước `blobOf`, giới hạn số byte thực khi đọc chunk native kể cả provider không báo size, kiểm tra lại Blob và ArrayBuffer trước parser.
- Watchdog từ phía UI dừng worker sau 20 giây mở file hoặc 8 giây dựng slide, hủy toàn bộ yêu cầu đang đợi, giải phóng cache và báo lỗi rõ. Timer được xóa khi trả kết quả, hủy hoặc rời file.
- Trang này **không gọi `touch`** khi mở; việc ghi `openedAt` do nơi gọi (Home, Search) làm.

## Dữ liệu (`document`)

Đọc nội dung qua `blobOf` và `display_name`, `mime_type`. Với PowerPoint, lưu `page_count` là số slide, `last_page` là chỉ số slide bắt đầu từ 0, `last_zoom` là hệ số so với vừa màn hình. Các giá trị được lưu trễ 300ms và khi rời view, dùng đúng ID file ban đầu. Các định dạng Office khác chưa dùng tiến độ này.

## Thay đổi cần làm

Gần như **không đổi**:

1. `blobOf` giữ nguyên chữ ký; bên dưới gọi `readContent` của native. Việc dựng HTML (`mammoth`, SheetJS, `marked`) vẫn ở WebView.
2. Lỗi "This file no longer exists." đã có sẵn (`error` ref). Giữ làm chỗ xử lý link hỏng, khớp [01](01-library.md).
3. Cân nhắc để chính trang này gọi `touch`, thay vì mỗi nơi gọi tự làm, để không sót như trường hợp ảnh ở Home.

## Rủi ro và câu hỏi mở

- Chưa có chú thích cho Office và ảnh. Nếu sau này cần, "ghi thẳng vào file" chỉ làm được theo từng định dạng; xem `schema.md` mục 5 và [07](07-pdf-annotate.md).
- View Excel ưu tiên đọc dữ liệu: giữ giá trị số/ngày đã định dạng và ô gộp; chưa tái tạo toàn bộ phông/màu/đồ thị/ảnh, trạng thái ẩn dòng/cột hoặc chiều cao dòng gốc. Công thức dùng **kết quả được lưu trong file**, không tính lại. Luồng xuất PDF tiếp tục dùng `officeToHtml` cũ.
- Worker tránh phân tích file trên luồng UI, nhưng workbook vẫn được phân tích toàn bộ trong bộ nhớ. Virtual scroll giới hạn DOM; không phải đọc từng phần file. Cần đo bộ nhớ và kiểm tra thao tác chạm/cuộn trên Android thật.
- PowerPoint là view đọc tĩnh: không chạy animation, video/audio, liên kết tương tác hay macro. File có mật khẩu được báo rõ là chưa hỗ trợ. Font không có trên máy có thể bị thay thế; không cam kết giống PowerPoint tuyệt đối.
- Kiểm thử có file PPT/PPTX thật, PPT có ảnh, file mật khẩu/hỏng, worker thật, hủy yêu cầu, cache, chuyển slide/zoom/vuốt, lưu tiến độ và 5.000 thumbnail giả lập. Chưa đo độ mượt/bộ nhớ trên Android thật; công cụ xem trình duyệt hiện không kết nối được.
