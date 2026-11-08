# Rà soát bảo mật web-ppt 0.8.0

Ngày: **08/11/2026**. Phạm vi: `@web-ppt/core@0.8.0`, commit phát hành
`3ab9ddbf941c24a764981bb712640fa1443bf54e`, cùng phần tích hợp PowerPoint hiện có trong PDF Toolbox.

**Cập nhật sau rà soát:** bản app đã bổ sung lớp kiểm tra CFB trước parser, giới hạn byte/ZIP và
watchdog; xem [bản xử lý](web-ppt-remediation-2026-11-08.md). Các phát hiện dưới đây ghi nhận
trạng thái trước bản sửa. Mã upstream 0.8.0 không được sửa hoặc thay bằng fork.

## Kết luận

**Chưa nên coi bản tích hợp hiện tại là đủ an toàn để phát hành cho việc mở file không tin cậy.**
Không phát hiện hành vi cố ý đánh cắp dữ liệu trong các đường mã đã kiểm tra. Tuy nhiên,
đã tái hiện được một điểm yếu gây khuếch đại cấp phát bộ nhớ trong bộ đọc PPT nhị phân.
Ngoài ra, app chưa có giới hạn dung lượng file đầu vào hoặc thời hạn xử lý worker.
Các biện pháp sandbox/CSP và cache hiện có không khắc phục được hai vấn đề đó.

Đây là rà soát mã nguồn có trọng tâm và kiểm thử đối kháng có giới hạn, **không phải chứng nhận
an toàn, kiểm toán độc lập toàn bộ repo hoặc kiểm thử xâm nhập trên Android**.
Không thay đổi thư viện hoặc mã runtime của app trong lượt rà soát này.

## 1. Cách kiểm tra và bằng chứng

- Tải snapshot mã nguồn đúng commit phát hành, không dùng nhánh `master` đang thay đổi.
- Tải tarball npm 0.8.0, kiểm tra SHA-512, đọc provenance và xác minh chữ ký bằng npm.
- Đọc các đường chính: phân tích ZIP, CFB/FAT của PPT, XML trong worker, dựng SVG/XHTML,
  xử lý URL, quản lý tài nguyên, workflow phát hành và phần tích hợp trong app.
- Dùng AST để tìm API nhạy cảm trong `core`, `viewer-core`, `fonts` và bundle worker của app;
  rà lại các kết quả. Các `.exec()` tìm thấy ở những đường đã đọc là RegExp, không phải gọi shell.
- Chạy 8 trường hợp ZIP lỗi, payload chèn markup qua văn bản OOXML, kiểm tra scheme URL,
  và mẫu PPT với FAT tạo chu trình trong tiến trình riêng.
- Mẫu PPT đối kháng chạy với timeout 5 giây, heap V8 128 MiB và chặn mọi yêu cầu cấp phát
  Uint8Array trên 32 MiB **trước khi cấp phát**. Không để tiến trình thực sự cấp phát buffer 512 MB.

Bằng chứng và script cục bộ nằm tại `App/.dev-output/web-ppt-audit/`:
`checks.json`, `audit-checks.mjs`, `registry-0.8.0.json`, `attestations.json`,
`signatures-core.json`, `signatures-app.json`, `npm-audit.json` và snapshot nguồn.
Thư mục này được Git ignore, không được đóng gói vào app.

Chạy lại phép thử: từ thư mục `App`, chạy `node .dev-output/web-ppt-audit/audit-checks.mjs`.
Script dùng snapshot và tarball đã tải, không tự tải bản mới hoặc sửa dữ liệu người dùng.

## 2. Phát hiện F1 — Khuếch đại cấp phát bộ nhớ qua chu trình FAT trong PPT

**Mức ưu tiên: cao đối với tính sẵn sàng. Đã tái hiện việc yêu cầu cấp phát; chưa gây crash thật.**

Điều kiện: người dùng mở một file PPT có cấu trúc CFB/FAT được chỉnh sửa.
Quét metadata của file trên Home tự nó chưa kích hoạt bộ phân tích này.

Mã liên quan:

