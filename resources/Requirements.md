# Arbora — Yêu cầu & User Stories (suy ra từ Personas GĐ1)

> **Trạng thái:** Deliverable Pha Discovery, bước "Thiết kế yêu cầu" → đầu vào cho Pha Design (§3.1 [`Overview.md`](./Overview.md)).
> **Nguồn:** Suy ra trực tiếp từ [`Personas.md`](./Personas.md) (10 personas A1–C3) + briefing hành vi GĐ1 **[B]**. Mỗi yêu cầu **truy ngược** về persona đã đòi hỏi nó.
> **Quan hệ Proposal:** Cụ thể hóa phạm vi [`Project_Proposal.md`](./Project_Proposal.md) §6 thành yêu cầu kiểm thử được. Không lặp lại NFR/non-goal đã chốt — chỉ trỏ tới và bổ sung ngưỡng do persona đặt ra.

---

## 1. Quy ước

- **FR** = yêu cầu chức năng · **NFR** = phi chức năng · **US** = user story.
- Mỗi mục gắn: **Persona** (ai đòi) · **Pha** (theo roadmap Proposal §8) · **Bằng chứng [B]**.
- **MoSCoW:** M = Must (MVP/Pha 1) · S = Should · C = Could · W = Won't-now (xem Non-goals §6.4 Proposal).

---

## 2. Yêu cầu chức năng (FR)

### Trụ 1 — Tổ chức & lưu trữ
| ID | Yêu cầu | Persona | Pha | MoSCoW |
|---|---|---|---|---|
| FR-ORG-1 | Tạo **môn = workspace riêng** chứa nguồn/notes/thẻ/quiz/lịch/điểm | tất cả | 1 | M |
| FR-ORG-2 | Thêm nguồn **PDF/slide/audio bài giảng** vào môn | A1, C1, C2 | 1 | M |
| FR-ORG-3 | **Knowledge map** per môn + trạng thái khái niệm (mới/đang học/đã thuộc/cần ôn), lấy từ dữ liệu FSRS | A1, A4 | 2 | S |

### Trụ 2 — Hiểu & sinh nội dung (lõi khác biệt)
| ID | Yêu cầu | Persona | Pha | MoSCoW |
|---|---|---|---|---|
| FR-GEN-1 | Sinh **notes có cấu trúc + flashcard + quiz** từ nguồn của môn | A1, A4, B1, C1 | 1 | M |
| FR-GEN-2 | **Mỗi thẻ & câu quiz mang trích dẫn nguồn** (trang/timestamp) — *bắt buộc* | A1, A2 | 1 | M |
| FR-GEN-3 | **Grounding chặt**: chỉ sinh từ nội dung nguồn, không bịa ngoài tài liệu | A1, A2 | 1 | M |
| FR-GEN-4 | **Review-before-trust**: user duyệt/sửa trước khi thẻ vào deck ôn | A1, A2 | 1 | M |
| FR-GEN-5 | **Transcribe** audio/video bài giảng (Whisper + VAD) → text có timestamp | C1, C2, A1 | 1 | M |
| FR-GEN-6 | **Hỏi-đáp RAG khoanh vùng theo môn**, trả lời **có trích dẫn** | A2, A1 | 2 | S |
| FR-GEN-7 | Sinh **sơ đồ/mind map bằng Mermaid** (LLM xuất mã, render local) | A3, B3 | 2 | S |
| FR-GEN-8 | **Dịch / nội dung song ngữ** cho nguồn & tóm tắt (Việt–Anh) | C1, C2 | 4 | C |
| FR-GEN-9 | Disclaimer "AI có thể sai — hãy kiểm tra" hiển thị ở điểm sinh nội dung | tất cả | 1 | M |

### Trụ 3 — Luyện tập & ghi nhớ
| ID | Yêu cầu | Persona | Pha | MoSCoW |
|---|---|---|---|---|
| FR-SRS-1 | Ôn tập theo **FSRS** (dùng thư viện, không tự viết scheduler) | A1, A4 | 1 | M |
| FR-SRS-2 | **Export `.apkg` / AnkiConnect** để ôn trên điện thoại | A1 | 1 | M |
| FR-SRS-3 | **Interleaving**: trộn câu hỏi nhiều chủ đề/môn trong một phiên | A4 | 2 | S |
| FR-SRS-4 | Nút **"Giải thích vì sao"** (elaboration) sau mỗi thẻ | A1, B3 | 2 | C |

