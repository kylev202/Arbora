# Arbora — User Flows (Phase 1 MVP)

> **Mục đích:** Mô tả từng màn hình và luồng di chuyển cho vòng lặp MVP A→Z. Đây là đầu vào để thiết kế wireframes và IPC contract.
> **Trạng thái:** v1 — Phase 1 Design. Text-based flows; wireframes low-fi sẽ bổ sung sau.
> **Liên quan:** [`Phase0_Discovery.md`](./Phase0_Discovery.md) §2 · [`Phase1_IPC_Contract.md`](./Phase1_IPC_Contract.md) · [`Requirements.md`](./Requirements.md)

---

## 1. Màn hình tổng thể (Screen Inventory)

| ID | Màn hình | Mô tả |
|---|---|---|
| S-01 | Home / Subject List | Danh sách môn học, điểm vào app |
| S-02 | Subject Workspace | Hub chính per môn, có tabs |
| S-03 | Add Source | Modal thêm tài liệu + tiến trình ingest |
| S-04 | Generate Content | Modal chọn loại nội dung + tiến trình |
| S-05 | Review Queue | Duyệt notes/thẻ/quiz trước khi lưu |
| S-06 | Study Session | Phiên ôn tập active recall (FSRS) |
| S-07 | Plan | Deadline + sổ điểm + what-if GPA |
| S-08 | Dashboard | Cây tiến độ + stats per môn |
| S-09 | Settings | Preset AI, BYO key, Whisper model |
| S-10 | Onboarding | Lần đầu: chọn preset, (tùy chọn) BYO key |

---

## 2. Vòng lặp MVP A→Z

```
[S-10 Onboarding]  ─── lần đầu ───►  [S-01 Home]
                                            │
                                    Tạo môn mới
                                            │
                                            ▼
                                    [S-02 Workspace]  ◄─── quay lại mọi lúc
                                     ├── tab: Sources
                                     ├── tab: Content (Notes/Cards/Quiz)
                                     ├── tab: Study
                                     ├── tab: Plan
                                     └── tab: Dashboard
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              │ A. Thêm nguồn               │ B. Sinh nội dung             │
              ▼                             ▼                              │
       [S-03 Add Source]           [S-04 Generate]                        │
       → chọn file (PDF/slide/     → chọn loại                            │
         audio)                      (notes/cards/quiz)                   │
       → tiến trình ingest         → tiến trình gen                       │
       → done → về Sources tab     → done → badge "cần review"            │
                                             │                             │
                              C. Review (BẮT BUỘC)                        │
                                             ▼                             │
                                    [S-05 Review Queue]                   │
                                    → xem từng item + trích dẫn           │
                                    → sửa / giữ / bỏ                      │
                                    → approve → lưu vào deck              │
                                             │                             │
                              D. Ôn tập FSRS                              │
                                             ▼                             │
                                    [S-06 Study Session]                  │
                                    → hiện mặt trước thẻ                  │
                                    → user tự nhớ                         │
                                    → lật mặt sau                         │
                                    → chấm Again/Hard/Good/Easy           │
                                    → FSRS update lịch                    │
                                             │                             │
                              E. Lập kế hoạch & theo dõi                  │
                                             ▼                             │
                                    [S-07 Plan]                           │
                                    → thêm deadline                       │
                                    → nhập điểm                           │
                                    → xem GPA + what-if                   │
                                             │                             │
                              F. Xem tiến độ                              │
                                             ▼                             │
                                    [S-08 Dashboard]                      │
                                    → cây lớn theo mastery                │
                                    → stats: đã thuộc/cần ôn/streak       │
                                    → deadline sắp tới                    │
```

---

## 3. Chi tiết từng màn hình

---

### S-01 — Home / Subject List

**Mục đích:** Điểm vào, tổng quan tất cả môn.

**Entry:** Mở app (sau onboarding).

**Nội dung:**
- Danh sách subject cards (mỗi card: màu, tên môn, số thẻ due hôm nay, deadline gần nhất).
- Nút **"+ Môn mới"**.
- Mini tree icon per môn (kích thước theo mastery_pct).

