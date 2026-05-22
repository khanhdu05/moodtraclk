# MoodTrack Mobile

MoodTrack là app nhật ký cảm xúc thông minh cho sinh viên, được chọn từ đề tài **MoodTracker - Nhật ký cảm xúc thông minh** trong file `15-de-tai-mobile.pptx`.

## Lý do chọn đề tài

MoodTracker là đề tài 2 sao, dễ hoàn thành hơn các đề cần Maps, OCR, AI hoặc video call. App vẫn đáp ứng đủ yêu cầu chính: có Authentication, Firebase, tối thiểu 5 màn hình, biểu đồ tâm trạng, gợi ý hoạt động và cài đặt nhắc nhở.

## Tính năng đã làm

- Đăng nhập / đăng ký bằng Firebase Authentication.
- Lưu mood hằng ngày lên Firestore.
- Ghi nhanh cảm xúc bằng emoji, điểm mood, năng lượng và ghi chú.
- Biểu đồ 7 lần ghi gần nhất và nhận xét xu hướng.
- Gợi ý hoạt động healing theo mood gần nhất.
- Lịch sử mood, xóa bản ghi.
- Cài đặt giờ nhắc ghi nhật ký.
- Chế độ demo local nếu chưa cấu hình Firebase.

## 5 màn hình chức năng

1. Hôm nay: ghi mood nhanh.
2. Thống kê: biểu đồ và phân tích xu hướng.
3. Gợi ý: hoạt động cải thiện tâm trạng.
4. Lịch sử: danh sách mood đã lưu.
5. Cài đặt: nhắc nhở và đăng xuất.

## Firebase services

- Firebase Authentication: đăng nhập, đăng ký, đăng xuất.
- Cloud Firestore: lưu `moodEntries` và `userSettings`.

## Cài đặt

```bash
npm install
```

Tạo file `.env` từ `.env.example` và điền cấu hình Firebase web app:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

Trong Firebase Console:

- Bật Authentication bằng Email/Password.
- Tạo Cloud Firestore database.
- Có thể dùng rule khi demo:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /moodEntries/{entryId} {
      allow read, create, update, delete: if request.auth != null
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.userId;
    }

    match /userSettings/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Chạy dự án

```bash
npm start
```

Sau đó quét QR bằng Expo Go hoặc nhấn `a` để mở Android emulator.

Nếu chưa có Firebase `.env`, app vẫn chạy bằng demo local để xem UI và luồng chức năng.

## Cấu trúc thư mục

```text
App.js
src/
  data/moods.js
  services/firebase.js
  theme.js
docs/
  phan-cong-nhiem-vu.md
  slide-thuyet-trinh.md
  kich-ban-video-demo.md
```

## Gợi ý demo

1. Đăng ký tài khoản mới.
2. Ghi mood hôm nay với emoji và ghi chú.
3. Mở tab Thống kê để xem biểu đồ.
4. Mở tab Gợi ý để xem hoạt động phù hợp.
5. Mở Lịch sử, xóa một bản ghi.
6. Mở Cài đặt, đổi giờ nhắc và đăng xuất.