### Trụ 4 — Lập kế hoạch & theo dõi
| ID | Yêu cầu | Persona | Pha | MoSCoW |
|---|---|---|---|---|
| FR-PLAN-1 | Quản lý **deadline + lịch học** + nhắc nhở | B1, A4 | 1 | M |
| FR-PLAN-2 | **Tự rải phiên ôn FSRS** quanh deadline/ngày thi cho khái niệm của môn | A4, A1 | 3 | S |
| FR-PLAN-3 | **Sổ điểm** theo môn/loại + GPA + what-if ("cần bao nhiêu điểm bài cuối") | A4 | 1 | M |
| FR-PLAN-4 | **Dashboard tiến độ** per môn (% đã thuộc, độ ổn định trí nhớ, deadline) | A4, A1 | 1 | M |

### Trụ 5 — Động lực & cá nhân hóa (tái khung, không dark pattern)
| ID | Yêu cầu | Persona | Pha | MoSCoW |
|---|---|---|---|---|
| FR-MOT-1 | **Cây tiến bộ** lớn theo *kết quả học thật* (khái niệm đạt mức ghi nhớ), KHÔNG theo phút mở app | B1, B2 | 3 | S |
| FR-MOT-2 | **Cây không chết / không bị phạt** khi nghỉ; có "ngày nghỉ"/streak-freeze | B2, B3 | 3 | M *(của lớp gamification)* |
| FR-MOT-3 | **Nút giảm ma sát bắt đầu** ("Bắt đầu phiên 10 phút") + phiên ngắn có hẹn giờ | B1, B3 | 3 | S |
| FR-MOT-4 | **Chế độ tập trung** + giao diện ít quá tải (ẩn bớt, một việc/lần) | B3 | 3 | S |
| FR-MOT-5 | Cá nhân hóa **rule-based** theo biến số thật (thời gian rảnh, deadline, mục tiêu) — *không* "phát hiện phong cách học" | A4, B1 | 3 | S |
| FR-MOT-6 | Nội dung **đa phương thức** (đọc/nghe/sơ đồ/quiz) cho mọi người (dual coding) | C1, B3 | 3/4 | C |

### AI runtime & cấu hình
| ID | Yêu cầu | Persona | Pha | MoSCoW |
|---|---|---|---|---|
| FR-AI-1 | **Preset model theo RAM**: 🌱 1.5B–3B (8GB) · 🌿 7B–8B (16GB) · 🌳 14B+ (32GB/GPU) | C1, C2, C3, A3 | 1 | M |
| FR-AI-2 | **BYO cloud key opt-in** (OpenAI/Gemini/Anthropic/OpenRouter/endpoint OpenAI-compatible); user trả phí; data chỉ rời máy khi user bật | A3 | 3/4 | S |
| FR-AI-3 | **Hoạt động offline** hoàn toàn sau khi tải model (lõi không cần internet) | C1, C2, C3 | 1 | M |

---

## 3. Yêu cầu phi chức năng (NFR) — ngưỡng do persona đặt ra

> Mở rộng Proposal §6.5 bằng ngưỡng cụ thể từ briefing.

| ID | NFR | Ngưỡng/cam kết | Persona | Bằng chứng [B] |
|---|---|---|---|---|
| NFR-PERF-1 | Chạy trên **máy yếu 8GB** | Pipeline ingest→thẻ hoàn tất trong ngưỡng chấp nhận với preset 🌱; *test trên 8GB là bắt buộc* | C1, C2, C3 | 8GB là sàn tối thiểu; máy tầm trung quay lại 8GB do thiếu DRAM 2026 |
| NFR-PRIV-1 | **Local-first & riêng tư** | Dữ liệu không rời máy trừ khi user bật BYO-key/tích hợp có nhãn rõ; **không telemetry mặc định**, nếu có → opt-in + ẩn danh | C3, A1 | Gen-Z privacy paradox; 21% thoải mái train data; "privacy-first AI" mạnh ở Úc |
| NFR-COST-1 | **Miễn phí lõi, $0 vận hành** | Toàn bộ tính năng lõi miễn phí; không paywall tính năng MVP | B1, C1, C2 | Quizlet Plus $35.99 "đắt"; $20/tháng quá tầm; free-tier + canh trial |
| NFR-A11Y-1 | **Tiếp cận / ADHD** | Tương phản cao, TTS, cỡ chữ chỉnh được, giảm chuyển động, chế độ tập trung; **không cơ chế trừng phạt** | B3, B2 | Streak anxiety hại người ADHD; hỗ trợ điều hành *có* bằng chứng |
| NFR-SAFE-1 | **An toàn AI** | 5 cam kết §6.6 Proposal là gate bắt buộc từ MVP (grounding, structured output, trích dẫn, review, disclaimer) | A1, A2 | Hallucination ~40% (ChatGPT) vs ~13% (NotebookLM grounded) |
| NFR-I18N-1 | **Ngôn ngữ** | UI + (pha sau) dịch nội dung hỗ trợ tiếng Việt cho cohort du học sinh | C1, C2 | ESL chỉ hiểu 40–60% bài giảng; lệ thuộc phần mềm dịch |
| NFR-XPLAT-1 | **Cross-platform** | Win/macOS/Linux, pin version tránh "CUDA/dependency hell" | tất cả | (Proposal §6.5) |

