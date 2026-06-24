# Arbora — Project Proposal (Đề xuất Dự án Chính thức)

> **Trạng thái tài liệu:** Giai đoạn lập kế hoạch (Planning) — *chưa bắt đầu code*.
> **Tài liệu nền:** Xem [`StudyForge_Overview.md`](./StudyForge_Overview.md) (phân tích & nghiên cứu, v1.0 — "StudyForge" là tên làm việc cũ).
> Tài liệu này **chính thức hóa** các quyết định từ overview thành cam kết dự án.

---

## 0. Thông tin dự án (Project Metadata)

| Trường | Giá trị |
|---|---|
| **Tên sản phẩm** | **Arbora** *(đã chốt — thay cho tên làm việc "StudyForge")* |
| **Một câu mô tả** | Không gian học tập toàn vẹn, local-first, biến tài liệu của trường thành kiến thức được ghi nhớ — riêng tư, miễn phí, không cần internet. |
| **Loại dự án** | Sản phẩm open-source cá nhân/cộng đồng (miễn phí) |
| **Nền tảng** | Desktop app (Windows / macOS / Linux), cài-một-lần |
| **Mô hình vận hành** | Chạy hoàn toàn trên máy người dùng (local-first, offline-capable) |
| **Stack chính thức** | Tauri 2 (Rust core) + **React** (web UI) + Python sidecar (AI) |
| **Lưu trữ** | SQLite + **FAISS** (vector store cho RAG) |
| **Chiến lược AI** | Local mặc định (chia bậc theo RAM) + **BYO cloud key** tùy chọn — *không* server trung tâm |
| **Nguồn lực** | 1 developer (solo, toàn thời gian) |
| **Giấy phép** | **MIT** *(đã chốt)* |
| **Phiên bản proposal** | 1.1 (planning) |
| **Ngày** | 2026-06-22 |

---

## 1. Bản sắc: vì sao là "Arbora" 🌳

Arbora (gốc Latin *arbor* — "cây") đóng khung toàn bộ sản phẩm quanh ẩn dụ **cái cây tri thức lớn dần**. Đây không chỉ là branding — nó là **xương sống cho lớp động lực** và giúp Arbora tránh đúng những cái bẫy gamification mà overview cảnh báo:

| Yếu tố cây | Ý nghĩa trong sản phẩm |
|---|---|
| 🫚 **Gốc rễ** | Nền tảng kiến thức & **thói quen học** (xuất hiện đều, ôn đúng hạn) |
| 🌳 **Thân** | Sự phát triển lâu dài, bền vững — *không học vẹt* |
| 🌿 **Nhánh** | Mỗi nhánh = một môn/kỹ năng |
| 🍃 **Lá / quả** | Khái niệm đã thật sự thành thạo (lấy từ dữ liệu FSRS) |
| ☀️ **AI** | Người làm vườn: chăm sóc, hỗ trợ — không thay người học lớn lên |

**Điểm mấu chốt — cây là cách "gamify đúng" mà overview yêu cầu:**
- Cây lớn theo **kết quả học thật** (số khái niệm đạt mức ghi nhớ), **không** theo "số phút mở app" → tránh *engagement theater*.
- Cây **không chết / không bị phạt** khi bạn nghỉ một ngày (khác hẳn "đứt streak" gây lo âu) → thân thiện ADHD, không dark pattern.
- Hình ảnh cây lớn chậm-mà-chắc tự truyền tải triết lý **ôn ngắt quãng & tích lũy dài hạn**.

→ *Lớp gamification của Arbora chính là sự trực quan hóa tiến bộ này* (xem Trụ 5, Mục 6.4).

---

## 2. Tóm tắt điều hành (Executive Summary)

Arbora là một **desktop app cài-một-lần, chạy hoàn toàn local**, gộp bốn loại công cụ mà học sinh/sinh viên hiện phải dùng rời rạc và phần lớn trên cloud trả phí:

1. **"NotebookLM cho học sinh"** — biến tài liệu (PDF/slide/ghi âm bài giảng) thành ghi chú có cấu trúc, flashcard, quiz, sơ đồ, và trợ lý hỏi-đáp **có trích dẫn nguồn** — nhưng **tự tái tạo local** (LLM + RAG trên máy), không phụ thuộc API ngoài.
2. **Anki/FSRS** — ôn tập ngắt quãng theo khoa học trí nhớ.
3. **Quản lý học tập** — môn học, lịch, deadline, sổ điểm, theo dõi tiến độ.
4. **Động lực & hỗ trợ ADHD** — gamification "cây phát triển" + chế độ tiếp cận, dựa trên bằng chứng.

