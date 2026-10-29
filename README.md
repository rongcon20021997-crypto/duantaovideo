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

## Sửa lỗi Chrome debugging trên Windows

Nếu **GFlow Doctor** báo `Could not start Google Chrome with a debugging port`, có hai nguyên nhân thường gặp:

1. `swissmarley/gflow-cli` hiện có `findChromeProcessesForProfile()` trả về `[]` trên Windows. Vì vậy nó không tự đóng cửa sổ **Chrome đăng nhập** trước khi khởi động phiên Chrome có CDP. Hãy **đóng hoàn toàn cửa sổ Chrome do GFlow mở để đăng nhập**, không đóng Chrome cá nhân, rồi bấm Doctor. Không xóa profile/cookie.
2. Chrome không nằm tại `C:\Program Files\Google\Chrome\Application\chrome.exe`. Vào Cài đặt → **Đường dẫn Google Chrome**, chọn `chrome.exe` ở thư mục cài đặt thật (ví dụ `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe` hoặc AppData). Bấm **Chẩn đoán Chrome / profile** trước khi Doctor.

Ứng dụng chỉ *kiểm tra* tiến trình Chrome sử dụng chính profile gflow và cảnh báo rõ ràng, không tự đóng Chrome hoặc xóa dữ liệu cá nhân. Khi lỗi thuộc upstream, cần sửa/chạy test trên máy Windows có Chrome đã đăng nhập để xác nhận hoạt động thực tế.

## Sửa lỗi `No Flow project is open and one could not be created`

Bản tích hợp sử dụng navigator của `swissmarley/gflow-cli` với bản vá tương thích khi `npm install`:

- Nếu Chrome đang ở project, tiếp tục dùng project đó.
- Nếu Chrome ở dashboard và không chỉ định project, ứng dụng chỉ mở project có sẵn và **không tự bấm New project**. Không có project sẽ báo lỗi rõ ràng.
- Khi chưa có project, hãy tự bấm `+ New project` trong Google Flow, xác nhận trang project hoạt động bình thường rồi sao chép URL vào DuAnTaoVideo.
- Nếu Flow đổi giao diện tiếp, mở https://flow.google.com bằng Chrome, vào một dự án, sao chép URL dạng `https://flow.google.com/project/<id>` vào **Cài đặt → Project Google Flow**, lưu dự án và tạo nhân vật lại.
- Nếu dùng project name phải khớp nhãn project; URL/ID là lựa chọn đáng tin hơn.
- Không tự động nhấn Create project lần nào; nếu URL trả về `/404` hoặc `/404?reason=project`, ứng dụng dừng và hướng dẫn kiểm tra quyền tài khoản.

**Lưu ý:** Google Flow web thực tế có thể thay đổi và không thể kiểm chứng trực tiếp nếu thiếu phiên đăng nhập tài khoản. Bản vá dựa vào DOM/Playwright của upstream, không gọi API nội bộ Google.

## Tạo ảnh riêng, không cần chạy video

Trong **Kịch bản**, chọn một cảnh rồi nhập **Prompt tạo ảnh keyframe** và bấm **Tạo ảnh cảnh này**. Nếu muốn dùng nhân vật đã tạo trong Flow, bật mục **Dùng nhân vật đã lưu**. Nếu chưa có Character, bỏ mục này để tạo ảnh bình thường.

Trong tab **Nhân vật**, nút **Tạo ảnh thử từ mô tả** tạo ảnh theo chữ, không sử dụng ảnh tham chiếu đã tải lên. Để dùng các ảnh tham chiếu này, chọn **Tạo nhân vật trên Google Flow**.

Phải điền URL project có thể truy cập trong **Cài đặt**. Khi đang tạo ảnh, ứng dụng hiển thị hoạt động, log và sau khi tạo sẽ xác nhận đường dẫn file ảnh trên máy. Ứng dụng không tự tạo Flow project.

## Project chuyển sang `/404`: kiểm tra đúng Chrome GFlow

Với bản mới, **không đoán ID project** và không tự tạo project:
1. Mở **Cài đặt → GFlow Doctor** để tạo phiên Chrome debugging đúng profile GFlow.
2. Trong cửa sổ Chrome **do GFlow Doctor mở**, vào `https://flow.google.com`, đăng nhập tài khoản có quyền truy cập project, sau đó **tự bấm mở project** trong giao diện Flow. Nếu Chrome này mở project cũng chuyển `/404`, cần kiểm tra tài khoản/project trước; không thể khắc phục bằng việc đổi URL trong ứng dụng.
3. Giữ nguyên tab project. Quay lại ứng dụng bấm **Dò project đang mở trong Chrome GFlow**. Ứng dụng chỉ đọc URL tab qua DevTools localhost, không đọc cookie, không điều khiển DOM hoặc sửa dữ liệu Flow.
4. Nếu phát hiện một project, URL được lưu tự động vào workspace. Nếu có nhiều project, chọn đúng URL rồi bấm **Lưu dự án**.
5. Tạo ảnh sau khi project đang mở khớp project đã chọn. Nếu có `/404` hoặc project sai profile, ứng dụng sẽ **dừng trước khi tốn credits**, ghi rõ lỗi và hướng dẫn.

Thư viện `gflow-cli` được cập nhật tương thích khi `npm install` để **không tự tải lại trang chủ** nếu Chrome đã đang mở trình chỉnh sửa project. Phần tự động tạo ảnh/video vẫn được xử lý bởi upstream GFlow CLI.
