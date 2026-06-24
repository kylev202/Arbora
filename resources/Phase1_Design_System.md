# Arbora — Design System (Phase 1)

> **Mục đích:** Hệ thống thiết kế tối giản, *bình tĩnh, ít quá tải* — nền tảng UI cho cả vòng lặp MVP. Ưu tiên a11y baseline (ADHD-aware) ngay từ MVP.
> **Trạng thái:** v1 — Phase 1 Design. Tokens dạng CSS variables để bê thẳng vào code Phase 2.
> **Liên quan:** [`Phase1_User_Flows.md`](./Phase1_User_Flows.md) · [`Phase1_Tree_Metaphor.md`](./Phase1_Tree_Metaphor.md) · [`Requirements.md`](./Requirements.md) NFR-A11Y-1

---

## 1. Nguyên tắc thiết kế

| Nguyên tắc | Hệ quả thiết kế |
|---|---|
| **Calm, low-overwhelm** | Một việc chính mỗi màn hình; nhiều khoảng trắng; tối đa 1 màu nhấn/màn. |
| **Không trừng phạt** (B2/B3) | Không đỏ cảnh báo cho "bỏ lỡ"; không streak counter đỏ rực; không animation thúc giục. |
| **Grounding hữu hình** | Citation luôn hiển thị, dễ click; disclaimer ở mọi điểm sinh nội dung. |
| **A11y từ MVP** | Tương phản ≥ WCAG AA; cỡ chữ chỉnh được; focus rõ; `prefers-reduced-motion`. |
| **Ẩn dụ thiên nhiên** | Bảng màu xanh-lá/đất; cây là điểm nhấn cảm xúc duy nhất. |

---

## 2. Color Tokens

Bảng màu **calm, thiên nhiên** — xanh lá làm chủ đạo (cây), nền ấm trung tính, tối thiểu màu báo động.

```css
:root {
  /* ── Brand / Primary (cây, hành động chính) ── */
  --color-primary:        #4A7C59;   /* xanh lá rừng — nút chính, nhánh cây */
  --color-primary-hover:  #3D6849;
  --color-primary-soft:   #E8F0EA;   /* nền nhạt cho vùng nhấn */

  /* ── Accent (mastery, "đã thuộc") ── */
  --color-accent:         #6BA368;   /* xanh lá tươi — lá khỏe, tiến độ */
  --color-accent-warm:    #C9A227;   /* vàng đất — "đang học", quả non */

  /* ── Neutral (nền, chữ) — ấm, không xám lạnh ── */
  --color-bg:             #FAF8F4;   /* nền chính, trắng ngà ấm */
  --color-surface:        #FFFFFF;   /* card, modal */
  --color-surface-alt:    #F2EEE7;   /* vùng phụ, sidebar */
  --color-border:         #E0DAD0;
  --color-text:           #2B2B28;   /* chữ chính — gần đen, không đen tuyền */
  --color-text-muted:     #6B665E;   /* chữ phụ, label */

  /* ── Semantic (DÙNG TIẾT KIỆM) ── */
  --color-success:        #4A7C59;   /* = primary, củng cố tích cực */
  --color-info:           #5A7D9A;   /* xanh dương nhạt — thông tin trung tính */
  --color-warning:        #C9A227;   /* vàng đất — KHÔNG cam/đỏ chói */
  --color-danger:         #B5524A;   /* đỏ đất, trầm — chỉ cho xóa/destructive */

  /* ── Citation / nguồn ── */
  --color-citation-bg:    #F0F4F8;
  --color-citation-text:  #5A7D9A;
}
```

**Dark mode** (token đối ứng — chi tiết hóa khi build):
```css
[data-theme="dark"] {
  --color-bg:          #1C1B19;
  --color-surface:     #262521;
  --color-surface-alt: #2E2C28;
  --color-text:        #EDE9E1;
  --color-text-muted:  #A39E94;
  --color-border:      #3A3833;
  --color-primary:     #6BA368;   /* sáng hơn để giữ tương phản trên nền tối */
  /* ... */
}
```

**Ràng buộc:**
- KHÔNG dùng đỏ cho trạng thái học (quá hạn ôn, bỏ lỡ) → dùng `--color-text-muted` hoặc vàng đất.
- `--color-danger` CHỈ cho hành động phá hủy (xóa môn/source/card).
- Mọi cặp text/nền đạt **WCAG AA (≥ 4.5:1)** cho body, **≥ 3:1** cho text lớn.

---

## 3. Typography

```css
:root {
  /* Font: sans-serif dễ đọc, hỗ trợ tiếng Việt đầy đủ (dấu) */
  --font-sans: "Inter", "Be Vietnam Pro", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;   /* code/citation timestamp */

  /* Scale (1.25 — major third, vừa phải, không quá tương phản) */
  --text-xs:   0.8rem;    /* 12.8px — label, caption */
  --text-sm:   0.9rem;    /* 14.4px — phụ */
  --text-base: 1rem;      /* 16px   — body (mặc định, chỉnh được) */
  --text-lg:   1.25rem;   /* 20px   — tiêu đề card */
  --text-xl:   1.563rem;  /* 25px   — tiêu đề màn hình */
  --text-2xl:  1.953rem;  /* 31px   — heading lớn, hiếm dùng */

  --leading-tight:  1.3;
  --leading-normal: 1.6;  /* body — rộng rãi, dễ đọc cho ESL/ADHD */

  --weight-normal:   400;
  --weight-medium:   500;
  --weight-semibold: 600;
}
```

