# Kịch bản hiển thị quảng cáo — PDF Toolbox

**Trạng thái:** đã triển khai trong code (lõi ở `App/src/shared/ads/`), **chưa kiểm tra trên máy thật**. Đơn vị quảng cáo trong `App/src/shared/ads/config.ts` vẫn để trống, nên khi chưa điền thì app không giữ chỗ và không hiện quảng cáo nào.

**Đọc kèm:** `note/ads_policy_interstitial_banner_native.md` (chính sách), `note/native-ad-slot-guide.md` (cách đặt ô native), `note/ad-layout-stability.md` (giữ chỗ chống giật layout).

---

## 1. App này khác game ở đâu

PDF Toolbox là app tiện ích. Người dùng mở app để làm một việc cụ thể, làm xong rồi đóng:

| Việc người dùng làm | Đặc điểm | Hệ quả cho quảng cáo |
|---|---|---|
| Đọc PDF, Word, Excel, PPT | Dài, tập trung, cuộn liên tục | Không được chen ngang. Không có quảng cáo nào đè lên trang tài liệu |
| Dùng công cụ (ghép, tách, khóa, chuyển đổi, quét) | Ngắn, có điểm **xong việc** rõ ràng | Điểm xong việc là chỗ tốt nhất cho quảng cáo toàn màn hình |
| Mở tệp từ app khác ("Open with") | Người dùng đang vội, muốn thấy tệp ngay | Không quảng cáo nào được chặn trước tệp |
| Duyệt danh sách tệp ở trang chủ | Lướt, chọn | Banner ở đáy là hợp lý |

Ngoài ra app **rất hay tự rời màn hình** để mở màn hệ thống: chọn tệp, chia sẻ, lưu bản sao, chọn thư mục lưu, màn cấp quyền tệp, camera. Khi người dùng quay lại từ các màn này, **không được** hiện quảng cáo mở app (xem mục 4.2).

## 2. Năm nguyên tắc

1. **Tài liệu là vùng cấm.** Không banner, không native, không interstitial trong lúc đọc (cuộn, phóng to, tìm chữ, ghi chú).
2. **Toàn màn hình chỉ ở điểm chuyển tiếp tự nhiên:** lúc khởi động, lúc vừa xong một công cụ, lúc mở một tài liệu từ danh sách. Không bao giờ hiện khi bấm Back hoặc khi thoát app.
3. **Một khoảng nghỉ chung cho mọi quảng cáo toàn màn hình:** 60 giây, tính từ lúc quảng cáo trước được **đóng**.
4. **Quảng cáo không bao giờ chặn việc của người dùng.** Không tải được, quá hạn hoặc không có fill thì đi tiếp như không có gì.
5. **Không đặt quảng cáo sát nút bấm.** Các màn công cụ có nút chính ở đáy (`BottomAction`) nên không đặt banner ở đó.

## 3. Bản đồ quảng cáo theo màn

| Màn (route) | Banner | Native | Toàn màn hình | Ghi chú |
|---|---|---|---|---|
| `/language` (lần đầu) | — | `small` dưới danh sách ngôn ngữ | — | Cách nút Continue ≥ 48dp |
| `/onboarding` (lần đầu) | — | — | — | Slide vuốt ngang có animation, native view không bám theo được |
| Sau onboarding | — | — | — | Lần đầu không có quảng cáo toàn màn hình |
| `/launch` (mới) | — | — | **App open** khi mở app nguội | Hạn 5 giây, quá hạn thì bỏ |
| `/begin` | Có | `medium` (`small` nếu máy thấp) | — | Đã có chỗ sẵn. Đếm ngược 3 giây |
| `/`, `/history`, `/favorites` | **Có** | `small` ở đầu danh sách, cả 3 tab | — | Nút nổi (FAB) phải nằm trên banner. Ô native cố định dưới hàng lọc loại tệp, ngoài vùng cuộn |
| `/search` | Có, ẩn khi bàn phím mở | — | — | |
| `/reader/:id`, `/office/:id` | — | — | Interstitial **trước khi** mở tài liệu (mục 4.3) | Bên trong trình đọc không có quảng cáo |
| `/tool/*` lúc chọn tệp và chạy | — | — | — | Nút chính ở đáy, không đặt banner |
| `/tool/*` vừa xong | — | — | **Interstitial** trước bảng kết quả (mục 4.4) | Điểm có doanh thu chính |
| `/tool/scan` (camera) | — | — | — | Màn camera nền đen, không quảng cáo |
| `/settings`, `/trash` | Có | — | — | |
| Quay lại app từ nền | — | — | **App open** nếu đi lâu ≥ 30 giây (mục 4.2) | Không áp dụng khi app tự mở màn hệ thống |

