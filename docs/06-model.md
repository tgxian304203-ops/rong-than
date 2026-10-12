# 06. MODEL ĐẠI NÃO VÀ MODEL TIỂU NÃO

## 1. MODEL ĐẠI NÃO

Nhiệm vụ của Đại Não:
- Đại Não có nhiệm vụ duy nhất là dò, gọi model từ key của Đại Não.
- Model được Đại Não gọi được gọi là BOSS.
- Đại Não chỉ dùng key của phần Đại Não.
- Đại Não KHÔNG được dò, không được gọi model từ key của Tiểu Não.

Việc Đại Não phải làm:
- Phân loại yêu cầu User.
- Chọn model theo loại yêu cầu.
- Gọi model lên làm BOSS.
- Xử lý khi BOSS hết quota hoặc lỗi.
- Gọi BOSS mới lên thay từ key của phần Đại Não.

Model Đại Não dùng:

| Vai trò | Model ưu tiên 1 | Model ưu tiên 2 | Nhà cung cấp |
|---|---|---|---|
| Phân loại yêu cầu | openai/gpt-oss-120b | meta-llama/llama-4-maverick-17b-128e-instruct | Groq |
| Chọn model theo loại | llama-3.3-70b-versatile | openai/gpt-oss-20b | Groq |
| Gọi BOSS mới khi BOSS cũ lỗi | openai/gpt-oss-120b | meta-llama/llama-4-maverick-17b-128e-instruct | Groq |

Lý do chọn Groq cho Đại Não:
- Tốc độ cực nhanh nhờ Groq LPU.
- RPM cao (30 RPM).
- Model mạnh, đủ thông minh cho việc phân loại.

## 2. MODEL TIỂU NÃO

Nhiệm vụ của Tiểu Não:
- Tiểu Não có vai trò dò, gọi model từ key dán ở phần Tiểu Não.
- Model được gọi lên từ Tiểu Não được gọi là lính.
- Tiểu Não chỉ dùng key của phần Tiểu Não.
- Tiểu Não KHÔNG được dò, không được gọi model từ key của Đại Não.

Việc Tiểu Não phải làm:
- Nhận format điều phối từ BOSS.
- Đọc nhiệm vụ trong format.
- Chọn model theo nhiệm vụ.
- Kiểm tra quota và khả dụng.
- Gọi model từ key của Tiểu Não lên làm lính.
- Trả kết quả về BOSS.

Bảng chọn model theo nhiệm vụ:

| Loại nhiệm vụ | Model ưu tiên 1 | Model ưu tiên 2 | Nhà cung cấp |
|---|---|---|---|
| Viết code | qwen/qwen3-coder:free | openai/gpt-oss-120b | OpenRouter / Groq |
| Sửa lỗi code | qwen/qwen3-coder:free | meta-llama/llama-4-maverick-17b-128e-instruct | OpenRouter / Groq |
| Phân tích code | openai/gpt-oss-120b | meta-llama/llama-4-maverick-17b-128e-instruct | Groq |
| Đọc tài liệu dài | qwen/qwen3.6-plus:free | moonshotai/kimi-k2-instruct | OpenRouter / Groq |
| Tóm tắt | llama-3.3-70b-versatile | minimax/minimax-m2.5:free | Groq / OpenRouter |
| Tra cứu thông tin | meta-llama/llama-4-scout-17b-16e-instruct | minimax/minimax-m2.5:free | Groq / OpenRouter |
| Tác vụ khối lượng lớn | gemini-3.5-flash-lite | llama-3.1-8b-instant | Gemini / Groq |

Lý do chọn theo nhiệm vụ:
- Viết code, sửa lỗi → cần model chuyên code, context dài.
- Đọc tài liệu dài → cần model context lớn.
- Tác vụ khối lượng lớn → cần model RPM cao.

## 3. QUY TẮC CHUNG

Độc lập key:
- Đại Não chỉ dùng key của phần Đại Não.
- Tiểu Não chỉ dùng key của phần Tiểu Não.
- Đại Não KHÔNG được dò, không được gọi model từ key của Tiểu Não.
- Tiểu Não KHÔNG được dò, không được gọi model từ key của Đại Não.

Khi model không khả dụng:
- Kiểm tra quota và khả dụng trước khi gọi.
- Nếu model ưu tiên 1 hết quota hoặc lỗi → chuyển model ưu tiên 2.
- Nếu model ưu tiên 2 cũng không được → chuyển model cùng hạng sức mạnh khác nhà cung cấp.
- Nếu tất cả hết → hạ xuống hạng thấp hơn.

Xoay key khi hết quota:
- Nếu một key hết quota → xoay qua key tiếp theo.
- Nếu có nhiều key giống nhau (3 Groq, 3 Gemini, 3 OpenRouter) → khi 1 key hết quota phải xoay đủ theo vòng lặp.
- Không được tự ý bỏ qua.

Cập nhật bảng:
- Bảng chọn model phải cập nhật định kỳ.
- Model free thay đổi thường xuyên.
- Chỉ dùng model còn hoạt động.