**Khe hở thị trường:** Không có sản phẩm nào gộp đủ bốn mảng này trong **một desktop app local-first, miễn phí**. Đối thủ (NotebookLM, Quizlet, Knowt…) ở trên cloud và thu phí tính năng lõi; các công cụ open-source khác chỉ là "chat với tài liệu" tổng quát.

**Nguyên tắc thực thi:** Xây theo **lõi → vòng tròn mở rộng** (Pha 0→5), mỗi pha ra một bản *dùng được trọn vẹn*.

---

## 3. Vấn đề & Giải pháp

### 3.1 Vấn đề
- Học sinh/sinh viên ngập trong tài liệu (slide, PDF, ghi âm) nhưng *ghi lại ≠ học*. Hai kỹ thuật mạnh nhất theo khoa học — **gợi nhớ chủ động** và **ôn ngắt quãng** — lại ít được dùng.
- Công cụ tốt thì **trên cloud + paywall + rời rạc**, buộc người học tự ghép và để dữ liệu cá nhân trôi nổi trên máy chủ người khác.

### 3.2 Giải pháp
Một không gian học tập **hợp nhất, local**: thả tài liệu môn học vào → tự sinh notes/thẻ/quiz/sơ đồ **truy về nguồn** → lên lịch ôn theo FSRS → nhắc đúng lúc → theo dõi tiến độ, deadline, điểm — **không gửi dữ liệu đi đâu**.

---

## 4. Định vị & Khác biệt (Positioning & USP)

**Câu định vị:**
> *"Arbora là không gian học tập chạy hoàn toàn trên máy bạn: thả tài liệu của trường vào, nó tự biến thành ghi chú có cấu trúc, thẻ ghi nhớ, quiz và sơ đồ; rồi lên lịch ôn theo khoa học trí nhớ, nhắc bạn đúng lúc, và theo dõi tiến bộ từng môn — riêng tư, miễn phí, không cần internet."*

**USP:** riêng tư trọn vẹn (local-first) + trọn gói cho việc học + thân thiện với người học thật (ADHD/đa phương thức) + ẩn dụ tiến bộ tích cực, không thao túng.

---

## 5. Đối tượng người dùng (Target Users)

**Người dùng chính:** Học sinh THPT & sinh viên đại học, đặc biệt những người: coi trọng quyền riêng tư / mạng yếu; muốn **một** công cụ trọn gói; cần môi trường **thân thiện ADHD**, ít quá tải.

**Personas tham chiếu (sẽ kiểm chứng qua phỏng vấn ở Pha Discovery):**
- *"An" — sinh viên y khoa:* khối lượng khổng lồ, cần độ chính xác cao & ôn tập có hệ thống.
- *"Bình" — sinh viên kỹ thuật có ADHD:* dễ trì hoãn, cần giảm ma sát bắt đầu, phiên ngắn, phản hồi tức thì.
- *"Chi" — học sinh THPT, laptop phổ thông (8GB):* cần preset máy yếu, giao diện đơn giản, miễn phí.

---

## 6. Triết lý, Phạm vi & Yêu cầu phi chức năng

### 6.1 Bốn cột trụ triết lý
- **Local-first & riêng tư:** dữ liệu *không bao giờ rời máy* (trừ khi user chủ động bật tích hợp/BYO-key có nhãn rõ).
- **Dựa trên bằng chứng:** mọi cơ chế học có gốc khoa học nhận thức (recall, spacing, interleaving, dual coding).
- **Grounded & kiểm chứng được:** mọi nội dung AI **truy về nguồn** (trích dẫn + trang/timestamp), có bước review trước khi tin.
- **Bao trùm & tiếp cận được:** thiết kế cho não thật — bao gồm ADHD, người dễ quá tải, học đa giác quan.

### 6.2 Phạm vi MVP (Pha 1) — *trong*
Tạo môn + workspace + thêm nguồn (PDF/slide/audio) → sinh **notes/flashcard/quiz** *có trích dẫn* + **review/edit trước khi lưu** → **ôn FSRS** + active recall → **deadline + lịch** cơ bản + nhắc → **sổ điểm** đơn giản → **dashboard tiến độ** per môn (cây cơ bản) → preset model theo RAM.

### 6.3 Phạm vi pha sau (2→5) — *trong*
Đa môn + RAG khoanh vùng theo môn, knowledge map, interleaving, sơ đồ Mermaid, gamification "cây" & cá nhân hóa rule-based, chế độ ADHD, "NotebookLM-local" mở rộng, đóng gói & phân phối 3 OS.