- **Be Vietnam Pro** đảm bảo dấu tiếng Việt đẹp (cohort du học sinh Việt).
- Cỡ chữ base **chỉnh được** trong Settings (NFR-A11Y-1): 14 / 16 / 18 / 20px → scale toàn app qua `rem`.
- `--leading-normal: 1.6` rộng — giảm tải đọc cho ESL và ADHD.

---

## 4. Spacing & Layout

```css
:root {
  /* Spacing scale (4px base) */
  --space-1:  0.25rem;   /* 4px  */
  --space-2:  0.5rem;    /* 8px  */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-6:  1.5rem;    /* 24px */
  --space-8:  2rem;      /* 32px */
  --space-12: 3rem;      /* 48px */
  --space-16: 4rem;      /* 64px */

  /* Radius — bo mềm, thân thiện */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Shadow — rất nhẹ, tránh nặng nề */
  --shadow-sm: 0 1px 2px rgba(43,43,40,0.06);
  --shadow-md: 0 2px 8px rgba(43,43,40,0.08);
  --shadow-lg: 0 8px 24px rgba(43,43,40,0.10);

  /* Layout */
  --sidebar-width: 220px;
  --content-max-width: 760px;    /* giới hạn dòng đọc — calm, không tràn */
  --modal-width: 520px;
}
```

**Quy tắc khoảng trắng:**
- Padding tối thiểu trong card: `--space-6` (24px).
- Khoảng cách giữa section: `--space-8` đến `--space-12`.
- Content vùng đọc giới hạn `--content-max-width` — không để dòng text dài hết màn rộng.

---

## 5. Component Inventory (MVP)

| Component | Mô tả | Dùng ở |
|---|---|---|
| **Button** | primary / secondary / ghost / danger; sizes sm/md | Khắp nơi |
| **SubjectCard** | màu môn, tên, badge due, mini-tree | S-01 |
| **SourceRow** | icon type, title, badge ingest status | S-02 Sources |
| **ReviewCard** | hiện item + citation + 3 nút approve/reject/edit | S-05 |
| **StudyCard** | mặt trước/sau, nút lật, 4 rating | S-06 |
| **CitationChip** | nguồn + trang/timestamp, click → mở nguồn | S-05, S-06 |
| **Disclaimer** | banner "AI có thể sai" | S-04, S-05 |
| **ProgressBar** | tiến trình ingest/generate | S-03, S-04 |
| **Tree** | SVG cây phát triển | S-08 (xem Tree Metaphor) |
| **StatTile** | số liệu + label + icon | S-08 |
| **Modal** | overlay + card căn giữa | S-03, S-04 |
| **Tabs** | điều hướng trong workspace | S-02 |
| **EmptyState** | icon + text + CTA | mọi tab rỗng |
| **GradeTable** | bảng điểm + what-if rows | S-07 |
| **RatingButton** | nút FSRS với label gợi ý | S-06 |
| **PresetSelector** | radio 3 preset RAM | S-09, S-10 |

---

## 6. Component Specs chính

### Button
```
primary:    bg=primary, text=white, hover=primary-hover
secondary:  bg=surface, border=border, text=text
ghost:      transparent, text=text-muted, hover bg=surface-alt
danger:     bg=transparent, text=danger, border=danger (confirm trước khi chạy)
focus:      outline 2px primary, offset 2px (LUÔN hiển thị, a11y)
disabled:   opacity 0.5, cursor not-allowed
min-height: 40px (touch target ≥ 40px)
```

### CitationChip (first-class — citation luôn hữu hình)
```
┌────────────────────────────────────┐
│ 📄 Slide 5 · "màng nhĩ rung..." ↗  │   ← bg=citation-bg, text=citation-text
└────────────────────────────────────┘
click → mở nguồn tại trang/timestamp (highlight excerpt)
```

### RatingButton (FSRS — không phán xét)
```
[Again]  [Hard]  [Good]  [Easy]
 xám      vàng    xanh     xanh đậm
"Quên"  "Khó"  "Nhớ được" "Dễ"
→ KHÔNG dùng đỏ cho "Again" (tránh cảm giác thất bại)
```

---

## 7. Accessibility Baseline (MVP — NFR-A11Y-1)

| Yêu cầu | Thực thi |
|---|---|
| **Tương phản** | Mọi text đạt WCAG AA; token màu đã kiểm. |
| **Cỡ chữ chỉnh được** | Settings: 14/16/18/20px → scale `rem` toàn app. |
| **Focus visible** | `outline 2px primary` trên mọi element focus được; không bao giờ `outline: none` không thay thế. |
| **Reduced motion** | `@media (prefers-reduced-motion: reduce)` → tắt animation cây, transition tối thiểu. |
| **Keyboard nav** | Toàn bộ vòng lặp dùng được bằng bàn phím (shortcuts ở User Flows §6). |
| **Touch targets** | ≥ 40×40px. |
| **Semantic HTML** | `<button>` cho action, `<nav>`, `<main>`, aria-label cho icon-only. |
| **Chế độ tập trung** (Pha 3) | Token đã chuẩn bị; MVP giữ giao diện đủ tĩnh để mở rộng. |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Motion (tiết chế)

- **Mặc định:** transition 150–200ms ease cho hover/focus; không bounce, không spin lâu.
- **Cây lớn:** animation mềm khi mastery tăng (≤ 600ms, ease-out) — điểm nhấn cảm xúc *duy nhất*.
- **KHÔNG:** confetti, shake, pulse đỏ, đếm ngược gây áp lực.
- Mọi motion tôn trọng `prefers-reduced-motion`.

---

*Design System v1.0 — Phase 1 Design. Tokens dạng CSS variables, bê thẳng vào `src/styles/` ở Phase 2. Dark mode + chế độ tập trung chi tiết hóa khi build.*
