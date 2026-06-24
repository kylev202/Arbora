# Arbora — Project Checklist (Khung thực thi từ số 0 đến Deploy)

> **Cách dùng:** Bản đồ thực thi để xây dựng dự án theo đúng thứ tự. Đánh dấu `[x]` khi xong. Mỗi pha có **Definition of Done (DoD)** — không sang pha sau khi pha hiện tại chưa ra một bản *dùng được trọn vẹn*.
> **Bối cảnh:** Solo, toàn thời gian · Stack: **Tauri 2 + React + Python sidecar** · Open-source (MIT).
> **Liên quan:** [`Arbora_Project_Proposal.md`](./Arbora_Project_Proposal.md) · [`Arbora_Developer_Guide.md`](./Arbora_Developer_Guide.md) · [`StudyForge_Overview.md`](./StudyForge_Overview.md)

---

## Giai đoạn -1 — Quyết định trước khi viết dòng code nào (Pre-flight)

- [x] **Tên sản phẩm:** Arbora 🌳
- [x] **Giấy phép:** MIT
- [x] **UI framework:** React
- [x] **Vector store:** FAISS
- [x] **Chiến lược AI:** local mặc định (preset RAM) + BYO key — *không* server trung tâm
- [x] Chốt **bản model LLM cụ thể** + ngưỡng RAM cho từng preset. — *Qwen3 4B/8B/14B (🌱/🌿/🌳); xem [`Phase0_Model_Presets.md`](./Phase0_Model_Presets.md).*
- [x] Xác nhận cấu hình máy dev. — *RTX 4070 12GB VRAM + 16GB RAM + Ryzen 7 5700X; daily driver Qwen3 8B.*

---

## Giai đoạn 0 — Discovery & Khoanh vùng

> Deliverables: [`Phase0_Discovery.md`](./Phase0_Discovery.md) (tài liệu DoD) · [`Phase0_Interview_Kit.md`](./Phase0_Interview_Kit.md) (bộ phỏng vấn) · [`Personas.md`](./Personas.md) (10 personas đã kiểm chứng) · [`Requirements.md`](./Requirements.md) (FR/NFR/user stories truy ngược personas).

- [x] Phỏng vấn / nghiên cứu hành vi học tập: họ học thế nào, đau ở đâu. — *kết quả tổng hợp trong briefing GĐ1 (Australian + Vietnamese students).*
- [x] Viết lại **một câu định vị** (đã có trong proposal). — *xem Discovery §1.*
- [x] Định nghĩa **"vòng lặp hoàn chỉnh"** tối thiểu cho MVP (một học sinh, một môn, A→Z). — *Discovery §2.*
- [x] Xác nhận personas (An/Bình/Chi) — kiểm chứng & mở rộng thành **10 personas** (4 An / 3 Bình / 3 Chi) neo vào số liệu briefing. — *[`Personas.md`](./Personas.md).*
- [x] Chốt phạm vi MVP (in/out) — FR/NFR + MoSCoW + tái khẳng định non-goal. — *[`Requirements.md`](./Requirements.md) §2–3, §6; vài câu hỏi ưu tiên còn mở ở §7.*

**DoD:** ✅ Tài liệu định vị + vòng lặp MVP + **personas đã kiểm chứng** + requirements truy ngược. — *còn 5 câu hỏi mở (Requirements §7) cần xác minh ở Pha 0 spike / phỏng vấn bổ sung.*

---

## Giai đoạn 1 — Thiết kế (Design)

### Trải nghiệm
- [x] Vẽ **user flows** cho vòng lặp MVP (tạo môn → thêm nguồn → sinh nội dung → review → ôn → dashboard). — *[`Phase1_User_Flows.md`](./Phase1_User_Flows.md) (10 màn hình S-01..S-10).*
- [x] Dựng **design system** tối giản (màu, typography, spacing, component) — giao diện *bình tĩnh, ít quá tải*. — *[`Phase1_Design_System.md`](./Phase1_Design_System.md) (tokens CSS + a11y baseline).*
- [x] Thiết kế **ẩn dụ "cây"**: cây lớn thế nào theo dữ liệu mastery (nhánh = môn, lá = khái niệm thuộc). — *[`Phase1_Tree_Metaphor.md`](./Phase1_Tree_Metaphor.md).*
- [x] Wireframe các màn hình chính (low-fidelity). — *[`Phase1_Wireframes.md`](./Phase1_Wireframes.md) (ASCII low-fi).*