### 6.4 Ngoài phạm vi (Non-goals — trung thực)
- ❌ **Server API trung tâm miễn phí** (chi phí token không bền vững + phá vỡ local-first + gánh nặng vận hành). → Dùng **local + BYO key** (Mục 7.2). Tier hosted trả phí (nếu có) là quyết định *hậu ra mắt*.
- ❌ **Phụ thuộc API NotebookLM** (không có API công khai). Chỉ là *tích hợp tùy chọn online* ở pha sau.
- ❌ **"Thuật toán phát hiện phong cách học" (VAK)** — neuromyth. Thay bằng đa phương thức + cá nhân hóa theo biến số thật.
- ❌ **Sinh hình ảnh AI nặng (SD/Flux)** trong lõi — hoãn; ưu tiên sơ đồ-bằng-mã (Mermaid).
- ❌ **Tự viết scheduler trí nhớ** — dùng thư viện FSRS.
- ❌ Không phải nguồn chân lý, không thay thầy cô/bạn học.

### 6.5 Yêu cầu phi chức năng (NFRs)
| NFR | Cam kết |
|---|---|
| **Offline** | Toàn bộ lõi chạy không cần internet sau khi tải model. |
| **Riêng tư** | Không telemetry mặc định; nếu có, phải opt-in & ẩn danh. |
| **Hiệu năng (máy yếu)** | Preset 1.5B–3B (Q4) + Whisper tiny/base; *test trên cấu hình yếu là bắt buộc*. |
| **Tiếp cận (a11y)** | Tương phản cao, TTS, cỡ chữ, giảm chuyển động, chế độ tập trung. |
| **An toàn AI** | Xem 6.6 — ưu tiên số 1 từ MVP. |
| **Cross-platform** | Win/macOS/Linux; pin version để tránh "dependency/CUDA hell". |

### 6.6 Cam kết an toàn AI (bắt buộc từ MVP)
1. **Grounding chặt** — chỉ sinh từ tài liệu nguồn.
2. **Structured output** — JSON schema / GBNF.
3. **Trích dẫn trên *mỗi* thẻ & câu quiz** (trang/timestamp).
4. **Review-before-trust** — duyệt trước khi vào deck ôn.
5. **Disclaimer rõ ràng** — "AI có thể sai — hãy kiểm tra."

---

## 7. Stack công nghệ chính thức

> Chi tiết kiến trúc & cấu trúc thư mục: [`Arbora_Developer_Guide.md`](./Arbora_Developer_Guide.md).

### 7.1 Stack lõi
| Lớp | Lựa chọn | Trạng thái |
|---|---|---|
| Vỏ desktop | **Tauri 2** (Rust core) | ✅ chốt |
| UI | **React** | ✅ chốt |
| AI runtime | **Python sidecar** | ✅ chốt |
| Lưu trữ | **SQLite** | ✅ chốt |
| Vector store | **FAISS** | ✅ chốt |
| LLM serving | **Ollama** (hoặc llama.cpp) | ✅ |
| Model | họ Qwen/Gemma 3/Phi-4/Llama (preset RAM) | ⏳ chọn bản cụ thể tại Pha 0 |
| Transcription | faster-whisper / whisper.cpp + VAD | ✅ |
| Embeddings | nomic-embed-text / bge-small | ✅ |
| Sơ đồ | Mermaid.js (render local) | ✅ |
| Flashcard | genanki (.apkg) / AnkiConnect | ✅ |
| Lịch ôn | thư viện **FSRS** | ✅ |
| TTS (pha sau) | Piper / Kokoro | ⏳ |
| Parsing | PyMuPDF/pdfplumber, python-pptx, Tesseract, ffmpeg | ✅ |

### 7.2 Chiến lược Model LLM (quan trọng — giải quyết "máy yếu")
**Provider abstraction 2 tầng**, local-first vẫn là mặc định:

1. **Local mặc định, chia bậc theo phần cứng** (qua Ollama):
   - 🌱 *Máy yếu (~8GB RAM, CPU):* 1.5B–3B Q4 + Whisper tiny/base — chạy được, chậm/chất lượng vừa.
   - 🌿 *Trung bình (16GB):* 7B–8B Q4.
   - 🌳 *Mạnh (32GB+/GPU):* 14B+.
2. **BYO cloud key (opt-in, có nhãn rõ)** — cho máy yếu *hoặc* muốn chất lượng cao: user tự nhập API key (OpenAI / Gemini / Anthropic / OpenRouter / endpoint OpenAI-compatible). **User trả phí, không phải dự án.** Dữ liệu chỉ rời máy khi user chọn.

> **Vì sao không tự dựng server trung tâm:** đốt token = chi phí không bền vững cho app miễn phí; phá vỡ USP local-first; gánh nặng vận hành (auth/abuse/uptime) cho solo dev. Tier hosted trả phí là lựa chọn *hậu ra mắt*, không phải bây giờ.

