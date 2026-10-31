# DuAnTaoVideo Flow Asset IDs — Chrome Extension MV3

1. Mở Chrome do **GFlow Doctor** điều khiển. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển / Developer mode**.
2. Bấm **Tải tiện ích đã giải nén / Load unpacked**, chọn thư mục `extension` của repo. Nếu dùng bản EXE đã đóng gói, thư mục tương ứng là `resources/duantaovideo-extension`.
3. Mở lại project Google Flow trong **cùng cửa sổ Chrome**, bấm dấu + cạnh ô prompt và mở thư viện ảnh.
4. Extension đọc các ID hiển thị trong DOM hoặc tạo mã nhận diện cục bộ, đánh dấu ảnh với `data-dtv-asset-key`, lưu vào `chrome.storage.local`.
5. DuAnTaoVideo kết nối bằng Playwright CDP tới tab đó, đọc thuộc tính DOM này. Không cần server/port localhost, mật khẩu hay API Google Flow nội bộ.

**Giới hạn:** Không có đảm bảo Google Flow cung cấp ID media công khai trong HTML. Mã `dom:` phản ánh một thuộc tính ID mà Flow thực sự trả trong DOM nhưng có thể đổi; `local:` chỉ là fingerprint của thuộc tính ảnh đang hiển thị. Chrome extension không được phép suy đoán ID từ request nội bộ, và không gửi ảnh/URL/cookie ra ngoài. Việc extension nhận diện ảnh phụ thuộc vào bộ chọn media trong UI hiện tại. Nếu ID đã đổi hoặc ảnh bị xóa, app dừng thay vì tạo nhầm ảnh hay tự upload trùng.
