# 04. ĐẶC TẢ GIAO DIỆN

## MỤC LỤC

1. Quy tắc giao diện chung
2. Màn hình chat chính
3. Thanh nhập tin nhắn và tệp đính kèm
4. Menu chính bên trái
5. New Chat
6. Danh sách dự án
7. Màn hình bên trong dự án
8. Lịch sử trò chuyện
9. Màn hình Cài đặt
10. Trang Dán Key
11. Trang Đại Não
12. Trang Tiểu Não
13. Trang Web
14. Cài đặt tài khoản
15. Đổi ID tài khoản
16. Đổi mật khẩu
17. Xóa tài khoản
18. Đăng ký
19. Đăng nhập
20. Rồng Thần Logs
21. Quy tắc xác nhận, xóa và bảo mật
22. Yêu cầu responsive
23. Yêu cầu kết nối backend
24. Sơ đồ điều hướng toàn ứng dụng

---

## 1. QUY TẮC GIAO DIỆN CHUNG

TÊN DỰ ÁN: Rồng Thần

LOGO:
- Logo chính: 🌕🐉
- Màn hình chat chính: logo nằm chính giữa phía trên màn hình.
- Các màn hình phụ: logo nằm ở góc trên bên phải.
- Không tự ý chuyển logo về chính giữa ở các màn hình phụ.
- Không đặt logo dự án lên từng nút chức năng.
- Logo trên đầu trang và biểu tượng trên tin nhắn là hai thành phần riêng biệt.

GIAO DIỆN:
- Hỗ trợ điện thoại Android và iPhone.
- Tự điều chỉnh theo chiều rộng, chiều cao và hướng màn hình.
- Không để nội dung bị tràn khỏi màn hình.
- Các danh sách dài phải có vùng cuộn riêng phù hợp.
- Các nút phải có vùng chạm phù hợp với điện thoại.
- Không tự ý thêm các nút hoặc mục cài đặt chưa được duyệt.

TIN NHẮN:
- Tin nhắn AI căn trái.
- Tin nhắn người dùng căn phải.
- Nền khung tin nhắn có hiệu ứng trong suốt khoảng 50%.
- Tin nhắn AI dùng chữ xanh lá.
- Tin nhắn người dùng dùng chữ trắng.

BIỂU TƯỢNG:
- 🔥🐉: nhãn Rồng Thần trên tin nhắn AI.
- 👾: nhãn User trên tin nhắn người dùng.
- 🌕🐉: logo chính của ứng dụng.
- 🔥: API Key còn quota.
- 😓: API Key đã hết quota.

---

## 2. MÀN HÌNH CHAT CHÍNH

┌────────────────────────────────┐
│ ☰              🌕🐉          ⋮ │
│                                │
│ 🔥🐉 Rồng Thần                  │
│ ┌────────────────────────────┐ │
│ │ Xin chào! Tôi có thể giúp  │ │
│ │ gì cho bạn hôm nay?        │ │
│ └────────────────────────────┘ │
│                                │
│                    👾 User     │
│                 ┌────────────┐ │
│                 │ Tin nhắn   │ │
│                 │ của bạn... │ │
│                 └────────────┘ │
│                                │
│ ┌────────────────────────────┐ │
│ │ ＋  Nhập tin nhắn...     ➤ │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘

A. NÚT ☰ BÊN TRÁI: mở menu chính, trượt từ trái sang phải, phủ toàn bộ màn hình.

B. LOGO 🌕🐉: nằm chính giữa phía trên màn hình chat.

C. NÚT ⋮ BÊN PHẢI: mở màn hình Rồng Thần Logs. Không mở menu tùy chọn chung.

D. TIN NHẮN AI: nhãn 🔥🐉 Rồng Thần trên khung, căn trái, chữ xanh lá, nền trong suốt ~50%.

E. TIN NHẮN NGƯỜI DÙNG: nhãn 👾 User trên khung, căn phải, chữ trắng, nền trong suốt ~50%.

F. VÙNG TRÒ CHUYỆN: cuộn được, phân biệt rõ AI và User.

G. THANH NHẬP: dưới cùng, ＋ bên trái, ô nhập giữa, ➤ bên phải.
Khi bàn phím mở → thanh nhập nằm sát phía trên bàn phím.

---

## 3. THANH NHẬP TIN NHẮN VÀ TỆP ĐÍNH KÈM

Quy tắc nhập:
- Nhấn ô nhập mở bàn phím.
- Ô nhập tự mở rộng theo nội dung.
- Chiều cao tối đa tương đương 6 dòng.
- Dài hơn 6 dòng → giữ chiều cao tối đa, cho cuộn nội bộ.
- Enter = xuống dòng. Không gửi.
- Chỉ gửi khi nhấn ➤.