- [`ppt/cfb.ts:59`](https://github.com/unStone/web-ppt/blob/3ab9ddbf941c24a764981bb712640fa1443bf54e/packages/core/src/ppt/cfb.ts#L59):
  duyệt chuỗi FAT với ngưỡng 1.000.000 bước nhưng không phát hiện sector đã thăm.
- [`ppt/cfb.ts:68`](https://github.com/unStone/web-ppt/blob/3ab9ddbf941c24a764981bb712640fa1443bf54e/packages/core/src/ppt/cfb.ts#L68):
  tạo buffer theo số sector thu được, không đối chiếu tổng kích thước với dung lượng file.
- Header sector shift ở dòng 23 cũng chưa được kiểm tra chặt theo các giá trị hợp lệ của CFB.

Kết quả trên **entry point của gói npm đã phát hành**, không chỉ trên bản source tự biên dịch:

```json
{
  "inputBytes": 5632,
  "attemptedAllocations": [512000000, 512000000],
  "error": "AUDIT_BLOCKED_ALLOCATION:512000000"
}
```

Một file 5.632 byte đã làm parser cố tạo buffer 512.000.000 byte, khoảng 488 MiB.
Hai lần yêu cầu đều bị chặn; không được diễn giải kết quả này là đã đo peak RAM 1 GB.
Điểm yếu có thể làm ứng dụng Android cạn RAM, bị đóng renderer hoặc bị hệ điều hành dừng.
**Chưa có bằng chứng thực thi mã hoặc đánh cắp dữ liệu từ phép thử này.**

Khắc phục cần làm: phát hiện chu trình bằng tập sector đã thăm; xác thực sector shift và chỉ số;
giới hạn số sector theo kích thước file thực; kiểm tra ngân sách cấp phát trước `readChain`;
từ chối CFB sai cấu trúc ngay từ đầu. Với bản app hiện tại, cần chặn/harden đường đọc PPT
trước khi nhận file không tin cậy; chỉ giới hạn kích thước file đầu vào sẽ không chặn được mẫu nhỏ này.

## 3. Phát hiện F2 — App thiếu ngân sách đầu vào và thời gian xử lý

**Mức ưu tiên: trung bình; tăng mức ảnh hưởng của F1 trên thiết bị ít RAM. Kiểm tra mã xác nhận.**

- `App/src/entities/office/lib/read-presentation.ts:11` gọi `blob.arrayBuffer()` trước khi tạo worker,
  chưa kiểm tra `blob.size` hoặc giới hạn tổng byte.
- Lệnh mở/render không có watchdog timeout để tự dừng worker khi parser chạy quá lâu.
- `presentation-engine.ts:10` dùng `parse(data, { lazy: true })`, chưa đặt bộ giới hạn ZIP riêng cho mobile.
- Mức mặc định của thư viện là **128 MiB mỗi entry, 512 MiB tổng khai báo và tỷ lệ nén 1000**.
  Đây là giới hạn ZIP, không phải giới hạn tổng RAM của app.
  [Nguồn](https://github.com/unStone/web-ppt/blob/3ab9ddbf941c24a764981bb712640fa1443bf54e/packages/core/src/zip.ts#L40).
- Cache 6 slide/4 MiB trong app chỉ giới hạn chuỗi SVG/text được giữ phía UI; không giới hạn
  cây dữ liệu, ảnh, font hoặc các buffer đang phân tích ở worker.

Đề xuất: giới hạn file đầu vào trước khi đọc byte; đặt hạn mức ZIP phù hợp máy thật;
thêm watchdog có thể terminate worker; giới hạn số slide/shape, độ sâu XML và ngân sách ảnh/font;
kiểm tra áp lực bộ nhớ trên thiết bị Android ít RAM. Worker giúp tránh chặn luồng UI nhưng
**không tạo ra hạn mức RAM riêng và không phải sandbox chống thư viện độc hại**.

## 4. Những kiểm tra có kết quả tích cực

### Nguồn gốc bản phát hành

- SHA-512 tarball trùng `dist.integrity` trong registry và digest của provenance:
  `ca91b7c9ffa0b8a1149b44f4978d70d4657e5165d7c82b8337bbf0caeaed1be75701bad0892752f3c8064cdc740bf779cbf1a41b748b4313e1589809407311b5`.
- Provenance chỉ tới tag `v0.8.0`, commit `3ab9ddbf941c24a764981bb712640fa1443bf54e`,
  workflow `.github/workflows/release.yml` của chính repo.
- `npm audit signatures` trong project cô lập chỉ cài core 0.8.0 và dependency trả
  `invalid: []`, `missing: []`.
- Gói core chỉ khai báo một runtime dependency là `fflate`. Không có lifecycle hook
  `preinstall`, `install`, `postinstall` hay `prepare` trong package được kiểm tra.
- App ghim phiên bản 0.8.0 và integrity trong lockfile.

[Metadata npm](https://registry.npmjs.org/@web-ppt/core/0.8.0),
[attestations](https://registry.npmjs.org/-/npm/v1/attestations/@web-ppt%2fcore@0.8.0).
Chữ ký/provenance giúp truy vết nguồn gốc, **không chứng minh thuật toán parser an toàn**.
Chưa thực hiện rebuild tái lập để đối chiếu byte-for-byte toàn bộ bundle npm với source.

### ZIP/PPTX

Đã thấy kiểm tra số entry, kích thước khai báo, tỷ lệ nén, đường dẫn tương đối, tên trùng,
đối chiếu local header với central directory và kích thước sau inflate.
Kết quả thử trên gói npm:

| Ca | Kết quả |
|---|---|
| ZIP64 | `zip64-unsupported` |
| Tên trùng khác hoa/thường | `zip-duplicate-name` |
| Tên trùng khác dấu phân cách | `zip-duplicate-name` |
| Đường dẫn traversal | `zip-invalid-name` |
| Giả kích thước | `zip-size-mismatch` |
| EOCD lỗi | `zip-invalid-structure` |
| ZIP bomb với ngưỡng entry thử nghiệm 1 MiB | `zip-entry-too-large` |
| Nhiều entry với ngưỡng thử nghiệm 10 | `zip-too-many-entries` |

Hai ca cuối dùng ngưỡng chủ động hạ thấp; không được hiểu rằng mọi ZIP bomb hoặc archive
nhiều entry đều bị chặn bởi ngưỡng mặc định. Không suy rộng kết quả ZIP sang PPT nhị phân.

### Chèn markup và URL

- Payload dạng `<img ... onerror=...>` đưa vào văn bản OOXML qua entry point parse/render
  được xuất thành văn bản đã escape, không thành thẻ `img` thực thi.
- Kiểm tra URL từ chối `javascript:`, `data:`, `file:`; chấp nhận `https:` và `mailto:`.
  [Nguồn URL policy](https://github.com/unStone/web-ppt/blob/3ab9ddbf941c24a764981bb712640fa1443bf54e/packages/core/src/types.ts#L20).
- Có hàm escape XML/CSS string cho các đường xuất SVG/XHTML đã đọc.

Đây là phép thử mẫu và rà mã, không phải fuzz toàn bộ thuộc tính SVG/CSS hay kiểm chứng
khai thác XSS trên Android WebView. Chưa có browser automation khả dụng trong phiên này.

### Truy cập mạng

Không thấy `eval`, `new Function`, WebSocket, XMLHttpRequest hay lời gọi trực tiếp `fetch`
trong bundle worker PowerPoint hiện được build cho app qua phép quét AST này.
Các API xuất ảnh/PDF, phát media và tải font tùy chọn của repo có `fetch` để đọc tài nguyên;
điều đó tự nó không phải mã đánh cắp dữ liệu và không phải đường mà app đang gọi để xem slide.

Iframe hiện có sandbox không bật script và CSP chặn kết nối/tài nguyên mạng ngoài,
cho ảnh/font từ `blob:`/`data:`. **CSP của iframe không áp dụng cho worker hoặc package lúc cài đặt**.
Không có bằng chứng upload tài liệu trong luồng đã kiểm tra; chưa thể từ đó bảo đảm mọi
module, mọi bản phát hành tương lai hoặc mọi payload đều không có rò rỉ dữ liệu.

### Cảnh báo dependency đã biết

`npm audit --omit=dev --json` tại thời điểm rà soát báo 0 cảnh báo trong tập dependency production
của app. Điều này không phát hiện được F1 và không thay thế kiểm tra mã nguồn.

Một lần kiểm tra chữ ký toàn app báo attestation không hợp lệ cho `vue-router@5.4.0`;
lần kiểm tra lại có JSON trả `invalid: []`, `missing: []`. Không tái hiện ổn định cảnh báo đó,
không có cơ sở kết luận package bị sửa đổi. Kiểm tra cô lập web-ppt không có cảnh báo.

## 5. Giới hạn tin cậy và hướng xử lý

Repo còn trẻ và phụ thuộc một maintainer chính. Trang Security chưa có SECURITY.md và
không có advisory được công bố; **không có advisory không đồng nghĩa không có lỗi**.
[Trang Security](https://github.com/unStone/web-ppt/security).

Ưu tiên trước phát hành:

1. Sửa hoặc chặn đường CFB có chu trình đã tái hiện; thêm regression test có guard cấp phát.
2. Bổ sung ngân sách file/ZIP, watchdog và giới hạn cấu trúc trước khi nhận file ngoài.
3. Giữ preview không chạy script, không mở link và không tải tài nguyên ngoài; xác minh hiệu lực
   thực tế của sandbox/CSP/worker trên Android WebView.
4. Thử trên máy ít RAM với file thật, file hỏng và ảnh/font lớn; theo dõi bộ nhớ native/renderer.
5. Giữ pin phiên bản và lockfile; rà từng bản nâng cấp. Nếu sửa thư viện, dùng fork hoặc patch
   được quản lý và kiểm thử, không sửa tay file minified trong node_modules.

Không gửi issue, báo cáo riêng, tài liệu hay file thử nghiệm cho tác giả hoặc dịch vụ bên ngoài.
Người dùng có thể dùng kết quả này để quyết định harden, thay thư viện hoặc giới hạn hỗ trợ PPT.