---

## 8. Lộ trình & Cột mốc (Roadmap — solo, toàn thời gian)

| Pha | Nội dung | Ước lượng | Definition of Done |
|---|---|---|---|
| **0** | Spike xương sống (CLI: tài liệu→LLM→thẻ/quiz .apkg) | 1–2 tuần | Pipeline chạy offline & chất lượng đủ dùng |
| **1** | MVP "một môn, một vòng lặp" | 4–8 tuần | Một học sinh dùng được cho một môn từ A→Z |
| **2** | Đa môn & tổ chức sâu (RAG/môn, knowledge map, Mermaid) | 3–5 tuần | Chuyển ngữ cảnh mượt, hỏi-đáp có trích dẫn |
| **3** | Động lực "cây" & cá nhân hóa (ADHD) | 3–5 tuần | Cây phát triển + rule-based scheduling + chế độ tiếp cận |
| **4** | "NotebookLM-local" mở rộng | 4–8 tuần | Bộ đầu ra học tập mở rộng (tùy chọn) |
| **5** | Đánh bóng & phân phối (3 OS, signing, auto-update) | Liên tục | Binary 3 OS, onboarding, demo, ra mắt beta |

**Checklist thực thi chi tiết:** [`Arbora_Project_Checklist.md`](./Arbora_Project_Checklist.md).

---

## 9. Giấy phép, Phân phối & Quản trị

- **Giấy phép:** **MIT** (đã chốt — tối đa lan tỏa trong cộng đồng học sinh/FOSS).
- **Phân phối:** GitHub Releases (binary 3 OS). Code signing (Win/macOS) — có phí, *trì hoãn được lúc đầu*.
- **Chi phí vận hành:** ~**$0** (hoàn toàn local + open-source). BYO key → user trả phí phần cloud của họ.
- **Mô hình kinh doanh tương lai (tùy chọn, hậu ra mắt):** tier hosted trả phí *nếu* có nhu cầu — doanh thu phải bù đủ chi phí token; không bao giờ là mặc định miễn phí.
- **Cộng đồng & ra mắt:** r/Anki, r/LocalLLaMA, r/languagelearning, Hacker News ("Show HN"), awesome-anki/selfhosted/local-llm. Thông điệp: "**local, miễn phí, riêng tư, cài-một-lần**" + demo 30 giây.
- **Đóng góp:** README + CONTRIBUTING + LICENSE (MIT) + demo từ Pha 1.

---

## 10. Tiêu chí thành công (Success Metrics)

> **Đo kết quả học, không đo "thời gian mở app/streak".**

- **Chất lượng AI:** % thẻ/quiz được chấp nhận không sửa khi review.
- **Kết quả học:** số khái niệm đạt mức ghi nhớ mục tiêu; độ phủ ôn tập đúng hạn FSRS (= cây lớn lành mạnh).
- **Tính dùng được:** hoàn tất "một vòng lặp" không bí.
- **Dogfooding:** chính tác giả dùng được cho việc học hằng ngày.
- **Hiệu năng máy yếu:** pipeline hoàn tất trong ngưỡng chấp nhận trên preset máy yếu.

---

## 11. Rủi ro chính & Giảm thiểu (tóm tắt)

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Phạm vi quá rộng cho solo | Cao | Lõi → mở rộng theo pha; cắt không thương tiếc |
| LLM local hallucinate → dạy sai | Cao | Grounding, trích dẫn từng thẻ, review-before-trust, disclaimer |
| Máy yếu không kham nổi local model | TB | Preset bậc thấp + **BYO key** làm lối thoát |
| Cám dỗ tự dựng server trung tâm | TB | Giữ local + BYO key; tier hosted chỉ là tùy chọn trả phí hậu ra mắt |
| Phụ thuộc NotebookLM | Cao | Tự tái tạo local; chỉ tích hợp tùy chọn |
| "Learning styles" như khoa học | TB | Tái khung: đa phương thức + cá nhân hóa thật + ADHD |
| Gamification gây lo âu | TB | Ẩn dụ "cây" (không phạt, không thao túng, gắn kết quả học) |
| Đóng gói cross-platform / CUDA hell | Cao (vận hành) | whisper.cpp + Ollama, pin version, CI 3 OS, preset máy yếu |
| Bản quyền nội dung tải về | TB | User tự cung cấp file; ghi rõ quyền dùng |

---

*Project Proposal v1.1 — giai đoạn planning. Tên sản phẩm: **Arbora**. Dựa trên [`StudyForge_Overview.md`](./StudyForge_Overview.md).*
