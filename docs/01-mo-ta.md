# 01. MÔ TẢ

## Kiến trúc

Đại Não có nhiệm vụ duy nhất là dò, gọi model từ key của Đại Não.
Model được Đại Não gọi được gọi là **BOSS**.

BOSS có nhiệm vụ viết format điều phối model của Tiểu Não.
Đồng thời có quyền quyết định truy cập Web từ key được dán ở phần
giao diện dán key Web.

Khi BOSS hết quota hoặc lỗi thì Đại Não sẽ gọi BOSS mới lên thay
từ key của phần Đại Não. Khi BOSS mới lên thay phải đọc lại yêu cầu
User và xác định tình trạng hiện tại đang làm gì, đã làm tới đâu
để tiếp tục nhiệm vụ.

Tiểu Não có vai trò dò, gọi model từ key dán ở phần Tiểu Não.
Model được gọi lên từ Tiểu Não được gọi là **lính**.

Lính có nhiệm vụ là làm việc mà BOSS giao.
Sau khi làm xong phải đưa câu trả lời cho BOSS.

Nếu nhiệm vụ liên quan tới code thì BOSS sẽ kiểm tra chạy thử trên
Sandbox. Nếu đúng thì trả về Rồng Thần để Rồng Thần trả về User.
Nếu sai thì BOSS phải đưa ra cách khắc phục và tiếp tục viết format
cho lính sửa. Sửa cho tới khi nào đúng mới thôi.

## Các bước dò model từ key

- Bước 1: Xác nhận xem có bao nhiêu key được dán.
- Bước 2: Xác nhận quyền truy cập model.

## Quy tắc xoay key

Nếu một key hết quota thì sẽ xoay qua key tiếp theo.
Nếu như có nhiều key giống nhau, ví dụ như 3 Groq, 3 Gemini,
3 OpenRouter thì khi 1 key hết quota sẽ phải xoay đủ theo vòng lặp.
Không được tự ý bỏ qua.

Dùng nhiều tài khoản để tạo nhiều key nên có nhiều quota.

## Quy tắc

- Đại Não **không được** dò, không được gọi model từ key của Tiểu Não.
- Tiểu Não **không được** dò, không được gọi model từ key của Đại Não.
- BOSS **không trực tiếp làm** yêu cầu mà sẽ viết format để điều phối lính.
  Nếu như là thông tin cần tra web thì BOSS sẽ tự làm.