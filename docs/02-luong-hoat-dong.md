# 02. LUỒNG HOẠT ĐỘNG

## LUỒNG 1 — User gửi yêu cầu không cần Web, không cần code

USER
  ↓
RỒNG THẦN nhận yêu cầu
  ↓
RỒNG THẦN chuyển yêu cầu cho BOSS
  ↓
BOSS viết format điều phối lính
  ↓
Tiểu Não dò, gọi model từ key Tiểu Não
  ↓
Lính thực hiện việc BOSS giao
  ↓
Lính đưa câu trả lời cho BOSS
  ↓
BOSS trả kết quả cho Rồng Thần
  ↓
Rồng Thần trả kết quả cho User

## LUỒNG 2 — User gửi yêu cầu cần tra Web

USER
  ↓
RỒNG THẦN nhận yêu cầu
  ↓
RỒNG THẦN chuyển yêu cầu cho BOSS
  ↓
BOSS quyết định cần tra Web
  ↓
BOSS tự tra Web từ key dán ở phần giao diện dán key Web
  ↓
BOSS viết format điều phối lính
  ↓
Tiểu Não dò, gọi model từ key Tiểu Não
  ↓
Lính thực hiện việc BOSS giao (đã có dữ liệu Web từ BOSS)
  ↓
Lính đưa câu trả lời cho BOSS
  ↓
BOSS trả kết quả cho Rồng Thần
  ↓
Rồng Thần trả kết quả cho User

## LUỒNG 3 — User gửi yêu cầu liên quan tới code

USER
  ↓
RỒNG THẦN nhận yêu cầu
  ↓
RỒNG THẦN chuyển yêu cầu cho BOSS
  ↓
BOSS viết format điều phối lính
  ↓
Tiểu Não dò, gọi model từ key Tiểu Não
  ↓
Lính làm việc BOSS giao
  ↓
Lính đưa kết quả cho BOSS
  ↓
BOSS kiểm tra chạy thử trên Sandbox
  ├──── ĐÚNG ───→ BOSS trả kết quả cho Rồng Thần
  │              → Rồng Thần trả kết quả cho User
  │
  └──── SAI  ───→ BOSS đưa ra cách khắc phục + viết format cho lính sửa
                 → Lính sửa
                 → BOSS kiểm tra chạy thử lại trên Sandbox
                 → Lặp lại cho tới khi ĐÚNG mới thôi

## LUỒNG 4 — Khi BOSS hết quota hoặc lỗi

BOSS đang hoạt động
  ↓
BOSS hết quota hoặc lỗi
  ↓
Đại Não gọi BOSS mới lên thay từ key của phần Đại Não
  ↓
BOSS mới đọc lại yêu cầu User
  ↓
BOSS mới xác định tình trạng hiện tại đang làm gì, đã làm tới đâu
  ↓
BOSS mới tiếp tục nhiệm vụ

## LUỒNG 5 — Dò model từ key

- **Bước 1:** Xác nhận xem có bao nhiêu key được dán.
- **Bước 2:** Xác nhận quyền truy cập model.

## LUỒNG 6 — Xoay key khi hết quota

Một key hết quota
  ↓
Xoay qua key tiếp theo
  ↓
Nếu có nhiều key giống nhau (3 Groq, 3 Gemini, 3 OpenRouter)
  ↓
Xoay đủ theo vòng lặp
  ↓
Không được tự ý bỏ qua

## LUỒNG 7 — Quy tắc độc lập Đại Não và Tiểu Não

- Đại Não **không được** dò, không được gọi model từ key của Tiểu Não.
- Tiểu Não **không được** dò, không được gọi model từ key của Đại Não.