### Kỹ thuật
- [x] Thiết kế **mô hình dữ liệu** (môn, nguồn, note, thẻ, quiz, lịch, điểm, tiến độ) — xem Developer Guide. — *[`Phase1_Data_Model.md`](./Phase1_Data_Model.md) (SQL DDL formal).*
- [x] Thiết kế **kiến trúc**: Tauri/React ↔ Python sidecar ↔ SQLite ↔ FAISS ↔ Ollama. — *[`Developer_Guide.md`](./Developer_Guide.md) §4.*
- [x] Định nghĩa **IPC contract** (React ↔ Rust commands ↔ Python sidecar). — *[`Phase1_IPC_Contract.md`](./Phase1_IPC_Contract.md).*
- [x] Định nghĩa **schema structured output** cho thẻ/quiz/notes (JSON/Pydantic/GBNF). — *[`Phase1_Output_Schemas.md`](./Phase1_Output_Schemas.md).*
- [x] Thiết kế **interface LLM provider** (local Ollama ↔ remote OpenAI-compatible cho BYO key). — *[`Phase1_IPC_Contract.md`](./Phase1_IPC_Contract.md) §7.*

**DoD:** ✅ User flows + data model + sơ đồ kiến trúc + IPC contract + provider interface đã viết ra (chưa code). **Giai đoạn 1 hoàn tất.**

---

## Giai đoạn 2 — Dựng khung & Môi trường (Skeleton)

### Repo & quy trình
- [x] Khởi tạo Git repo + `.gitignore` (Rust/Node/Python). — *git init `main`; `.gitignore` phủ Node/Rust/Python + runtime data.*
- [x] Thêm `README`, `LICENSE` (MIT), `CONTRIBUTING`, `CODE_OF_CONDUCT`. — *đủ 4 file ở root.*
- [x] Cấu trúc monorepo: `src-tauri/`, `src/` (React), `sidecar/`, `shared/`, `docs/` (xem Developer Guide). — *+ `scripts/`, `public/`.*
- [x] Thiết lập **CI** (lint + test + build) cho 3 OS. — *`.github/workflows/ci.yml` (frontend/sidecar/rust × ubuntu/macos/windows); chạy thật khi push.*
- [x] Pin version mọi dependency (Rust crates, npm, Python). — *`Cargo.lock` + `package-lock.json` + `requirements.lock` (full transitive pin) committed; `rust-toolchain.toml` 1.94.1, `.nvmrc` 25.*

### App shell chạy được
- [x] Tauri 2 + React "hello world" chạy trên máy dev. — *Tauri 2.11.3; `npm run tauri dev` mở Vite@1420 + cửa sổ; IPC `greet` OK.*
- [x] Kết nối **SQLite** + chạy migration đầu tiên. — *`0001_initial.sql` (15 bảng) qua `sqlx::migrate!` lúc setup; verify 16 bảng + `settings`=1 row.*
- [x] Spawn & quản lý **Python sidecar** từ Rust (health check qua IPC). — *Rust spawn `python -m arbora_ai.server`, đọc cổng từ stdout, poll `/health`, emit `sidecar:status`, kill khi thoát.*
- [x] Cài & gọi được **Ollama** + một model từ sidecar. — *`OllamaProvider` health + generate(JSON) — test integration pass với qwen3:8b.*
- [x] **Transcribe** một file audio mẫu bằng faster-whisper/whisper.cpp. — *`Transcriber` (faster-whisper base, CTranslate2, không torch); test pass trên `sample_audio.wav`.*
- [x] Khởi tạo **FAISS index** + lưu/đọc thử embedding. — *`SubjectIndex` add/search/save/load + embeddings nomic-embed-text; test pass.*

**DoD:** ✅ App khởi động, nối DB, gọi sidecar, sidecar gọi LLM + transcribe + ghi FAISS. — *verify end-to-end 2026-06-24; `sidecar ready @ 127.0.0.1:PORT`, `/health` 200, 6/6 test sidecar pass.*

---

## Giai đoạn 3 — Spike phần khó nhất (Prove the Risk) ⚠️