**Actions:**
- Click vào môn → vào S-02 (tab: Sources hoặc tab gần nhất đã dùng).
- Click "+ Môn mới" → modal tạo môn (tên + chọn màu) → tạo xong → vào S-02.
- Giữ chuột / right-click môn → Đổi tên | Xóa môn.

**Empty state:** "Chưa có môn nào — bắt đầu bằng cách thêm môn đầu tiên." + nút "+ Môn mới".

**Error states:** Không có — Home chỉ đọc DB local, hiếm lỗi; nếu DB lỗi → thông báo "Không mở được dữ liệu, thử khởi động lại".

---

### S-02 — Subject Workspace

**Mục đích:** Hub điều hướng mọi thao tác trong một môn.

**Entry:** Từ S-01, từ breadcrumb bất kỳ.

**Layout:** Sidebar trái (tab icons) + vùng nội dung phải. Tabs:

| Tab | Nội dung |
|---|---|
| **Sources** | Danh sách tài liệu đã thêm + badge trạng thái ingest |
| **Content** | 3 sub-tabs: Notes / Cards / Quiz — hiện items đã review |
| **Study** | Nút bắt đầu phiên ôn, stats due today, streak |
| **Plan** | Deadlines + sổ điểm |
| **Dashboard** | Cây + tổng quan tiến độ |

**Persistent elements:**
- Breadcrumb: Home > [Tên môn].
- Badge "N cần review" trên tab Content khi có items chưa duyệt.
- Badge "N thẻ hôm nay" trên tab Study.

---

### S-03 — Add Source (modal)

**Mục đích:** Thêm tài liệu + chờ ingest.

**Entry:** Nút "+ Thêm tài liệu" trong tab Sources (S-02).

**Steps:**

```
Step 1 — Chọn file:
  → File picker: .pdf / .pptx / .mp3 / .wav / .m4a / .ogg
  → Hiển thị tên file + type icon + kích thước.
  → Nút "Thêm" (chính) + "Huỷ".

Step 2 — Ingest (modal giữ mở):
  → Progress bar animated.
  → Label bước hiện tại: "Đang đọc file..." → "Đang phân tích văn bản..." →
    "Đang tạo bản ghi âm..." (chỉ với audio) → "Đang lập chỉ mục..." → "Xong!"
  → Thời gian ước tính (tùy loại file và preset).
  → Nút "Chạy nền" → đóng modal, tiến trình chạy ngầm, badge trên Sources tab.

Step 3 — Done:
  → "✓ Đã xong — [N] đoạn văn bản được lập chỉ mục."
  → Nút "Sinh nội dung ngay" → mở S-04 với source này đã chọn sẵn.
  → Nút "Đóng".
```

**Error:**
- File lỗi / không đọc được → "Không đọc được file này. Kiểm tra định dạng và thử lại."
- Model Whisper chưa tải (audio) → "Cần tải mô hình phiên dịch lần đầu (~150 MB). Tải ngay?"

---

### S-04 — Generate Content (modal)

**Mục đích:** Chọn nguồn + loại nội dung cần sinh → khởi động job.

**Entry:** Nút "Sinh nội dung" trong tab Content, hoặc từ S-03 step 3.

**Steps:**

```
Step 1 — Chọn nguồn:
  → Danh sách sources của môn (chỉ sources đã ingest xong).
  → Mặc định: chọn tất cả. Cho phép bỏ chọn.
  → Nếu 0 source chọn: disabled nút "Tiếp".

Step 2 — Chọn loại:
  → 3 toggle: [ ] Notes có cấu trúc  [ ] Flashcard  [ ] Quiz
  → Ít nhất 1 phải chọn.
  → Gợi ý: "Lần đầu với nguồn này? Nên sinh cả 3."

Step 3 — Sinh (modal giữ mở):
  → Progress bar.
  → "Đang đọc nguồn..." → "Đang hỏi AI..." → "Đang kiểm tra kết quả..." → "Xong!"
  → Disclaimer nhỏ: "AI có thể mắc lỗi. Bạn sẽ được xem và chỉnh sửa trước khi lưu."
  → Nút "Chạy nền" (giống S-03).

Step 4 — Done:
  → "✓ Sinh xong — [N] notes, [M] thẻ, [K] câu quiz. Hãy xem và duyệt trước khi lưu."
  → Nút "Xem ngay" → mở S-05.
  → Nút "Để sau" → đóng modal, badge "N cần review" trên tab Content.
```

