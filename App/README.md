# PDF Toolbox

Ứng dụng đọc & công cụ PDF chạy trên web và Android, viết bằng **Vue 3 + TypeScript + Capacitor + Tailwind CSS 4 + `@iconify/vue`**.
Chức năng và giao diện được thiết kế dựa trên bản phân tích trong `../scraped-data/PDF Box/` (mã và thương hiệu là của riêng dự án này).

## Chạy

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck (vue-tsc) + vite build -> dist/
npm run cap:sync     # build + chép dist vào android/
npm run cap:android  # mở Android Studio
```

Android: cần JDK 17+ và Android Studio. Thư mục `android/` đã được tạo bằng `npx cap add android` (đã thêm quyền `CAMERA`). iOS chưa được thêm (`npx cap add ios` trên macOS).

## Chức năng

| Chức năng | Thư viện / cách làm |
|---|---|
| Quản lý file (Home / History / Favorites, đổi tên, xóa, chia sẻ, chi tiết) | IndexedDB (`idb-keyval`), Pinia store |
| Tìm file theo tên | khớp chuỗi con, không phân biệt hoa/thường, bỏ phần đuôi |
| Đọc PDF (cuộn, zoom, thumbnail, nhảy trang, thanh trượt dọc, mật khẩu) | `pdfjs-dist` |
| Tìm chữ trong PDF | pdf.js `getTextContent`, đo độ rộng chữ bằng canvas để tô đúng vị trí |
| Chú thích (highlight, gạch chân, gạch ngang, bút, undo/redo, lưu) | vẽ vector vào trang bằng `@cantoo/pdf-lib` |
| Ghép PDF | `PDFDocument.copyPages` |
| Tách PDF (chọn trang bằng thumbnail hoặc `1-3, 5, 8-`) | `copyPages` |
| Khóa / Mở khóa PDF | `@cantoo/pdf-lib` `encrypt()` AES-128, mật khẩu user = owner; mở khóa tạo bản sao không mật khẩu |
| Ảnh → PDF (A3, A4, A5, A6, B4, B5) | `embedJpg/embedPng`, vừa khít trang và căn giữa |
| PDF → Ảnh (từng trang hoặc một ảnh dài, 3 mức chất lượng) | pdf.js render ra canvas, xuất JPEG |
| Xem Word (.docx), Excel, TXT | `mammoth`, SheetJS, đều qua DOMPurify |
| Word/Excel/TXT → PDF | `html2canvas` cắt thành trang A4 (**PDF chỉ chứa ảnh, không chọn/tìm được chữ**) |
| Scan bằng camera → PDF | `@capacitor/camera` (web: `<input capture>`), chế độ "Document" (xám + kéo giãn tương phản) |
| Lưu / chia sẻ file | `@capacitor/filesystem` (Documents/PDFToolbox), `@capacitor/share`; web: tải xuống / Web Share |

## Giới hạn đã biết

- Không có OCR; scan chỉ tạo PDF dạng ảnh.
- Không xem được `.doc` cũ (cần lưu thành `.docx`) và PowerPoint.
- Không có copy chữ từ PDF (chưa có lớp chọn chữ).
- Chú thích được "in" vào trang (không phải annotation PDF chuẩn) và chỉ hỗ trợ trang không bị xoay; chọn vùng bằng kéo thả, không bám theo dòng chữ.
- Tìm chữ chỉ khớp trong một đoạn chữ liền của pdf.js, cụm từ bị tách qua nhiều đoạn có thể không tìm thấy.
- PDF → ảnh dài bị giới hạn 16 000 px chiều cao; lúc đó hãy chọn "từng trang".
- File lưu trong IndexedDB của WebView; xóa dữ liệu app là mất thư viện (hãy dùng Save to device để xuất ra).
- Mới kiểm thử trên trình duyệt (khung 375×812); **chưa chạy trên thiết bị/emulator Android thật**.

## Cấu trúc

```
src/
  lib/        pdfOps, pdfjs, render, office, db, platform, dialogs…  (logic không phụ thuộc UI)
  stores/     library (Pinia)
  components/ FileRow, FileSelect, PdfPage, PageThumb, BottomSheet, DialogHost…
  views/      Home, Search, Reader, Office và các màn công cụ
```