> *Làm trước UI đẹp. Nếu phần này không đạt chất lượng, mọi thứ khác vô nghĩa.*

- [ ] CLI thuần: `PDF/audio → parser/transcript → text`.
- [ ] `text → LLM local (structured JSON)` có **grounding** vào nguồn.
- [ ] Sinh **flashcard + quiz** với **trích dẫn nguồn** (trang/timestamp) trên mỗi item.
- [ ] Validate structured output theo schema — reject/retry khi sai.
- [ ] Xuất `.apkg` bằng genanki, import thử vào Anki thành công.
- [ ] **Đo chất lượng:** tự chấm trên 2–3 tài liệu thật → % thẻ chấp nhận được.
- [ ] Test trên **preset máy yếu** (3B Q4 + Whisper base).
- [ ] Thử **BYO key** path: cùng pipeline qua một endpoint OpenAI-compatible.

**DoD:** Pipeline offline chạy end-to-end, chất lượng đủ dùng trên cả máy yếu; provider abstraction hoạt động.

---

## Giai đoạn 4 — Xây MVP (Pha 1: một môn, một vòng lặp)

### Tổ chức
- [ ] Tạo/sửa/xóa **môn học** + workspace riêng.
- [ ] Thêm **nguồn** vào môn (PDF / slide / audio).

### Sinh nội dung (lõi)
- [ ] Sinh **notes có cấu trúc** (Cornell/outline) có trích dẫn.
- [ ] Sinh **flashcard** kèm giải thích + trích dẫn.
- [ ] Sinh **quiz trắc nghiệm** có giải thích đáp án + trích dẫn.
- [ ] **Màn hình review/edit** bắt buộc trước khi lưu (review-before-trust).
- [ ] Hiển thị **disclaimer** "AI có thể sai".
- [ ] Cài đặt chọn **local preset / BYO key**.

### Luyện tập & ghi nhớ
- [ ] Tích hợp **FSRS**: lên lịch ôn, cập nhật trạng thái thẻ.
- [ ] Màn hình **ôn tập** (active recall).

### Lập kế hoạch & theo dõi
- [ ] **Deadline + lịch học** cơ bản + nhắc nhở.
- [ ] **Sổ điểm** đơn giản (theo môn/loại).
- [ ] **Dashboard tiến độ** per môn — **cây cơ bản** (lớn theo % khái niệm thuộc).

### Vận hành
- [ ] **Preset model theo RAM** trong settings.
- [ ] UI tối giản nhưng hoàn chỉnh cho cả vòng lặp.

**DoD:** Tạo môn → thả tài liệu → notes/thẻ/quiz đã review → ôn FSRS → thấy cây lớn + quản lý deadline/điểm. **Bản đáng để người khác thử.**

---

## Giai đoạn 5 — Dogfooding & Test

- [ ] **Tự dùng** cho chính việc học hằng ngày (≥1–2 tuần).
- [ ] Mời 3–5 người dùng thử, thu phản hồi có cấu trúc.
- [ ] **Unit test:** schema validation, FSRS, parsing.
- [ ] **Integration test:** pipeline lõi.
- [ ] Sửa bug + đo lại chất lượng thẻ/quiz.
- [ ] Viết **README + demo GIF/video 30 giây**.

**DoD:** App ổn định qua dùng thật; có test cho phần lõi; có demo.

---

## Giai đoạn 6 — Pha 2: Đa môn & Tổ chức sâu

- [ ] Nhiều môn / workspace, chuyển ngữ cảnh mượt (nhiều nhánh cây).
- [ ] **Hỏi-đáp RAG khoanh vùng theo môn** (FAISS index theo môn, có trích dẫn).
- [ ] **Knowledge map** per môn (khái niệm + trạng thái: mới/đang học/đã thuộc/cần ôn).
- [ ] **Interleaving** (trộn câu hỏi nhiều chủ đề).
- [ ] **Sơ đồ/mind map bằng Mermaid** (LLM sinh mã, render local).

**DoD:** Quản lý nhiều môn, hỏi-đáp theo môn có trích dẫn, xem knowledge map + sơ đồ.

---

## Giai đoạn 7 — Pha 3: Động lực "Cây" & Cá nhân hóa