**Error:**
- LLM không khởi động → "Không kết nối được AI. Kiểm tra Ollama đang chạy chưa." + link docs.
- Schema sai sau retry → "AI trả về kết quả không đọc được sau 3 lần thử. Thử lại?"

---

### S-05 — Review Queue

**Mục đích:** Xem, sửa, duyệt hoặc bỏ từng item AI sinh ra trước khi lưu vào deck. **Bắt buộc — không thể bỏ qua.**

**Entry:** Từ S-04 step 4 "Xem ngay", hoặc từ badge "N cần review" (tab Content).

**Layout:**

```
┌─ Review Queue (24 items) ──────────────────────────────┐
│  [< Thẻ 3/24 >]        [Approve all remaining]         │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  TYPE: FLASHCARD                                    │ │
│  │                                                     │ │
│  │  MẶT TRƯỚC:                                        │ │
│  │  Chức năng của màng nhĩ trong tai là gì?           │ │
│  │                                                     │ │
│  │  MẶT SAU:                                          │ │
│  │  Màng nhĩ rung động để truyền sóng âm vào tai giữa│ │
│  │                                                     │ │
│  │  GIẢI THÍCH:                                       │ │
│  │  Màng nhĩ (tympanic membrane) là màng mỏng...      │ │
│  │                                                     │ │
│  │  NGUỒN: Slide 5 — Giải Phẫu Tai [trang 5]         │ │
│  │  > "Màng nhĩ có chức năng..."  [Xem trong nguồn ↗] │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  [ Chỉnh sửa ]    [ Bỏ qua (xóa) ]    [ Giữ (approve) ]│
└────────────────────────────────────────────────────────┘
```

**Actions:**
- **Giữ (approve):** lưu item vào deck (FSRS sẽ lên lịch).
- **Bỏ qua (reject):** xóa item — không thể hoàn tác dễ dàng (confirm nếu xóa nhiều).
- **Chỉnh sửa:** mở inline editor cho từng trường; sau khi lưu edit → auto-approve.
- **< >:** điều hướng giữa các items (cũng có thể dùng phím ←→).
- **Xem trong nguồn ↗:** highlight đoạn trích trong file gốc (nếu PDF; với audio: nhảy đến timestamp).
- **Approve all remaining:** approve hàng loạt items còn lại mà không xem — đi kèm cảnh báo "Bạn sẽ chấp nhận tất cả mà không xem. Tiếp tục?" + disclaimer.
- **Tab switching:** có thể lọc theo loại (All / Notes / Cards / Quiz).

**Done state:** "Xong! X items đã lưu, Y items đã bỏ qua." → về tab Content.

**Disclaimer** (cố định ở đầu màn hình): "AI có thể mắc lỗi — hãy kiểm tra với tài liệu gốc trước khi tin."

---

### S-06 — Study Session

**Mục đích:** Phiên ôn tập active recall theo lịch FSRS.

**Entry:** Nút "Bắt đầu ôn" trong tab Study (S-02), hoặc nút "Bắt đầu phiên 10 phút" (quick-start).

**Flow:**

```
[Start screen]
  → Hiện: "X thẻ cần ôn hôm nay" / "Không có thẻ — bạn đã học xong hôm nay!"
  → Nút "Bắt đầu" / "Bắt đầu 10 phút" (giới hạn ~8 thẻ)

[Card front]
  → Hiện mặt trước (câu hỏi / khái niệm).
  → Nút "Hiện đáp án".
  → Không có đếm ngược, không có áp lực.

[Card back]
  → Hiện mặt sau + giải thích + trích dẫn nguồn.
  → 4 nút rating:
    [Again]  [Hard]  [Good]  [Easy]
    Gợi ý ngắn dưới mỗi nút: "Quên hoàn toàn" / "Khó" / "Nhớ được" / "Dễ"
  → Nút "Xem nguồn" (nhỏ, tùy chọn).

[Session end]
  → "Hoàn tất! Đã ôn X thẻ."
  → Mini chart: phân bố Again/Hard/Good/Easy.
  → "Thẻ tiếp theo: [ngày]."
  → Nút "Về Dashboard".
```

