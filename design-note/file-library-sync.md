# Đồng bộ thư viện file theo sự kiện

> Trạng thái: đã triển khai luồng chính ngày 09/11/2026; phạm vi kiểm chứng và giới hạn ở mục 12.
> Ngày: 08/11/2026.
> Phạm vi: tìm và cập nhật file trong bộ nhớ Android; không liên quan chức năng chụp tài liệu bằng camera.

## 1. Mục tiêu

Sau khi được cấp quyền, app quét toàn bộ một lượt để lập danh sách file trong DB. Từ đó, giao diện lấy dữ liệu từ DB; việc vào Home, chuyển tab hoặc quay lại app không tự kích hoạt quét toàn bộ.

Khi có thay đổi bên ngoài, app cập nhật file hoặc thư mục liên quan vào DB. Có file mới không đồng nghĩa với quét lại toàn bộ thiết bị.

Các yêu cầu chính:

- Hiển thị danh sách đã lưu ngay khi mở app.
- Giảm việc duyệt thư mục và đọc metadata lặp lại.
- Nhận biết file được thêm, sửa, đổi tên, di chuyển hoặc xóa.
- Giữ lịch sử mở, yêu thích và tiến độ đọc khi cập nhật metadata.
- Có cơ chế phục hồi nếu lần quét đầu bị ngắt hoặc app bỏ lỡ thay đổi.
- Không cần giữ một dịch vụ chạy nền liên tục chỉ để theo dõi file.

## 2. Hiện trạng trước cải tiến

| Thành phần | Hành vi hiện tại | Điểm cần thay đổi |
|---|---|---|
| `HomePage.vue` | Gọi đồng bộ khi vào Home và khi app hoạt động trở lại ở Home | Tách hiển thị khỏi quét toàn bộ |
| `store.ts` / `syncDeviceFiles()` | Kiểm tra quyền, quét thư viện, tải lại danh sách | Tách khởi tạo chỉ mục, đọc DB và cập nhật thay đổi |
| `DeviceStorage.scan()` | Duyệt các thư mục trong vùng lưu trữ dùng chung có quyền đọc | Giữ cho lần khởi tạo và phục hồi có chủ đích |
| `LibraryRepository.list()` | Đọc thời gian sửa của từng file trước khi trả danh sách | Đường đọc danh sách chỉ truy vấn DB |
| `LibraryWatcher` | Theo dõi mục đã lập chỉ mục; xử lý file mất và kiểm tra khoảng 30 giây/lần khi hoạt động | Xử lý thay đổi có phạm vi, bỏ vòng kiểm tra toàn bộ định kỳ này |
| Bridge và Pinia | Đã có sự kiện `documentsRemoved` | Bổ sung thông báo thêm và cập nhật bản ghi |

Code tham chiếu:

- [HomePage.vue](../App/src/pages/home/ui/HomePage.vue)
- [store.ts](../App/src/entities/file/model/store.ts)
- [DeviceStorage.kt](../App/android/app/src/main/kotlin/vn/alf/pdftoolbox/library/files/DeviceStorage.kt)
- [LibraryRepository.kt](../App/android/app/src/main/kotlin/vn/alf/pdftoolbox/library/LibraryRepository.kt)
- [LibraryWatcher.kt](../App/android/app/src/main/kotlin/vn/alf/pdftoolbox/library/files/LibraryWatcher.kt)
- [LibraryPlugin.kt](../App/android/app/src/main/kotlin/vn/alf/pdftoolbox/library/bridge/LibraryPlugin.kt)

## 3. Luồng hoạt động đề xuất