---

## 4. User Stories (theo pha)

> Mẫu: *"Là **[persona]**, tôi muốn **[hành động]** để **[giá trị]**."* + tiêu chí chấp nhận (AC).

### Pha 1 — MVP "một môn, một vòng lặp" (Must)

**US-1 (A1, C1)** — Là **SV ngập tài liệu**, tôi muốn **thả PDF/slide/ghi âm bài giảng vào một môn và nhận lại notes + flashcard + quiz** để biến tài liệu thành thứ ôn được mà không tạo thẻ thủ công.
- AC: ingest ≥1 PDF & ≥1 file audio; sinh ≥1 bộ notes + thẻ + quiz; chạy offline; preset theo RAM tự nhận.

**US-2 (A1, A2)** — Là **người học cần độ chính xác**, tôi muốn **mỗi thẻ/câu quiz chỉ rõ trang/timestamp nguồn và duyệt được trước khi vào deck** để không học nhầm kiến thức sai.
- AC: 100% thẻ/quiz có trích dẫn truy được về nguồn; có màn review để sửa/chấp nhận/loại; thẻ chưa duyệt **không** vào lịch ôn (gate review-before-trust).

**US-3 (A1, A4)** — Là **người ôn khối lượng lớn**, tôi muốn **hệ thống tự quyết ôn thẻ nào hôm nay theo FSRS** để nhớ lâu với ít công nhất.
- AC: lịch ôn do thư viện FSRS sinh; phiên ôn active-recall; cập nhật due/stability sau mỗi lần ôn.

**US-4 (A1)** — Là **Anki power user**, tôi muốn **export deck ra `.apkg`** để ôn tiếp trên điện thoại.
- AC: xuất `.apkg` mở được trong Anki; (tùy chọn) đẩy qua AnkiConnect.

**US-5 (A4, B1)** — Là **SV bận**, tôi muốn **thêm deadline/kỳ thi và xem dashboard tiến độ + sổ điểm của môn** để biết đang ở đâu mà không nhập tay nhiều.
- AC: CRUD deadline + nhắc; sổ điểm + GPA + what-if; dashboard % đã thuộc/độ ổn định/deadline tự tổng hợp.

**US-6 (C1, C2, C3)** — Là **SV máy yếu/ngân sách 0đ**, tôi muốn **cả vòng lặp chạy offline & miễn phí trên laptop 8GB** để dùng được mà không trả phí hay cần mạng.
- AC: preset 🌱 1.5B–3B + Whisper tiny/base hoàn tất pipeline trên 8GB trong ngưỡng chấp nhận; không tính năng lõi nào bị khóa sau paywall; không telemetry mặc định.

**US-7 (C1, C2)** — Là **du học sinh nghe chưa kịp bài giảng**, tôi muốn **transcribe bản ghi thành text có timestamp + tóm tắt** để học lại phần đã bỏ lỡ.
- AC: transcribe audio → text + timestamp; tóm tắt truy về timestamp; (pha sau FR-GEN-8) hỗ trợ song ngữ.

### Pha 2 — Đa môn & tổ chức sâu (Should)

**US-8 (A2, A1)** — Là **SV cần kiểm chứng**, tôi muốn **hỏi-đáp trợ lý chỉ-biết-về-một-môn và nhận câu trả lời có trích dẫn** để tin được mà không sợ nó "chế" nguồn.
- AC: RAG khoanh vùng theo `subject_id`; mọi câu trả lời kèm trích dẫn truy nguồn; không trộn dữ liệu môn khác.

**US-9 (A3, B3)** — Là **người học trực quan**, tôi muốn **sơ đồ/mind map render ngay trên máy** để thấy cấu trúc khái niệm.
- AC: LLM xuất mã Mermaid hợp lệ; render local; node truy về nguồn.

### Pha 3 — Động lực "cây" & cá nhân hóa / ADHD (Should/Must-of-layer)

**US-10 (B2, B3)** — Là **người dễ lo âu vì streak**, tôi muốn **một cái cây lớn theo việc học thật và KHÔNG chết/không phạt khi tôi nghỉ** để giữ thói quen mà không thấy tội lỗi.
- AC: cây tăng trưởng gắn khái niệm đạt mức ghi nhớ + ôn đúng hạn, **không** gắn phút mở app; nghỉ một ngày không reset/không trừng phạt; có ngày nghỉ/streak-freeze.