**Nguyên tắc UX:**
- Không streak counter hiển thị nổi bật (tránh streak anxiety cho Bình/B2).
- Không âm thanh / animation trừng phạt.
- Phiên ngắn: "Bắt đầu 10 phút" commit ~8 thẻ, sau đó tự hỏi "Tiếp tục?" (không ép).

---

### S-07 — Plan

**Mục đích:** Quản lý deadline + điểm số.

**Entry:** Tab Plan trong S-02 Workspace.

**Hai khu vực song song:**

**A — Deadlines:**
```
┌── Deadlines ──────────────────────────────┐
│  [+ Thêm deadline]                         │
│                                            │
│  📅 Thi giữa kỳ Sinh học    21/07 (27 ngày)│
│  📝 Nộp báo cáo             15/07 (21 ngày)│
│  📅 Thi cuối kỳ Sinh học    12/08 (49 ngày)│
│                                            │
└────────────────────────────────────────────┘
```
- CRUD deadline (tên, ngày, loại: thi/bài tập/khác).
- Nhắc nhở: badge trên S-01 home card khi deadline < 7 ngày.

**B — Sổ điểm:**
```
┌── Sổ điểm ────────────────────────────────────────────┐
│  [+ Thêm điểm]                                         │
│                                                        │
│  Danh mục       Tên            Điểm   / Tối đa  Trọng │
│  Giữa kỳ       Thi giữa kỳ    75     / 100      30%   │
│  Bài tập        BT1            9      / 10       10%   │
│  Cuối kỳ        Thi cuối kỳ   ---    / 100      60%   │
│                                                        │
│  Trung bình hiện tại: 82.5 / 100  ≈  GPA: 3.5         │
│                                                        │
│  What-if: Nếu thi cuối kỳ đạt 70 → GPA: 3.2           │
│           Nếu thi cuối kỳ đạt 85 → GPA: 3.7           │
│           Nếu thi cuối kỳ đạt 95 → GPA: 4.0           │
└────────────────────────────────────────────────────────┘
```
- What-if tự động tính cho ô điểm còn trống (cuối kỳ chưa có).

---

### S-08 — Dashboard

**Mục đích:** Thấy tiến độ học tổng thể của môn qua ẩn dụ "cây phát triển".

**Entry:** Tab Dashboard trong S-02 Workspace.

**Layout:**

```
┌── Dashboard: Sinh học 12 ─────────────────────────────┐
│                                                        │
│     🌳                              Stats              │
│    /│\     (cây lớn hay nhỏ        ──────────          │
│   / │ \    theo mastery_pct)       ✓ 47 thẻ đã thuộc  │
│  /  │  \                           ○ 23 thẻ đang học   │
│ /   │   \                          📅 8 thẻ hôm nay    │
│     │                              🔥 Streak: 5 ngày   │
│─────┴──────                                            │
│                                                        │
│  47 / 70 khái niệm đã ghi nhớ  (67%)                  │
│                                                        │
│  Deadline sắp tới:                                     │
│  └ Thi giữa kỳ — 21/07 (27 ngày nữa)                  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Nguyên tắc cây:**
- Kích thước / độ um tùm của cây ∝ `mastery_pct` (số thẻ đạt stability ngưỡng / tổng thẻ).
- Cây **không thu nhỏ** khi user nghỉ — chỉ lớn dần, không phạt.
- Màu sắc: xanh lá (đã thuộc) / vàng (đang học) / xám (chưa bắt đầu). Không màu đỏ cảnh báo.
- Chi tiết kỹ thuật render cây: xác định ở Phase 1 Design thêm (wireframe riêng).

---

### S-09 — Settings

**Mục đích:** Cấu hình AI preset và (tùy chọn) BYO key.

**Entry:** Icon Settings ở footer/sidebar toàn cục.

**Sections:**

**AI Preset:**
```
🌱 Nhẹ (RAM ≤ 8 GB)       model ~1.5B–3B + Whisper tiny
🌿 Trung bình (RAM ~16 GB) model ~7B–8B + Whisper base      ← gợi ý mặc định
🌳 Mạnh (RAM ≥ 32 GB)      model 14B+ + Whisper small
```
- Nhận diện RAM tự động (Rust), pre-select preset phù hợp.
- Có thể đổi thủ công.

**BYO API Key (opt-in, mặc định tắt):**
```
[ ] Dùng API key của riêng tôi (dữ liệu sẽ rời máy khi bật)

