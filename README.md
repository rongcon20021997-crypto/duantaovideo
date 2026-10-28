# DuAnTaoVideo — Google Flow Desktop Studio

Ứng dụng Electron + React + TypeScript với node canvas kiểu n8n. Dùng **trực tiếp** hai thư viện có sẵn, không sao chép DOM/selector:

- [swissmarley/gflow-cli](https://github.com/swissmarley/gflow-cli): engine chính; Chrome login, tạo ảnh/video, Character, Voice, Frames, Scene Extend, tải media.
- [Zahed316/google-flow-cli](https://github.com/Zahed316/google-flow-cli): engine SDK phụ; Node.js FlowClient, doctor, project list, tạo video. Khóa phiên bản bằng SHA GitHub.
- OpenAI/Gemini (tùy chọn) viết kịch bản AI cho 1–20 cảnh, có mẫu offline chỉnh sửa được.
- Ứng dụng có hàng đợi chạy tuần tự, lưu dự án, hiển thị trạng thái từng cảnh, mở video tại thư mục đầu ra.

## Cài đặt (Windows, Node.js >= 20, Chrome)

```powershell
git clone https://github.com/rongcon20021997-crypto/duantaovideo.git
cd duantaovideo
npm install
npm run dev
```

## Sử dụng

1. Vào Cài đặt → Đăng nhập Chrome. Đăng nhập Google thủ công vào cửa sổ Chrome do GFlow mở.
2. Bấm GFlow Doctor, chọn engine GFlow CLI làm mặc định.
3. Vào Nhân vật, mô tả người dẫn, tải ảnh tham chiếu, chọn voice nếu có trong Flow, bấm Tạo trên Google Flow.
4. Nhập chủ đề và số phân cảnh. Bấm AI viết kịch bản (cần OpenAI/Gemini key) hoặc dùng mẫu; xem và sửa prompt từng cảnh.
5. Bấm Lưu dự án, sau đó Chạy toàn bộ. Engine GFlow tạo ảnh keyframe tùy cấu hình, tạo video từng cảnh rồi lưu về máy.
6. Mở Thư viện để xem media và dùng Scene Extend với Media ID hoặc Scene ID trong Flow.

## Cấu trúc

```text
electron/main.cjs          Electron IPC + chạy trực tiếp upstream CLI/FlowClient + AI/story + queue
electron/preload.cjs       IPC allowlist
electron/lib/workflow.cjs  model dữ liệu, cảnh mẫu, tên file
src/App.tsx                React Flow canvas, biên tập kịch bản, nhân vật, media, cài đặt
src/styles.css             giao diện desktop dark
tests/workflow.test.cjs    kiểm thử dữ liệu
```

## Kiểm thử / đóng gói

```powershell
npm test
npm run build
npm run dist:win
```

Máy cần Google Chrome và quyền sử dụng Google Flow. SDK của Zahed có Chrome profile / cổng 9222 riêng, **không chia sẻ đăng nhập tự động** với swissmarley và không hỗ trợ Character cùng cách. Với video giữ nhân vật, chọn GFlow CLI. Key AI được lưu bằng Electron safeStorage khi có mã hóa OS, hoặc khai báo OPENAI_API_KEY/GEMINI_API_KEY qua biến môi trường. Không commit key hay media vào GitHub.

**Giới hạn:** Chưa kiểm thử chạy live trên tài khoản Google của bạn. Tính nhất quán khuôn mặt/giọng và khả năng chạy phụ thuộc Google Flow. Các thay đổi UI có thể làm upstream CLI lỗi. Không cam kết tránh bị giới hạn, không tự động vượt CAPTCHA/rate limit. Mỗi scene sinh video riêng, chưa ghép phim cuối. Hàng đợi dừng khi gặp lỗi để không tốn credits ngoài ý muốn.

## License / Credits

GFlow CLI © swissmarley, MIT; Google Flow CLI © Zahed Rastgar, MIT. Hai upstream là dự án độc lập, không liên kết Google.