| Tình huống | Xử lý |
|---|---|
| Chưa có quyền | Hiển thị dữ liệu DB hiện có và trạng thái quyền; chưa lập chỉ mục bộ nhớ ngoài |
| Có quyền, chưa hoàn tất khởi tạo | Quét toàn bộ một lượt; ghi DB theo lô; đánh dấu hoàn tất khi thành công |
| Mở app sau khi đã khởi tạo | Hiển thị DB ngay; khởi động theo dõi và kiểm tra phần thay đổi bị bỏ lỡ |
| Vào Home hoặc chuyển tab | Dùng dữ liệu đã tải từ DB trong Pinia; không quét bộ nhớ |
| Có sự kiện thay đổi | Gom sự kiện, cập nhật file hoặc thư mục bị ảnh hưởng, ghi DB và thông báo giao diện |
| App tự tạo/import/sửa/xóa file | Cập nhật DB trực tiếp trong thao tác native; không đợi observer |
| Quyền bị thu hồi | Dừng công việc cần quyền; giữ DB; không coi lỗi quyền là file bị xóa |
| Quyền được cấp lại | Khôi phục theo dõi và kiểm tra bù; không mặc định quét toàn bộ chỉ vì vừa cấp lại quyền |
| Người dùng yêu cầu quét lại toàn bộ | Thực hiện một tác vụ riêng có trạng thái tiến trình và chống chạy trùng |

Trong lúc cập nhật, danh sách hiện có vẫn sử dụng được. Chỉ lần khởi tạo hoặc phục hồi thực sự cần thiết mới hiển thị trạng thái quét toàn bộ.

## 4. Nhận thay đổi từ Android

### 4.1. FileObserver

Theo dõi thư mục có quyền truy cập để nhận các sự kiện liên quan:

- `CREATE`: phát hiện file hoặc thư mục mới; file có thể vẫn đang được ghi.
- `CLOSE_WRITE`: thời điểm phù hợp để đọc metadata sau khi một lượt ghi kết thúc.
- `MOVED_TO`, `MOVED_FROM`: nhận biết file được chuyển vào hoặc ra, bao gồm tình huống đổi tên.
- `DELETE`, `DELETE_SELF`, `MOVE_SELF`: cập nhật mục mất và điều chỉnh vùng theo dõi.

Không coi `CREATE` là bằng chứng file đã hoàn chỉnh. Với tải xuống hoặc sao chép nhiều bước, cần gom sự kiện và thử lại có giới hạn nếu file chưa sẵn sàng.

Theo dõi thư mục cần quản lý riêng: không giả định một observer ở thư mục gốc tự bao phủ mọi thư mục con. Phải có chiến lược đăng ký thư mục con, bổ sung khi có thư mục mới và gỡ khi thư mục mất. Chỉ theo dõi thư mục đã chứa tài liệu sẽ bỏ sót tài liệu đầu tiên trong một thư mục khác.

Số lượng observer và chi phí đăng ký phải được đo trên thiết bị có nhiều thư mục. Chưa chốt cách bao phủ toàn bộ cây thư mục trước khi có kết quả kiểm chứng.

### 4.2. ContentObserver và MediaStore

Đăng ký `ContentObserver` với các collection/URI phù hợp để nhận tín hiệu thay đổi do provider phát ra. Nếu sự kiện chỉ cho biết collection thay đổi, truy vấn chênh lệch trong collection đó thay vì duyệt toàn bộ hệ thống file.

MediaStore có thể bổ sung khả năng kiểm tra thay đổi trong dữ liệu mà nó quản lý. Không mặc định mọi PDF, Office, TXT hoặc Markdown trong mọi thư mục đều được MediaStore lập chỉ mục và thông báo đầy đủ. Cần kiểm chứng theo phiên bản Android, quyền thực tế và nguồn tạo file.

Hai cơ chế có thể trùng sự kiện. Mọi thao tác cập nhật phải có tính lặp an toàn: xử lý cùng một file nhiều lần không tạo bản ghi trùng.

## 5. Xử lý sự kiện và cập nhật DB

Luồng đề xuất:

```text
FileObserver / ContentObserver / thao tác file trong app
                         |
                         v
            Gom sự kiện, loại trùng, xác định phạm vi
                         |
                         v
            Đọc metadata của phần bị ảnh hưởng
                         |
                         v
                  Ghi DB trong transaction
                         |
                         v
                Phát sự kiện sau khi commit
                         |
                         v
             Pinia cập nhật danh sách đang hiển thị
```

