# Arbora — Ẩn dụ "Cây phát triển" (Phase 1)

> **Mục đích:** Đặc tả cách cây lớn lên theo dữ liệu học thật — *thưởng đúng hành vi, không trừng phạt khi nghỉ*. Đây là điểm nhấn cảm xúc & bản sắc thương hiệu (Arbora 🌳).
> **Trạng thái:** v1 — Phase 1 Design. MVP làm "cây cơ bản"; cá nhân hóa sâu để Pha 3.
> **Liên quan:** [`Phase1_User_Flows.md`](./Phase1_User_Flows.md) S-08 · [`Phase1_Data_Model.md`](./Phase1_Data_Model.md) · [`Requirements.md`](./Requirements.md) FR-MOT-1/2 · [`Phase1_Design_System.md`](./Phase1_Design_System.md)

---

## 1. Triết lý (ràng buộc bất di bất dịch)

| Luật | Lý do (persona) |
|---|---|
| Cây lớn theo **kết quả học thật**, KHÔNG theo phút mở app | FR-MOT-1; tránh dark pattern thời lượng |
| Cây **không bao giờ thu nhỏ / không chết** khi nghỉ | FR-MOT-2; streak anxiety hại người ADHD (B2/B3) |
| **Không màu đỏ / không cảnh báo trừng phạt** | NFR-A11Y-1; giữ cảm giác an toàn |
| Có **"ngày nghỉ" / streak-freeze** | B2/B3; nghỉ là bình thường, không tội lỗi |
| Tăng trưởng **mượt, tiệm cận** — không tụt | Củng cố tích cực, không gây lo âu |

> **Một câu:** Cây là tấm gương phản chiếu kiến thức bạn *đã ghi nhớ được* — nó chỉ lớn lên, chậm lại khi bạn nghỉ, nhưng không bao giờ úa đi vì bạn.

---

## 2. Nguồn dữ liệu nuôi cây (MVP)

MVP chưa có knowledge map đầy đủ (Pha 2) → dùng **card mastery làm proxy** cho "khái niệm đã thuộc".

```
mastery_pct = số card "mastered" / tổng số card đã approve (reviewed=1)

card "mastered"  ⟺  card_schedule.stability >= STABILITY_THRESHOLD
STABILITY_THRESHOLD = 21 (ngày)   # FSRS stability ≈ khoảng nhớ ổn định ~3 tuần
```

| Biến | Nguồn | Ý nghĩa cây |
|---|---|---|
| `mastery_pct` | card mastered / tổng card | **Kích thước tổng thể** của cây |
| `concepts_mastered` | (MVP = card mastered; Pha 2 = concepts) | Số **lá xanh** |
| `concepts_learning` | card đang học (stability < ngưỡng, đã review ≥1) | **Lá vàng / chồi** |
| `total_cards` | tổng card approve | **Tiềm năng** cây (khung tối đa) |

> Pha 2: thay proxy bằng bảng `concepts` thật (mỗi concept = một lá/quả, trạng thái từ FSRS của card thuộc concept đó).

---

## 3. Các giai đoạn sinh trưởng (growth stages)

Cây hiển thị theo bậc rời rạc (đỡ tải tính toán + cảm giác "lên cấp" rõ ràng), nội suy mềm trong từng bậc.

| Stage | Điều kiện | Hình ảnh |
|---|---|---|
| 0 — Hạt/Mầm | 0 card mastered | mầm nhỏ nhú khỏi đất |
| 1 — Cây con | mastery_pct > 0 hoặc ≥1 card mastered | thân mảnh, vài lá |
| 2 — Cây nhỡ | mastery_pct ≥ 0.25 | thân rõ, nhiều nhánh |
| 3 — Cây trưởng thành | mastery_pct ≥ 0.50 | tán lá rộng |
| 4 — Cây sum suê | mastery_pct ≥ 0.75 | tán dày, có quả |
| 5 — Cổ thụ | mastery_pct ≥ 0.95 | cây lớn, rễ vững, đầy quả |

**Nội suy trong bậc:** giữa hai stage, các tham số visual (chiều cao, số lá, độ rậm) nội suy tuyến tính theo `mastery_pct` → cây "nhích lớn" mỗi khi thêm card mastered, không chỉ nhảy bậc.

---

## 4. Mô hình render (kỹ thuật)

**Cách tiếp cận MVP: SVG layered + tham số hóa** (nhẹ, chạy tốt máy yếu — KHÔNG dùng WebGL/canvas nặng).