Menu nút ＋:
- 📷 Chụp ảnh → mở camera
- 🖼 Thêm ảnh → mở thư viện ảnh
- 📎 Thêm file → mở trình chọn tệp

Tệp đính kèm:
- Hiển thị bên trong vùng nhập.
- Ảnh: hiển thị hình thu nhỏ.
- Tệp thường: hiển thị tên tệp.
- Mỗi tệp có nút × riêng.
- Có thể đính kèm nhiều tệp.
- Các mục tệp tự xuống hàng khi không đủ chiều rộng.

---

## 4. MENU CHÍNH BÊN TRÁI

┌────────────────────────────────┐
│                         ×      │
│ New Chat                       │
│ 📁 Dự án                       │
│ 🕘 Lịch sử trò chuyện           │
│ ⚙ Cài đặt                      │
│                                │
│       KHU VỰC TÀI KHOẢN        │
│ [Đăng nhập]  [Đăng ký]         │
└────────────────────────────────┘

Cách mở: nhấn ☰ → trượt từ trái sang, phủ 100% màn hình.

Nút đóng: × ở góc trên bên phải.

Thứ tự: New Chat → Dự án → Lịch sử trò chuyện → Cài đặt → Khu vực tài khoản.

Chưa đăng nhập: hiển thị Đăng nhập + Đăng ký.
Đã đăng nhập: chỉ hiển thị Đăng xuất.

---

## 5. NEW CHAT

Tạo cuộc trò chuyện mới, tách biệt hội thoại trước.
KHÔNG xóa hội thoại cũ. KHÔNG xóa dự án. KHÔNG xóa API Key.

---

## 6. DANH SÁCH DỰ ÁN

Thành phần:
- Nút ← Quay lại.
- Tiêu đề 📁 DỰ ÁN.
- "Dự án của tôi" + nút ＋ tạo dự án mới.
- Ô tìm kiếm dự án.
- Thẻ dự án có tên + mô tả + nút × (xóa phải xác nhận).

---

## 7. MÀN HÌNH BÊN TRONG DỰ ÁN

Thành phần:
- ← Dự án quay lại danh sách.
- ⋮ (chức năng gán khi đã xác định rõ).
- Tên dự án.
- Cuộc trò chuyện + nút ＋ Cuộc trò chuyện mới.
- Lịch sử trong dự án (danh sách các cuộc trò chuyện).
- Mỗi cuộc trò chuyện có × (xóa phải xác nhận).

QUY TẮC BẮT BUỘC:
Màn hình này KHÔNG có ô nhập chat ở dưới cùng.
Phải mở 1 cuộc trò chuyện để vào giao diện chat.

---

## 8. LỊCH SỬ TRÒ CHUYỆN

- Hiển thị tối đa 10 cuộc trò chuyện gần nhất.
- Cuộc cũ hơn KHÔNG bị xóa chỉ vì không nằm trong danh sách.
- Chọn → mở đúng nội dung hội thoại.

---

## 9. MÀN HÌNH CÀI ĐẶT

CHỈ CÓ 2 NÚT:
1. 🗝 Dán Key
2. 👤 Cài đặt tài khoản

Không tự thêm mục cài đặt khác.

---

## 10. TRANG DÁN KEY

CHỈ CÓ 3 NÚT:
1. 🧠 Đại Não
2. 🧠 Tiểu Não
3. 🌐 Web

---

## 11. TRANG ĐẠI NÃO

- Thanh đầu: ← Dán Key + logo 🌕🐉 bên phải.
- Ô nhập API Key + 👁 hiện/ẩn + ▶ Run ngay cạnh.
- 3 nhóm: GROQ / GEMINI / OPENROUTER.
- Mỗi nhóm cuộn riêng.
- 🔥 = còn quota, 😓 = hết quota.
- × xóa riêng key (có xác nhận).
- KHÔNG có nút Lưu Key / Xóa Key riêng.

---

## 12. TRANG TIỂU NÃO

Giống Đại Não, tiêu đề đổi thành 🧠 TIỂU NÃO.
Key của Tiểu Não ĐỘC LẬP với Đại Não.

---

## 13. TRANG WEB

3 nhà cung cấp: TAVILY / SERPJET / BRAVE SEARCH.
- Ô nhập + 👁 + ▶ Run.
- 🔥 / 😓 + × xóa riêng.
- Mỗi nhóm cuộn riêng.
- KHÔNG có nút Lưu Key / Xóa Key riêng.
- KHÔNG tự đổi tên SerpJet.

---

## 14. CÀI ĐẶT TÀI KHOẢN