Quy tắc xử lý:

- Có hàng đợi đồng bộ ở native, không để mỗi callback tự mở một lượt quét.
- Gom sự kiện theo đường dẫn/URI hoặc thư mục; khoảng chờ gom sự kiện cần được đo và điều chỉnh.
- Nếu biết file cụ thể, chỉ đọc file đó. Nếu chỉ biết thư mục, đối chiếu trong thư mục đó.
- Khi một thư mục có sẵn nội dung được chuyển vào, có thể cần duyệt cây con đó.
- Chỉ thông báo giao diện sau khi DB commit thành công.
- Observer phát lại thay đổi do chính app gây ra không được tạo thêm bản ghi.
- Lỗi quyền, bộ nhớ tháo rời hoặc provider tạm thời không truy cập được không đủ để xóa bản ghi.
- Chỉ loại bản ghi khi xác nhận file đã mất; việc loại metadata không được xóa một file khác trên bộ nhớ.

Đổi tên/di chuyển cần giữ ID và metadata người dùng khi có đủ bằng chứng nhận diện cùng file. Không ghép bản ghi chỉ dựa vào tên hoặc kích thước; nếu không xác định được, phải có chính sách rõ ràng thay vì đoán.

## 6. Thay đổi bị bỏ lỡ khi app không chạy

Observer không phải nhật ký thay đổi bền vững. Khi tiến trình bị tắt hoặc observer không được đăng ký, không thể giả định toàn bộ sự kiện sẽ được phát lại lúc mở app.

Do đó, cần phân biệt:

- **Hiển thị:** đọc DB ngay, không chờ kiểm tra bộ nhớ.
- **Kiểm tra bù:** xác định phần thay đổi trong khoảng không theo dõi, cập nhật bất đồng bộ.

Đề xuất cho kiểm tra bù:

1. Lưu checkpoint theo volume/nguồn dữ liệu.
2. Với MediaStore trên Android hỗ trợ, kiểm tra version và generation; không có thay đổi thì không truy vấn tiếp các bản ghi của nguồn này.
3. Khi có thay đổi, truy vấn phần thêm/sửa theo khả năng của nguồn; xử lý mục bị xóa bằng đối chiếu phù hợp. Generation của bản ghi không tự cung cấp danh sách ID đã bị xóa.
4. Với file ngoài phạm vi MediaStore, cần đối chiếu thư mục hoặc một phương án phục hồi riêng. Không dùng mốc thời gian sửa của file như bảo đảm tuyệt đối vì file mới sao chép vào có thể giữ thời gian cũ.
5. Khi checkpoint không còn hợp lệ, DB chỉ mục bị hỏng hoặc không đủ thông tin phục hồi, có thể cần quét phục hồi rộng hơn. Đây là ngoại lệ có lý do, không phải hành vi mỗi lần vào Home.

**Giới hạn cần chấp nhận:** nếu chỉ dựa vào sự kiện trực tiếp và tuyệt đối không kiểm tra bù, không thể bảo đảm danh sách luôn đầy đủ sau thời gian app bị tắt. Cách kiểm tra bù cho các file không thuộc MediaStore là điểm cần kiểm chứng trước khi chốt triển khai.

Không đề xuất chạy foreground service liên tục chỉ để tránh bỏ lỡ sự kiện.

## 7. Trạng thái bền vững

Đây là mô hình dữ liệu đề xuất, chưa phải migration đã chốt:

