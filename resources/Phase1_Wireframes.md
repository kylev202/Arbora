# Arbora — Wireframes (Phase 1, low-fidelity)

> **Mục đích:** Bố cục low-fi (ASCII) cho các màn hình chính của vòng lặp MVP. Đủ để biết cái gì ở đâu trước khi code; chi tiết visual theo [`Phase1_Design_System.md`](./Phase1_Design_System.md).
> **Trạng thái:** v1 — Phase 1 Design. Low-fi; hi-fi mockup làm trong Phase 2 khi build UI.
> **Liên quan:** [`Phase1_User_Flows.md`](./Phase1_User_Flows.md) (luồng) · [`Phase1_Design_System.md`](./Phase1_Design_System.md) (tokens) · [`Phase1_Tree_Metaphor.md`](./Phase1_Tree_Metaphor.md)

---

## Quy ước

```
[ Button ]   nút        ( ) radio   [ ] checkbox   ▾ dropdown
│ ─ ┌ ┐ └ ┘  khung       ◄ ►         điều hướng     🌳 icon
```

---

## S-01 — Home / Subject List

```
┌──────────────────────────────────────────────────────────────┐
│  Arbora 🌳                                          [⚙ Settings]│
├──────────────────────────────────────────────────────────────┤
│                                                                │
│   Môn học của bạn                          [ + Môn mới ]       │
│                                                                │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│   │ 🟢 Sinh học 12 │  │ 🔵 Hóa hữu cơ  │  │ 🟡 Lịch sử     │  │
│   │                │  │                │  │                │  │
│   │   🌳 (lớn)     │  │   🌿 (nhỡ)     │  │   🌱 (con)     │  │
│   │                │  │                │  │                │  │
│   │ 8 thẻ hôm nay  │  │ 3 thẻ hôm nay  │  │ 0 thẻ hôm nay  │  │
│   │ 📅 Thi: 27 ngày│  │ 📅 —           │  │ 📅 BT: 5 ngày  │  │
│   └────────────────┘  └────────────────┘  └────────────────┘  │
│                                                                │
└──────────────────────────────────────────────────────────────┘

Empty: "Chưa có môn nào — bắt đầu bằng cách thêm môn đầu tiên." [ + Môn mới ]
```

---

## S-02 — Subject Workspace (tab Sources)

```
┌──────────────────────────────────────────────────────────────┐
│  Home > Sinh học 12                                  [⚙]       │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                  │
│  📄 Sources│   Tài liệu nguồn               [ + Thêm tài liệu]│
│  📝 Content│                                                  │
│     ⓷ cần  │   ┌──────────────────────────────────────────┐  │
│  📚 Study  │   │ 📄 Chương 1 - Tế bào.pdf      ✓ đã xử lý │  │
│     ⑧ hôm  │   │    42 trang · 128 đoạn                    │  │
│  📅 Plan   │   ├──────────────────────────────────────────┤  │
│  🌳 Dash   │   │ 📊 Bài giảng tuần 2.pptx      ✓ đã xử lý │  │
│            │   │    30 slide · 95 đoạn                     │  │
│            │   ├──────────────────────────────────────────┤  │
│            │   │ 🎧 Ghi âm buổi 3.mp3          ⏳ 60%...   │  │
│            │   │    đang tạo bản ghi...                    │  │
│            │   └──────────────────────────────────────────┘  │
│            │                                                  │
│            │            [ Sinh nội dung từ nguồn ]           │
└────────────┴─────────────────────────────────────────────────┘
```

---

## S-03 — Add Source (modal, đang ingest)

```
        ┌────────────────────────────────────────┐
        │  Thêm tài liệu                      [✕] │
        ├────────────────────────────────────────┤
        │                                        │
        │   📄 Chương 1 - Tế bào.pdf             │
        │       2.4 MB · PDF                      │
        │                                        │
        │   Đang xử lý...                        │
        │   ███████████████░░░░░░░  65%          │
        │   Đang lập chỉ mục đoạn văn bản...     │
        │                                        │
        │   ⏱ Còn khoảng 20 giây                 │
        │                                        │
        │              [ Chạy nền ]              │
        └────────────────────────────────────────┘
```