## 4. Kịch bản chi tiết

### 4.1. Mở app nguội (cold start)

```
Lần đầu:   /language (native small) → /onboarding → xin quyền tệp → Trang chủ
Lần sau:   /launch (app open, ≤ 5s) → /begin (native + banner, đếm 3s) → Trang chủ
Open with: /launch bị hủy ngay → mở thẳng tài liệu
```

- `/launch` là màn tải ngắn (logo và vòng quay), giống `LaunchAdView` của WorkoutApp. Nó chờ quảng cáo app open trong **tối đa 5 giây**, gồm cả thời gian khởi tạo SDK. Quá 5 giây thì bỏ, và quảng cáo về muộn **không bao giờ** được hiện đè lên màn sau.
- Không có đơn vị app open thì dùng interstitial MAX đã tải sẵn trong cùng hạn 5 giây (giống `launchInterstitial` của WorkoutApp).
- **Lần đầu dùng app không có app open.** Người dùng mới chưa có lý do ở lại, quảng cáo ngay giây đầu dễ khiến họ gỡ app.
- **Mở tệp từ app khác:** khi sự kiện `documentOpened` tới, hủy quảng cáo đang chờ (`AbortController`) rồi mở tài liệu ngay. Router hiện đã cho tệp đi thẳng qua `/begin`; cần thêm việc hủy ở `/launch`.

### 4.2. Quay lại app từ nền (resume)

Hiện app open khi **tất cả** đều đúng:

- App ở nền ≥ 30 giây.
- Quảng cáo toàn màn hình gần nhất đã đóng ≥ 60 giây.
- Người dùng **không** đang trong trình đọc có ghi chú chưa lưu, hoặc đang ở màn camera.
- Lần rời app **không do app tự mở màn hệ thống**.

Điều kiện cuối là điểm riêng của app này. Trước mỗi lệnh mở màn ngoài, đặt cờ `expectExternal()`, rồi xóa cờ khi app quay lại. Các chỗ cần đặt cờ:

| Hành động | File |
|---|---|
| Nhập tệp (bộ chọn tệp hệ thống) | `entities/file/model/store.ts` (`importFromDevice`), `entities/file/ui/FileSelect.vue` |
| Chia sẻ, lưu bản sao | `entities/file/model/use-file-actions.ts` |
| Chọn thư mục lưu | `features/save-location/ui/SaveLocation.vue` |
| Màn cấp quyền tệp | `entities/file/model/store.ts` (`requestLibraryAccess`) |
| Camera | `features/scan-document/` |

### 4.3. Mở tài liệu từ danh sách

Lúc người dùng bấm một tệp ở trang chủ, tìm kiếm, gần đây hoặc yêu thích là một điểm chuyển tiếp tự nhiên: họ rời danh sách để vào việc đọc.

- Hiện interstitial **trước** khi vào trình đọc, chỉ khi quảng cáo **đã tải sẵn**. Chưa tải thì mở tài liệu ngay, không chờ.
- **Lần mở đầu tiên trong phiên không có quảng cáo**, sau đó cứ **2 lần mở thì có 1 lần**, và vẫn theo khoảng nghỉ 60 giây.
- Không áp dụng cho: mở từ app khác, mở từ bảng kết quả của công cụ (đã có quảng cáo ở mục 4.4), mở lại cùng tệp vừa đóng.
- **Không** hiện quảng cáo khi rời trình đọc. Bấm Back mà gặp quảng cáo là trường hợp chính sách AdMob nêu tên là không được làm.

### 4.4. Xong một công cụ

Áp dụng cho ghép, tách, khóa/mở khóa, ảnh sang PDF, PDF sang ảnh, tài liệu sang PDF, quét. Luồng hiện tại là: chọn tệp → bấm nút → `useRunner.run()` → `ResultSheet` hiện "Xong".

```
bấm nút → đang xử lý (tải sẵn interstitial song song) → xong
        → interstitial (nếu đã tải và hết khoảng nghỉ) → đóng → ResultSheet
```