| Dữ liệu | Ý nghĩa |
|---|---|
| Trạng thái khởi tạo | Chưa bắt đầu, đang chạy, hoàn tất hoặc bị gián đoạn |
| Phiên bản chỉ mục | Nhận biết thay đổi cách lập chỉ mục cần phục hồi |
| Phạm vi/volume đã lập chỉ mục | Phân biệt các vùng lưu trữ và tình trạng gắn/tháo |
| Checkpoint theo nguồn | Version/generation hoặc thông tin đối chiếu phù hợp |
| Thông tin lần đồng bộ thành công | Hỗ trợ chẩn đoán, không dùng riêng nó để bảo đảm phát hiện mọi thay đổi |

Trạng thái đã cấp quyền và đã hoàn tất khởi tạo là hai trạng thái khác nhau. DB có bản ghi cũng không chứng minh lần quét đầu đã hoàn tất.

Nếu app bị tắt giữa lượt khởi tạo, lượt sau phải có thể tiếp tục hoặc chạy lại an toàn; không tạo bản ghi trùng và không đánh dấu hoàn tất sớm. Nếu nguồn thay đổi trong khi lập chỉ mục, cần xử lý bù trước khi coi checkpoint đã bắt kịp.

## 8. Thay đổi ở native và WebView

### Native

- Giữ Room là nguồn dữ liệu bền vững của thư viện.
- Chuyển `listDocuments()` sang đọc DB; bỏ việc đọc metadata từng file trong đường hiển thị.
- Tách tác vụ khởi tạo toàn bộ, xử lý thay đổi và kiểm tra bù.
- Thay vòng `pruneMissing()` toàn bộ định kỳ bằng xử lý có phạm vi và phục hồi khi cần.
- Quản lý lifecycle observer, hàng đợi, quyền và checkpoint tập trung; không phụ thuộc màn hình Home.
- Bổ sung sự kiện thêm/sửa/xóa sau commit, có thể gửi theo lô.

### WebView

- Mở app: đăng ký nhận thay đổi và tải snapshot DB; xử lý thứ tự để không bỏ lỡ sự kiện trong lúc tải.
- Vào Home/chuyển tab: dùng dữ liệu Pinia đã tải; không gọi quét toàn bộ.
- Nhận sự kiện: thêm, cập nhật hoặc loại bản ghi và tính lại thứ tự/bộ lọc liên quan.
- Dùng revision hoặc cơ chế snapshot nhất quán để phản hồi tải cũ không ghi đè thay đổi mới.
- Hiển thị riêng trạng thái cấp quyền, lập chỉ mục lần đầu và cập nhật thay đổi.
- Nút cập nhật thông thường yêu cầu kiểm tra chênh lệch; chức năng quét lại toàn bộ cần có tên rõ ràng.

Tên API và cấu trúc payload sẽ được chốt khi triển khai và cập nhật vào [native-api.md](native-api.md). Các thay đổi schema tương ứng phải được bổ sung vào [schema.md](schema.md).

## 9. Trình tự triển khai đề xuất

1. Kiểm chứng observer, phạm vi MediaStore và khoảng thời gian mất theo dõi trên thiết bị thật.
2. Thêm trạng thái khởi tạo bền vững và khả năng phục hồi lượt quét bị ngắt.
3. Tách đọc DB khỏi đọc metadata; loại trigger quét toàn bộ ở Home/resume, đồng thời bảo đảm có đường khởi tạo thay thế.
4. Bổ sung xử lý thay đổi có phạm vi, chống trùng và sự kiện cập nhật giao diện.
5. Hoàn thiện kiểm tra bù, xử lý quyền/volume và loại bỏ vòng kiểm tra toàn bộ 30 giây.
6. Đo chi phí trước/sau và cập nhật hợp đồng API, schema theo kết quả cuối cùng.

## 10. Tiêu chí nghiệm thu

