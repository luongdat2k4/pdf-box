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

## Cấu trúc (Feature-Sliced Design)

`src/` chia theo lớp, mỗi lớp chỉ được import từ lớp **bên dưới**: `app → pages → widgets → features → entities → shared`.
Các slice trong cùng một lớp không import nhau; muốn dùng slice khác phải qua public API (`index.ts`).

```
src/
  app/        khởi tạo: main.ts, App.vue, router/, styles/ (Tailwind), env.d.ts
  pages/      mỗi route một page mỏng ghép các lớp dưới
                home, search, reader, office-viewer,
                merge-pdf, split-pdf, lock-pdf, image-to-pdf, pdf-to-image, doc-to-pdf, scan-document, delete-files
  widgets/    khối UI lớn, tự đủ
                tools-sheet (bảng công cụ ở nút +), file-menu (menu thao tác file + chi tiết)
  features/   một hành động của người dùng = ui/ + model/
                merge-pdf, split-pdf, lock-pdf, image-to-pdf, pdf-to-image, doc-to-pdf, scan-document, delete-files,
                pdf-search (tìm chữ), pdf-annotate (chú thích, undo/redo, lưu)
  entities/   khái niệm nghiệp vụ
                file    (FileMeta, kho thư viện Pinia, IndexedDB, FileRow/FileSelect/ResultSheet, useFileActions, useRunner)
                pdf     (pdf.js, pdf-lib ops, render, PdfPage, PageThumb, mở file có mật khẩu)
                office  (Word/Excel/TXT -> HTML đã làm sạch)
  shared/     không biết gì về nghiệp vụ
                ui (Ic, ToolBar, BottomSheet, BottomAction, DialogHost + dialogs), lib (format, platform, error), config (icons)
```

Mỗi slice có các segment `ui/` (component), `model/` (state, composable, kiểu), `api/` (I/O), `lib/` (hàm thuần).

```bash
npm run lint:fsd   # kiểm tra quy tắc import giữa các lớp/slice (cũng chạy trong npm run build)
```