- Chèn vào `useRunner` (`entities/file/model/use-runner.ts`) để mọi công cụ dùng chung, không sửa từng màn.
- Bắt đầu tải interstitial **khi người dùng vào màn công cụ**, để lúc xong việc quảng cáo đã sẵn.
- Không có quảng cáo hoặc chưa hết khoảng nghỉ thì hiện `ResultSheet` ngay.
- Công cụ **xóa tệp** không có quảng cáo: đó là việc dọn dẹp, không phải tạo ra kết quả.
- Lỗi khi xử lý thì không hiện quảng cáo.

### 4.5. Banner

- **Trang chủ, tìm kiếm, cài đặt, thùng rác, `/begin`:** banner thích ứng (adaptive) cố định ở đáy.
- Dải giữ chỗ cao 50px có ngay từ khung hình đầu, chỉ phụ thuộc "đây có phải điện thoại không", không phụ thuộc quảng cáo đã tải chưa (theo `note/ad-layout-stability.md`).
- Trang chủ: `VirtualList` cộng thêm chiều cao banner vào `bottom-space`, và nút nổi (FAB) dời lên trên banner, cách ≥ 48dp.
- **Ẩn banner** khi đang mở: bảng công cụ, menu tệp, hộp thoại, bàn phím, quảng cáo toàn màn hình. Banner là view native nằm trên WebView, nếu không ẩn thì nó sẽ đè lên các bảng trượt từ dưới lên.

### 4.6. Native

Chỉ ở **màn tĩnh, không cuộn**: `/language` (`small`), `/begin` (`medium`), và đầu danh sách ở trang chủ (`small`, cả tab Home, History, Favorites). Ô ở trang chủ nằm cố định ngay dưới hàng lọc loại tệp, trên dải xin quyền và danh sách cuộn, nên không trôi theo tệp; máy thấp hơn 640px thì không có. Ô native nằm ngoài vùng cuộn, giữ chỗ cố định, và có nhãn "Quảng cáo" kèm AdChoices do SDK vẽ (theo `note/native-ad-slot-guide.md`).

Không chèn native **vào giữa** danh sách tệp (ô ở đầu danh sách là cố định, không phải một dòng của danh sách). Native trong danh sách cuộn bị trễ và đè lên header (đã ghi trong ghi chú kia), và người dùng dễ tưởng đó là một tệp.

### 4.7. Rewarded

**Chưa dùng ở bản đầu.** App không có tính năng trả phí để làm phần thưởng. Nếu sau này có, ví dụ "tắt quảng cáo 30 phút" hoặc "xuất ảnh chất lượng cao", thì mới thêm.

## 5. Tần suất

| Luật | Giá trị đề xuất |
|---|---|
| Khoảng nghỉ giữa hai quảng cáo toàn màn hình | 60 giây, tính từ lúc đóng |
| App open khi resume | Ở nền ≥ 30 giây |
| Interstitial khi mở tài liệu | Bỏ lần đầu trong phiên, sau đó 1 trên 2 lần |
| Interstitial khi xong công cụ | Mỗi lần xong, nếu đã hết khoảng nghỉ |
| Tối đa quảng cáo toàn màn hình mỗi phiên | 6 (chặn trên an toàn) |
| Hạn chờ app open lúc khởi động | 5 giây |
| Đếm ngược `/begin` | 3 giây (`BEGIN_SECONDS`) |

Các con số trên là cấu hình UX, không phải giới hạn bắt buộc của Google. Nên để thành hằng số trong một file, sau này chuyển sang remote config để chỉnh mà không cần ra bản mới.

## 6. Khi nào không có quảng cáo

- Chạy trên trình duyệt (không phải native).
- Chưa có đơn vị quảng cáo (cấu hình trống).
- Người dùng chưa đồng ý (consent/UMP) ở khu vực yêu cầu.
- Không có mạng. App đọc PDF hay được dùng offline, nên mọi chỗ phải đi tiếp bình thường.
- Đang có một quảng cáo toàn màn hình khác.
- Sau này: người dùng đã mua gói gỡ quảng cáo.

## 7. Triển khai đề xuất

Lớp điều phối dùng chung, theo mẫu `WorkoutApp/App/src/features/ads/adRuntime.ts` (đã làm):