CHỈ CÓ 3 CHỨC NĂNG:
1. 🪪 Đổi ID tài khoản
2. 🔒 Đổi mật khẩu
3. 🗑️ Xóa tài khoản

---

## 15. ĐỔI ID TÀI KHOẢN

- Hiển thị ID hiện tại.
- Ô nhập ID mới.
- Nút Xác nhận.
- Kiểm tra định dạng, kiểm tra ID chưa bị dùng.
- Chỉ cập nhật khi backend xác nhận.

---

## 16. ĐỔI MẬT KHẨU

3 trường: mật khẩu hiện tại / mật khẩu mới / xác nhận mật khẩu mới.
Mỗi trường có 👁.
Mật khẩu mới + xác nhận phải trùng.

---

## 17. XÓA TÀI KHOẢN

- Phải hiển thị xác nhận rõ ràng.
- Phải có cách hủy.
- Không xóa ngay khi vào trang.
- Backend phải xác minh quyền.

---

## 18. ĐĂNG KÝ

3 trường: ID / mật khẩu / xác nhận mật khẩu.
👁 trên từng trường mật khẩu.
Kiểm tra định dạng ID, ID chưa dùng.

---

## 19. ĐĂNG NHẬP

2 trường: ID / mật khẩu.
👁 hiện/ẩn mật khẩu.
Đăng nhập thành công → quay về chat chính.

---

## 20. RỒNG THẦN LOGS

Điểm vào: nhấn ⋮ ở chat chính.

Thành phần:
- ← Quay lại + logo 🌕🐉 bên phải.
- Trạng thái server (chỉ hiển thị khi backend cung cấp).
- Ô tìm kiếm log.
- Bộ lọc mức: Tất cả / INFO / WARN / ERROR / DEBUG.
- Danh sách log (cuộn).
- Tự động cuộn BẬT/TẮT.
- Xóa Logs (không icon thùng rác, phải xác nhận).
- ⬇ Tải Logs (.txt).

---

## 21. QUY TẮC XÁC NHẬN, XÓA VÀ BẢO MẬT

- Xóa dự án / hội thoại / key / logs / tài khoản → phải xác nhận.
- Nút × chỉ tác động đúng đối tượng.
- Không trộn dữ liệu giữa Đại Não / Tiểu Não / Web.
- Không lưu mật khẩu dạng văn bản thuần (theo yêu cầu dự án: đăng nhập trực tiếp).
- Không đưa mật khẩu / key vào logs.
- Không gửi key đến dịch vụ không liên quan.

---

## 22. YÊU CẦU RESPONSIVE

- Android + iPhone, dọc + ngang.
- Không cố định độ rộng.
- Nội dung dài tự xuống dòng.
- Danh sách dài có vùng cuộn.
- Menu chính phủ 100% màn hình.
- Thanh nhập tối đa 6 dòng.
- Các nhóm key cuộn độc lập.
- Logs cuộn riêng.

---

## 23. YÊU CẦU KẾT NỐI BACKEND

A. Chat: gửi nội dung, gửi tệp, nhận phản hồi, lưu lịch sử.
B. Dự án: tạo, lấy danh sách, tìm kiếm, mở, xóa, quản lý hội thoại.
C. Tài khoản: đăng ký, đăng nhập, đăng xuất, đổi ID, đổi mật khẩu, xóa.
D. API Key: kiểm tra, phân loại, lưu, xóa, kiểm tra quota.
E. Logs: kết nối backend, đọc log thật, lọc, tải .txt.

NGUYÊN TẮC:
- Không dùng dữ liệu mẫu giả làm dữ liệu thật.
- Không báo thành công khi backend chưa xác nhận.
- Khi lỗi → hiển thị thông báo phù hợp.

---

## 24. SƠ ĐỒ ĐIỀU HƯỚNG TOÀN ỨNG DỤNG

CHAT CHÍNH
├── ☰ MENU CHÍNH
│   ├── New Chat
│   ├── Dự án → Danh sách → Chi tiết
│   ├── Lịch sử (10 gần nhất)
│   ├── Cài đặt
│   │   ├── Dán Key
│   │   │   ├── Đại Não (Groq / Gemini / OpenRouter)
│   │   │   ├── Tiểu Não (Groq / Gemini / OpenRouter)
│   │   │   └── Web (Tavily / SerpJet / Brave)
│   │   └── Cài đặt tài khoản
│   │       ├── Đổi ID
│   │       ├── Đổi mật khẩu
│   │       └── Xóa tài khoản
│   ├── Khách: Đăng nhập
│   ├── Khách: Đăng ký
│   └── Đã đăng nhập: Đăng xuất
└── ⋮ LOGS
    └── Rồng Thần Logs