- Cấp quyền lần đầu tạo một lượt lập chỉ mục; các trigger đồng thời không tạo lượt quét trùng.
- Mở lại app, vào Home và chuyển tab không gọi quét toàn bộ; danh sách từ DB xuất hiện trước tác vụ kiểm tra bù.
- Không có thay đổi thì không lặp việc đọc metadata của toàn bộ danh sách.
- Tải, sao chép hoặc chuyển file hỗ trợ vào bộ nhớ khi đang theo dõi sẽ cập nhật DB và giao diện, bao gồm thư mục trước đó chưa có tài liệu.
- File đang ghi không gây lỗi lặp vô hạn hoặc tạo bản ghi trùng.
- Sửa, đổi tên, di chuyển và xóa được xử lý theo phạm vi liên quan; dữ liệu người dùng được giữ khi nhận diện được cùng file.
- Tạo/import file trong app cập nhật giao diện ngay; observer phát lại không gây trùng.
- Bị tắt giữa lần khởi tạo vẫn phục hồi được.
- Thay đổi khi app bị tắt được phát hiện qua cơ chế kiểm tra bù trong phạm vi đã cam kết; ghi rõ các giới hạn còn lại sau kiểm chứng.
- Thu hồi quyền hoặc tháo bộ nhớ không làm xóa hàng loạt metadata do lỗi truy cập.
- Kiểm tra trên Android 10 và Android 11 trở lên, bộ nhớ trong/thẻ nhớ nếu thiết bị hỗ trợ, cùng tập dữ liệu nhiều file/thư mục.
- Có số đo thời gian hiển thị DB, số file/thư mục bị truy cập, số observer và số tác vụ đồng bộ; chứng minh việc chuyển màn hình không phát sinh duyệt toàn bộ bộ nhớ.

## 11. Nguồn Android chính thức

