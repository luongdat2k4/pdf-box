# 12. PDF → ảnh

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Màn `App/src/features/pdf-to-image/ui/PdfToImage.vue`, route `/tool/pdf2img`.
- Chọn một PDF; chế độ **mỗi trang một ảnh** hoặc **một ảnh dài**; chất lượng theo chiều rộng 1080, 1600, 2400 px.
- `pdfToImages` vẽ trang ra canvas và xuất JPEG; báo tiến độ `Page d / t`. Ảnh dài bị giới hạn 16 000 px chiều cao (README).
- Kết quả **không** đi qua `savePdf` mà gọi thẳng `lib.addBlob`: `<tên>.jpg` (ảnh dài) hoặc `<tên>_p<N>.jpg` (từng trang).
- Tài liệu pdf.js được giải phóng ở khối `finally`.

## Dữ liệu (`document`)

- **Đọc:** nội dung PDF nguồn.
- **Ghi:** **nhiều dòng** `document` (một dòng mỗi ảnh), `mime_type = image/jpeg`, `page_count = NULL`.

## Thay đổi cần làm

**Không đổi** về hành vi. Lưu ý chỗ khác biệt: đường gọi `addBlob` trực tiếp (không qua `savePdf`) phải đi qua cùng `saveOutput` của native; vì cả hai cùng đi qua `addBlob` nên không phát sinh việc riêng. Nhiều ảnh sinh ra liên tiếp là nhiều lệnh qua cầu nối, nên cần gửi tuần tự để không dồn bộ nhớ.

## Rủi ro và câu hỏi mở

- Một PDF dài sinh hàng trăm file ảnh trong thư viện, làm danh sách Home đầy. Cân nhắc: gom vào một ngăn hoặc cho phép xuất thẳng ra thư mục thay vì nhập vào thư viện. Thư mục ảo đã bị loại khỏi schema; nếu nhu cầu này thật sự xuất hiện thì cần nhắc lại.
- Mỗi ảnh là Blob độc lập trong kho `app`, tốn dung lượng. Chưa đo.