**US-11 (B1, B3)** — Là **người ngại bắt đầu**, tôi muốn **một nút "bắt đầu phiên 10 phút" và giao diện ít quá tải** để vượt quán tính khởi động.
- AC: nút khởi động 1-chạm vào phiên ngắn có hẹn giờ; chế độ tập trung ẩn bớt; phù hợp NFR-A11Y-1.

**US-12 (A4, B1)** — Là **người có quỹ thời gian thay đổi**, tôi muốn **app tự rải lịch ôn quanh deadline theo thời gian rảnh** để ôn đúng thứ trước ngày thi.
- AC: rule-based scheduling dùng deadline + thời gian rảnh khai báo; **không** suy luận "phong cách học".

### Pha 3/4 — Power user & tiếp cận (Should/Could)

**US-13 (A3)** — Là **power user kỹ thuật**, tôi muốn **cắm API key cloud của riêng tôi** để dùng model mạnh hơn và tự kiểm soát chi phí/định tuyến dữ liệu.
- AC: nhập key cho ≥1 provider OpenAI-compatible; nhãn rõ "dữ liệu rời máy khi bật"; user trả phí; vẫn là opt-in.

**US-14 (C3)** — Là **người coi trọng riêng tư**, tôi muốn **biết chắc dữ liệu không rời máy ở chế độ mặc định** để yên tâm dùng.
- AC: mặc định 100% local; không telemetry; mọi đường dữ liệu-ra-ngoài đều opt-in + có nhãn rõ.

---

## 5. Ma trận truy vết (Persona → yêu cầu chính)

| Persona | FR/US neo chính |
|---|---|
| A1 (Y khoa) | FR-GEN-1..4, FR-SRS-1/2, US-1/2/3/4 |
| A2 (Luật) | FR-GEN-2/3/6, US-2/8 |
| A3 (Kỹ thuật/CS) | FR-AI-2, FR-GEN-7, US-9/13 |
| A4 (CPA) | FR-SRS-1, FR-PLAN-2/3/4, US-3/5/12 |
| B1 (Kinh doanh) | FR-MOT-3, FR-PLAN-1, NFR-COST-1, US-5/11 |
| B2 (KHXH, streak-anxiety) | FR-MOT-1/2, NFR-A11Y-1, US-10 |
| B3 (ADHD) | FR-MOT-2/3/4, NFR-A11Y-1, US-10/11 |
| C1 (Du học Việt, QTKD) | FR-GEN-5/8, FR-AI-1/3, NFR-PERF-1/I18N-1, US-6/7 |
| C2 (Du học Việt, IT) | FR-AI-1/3, NFR-COST-1, US-6/7 |
| C3 (Úc, privacy) | FR-AI-3, NFR-PRIV-1/PERF-1, US-6/14 |

**Kiểm tra phủ:** mọi persona đều neo ≥1 yêu cầu Must của Pha 1 → MVP phục vụ được cả 3 nhóm An/Bình/Chi.

---

## 6. Ngoài phạm vi & xác nhận lại (từ personas)

- Không persona nào đòi **"phát hiện phong cách học"** → giữ nguyên non-goal (Proposal §6.4); thay bằng FR-MOT-5/6 (đa phương thức + biến số thật).
- Không persona nào đòi **server miễn phí trung tâm**; nhóm C đòi *offline + $0* → khẳng định local + BYO-key (Proposal §6.4, §7.2).
- **Sinh ảnh AI nặng, NotebookLM API**: không persona nào nêu là nhu cầu Pha 1 → giữ Won't-now.

---

## 7. Câu hỏi mở (Discovery chưa trả lời — cần xác minh tiếp)

1. **Ngưỡng "chấp nhận được" cho máy 8GB** (giây/phút cho pipeline) — cần đo thực ở Pha 0 spike (NFR-PERF-1).
2. **Dịch song ngữ** (FR-GEN-8): mức cần thiết thật của cohort Việt — Pha 1 hay Pha 4? Briefing là proxy ESL, chưa có dữ liệu riêng cho SV Việt **[B caveat]**.
3. **Mức độ muốn export Anki** ngoài nhóm A1 — có nên đưa lên Must không?
4. **BYO-key**: nhóm A3 muốn, nhưng tần suất trong toàn cohort? Ảnh hưởng ưu tiên Pha 3 vs 4.
5. **Số liệu workload là advisory, không phải đo thực** **[B caveat]** — đừng dùng làm cam kết tính năng cứng.

---

*Requirements v1.0 — Pha Discovery. Truy ngược về [`Personas.md`](./Personas.md); cụ thể hóa [`Project_Proposal.md`](./Project_Proposal.md) §6.*