| File | Nội dung |
|---|---|
| `shared/ads/runtime.ts` | `adsPossible`, `fullScreenShowing`, `lastFullScreenAt`, `overlayCount`, `expectExternal()`, `tryLaunchAd(signal)`, `showInterstitial(placement)`, `preloadInterstitial()`, `onResume()` |
| `shared/ads/placements.ts` | Tên vị trí (`app_launch`, `app_resume`, `open_document`, `tool_done`) và các hằng số tần suất ở mục 5 |
| `app/App.vue` + `features/ads/component/BannerAd.vue` | Dải giữ chỗ 50px cho route có `meta.banner`; một banner dùng chung, ẩn khi `overlaysOpen > 0`, bàn phím mở hoặc có quảng cáo toàn màn hình |
| `pages/launch/` (mới) | Màn `/launch` |
| `app/router/index.ts` | Lần sau mở app thì đi `/launch` → `/begin` |
| `app/App.vue` | Lắng nghe `appStateChange` để gọi `onResume()`, và hủy quảng cáo khởi động khi có `documentOpened` |
| `entities/file/model/use-runner.ts` | Gọi quảng cáo `tool_done` trước khi trả kết quả |
| `pages/home`, `search` | Gọi quảng cáo `open_document` trước khi `router.push` vào trình đọc |
| `shared/ui/BottomSheet.vue`, `dialogs/DialogHost.vue` | Tăng/giảm `overlayCount` khi mở/đóng |

**Lưu ý về kiến trúc FSD:** `entities` không được import `features`. Nên đặt `runtime.ts` ở tầng có thể dùng chung (ví dụ `shared/ads`), hoặc cho `useRunner` nhận một hàm "trước khi trả kết quả" từ màn công cụ. Kiểm tra bằng `npm run lint:fsd`.

**Thứ tự làm:**

1. Lớp điều phối, `/launch` và app open lúc khởi động; banner ở trang chủ.
2. Interstitial khi xong công cụ và khi mở tài liệu.
3. App open khi resume, kèm cờ `expectExternal`.
4. Native ở `/language`.

## 8. Cấu hình cần điền

Trong `App/src/shared/ads/config.ts` (Android trước):

| Khóa | Dùng cho |
|---|---|
| `applovin.android.sdkKey` | Khởi tạo MAX |
| `applovin.android.banner` | Banner ở đáy |
| `applovin.android.interstitial` | Khởi động (dự phòng), mở tài liệu, xong công cụ |
| `admob.android.appId` | Thay ID test của Google. Phải khớp `ADMOB_APP_ID` trong `android/app/build.gradle` |
| `admob.android.openApp` | App open khi khởi động và khi resume |
| `admob.android.native` | `/language`, `/begin`, đầu danh sách trang chủ |

Khi phát triển thì đặt `testAds: true`. Trước khi phát hành, đặt `dev: false` và giữ `testAds: false`.

## 9. Kiểm thử trước khi phát hành

- [ ] Lần đầu mở app: không có quảng cáo toàn màn hình nào trước trang chủ.
- [ ] Mở app lần sau: app open hiện trong 5 giây hoặc bị bỏ; không có quảng cáo nào hiện đè lên `/begin` hay trang chủ.
- [ ] "Open with" lúc app đang tắt: tài liệu mở ngay, không có quảng cáo chen vào.
- [ ] Nhập tệp, chia sẻ, lưu bản sao, cấp quyền tệp, chụp ảnh rồi quay lại: không có app open.
- [ ] Ở nền 1 phút rồi quay lại: có app open (nếu đã hết khoảng nghỉ).
- [ ] Xong hai công cụ liên tiếp trong 60 giây: chỉ lần đầu có interstitial.
- [ ] Trong trình đọc: cuộn, phóng to, tìm chữ, ghi chú, bấm Back đều không có quảng cáo.
- [ ] Mở bảng công cụ hoặc menu tệp: banner ẩn, đóng lại thì banner hiện lại.
- [ ] Danh sách tệp: dòng cuối không bị banner che, FAB nằm trên banner.
- [ ] Không có mạng: mọi luồng đi tiếp bình thường, không chờ.
- [ ] Máy màn hình nhỏ (360×640) và máy có gesture navigation.
- [ ] Checklist chung ở mục 4 của `note/ads_policy_interstitial_banner_native.md` (privacy policy, Data safety, consent).

## 10. Cần chủ app quyết định

1. Có cho interstitial khi mở tài liệu không? Đây là điểm mang lại doanh thu nhưng ảnh hưởng trải nghiệm nhiều nhất. Phương án nhẹ hơn: chỉ dùng điểm "xong công cụ".
2. Có native ở `/language` lần đầu không? Doanh thu cao, nhưng là ấn tượng đầu tiên của người dùng mới.
3. Có làm gói gỡ quảng cáo (IAP) không? Nếu có thì đó là phần thưởng hợp lý cho rewarded.
