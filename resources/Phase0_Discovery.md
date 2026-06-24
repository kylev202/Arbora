# Arbora — Giai đoạn 0: Discovery & Khoanh vùng (Tài liệu DoD)

> **Mục đích:** Tài liệu 1 trang chốt **định vị + vòng lặp MVP + personas + phạm vi in/out** trước khi sang Giai đoạn 1 (Design).
> **Trạng thái:** v1 (desk-work). Personas & phạm vi là **giả thuyết làm việc**, được **kiểm chứng/điều chỉnh** sau phỏng vấn — xem [`Phase0_Interview_Kit.md`](./Phase0_Interview_Kit.md).
> **Liên quan:** [`Project_Proposal.md`](./Project_Proposal.md) · [`Project_Checklist.md`](./Project_Checklist.md) · [`Developer_Guide.md`](./Developer_Guide.md) · [`Overview.md`](./Overview.md)

---

## 1. Câu định vị (chốt)

> **Arbora là không gian học tập chạy hoàn toàn trên máy bạn: thả tài liệu của trường vào, nó tự biến thành ghi chú có cấu trúc, thẻ ghi nhớ, quiz và sơ đồ — đều truy về nguồn; rồi lên lịch ôn theo khoa học trí nhớ, nhắc đúng lúc, và cho bạn thấy từng môn lớn dần như một cái cây — riêng tư, miễn phí, không cần internet.**

**Biến thể ngắn (1 dòng, dùng cho README/ra mắt):**
> *Biến tài liệu của trường thành kiến thức được ghi nhớ — local, miễn phí, riêng tư, cài-một-lần.* 🌳

---

## 2. Vòng lặp hoàn chỉnh tối thiểu cho MVP (một học sinh · một môn · A→Z)

Đây là *con đường hạnh phúc duy nhất* mà Pha 1 phải làm **trọn vẹn** (ưu tiên một happy path hoàn hảo hơn mười tính năng nửa vời):

```
A. Tạo môn          → User tạo "Sinh học 12" (workspace riêng = một nhánh cây).
B. Thêm nguồn       → Thả 1 file: PDF / slide (.pptx) / ghi âm bài giảng.
C. Ingest           → [sidecar] parse/transcribe → chunk → embed → FAISS (theo môn).
D. Sinh nội dung    → notes (Cornell/outline) + flashcard + quiz trắc nghiệm,
                      GROUNDED, mỗi item có trích dẫn (trang/timestamp).
E. Review trước khi tin → Màn duyệt BẮT BUỘC: sửa/giữ/bỏ → chỉ item đã duyệt mới lưu.
                      Có disclaimer "AI có thể sai".
F. Ôn tập           → FSRS lên lịch → phiên active recall → cập nhật trạng thái thẻ.
G. Lập kế hoạch     → Đặt deadline + lịch học cơ bản + nhắc nhở.
H. Theo dõi         → Sổ điểm đơn giản + dashboard tiến độ per môn:
                      cây cơ bản lớn theo % khái niệm đã thuộc.
(xuyên suốt) Settings → chọn preset local theo RAM hoặc nhập BYO key.
```

**Tiêu chí "đi hết vòng lặp":** một học sinh, không cần hướng dẫn, tạo được môn → có deck đã review → ôn được theo FSRS → thấy cây lớn + quản lý 1 deadline/điểm — **không bị bí ở bước nào**.

---

## 3. Personas (v1 — chốt sau phỏng vấn)

