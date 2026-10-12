# 🌕🐉 Rồng Thần

Trợ lý AI đa tầng: **Đại Não → BOSS → Tiểu Não → Lính**, có Sandbox kiểm chứng code và Web search.

## 📐 Kiến trúc

User
 │
 ▼
Rồng Thần (gateway)
 │
 ▼
BOSS  ◄── Đại Não dò/gọi model từ key Đại Não
 │
 ├── viết format điều phối lính
 ├── tự tra Web (nếu cần)
 └── kiểm tra Sandbox (nếu là code)
 │
 ▼
Tiểu Não dò/gọi model từ key Tiểu Não
 │
 ▼
Lính làm việc → trả kết quả cho BOSS

**Nguyên tắc bất biến:**
- Đại Não và Tiểu Não **độc lập key hoàn toàn** — không dò/gọi chéo.
- Xoay key theo **vòng lặp đầy đủ**, không bỏ qua.
- BOSS hết quota → Đại Não gọi BOSS mới → đọc lại yêu cầu + xác định tình trạng.
- Code phải chạy Sandbox tới khi **đúng mới thôi**.
- **Không giả lập** — code thật 100%, không báo thành công khi backend chưa xác nhận.

## 🧰 Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 18 + React Router 6 |
| Build | Vite 5 |
| Backend | Node.js + Express |
| Database | MongoDB |
| Sandbox | LiveCodes |
| Model providers | Groq, Gemini, OpenRouter |
| Web providers | Tavily, SerpJet, Brave Search |
| Deploy | GitHub → Render |

## 📁 Cấu trúc thư mục

rong-than/
├── index.html
├── package.json
├── vite.config.js
├── .env                     # Cấu hình thật — KHÔNG commit
├── .env.example             # Mẫu để copy — được commit
├── .gitignore
├── README.md
├── docs/                    # Đặc tả dự án
├── src/                     # Frontend React
│   ├── main.js
│   ├── App.js
│   ├── pages/               # 17 trang
│   ├── components/          # 21 component
│   ├── api/                 # 8 module API
│   ├── store/               # 4 store (Context)
│   ├── styles/              # 3 file CSS
│   └── utils/               # 3 tiện ích
├── server/                  # Backend Express (sẽ bổ sung)
├── shared/                  # Hằng số dùng chung
└── scripts/                 # Script tiện ích

## 🚀 Chạy dự án (Frontend)

### 1. Cài đặt

    npm install

### 2. Cấu hình môi trường

Dự án có 2 file môi trường:

- **`.env.example`** — file mẫu, **có** trong repo, dùng để tham khảo.
- **`.env`** — file cấu hình thật, **KHÔNG** có trong repo (đã bị `.gitignore` chặn).

**Lần đầu clone repo về, bạn PHẢI tạo file `.env`:**

    cp .env.example .env

Sau đó mở `.env` và điền giá trị.

**Các biến môi trường cần điền:**

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `VITE_API_BASE_URL` | Không (khi dev) | Base URL của backend API |

**Chi tiết về `VITE_API_BASE_URL`:**

- **Khi dev** (chạy backend local ở port 3000): để **trống**.
  Vite proxy (đã cấu hình trong `vite.config.js`) sẽ tự chuyển
  mọi request `/api/*` sang `http://localhost:3000`.
- **Khi deploy lên Render**: đặt URL đầy đủ của backend, ví dụ:

      VITE_API_BASE_URL=https://rong-than-api.onrender.com/api

### 3. Chạy dev

    npm run dev

Mở trình duyệt: **http://localhost:5173**

### 4. Build production

    npm run build
    npm run preview

## 📱 Test trên điện thoại

Khi chạy `npm run dev`, Vite in ra địa chỉ dạng:

    ➜  Local:   http://localhost:5173/
    ➜  Network: http://192.168.x.x:5173/

Mở địa chỉ **Network** trên điện thoại (cùng mạng WiFi) để test.

Lưu ý: `vite.config.js` đã đặt `host: true` để cho phép truy cập
từ thiết bị khác trong mạng LAN.

## 🔐 Bảo mật

- **KHÔNG** commit file `.env` — đã có trong `.gitignore`.
- **KHÔNG** hiển thị đầy đủ API key — dùng `maskKey()` trong `src/utils/mask.js`.
- **KHÔNG** log mật khẩu hoặc key đầy đủ.
- **KHÔNG** báo thành công khi backend chưa xác nhận.
- **KHÔNG** đặt API key thật của nhà cung cấp (Groq, Gemini...) vào file `.env` frontend.
  Chúng nằm ở `server/.env` (backend).

## 📜 Ghi chú

- Frontend được viết **100% thật**, không có dữ liệu giả.
- Các API call cần **backend** ở `server/` (sẽ bổ sung).
- Nếu chưa có backend, giao diện vẫn hiển thị được nhưng các thao tác
  liên quan tới dữ liệu sẽ báo lỗi kết nối — điều này là **đúng thiết kế**.
- File `.env.example` được commit để người clone biết cần điền gì;
  file `.env` (chứa giá trị thật) thì không.

## 📖 Tài liệu dự án

Xem thư mục `docs/`:
- `01-mo-ta.md` — Mô tả tổng quan
- `02-luong-hoat-dong.md` — Các luồng hoạt động
- `03-cong-nghe.md` — Công nghệ sử dụng
- `04-giao-dien.md` — Đặc tả giao diện
- `05-luu-y.md` — Lưu ý khi làm việc
- `06-model.md` — Model Đại Não & Tiểu Não

---

**Bắt đầu:** `npm install` → `cp .env.example .env` → `npm run dev`
→ mở `http://localhost:5173`