---

## S-04 — Generate Content (modal, step 2: chọn loại)

```
        ┌────────────────────────────────────────┐
        │  Sinh nội dung                      [✕] │
        ├────────────────────────────────────────┤
        │  Nguồn: Chương 1, Bài giảng tuần 2 (2) │
        │                                        │
        │  Sinh loại nào?                        │
        │   [✓] 📝 Notes có cấu trúc             │
        │   [✓] 🃏 Flashcard                     │
        │   [✓] ❓ Quiz trắc nghiệm              │
        │                                        │
        │   💡 Lần đầu với nguồn này? Nên sinh   │
        │      cả 3.                             │
        │                                        │
        │  ⚠ AI có thể mắc lỗi. Bạn sẽ xem &    │
        │     sửa trước khi lưu.                 │
        │                                        │
        │        [ Huỷ ]      [ Sinh nội dung ] │
        └────────────────────────────────────────┘
```

---

## S-05 — Review Queue (BẮT BUỘC)

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠ AI có thể mắc lỗi — hãy kiểm tra với tài liệu gốc.        │
├──────────────────────────────────────────────────────────────┤
│  Review (3/24)   [Tất cả ▾]            [ Approve tất cả ]     │
│                                                                │
│  ┌──── 🃏 FLASHCARD ──────────────────────────────────────┐  │
│  │                                                         │  │
│  │  MẶT TRƯỚC                                              │  │
│  │  Chức năng của màng nhĩ trong tai là gì?               │  │
│  │                                                         │  │
│  │  MẶT SAU                                                │  │
│  │  Rung động để truyền sóng âm vào tai giữa.             │  │
│  │                                                         │  │
│  │  GIẢI THÍCH                                             │  │
│  │  Màng nhĩ là màng mỏng ngăn cách tai ngoài và giữa... │  │
│  │                                                         │  │
│  │  ┌────────────────────────────────────────────────┐   │  │
│  │  │ 📄 Slide 5 · "màng nhĩ rung động..." ↗          │   │  │
│  │  └────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│      ◄    [ ✎ Sửa ]   [ ✕ Bỏ ]   [ ✓ Giữ ]    ►            │
└──────────────────────────────────────────────────────────────┘

Phím: ← → điều hướng · A giữ · D bỏ · E sửa
```

---

## S-06 — Study Session

```
Mặt trước:                          Mặt sau:
┌──────────────────────────┐        ┌──────────────────────────┐
│  Sinh học 12 · 5/8       │        │  Sinh học 12 · 5/8       │
│                          │        │                          │
│                          │        │  Chức năng màng nhĩ?     │
│  Chức năng của màng nhĩ  │        │  ──────────────────────  │
│  trong tai là gì?        │        │  Rung động truyền sóng    │
│                          │        │  âm vào tai giữa.        │
│                          │        │                          │
│                          │        │  💡 Màng nhĩ là màng...  │
│                          │        │  📄 Slide 5 ↗            │
│                          │        │                          │
│   [ Hiện đáp án ]        │        │ [Again][Hard][Good][Easy]│
│                          │        │ Quên   Khó  Nhớ    Dễ    │
└──────────────────────────┘        └──────────────────────────┘
   (Space = lật)                       (1/2/3/4 = chấm điểm)
```

---

## S-07 — Plan (Deadlines + Sổ điểm)

```
┌──────────────────────────────────────────────────────────────┐
│  Home > Sinh học 12 > Plan                                     │
├──────────────────────────────────────────────────────────────┤
│  Deadlines                              [ + Thêm deadline ]    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📅 Thi giữa kỳ          21/07/2026      (27 ngày)       │  │
│  │ 📝 Nộp báo cáo          15/07/2026      (21 ngày)       │  │
│  │ 📅 Thi cuối kỳ          12/08/2026      (49 ngày)       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  Sổ điểm                                  [ + Thêm điểm ]     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Danh mục    Tên          Điểm   /Tối đa  Trọng số       │  │
│  │ Giữa kỳ     Thi GK       75     /100     30%            │  │
│  │ Bài tập     BT1          9      /10      10%            │  │
│  │ Cuối kỳ     Thi CK       —      /100     60%            │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Trung bình hiện tại: 82.5    ≈ GPA 3.5                  │  │
│  │ What-if:  CK=70 → GPA 3.2 ·  CK=85 → 3.7 ·  CK=95 → 4.0│  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## S-08 — Dashboard (cây)