- [FileObserver](https://developer.android.com/reference/android/os/FileObserver): sự kiện và cách theo dõi file/thư mục.
- [ContentResolver](https://developer.android.com/reference/android/content/ContentResolver): đăng ký observer và thông báo từ content provider.
- [MediaStore](https://developer.android.com/reference/android/provider/MediaStore): version/generation hỗ trợ đồng bộ thay đổi trong dữ liệu MediaStore.

Các API trên là cơ sở kỹ thuật. Khả năng bao phủ toàn bộ định dạng và vị trí file của app cần được kiểm chứng thực tế; tài liệu này không coi MediaStore là nhật ký cho toàn bộ hệ thống file.

## 12. Triển khai và kiểm chứng ngày 09/11/2026

### Thay đổi đã thực hiện

- `App.vue` đăng ký sự kiện trước khi tải snapshot DB, sau đó gọi khởi tạo/kiểm tra bù. Home không còn trigger theo tab hoặc resume.
- `listDocuments` chỉ đọc Room; snapshot và revision nằm trong cùng transaction. Pinia xử lý lô thêm/sửa/xóa, loại revision cũ và hợp nhất thay đổi trong lúc tải; phản hồi thao tác mới không bị sự kiện trễ ghi đè.
- Room v3 lưu trạng thái khởi tạo riêng với quyền, checkpoint thư mục và MediaStore theo volume; migration giữ dữ liệu v1/v2. Không dùng destructive migration. Khởi tạo bị ngắt được chạy lại an toàn.
- Hàng đợi native gom sự kiện 250ms, thử lại file chưa ổn định tối đa ba lần. FileObserver theo dõi cả thư mục chưa có tài liệu, bổ sung cây con mới và gỡ khi pause/mất thư mục; không còn vòng quét 30 giây. ContentObserver ưu tiên URI cụ thể khi khớp bản ghi. Broadcast volume yêu cầu kiểm tra bù khi foreground.
- Lần đầu/quét lại toàn bộ ghi metadata theo lô tối đa 64 bản ghi. Kiểm tra bù đối chiếu thời gian các thư mục đã biết, chỉ liệt kê thư mục thay đổi/cây con mới. MediaStore Android 11+ dùng version/generation và inventory ID; Android 10 trở xuống dùng truy vấn collection.
- `local_path` chống trùng khi URI từ provider cục bộ và FileObserver cùng chỉ một file. MediaStore identity giữ ID khi chứng minh được di chuyển; tombstone ẩn giữ metadata trong lúc chờ thông báo nguồn. Khi không có identity ổn định, đổi đường dẫn được xử lý xóa/thêm, không ghép theo tên hoặc kích thước.
- Giao diện phân biệt quyền, lập chỉ mục và cập nhật. Home có “Cập nhật”; Cài đặt có “Quét lại toàn bộ bộ nhớ”. API/payload và các cột nội bộ được ghi trong `native-api.md` và `schema.md`.

### Kiểm chứng đã chạy

- `npm run build`: kiểm tra FSD, TypeScript và Vite thành công.
- `npm run test:library`: các test trong `App/verification/` kiểm tra thứ tự, metadata, xóa, snapshot/sự kiện trễ, khởi động listener, chống tác vụ trùng, migration SQLite v1→v2→v3 và revision rollback. Các test danh sách lớn giữ phạm vi render/tìm kiếm với 50.000 bản ghi.
- Gradle `:app:assembleDebug :app:assembleDebugAndroidTest --offline`: biên dịch Kotlin, KSP/Room, xuất schema v3 và tạo APK thành công.
- Instrumentation `LibrarySyncTest` chạy bằng ADB trên Samsung SM-N985F, Android 13/API 33. Test dùng Room riêng trong bộ nhớ và thư mục UUID riêng trong Download; không đọc/ghi thư viện DB của người dùng. FileObserver thật phát hiện tài liệu đầu tiên trong thư mục trống, cây con mới, ghi lại và xóa file. Kiểm tra bù phát hiện bản sao tạo khi ngừng theo dõi dù giữ thời gian sửa cũ.
- Một mẫu đo: khởi tạo 1 file/2 thư mục khoảng 568ms (gồm thời gian gom sự kiện và MediaStore); 10 snapshot khoảng 48ms. Số observer tăng 2→3 khi thêm thư mục; hai lượt cập nhật không thay đổi giữ nguyên bộ đếm `directoriesRead=5`, `filesRead=6`. Mười lần snapshot không làm tăng bộ đếm truy cập file/thư mục. Đây là mẫu dữ liệu nhỏ, không phải benchmark toàn bộ thiết bị.
- Test trạng thái `running` mô phỏng khởi tạo bị ngắt; cổng quyền được mô phỏng bị thu hồi/cấp lại để xác nhận giữ DB; identity provider được đưa vào fixture để kiểm tra giữ ID/yêu thích/tiến độ khi discovery đi trước thông báo di chuyển. Chưa coi các mô phỏng này là kiểm chứng tiến trình bị OS kill, thu hồi quyền từ Settings hoặc đổi tên qua mọi provider thực tế.

### Giới hạn và phần cần kiểm chứng tiếp

- File không được MediaStore/provider quản lý: sửa nội dung tại chỗ lúc app không chạy có thể không đổi mtime thư mục. Trường hợp này cần “Quét lại toàn bộ”; không hứa phát hiện mọi thay đổi chỉ bằng observer. Công cụ khôi phục cả thời gian thư mục cũng có thể vượt qua checkpoint thành viên.
- Sự kiện/thay đổi trong MediaStore phụ thuộc provider và phiên bản Android. Test native hiện chưa chứng minh rename/move thực tế của mọi PDF/Office/TXT/Markdown qua MediaStore, hoặc provider đám mây.
- Chưa kiểm chứng trên Android 10, thẻ nhớ tháo/gắn thực tế, bộ dữ liệu nhiều nghìn thư mục hoặc giới hạn số FileObserver. Cần đo số observer, chi phí đăng ký và độ trễ trên các thiết bị này trước khi xác nhận toàn bộ tiêu chí nghiệm thu.
- Bộ đếm chẩn đoán là số lần DeviceStorage đọc metadata file/liệt kê thư mục, không bao gồm mọi syscall của Android/provider. Checkpoint thư mục vẫn phải stat các thư mục đã biết khi kiểm tra bù, nhưng không duyệt lại file của thư mục không thay đổi.