Nếu bật:
  Provider: [OpenAI ▾]  [Gemini]  [Anthropic]  [OpenRouter]  [Tùy chỉnh]
  Model:    [gpt-4o-mini          ]
  API Key:  [••••••••••••         ] [Kiểm tra kết nối]
  (Endpoint: chỉ hiện khi chọn "Tùy chỉnh")
```
- Label rõ: "⚠️ Khi bật, nội dung tài liệu bạn thả vào sẽ được gửi đến [Provider]. Arbora không kiểm soát chính sách dữ liệu của bên thứ ba."

---

### S-10 — Onboarding (lần đầu mở app)

**Mục đích:** Giúp user cài đặt xong trong <2 phút và tạo môn đầu tiên.

**Steps:**

```
Step 1/3 — Chào mừng:
  "Chào mừng đến Arbora 🌳 — Biến tài liệu thành kiến thức được ghi nhớ."
  [Bắt đầu]

Step 2/3 — Chọn preset:
  Arbora tự detect RAM và gợi ý:
  "Máy của bạn có ~16 GB RAM — chúng tôi gợi ý preset 🌿 Trung bình."
  [Dùng gợi ý này]  [Chọn khác]
  
  Nếu chọn khác → radio 3 preset + giải thích.
  
  "Model AI sẽ tải về lần đầu (~1–4 GB tùy preset). Tải ngay?"
  [Tải ngay (chạy ngầm)]  [Tải sau]

Step 3/3 — Tạo môn đầu tiên (hoặc bỏ qua):
  "Bắt đầu bằng cách tạo môn học đầu tiên."
  Input: Tên môn + chọn màu.
  [Tạo môn]  [Bỏ qua, tôi tự làm sau]
  → Vào S-01 (hoặc S-02 nếu đã tạo môn).
```

---

## 4. Navigation Map

```
S-10 Onboarding ──(1 lần)──► S-01 Home
                                  │
                          ┌───────┴────────────────┐
                          │                        │
                    Click môn              "+ Môn mới" modal
                          │                        │
                          ▼                        ▼
                    S-02 Workspace ◄───────────────┘
                    ├── Sources tab ──► S-03 Add Source (modal)
                    ├── Content tab ──► S-04 Generate (modal) ──► S-05 Review
                    ├── Study tab   ──► S-06 Study Session
                    ├── Plan tab    ──► S-07 Plan (inline)
                    └── Dashboard   ──► S-08 Dashboard (inline)

S-09 Settings ── accessible từ mọi màn hình (footer icon)
```

---

## 5. Loading & Empty States

| Màn hình | Empty state | Loading state |
|---|---|---|
| S-01 Home | "Chưa có môn — thêm môn đầu tiên" + nút | Skeleton cards |
| S-02 Sources tab | "Chưa có tài liệu — thêm PDF, slide, hoặc file audio" + nút | Skeleton list |
| S-02 Content tab | "Chưa có nội dung — sinh nội dung từ tài liệu" + nút (nếu có source) | Skeleton cards |
| S-02 Study tab | "Không có thẻ nào hôm nay — quay lại sau!" | Spinner nhỏ |
| S-05 Review | — (luôn có items nếu vào được) | Skeleton item |
| S-08 Dashboard | Cây nhỏ nhất (mầm cây) + "Bắt đầu ôn để cây lớn dần" | Skeleton stats |

---

## 6. Keyboard Shortcuts (MVP)

| Phím | Action |
|---|---|
| `←` / `→` | S-05: điều hướng item trước/sau |
| `Space` | S-06: lật thẻ |
| `1` `2` `3` `4` | S-06: rating Again/Hard/Good/Easy |
| `A` | S-05: Approve item hiện tại |
| `D` | S-05: Reject (delete) item hiện tại |
| `E` | S-05: mở edit mode |
| `Esc` | Đóng modal (S-03, S-04) |

---

*User Flows v1.0 — Phase 1 Design. Text-based; wireframes low-fi sẽ bổ sung trong Phase 1 (wireframing step).*