```
TreeData (từ get_subject_dashboard):
{
  mastery_pct:        0.67,
  concepts_total:     70,
  concepts_mastered:  47,
  concepts_learning:  23
}
        │
        ▼
TreeRenderer (React component, SVG)
  ├── trunk:    chiều cao/độ dày ∝ mastery_pct
  ├── branches: số nhánh ∝ stage (rời rạc) + góc cố định theo seed(subject_id)
  ├── leaves:   số lá xanh ∝ concepts_mastered; lá vàng ∝ concepts_learning
  └── ground:   cố định
```

**Tham số hóa (ví dụ):**
```typescript
function treeParams(t: TreeData) {
  const stage = stageFor(t.mastery_pct);           // 0–5
  return {
    trunkHeight: lerp(40, 180, t.mastery_pct),     // px
    trunkWidth:  lerp(6, 28, t.mastery_pct),
    branchCount: [0, 2, 4, 6, 9, 12][stage],
    greenLeaves: t.concepts_mastered,
    goldLeaves:  t.concepts_learning,
    hasFruit:    stage >= 4,
  };
}
```

- **Determinism:** dùng `subject_id` làm seed cho góc nhánh/vị trí lá → mỗi môn có cây *riêng nhưng ổn định* (không nhảy lung tung mỗi render).
- **Màu lá:** xanh (`--color-accent`) = mastered; vàng đất (`--color-accent-warm`) = learning. KHÔNG lá nâu/rụng cho "cần ôn".

---

## 5. Hành vi khi nghỉ (không trừng phạt)

```
Người dùng nghỉ N ngày:
  → Cây GIỮ NGUYÊN kích thước (mastery_pct không giảm).
  → KHÔNG lá rụng, KHÔNG đổi nâu, KHÔNG thông báo tội lỗi.
  → Card "cần ôn" (FSRS due) thể hiện ở Dashboard stats (số "cần ôn"),
    KHÔNG thể hiện bằng cây úa.
  → Khi quay lại: lời chào trung tính "Chào mừng trở lại 🌱" — không "Bạn đã bỏ lỡ X ngày!".
```

**Streak (nếu hiển thị):**
- Streak là **phụ trợ tùy chọn**, đặt nhỏ ở Dashboard — KHÔNG phải nhân vật chính.
- Nghỉ → streak tạm dừng, KHÔNG reset về 0 đột ngột (streak-freeze tự động cho ngày nghỉ).
- Pha 3: "ngày nghỉ" khai báo được; streak bỏ qua ngày đó.

> So với Anki (đỏ rực khi tồn đọng) và Duolingo (streak gây áp lực): Arbora cố tình *không* tạo áp lực này.

---

## 6. Tăng trưởng & animation

- Khi một card vừa đạt mastered (sau phiên ôn) → cây "nhích lớn" mượt: animation ≤ 600ms ease-out, một lá mới nảy.
- Tôn trọng `prefers-reduced-motion`: tắt animation, cây cập nhật tức thì.
- KHÔNG confetti/particle nặng (máy yếu + calm aesthetic).

---

## 7. Phạm vi MVP vs sau

| Khía cạnh | MVP (Pha 1) | Pha 3 (cây nâng cao) |
|---|---|---|
| Nguồn dữ liệu | card mastery (proxy) | concepts thật (knowledge map Pha 2) |
| Stages | 6 bậc rời rạc + nội suy | + mùa/biến thể theo môn |
| Nghỉ | không phạt (đã có) | + "ngày nghỉ" khai báo, streak-freeze chủ động |
| Cá nhân hóa | seed theo subject_id | + loài cây chọn được, trang trí mở khóa |
| Animation | nảy lá mượt | + hiệu ứng mùa, gió nhẹ (opt-in) |

**MVP DoD cho cây:** Dashboard hiển thị một cây SVG lớn dần theo `mastery_pct`, không thu nhỏ khi nghỉ, chạy mượt trên máy yếu, tôn trọng reduced-motion.

---

## 8. Rủi ro & quyết định

| Vấn đề | Quyết định |
|---|---|
| Cây đẹp nhưng nặng máy yếu | SVG tham số hóa, không WebGL; số lá cap (ví dụ ≤ 120 element) để DOM nhẹ. |
| Mastery_pct dao động khi card mới thêm | Dùng *số lượng* mastered cho lá (luôn tăng) + pct cho kích thước; thêm card chưa học làm khung lớn hơn nhưng không làm cây "teo". |
| Proxy card ≠ concept thật | Chấp nhận ở MVP; bảng `concepts` đã tạo sẵn (Data Model §3.10) để Pha 2 thay không phá schema. |
| "Không phạt" mâu thuẫn "nhắc ôn" | Tách biệt: cây = thành tựu (chỉ tăng); stats "cần ôn" = thông tin trung tính, không gắn vào cây. |

---

*Tree Metaphor v1.0 — Phase 1 Design. MVP: cây SVG cơ bản theo card mastery, không trừng phạt. Cá nhân hóa & knowledge-map-driven để Pha 2–3.*
