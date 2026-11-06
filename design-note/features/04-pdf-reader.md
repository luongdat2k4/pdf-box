# 04. Đọc PDF

> Phần chung và các điểm lệch với schema: xem [README](README.md). Đây là nơi **trạng thái đọc** (`last_page`, `last_zoom`) được thêm vào.

## Hiện trạng

Trang `App/src/pages/reader/ui/ReaderPage.vue`, route `/reader/:id`.

- Mở: `lib.bytesOf(id)` → `openWithPassword` (pdf.js; hỏi mật khẩu lặp lại nếu sai, `App/src/entities/pdf/lib/open-with-password.ts`). Người dùng hủy thì quay lại trang trước. Sau khi mở gọi `lib.touch(id)`.
- Hiển thị: cuộn dọc liên tục; mỗi trang là `PdfPage`. Chiều cao trang lấy từ tỷ lệ `ratios`, đọc **dần ở nền** (cập nhật ở trang 1, mỗi 25 trang, và trang cuối) để chiều cao cuộn đúng.
- Điều hướng: ô "Go to…" nhảy tới trang, thanh trượt dọc, ngăn thumbnail, nhãn `trang hiện tại / tổng`.
- Zoom: 1× đến 3×, bước 0,5.
- **Trang hiện tại và zoom chỉ nằm trong `ref`** (`current`, `zoom`), mất khi rời trang.
- Menu "More": nhảy trang, yêu thích, chia sẻ, lưu ra thiết bị.

## Dữ liệu (`document`)

| Lúc | Cột |
|-----|-----|
| Mở xong | ghi `page_count` (= `doc.numPages`), `last_opened_at` |
| Gặp yêu cầu mật khẩu | ghi `is_encrypted = 1` |
| Đang đọc | ghi `last_page`, `last_zoom` |
| Mở lại | **đọc** `last_page`, `last_zoom` để khôi phục |

## Thay đổi cần làm

1. **Lưu vị trí đọc có trễ (debounce, khoảng 1 giây sau khi ngừng cuộn)**, không ghi mỗi khung hình cuộn. Ghi bù ngay khi rời trang (`onBeforeUnmount`) và khi app chuyển sang nền (`@capacitor/app` đã có trong `package.json`).
2. **Khôi phục vị trí:** không gọi `goTo(last_page)` ngay khi mở. Vì chiều cao các trang phía trước chỉ chính xác khi `ratios` đã đọc tới trang đó (vòng lặp ở khối `onMounted`), phải **đợi `ratios` đủ tới `last_page`** rồi mới cuộn, nếu không sẽ lệch trang. Áp `last_zoom` trước khi cuộn.
3. Điền `page_count` và `is_encrypted` khi mở (xem [02](02-import-files.md)).
4. Nội dung đọc qua `lib.bytesOf` giữ nguyên chữ ký; bên dưới đổi sang `readContent` của native. pdf.js vẫn chạy trong WebView ([`native-api.md`](../native-api.md) mục 1). Về sau có thể cho pdf.js tải từng phần qua URL thay vì nạp cả file, nhưng không cần cho bản đầu.
5. Ghi `last_page`, `last_zoom` qua `updateDocument`. Mỗi lệnh đi qua cầu nối nên **debounce là bắt buộc**, không chỉ là tối ưu.
6. Sau khi lưu chú thích, tài liệu được mở lại ([07](07-pdf-annotate.md)): **không** reset `last_page`.

## Rủi ro và câu hỏi mở

- PDF đổi nội dung (sau khi lưu chú thích) làm `page_count` có thể đổi? Chú thích không thêm trang, nên không. Công cụ ghép, tách tạo file mới, không sửa file cũ.
- Mật khẩu **không** được lưu (nguyên tắc 5 của `schema.md`); mỗi lần mở lại file khóa phải nhập lại.
- Chưa có chọn chữ/copy từ PDF (README ghi rõ). Không liên quan schema.