| | **An** — SV Y khoa | **Bình** — SV Kỹ thuật + ADHD | **Chi** — HS THPT, máy phổ thông |
|---|---|---|---|
| **Bối cảnh** | Khối lượng khổng lồ, thi cử dày | Dễ trì hoãn, khó bắt đầu | Laptop ~8GB, ngân sách 0đ |
| **Đau chính** | Quá nhiều để nhớ; cần chính xác cao & hệ thống | Ma sát khi bắt đầu; mất tập trung; "đứt streak" gây lo âu | Công cụ tốt đều trả phí/cloud; máy yếu |
| **Cần ở Arbora** | Sinh thẻ/quiz chính xác có trích dẫn; ôn FSRS quy mô lớn | Phiên ngắn, nút "bắt đầu", phản hồi tức thì, **không bị phạt khi nghỉ** | Preset máy yếu, miễn phí, UI đơn giản |
| **Preset phần cứng** | 🌳 Mạnh / BYO key cho chất lượng | 🌿 Trung bình (16GB) | 🌱 Yếu (≤8GB, CPU) — *bắt buộc test* |
| **Tín hiệu thành công** | % thẻ chấp nhận cao; phủ ôn đúng hạn | Quay lại đều mà không lo âu; hoàn tất phiên ngắn | Pipeline chạy nổi & dùng được trên máy của em |

> An = ép chất lượng grounding/citation. Bình = ép triết lý "cây không phạt" + low-friction. Chi = ép NFR máy yếu. Cả ba phải dùng được **cùng một vòng lặp** ở Mục 2.

---

## 4. Phạm vi MVP (Pha 1) — chốt

**TRONG (in) — Pha 1 phải có để vòng lặp Mục 2 trọn vẹn:**
- Tạo/sửa/xóa **môn** + workspace riêng.
- Thêm **nguồn**: PDF / slide (.pptx) / audio → ingest pipeline (parse/transcribe/chunk/embed/FAISS).
- Sinh **notes có cấu trúc + flashcard + quiz trắc nghiệm**, *mỗi item có trích dẫn*.
- **Review/edit bắt buộc** trước khi lưu (review-before-trust) + **disclaimer**.
- **FSRS** lên lịch + màn **ôn tập** (active recall).
- **Deadline/lịch** cơ bản + nhắc nhở.
- **Sổ điểm** đơn giản (theo môn/loại).
- **Dashboard tiến độ** per môn + **cây cơ bản** (lớn theo % khái niệm thuộc).
- **Settings:** preset model theo RAM / BYO key.
- UI **tối giản, bình tĩnh, ít quá tải** (baseline a11y) — đủ cho cả vòng lặp.

**NGOÀI (out) — hoãn sang pha sau (KHÔNG làm ở MVP):**
- Đa môn & chuyển ngữ cảnh sâu, **RAG hỏi-đáp theo môn**, knowledge map, interleaving, sơ đồ Mermaid → **Pha 2**.
- Cây nâng cao + cá nhân hóa rule-based + nhắc thông minh + what-if điểm/GPA + **bộ chế độ ADHD đầy đủ** (focus timer, TTS, tương phản/cỡ chữ, giảm chuyển động) → **Pha 3**. *(UI bình tĩnh baseline vẫn vào từ MVP.)*
- Audio Overview / study guide / Learning Guide / NotebookLM-local / sinh ảnh AI → **Pha 4**.
- Đóng gói 3 OS, signing, auto-update, ra mắt → **Pha 5**.

**Non-goals (không bao giờ vào lõi):** server API trung tâm miễn phí · phụ thuộc API NotebookLM · "phát hiện phong cách học" (VAK) · sinh ảnh AI nặng trong lõi · tự viết scheduler trí nhớ.

---

## 5. Definition of Done — Giai đoạn 0

- [x] Câu định vị (Mục 1).
- [x] Vòng lặp MVP A→Z (Mục 2).
- [x] Phạm vi MVP in/out (Mục 4).
- [~] Personas v1 (Mục 3) — **chốt sau phỏng vấn**.
- [ ] Phỏng vấn 5–10 học sinh/sinh viên — **việc field-work của bạn**; dùng [`Phase0_Interview_Kit.md`](./Phase0_Interview_Kit.md). Sau phỏng vấn: cập nhật Mục 3 & 4 → đổi `[~]`/`[ ]` thành `[x]` → Pha 0 **Done**.

---

*Phase 0 Discovery v1 — desk-work hoàn tất. Chỉ còn phỏng vấn + chốt lại personas/phạm vi để đóng pha.*
