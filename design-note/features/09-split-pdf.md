# 09. Tách PDF

> Phần chung và các điểm lệch với schema: xem [README](README.md).

## Hiện trạng

- Màn `App/src/features/split-pdf/ui/SplitPdf.vue`, route `/tool/split`.
- Chọn một PDF → mở bằng `openWithPassword` → hiện lưới thumbnail (`PageThumb`) để chọn trang, hoặc nhập khoảng trang kiểu `1-3, 5, 8-` (`parsePageRanges`, `App/src/shared/lib/format.ts`). Có nút chọn tất cả, bỏ chọn.
- `extractPages` dựng **một** PDF mới từ các trang đã chọn (`App/src/entities/pdf/lib/ops.ts`), tên `<tên gốc>_split_<timestamp>`.
- Dù tên là "tách", kết quả luôn là **một file** chứa các trang đã chọn, không sinh nhiều file.
- Kết quả đi qua `savePdf` → `addBlob`; hiện `ResultSheet` ("Split successfully"). Đóng bảng kết quả thì giải phóng tài liệu pdf.js.

## Dữ liệu (`document`)

- **Đọc:** nội dung file nguồn.
- **Ghi:** một dòng `document` mới. `page_count` = số trang đã chọn.
- Không ghi quan hệ nguồn với đầu ra.

## Thay đổi cần làm

**Không đổi.**

## Rủi ro và câu hỏi mở

- Câu hỏi sản phẩm: có muốn tách thành **nhiều file** (ví dụ mỗi khoảng trang một file) không? Với schema hiện tại không có trở ngại: chỉ là nhiều lần `savePdf`, kết quả là nhiều dòng `document`, và `ResultSheet` đã hiển thị tối đa 6 dòng kèm "+ N more".
- Bộ nhớ: tài liệu pdf.js mở trong lúc chọn trang phải được giải phóng khi rời màn (đã làm bằng `reset` trong `onBeforeUnmount`).
