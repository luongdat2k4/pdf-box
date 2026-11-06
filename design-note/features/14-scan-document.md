# 14. Quét bằng camera → PDF

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Màn `App/src/features/scan-document/ui/ScanDocument.vue`, route `/tool/scan`.
- Chụp bằng `@capacitor/camera` (bản native); bản web dùng `<input capture="environment">`. Có thể thêm ảnh từ thư viện ảnh của máy.
- Các ảnh vừa chụp (`shots`) chỉ là **Blob trong bộ nhớ kèm Object URL**: có thể đổi thứ tự, xóa từng ảnh. Chưa có cắt góc, xoay.
- Hai chế độ: **Document** (xám + kéo giãn tương phản, cắt 1% tối nhất và 8% sáng nhất, cạnh dài tối đa 2200 px) và **Colour**.
- Chọn khổ giấy; giao diện chỉ hiện 3 khổ đầu (A3, A4, A5) dù có 6 khổ trong `PAGE_SIZES`.
- Bấm **Create PDF**: xử lý từng ảnh → `imagesToPdf` → `savePdf` (`scan_<timestamp>`). Đóng bảng kết quả thì xóa hết ảnh nháp.
- Rời màn khi còn ảnh nháp **không có hỏi xác nhận** (khác với ghép PDF).

## Dữ liệu (`document`)

- **Chỉ ghi** một dòng `document` mới sau khi tạo PDF, `page_count` = số ảnh. Ảnh nháp không vào DB.

## Thay đổi cần làm

**Không đổi.** Khớp với `schema.md` mục 6: bản nháp chưa xuất không lưu vào DB.

Cải tiến nhỏ nên làm cùng lúc, không liên quan schema: thêm hỏi xác nhận khi rời màn còn ảnh nháp (dùng `onBeforeRouteLeave` như [08](08-merge-pdf.md)).

## Rủi ro và câu hỏi mở

- **App bị hệ điều hành tắt khi đang quét** (ví dụ khi mở camera ngoài) thì mất ảnh nháp. Nếu muốn tiếp tục phiên quét dở thì cần lưu ảnh nháp ra thư mục cache và có bảng phiên quét; hiện chưa cần.
- Chưa có OCR; PDF chỉ chứa ảnh, không tìm chữ được.
- Chưa kiểm thử camera trên thiết bị Android thật (README).