- [ ] **Cây phát triển:** lớn theo kết quả học (mastery FSRS), **không** phạt khi nghỉ, có "ngày nghỉ".
- [ ] **Nhắc nhở thông minh** (linh hoạt, không trừng phạt).
- [ ] **Cá nhân hóa rule-based:** tự rải lịch ôn theo deadline + thời gian rảnh + bài chẩn đoán nền.
- [ ] **What-if điểm số** + GPA.
- [ ] **Chế độ ADHD/tiếp cận:** focus timer, phiên ngắn, nút "bắt đầu 10 phút", giao diện ít quá tải, TTS, tương phản/cỡ chữ, giảm chuyển động.

**DoD:** Lớp "cây" thưởng đúng hành vi học; tự sinh lịch ôn; chế độ tiếp cận hoạt động.

---

## Giai đoạn 8 — Pha 4: "NotebookLM-local" mở rộng (tùy chọn)

- [ ] **Audio Overview** (TTS local 2 giọng — Piper/Kokoro).
- [ ] Study guide / briefing / FAQ / timeline.
- [ ] Infographic / data table.
- [ ] **Learning Guide** (gia sư đặt câu hỏi dẫn dắt — Feynman/self-explanation).
- [ ] *(Tùy chọn)* Bridge **tích hợp NotebookLM online** — nhãn rõ "online, dùng Google, không bắt buộc".
- [ ] *(Tùy chọn, nặng)* Sinh **hình ảnh AI local** (SD/Flux) cho máy có GPU.

**DoD:** Bộ đầu ra mở rộng hoạt động; tích hợp online (nếu làm) tách hẳn khỏi lõi.

---

## Giai đoạn 9 — Pha 5: Đánh bóng, Đóng gói & Phân phối (Deploy)

### Hiệu năng & ổn định
- [ ] Tối ưu hiệu năng (ingest/sinh nội dung trên máy yếu).
- [ ] Xử lý lỗi gọn (sidecar crash, model chưa tải, file hỏng).
- [ ] **Onboarding** lần đầu (tải model, chọn preset, hoặc nhập BYO key).

### Đóng gói cross-platform
- [ ] Build binary **Windows / macOS / Linux** trên CI.
- [ ] Đóng gói Python sidecar + dependencies (tránh CUDA hell; pin version).
- [ ] *(Khi sẵn sàng)* **Code signing** Win/macOS.
- [ ] **Auto-update**.

### Phát hành
- [ ] Tài liệu người dùng + tài liệu kỹ thuật.
- [ ] Demo GIF/video, screenshots.
- [ ] **GitHub Release** v0.1 (3 OS).
- [ ] Ra mắt beta: r/Anki, r/LocalLLaMA, r/languagelearning, "Show HN".
- [ ] Xin vào awesome-anki / awesome-selfhosted / awesome-local-llm.

**DoD:** Binary cài-một-lần chạy 3 OS; có onboarding, tài liệu, demo; đã phát hành public.

---

## Xuyên suốt mọi pha (Cross-cutting)

- [ ] **An toàn AI:** grounding + trích dẫn + review-before-trust + disclaimer (từ MVP).
- [ ] **Local-first:** không gửi dữ liệu ra ngoài (trừ BYO-key/online opt-in có nhãn).
- [ ] **Test máy yếu:** mọi tính năng AI test trên preset 3B/Whisper base.
- [ ] **Đo kết quả học, không đo thời gian mở app.**
- [ ] **Pin version** + theo dõi dependency/CUDA.
- [ ] Mỗi pha **ra một bản dùng được trọn vẹn**; ưu tiên một happy path hoàn hảo hơn mười tính năng nửa vời.
- [ ] Giữ README + demo cập nhật.

---

## Giai đoạn 10 — Bảo trì (sau ra mắt)

- [ ] Cập nhật model khi có bản mới tốt hơn.
- [ ] Vá lỗi từ phản hồi cộng đồng.
- [ ] Theo dõi "dependency/CUDA hell".
- [ ] Triage issues/PR.
- [ ] *(Nếu có nhu cầu)* Cân nhắc tier hosted trả phí — chỉ khi doanh thu bù đủ chi phí.

---

*Checklist v1.1 — giai đoạn planning. Dựa trên lộ trình Pha 0–5 trong [`StudyForge_Overview.md`](./StudyForge_Overview.md).*