```
┌──────────────────────────────────────────────────────────────┐
│  Home > Sinh học 12 > Dashboard                                │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│              🌳                    │  Tiến độ                  │
│             /│\                    │  ─────────                │
│            /🍃🍃\                   │  ✓ 47 thẻ đã thuộc       │
│           /🍃 │🍃\                  │  ○ 23 thẻ đang học        │
│          🍃  │  🍃                 │  📅 8 thẻ cần ôn hôm nay  │
│              │                     │  🌱 Streak: 5 ngày        │
│         ─────┴─────                │                           │
│                                    │  Deadline sắp tới:        │
│      47 / 70 khái niệm (67%)       │  └ Thi GK — 21/07 (27ng) │
│                                    │                           │
└──────────────────────────────────────────────────────────────┘

Cây không thu nhỏ khi nghỉ · không màu đỏ · animation nảy lá khi thẻ mastered
```

---

## S-09 — Settings

```
┌──────────────────────────────────────────────────────────────┐
│  Cài đặt                                              [✕]      │
├──────────────────────────────────────────────────────────────┤
│  AI — Preset theo máy                                          │
│   ( ) 🌱 Nhẹ        RAM ≤8GB   · model ~3B + Whisper tiny     │
│   (•) 🌿 Trung bình  RAM ~16GB  · model ~7B + Whisper base    │
│   ( ) 🌳 Mạnh       RAM ≥32GB  · model 14B+ + Whisper small  │
│   💡 Máy bạn ~16GB → gợi ý 🌿                                  │
│                                                                │
│  Hiển thị                                                      │
│   Cỡ chữ:  [ 14 ] (•16) [ 18 ] [ 20 ]                         │
│   Giao diện: (•) Sáng  ( ) Tối                                 │
│                                                                │
│  ─────────────────────────────────────────────────────────    │
│  [ ] Dùng API key của riêng tôi                               │
│      ⚠ Khi bật, nội dung tài liệu sẽ gửi đến nhà cung cấp.    │
│      Provider: [ OpenAI ▾ ]   Model: [ gpt-4o-mini      ]     │
│      API Key:  [ •••••••••••• ]        [ Kiểm tra ]          │
└──────────────────────────────────────────────────────────────┘
```

---

## S-10 — Onboarding (step 2: chọn preset)

```
        ┌────────────────────────────────────────┐
        │  Arbora 🌳                       2/3    │
        ├────────────────────────────────────────┤
        │                                        │
        │   Chọn cấu hình AI                     │
        │                                        │
        │   Máy của bạn có ~16 GB RAM            │
        │   → gợi ý preset 🌿 Trung bình         │
        │                                        │
        │       [ Dùng gợi ý này ]              │
        │       [ Chọn khác ]                   │
        │                                        │
        │   Model AI tải lần đầu (~2 GB).        │
        │   [ Tải ngay (chạy ngầm) ] [ Tải sau ]│
        │                                        │
        │                          [ Tiếp → ]   │
        └────────────────────────────────────────┘
```

---

## Responsive (ghi chú)

- App desktop (Tauri) — tối ưu cho cửa sổ ≥ 1024px.
- Sidebar workspace co lại thành icon-only khi cửa sổ < 900px.
- `--content-max-width: 760px` giữ vùng đọc không tràn trên màn rộng.
- Modal căn giữa, `--modal-width: 520px`, co theo viewport nhỏ.

---

*Wireframes v1.0 — Phase 1 Design, low-fidelity. Hi-fi mockup + component thật làm ở Phase 2 (build UI) theo Design System tokens.*
