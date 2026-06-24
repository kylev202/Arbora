# Arbora — 10 Personas (Kết quả Pha Discovery / Giai đoạn 1)

> **Trạng thái:** Deliverable của Pha Discovery (xem vòng đời §3.1 trong [`Overview.md`](./Overview.md), bước "phỏng vấn 5–10 sinh viên").
> **Nguồn dữ liệu:** Briefing nghiên cứu hành vi học tập GĐ1 — *"Real-World Study Behaviour Briefing for the 'Arbora' Personas: Australian University Students & Vietnamese International Students"*. Mọi con số neo trong tài liệu này trích từ briefing đó (ghi tắt **[B]**).
> **Quan hệ với Proposal:** Bộ này **kiểm chứng & mở rộng** 3 personas tham chiếu trong [`Project_Proposal.md`](./Project_Proposal.md) §5 (An / Bình / Chi) thành 10 personas có số liệu thật.

---

## 0. Ba archetype (theo briefing GĐ1)

| Nhóm | Bản chất | Validate quyết định Arbora nào | Số persona |
|---|---|---|---|
| **An** | Khối lượng lớn, **đòi hỏi độ chính xác** & grounding (y/luật/kỹ thuật/CPA), sống trong Anki | AI grounded + trích dẫn từng thẻ + review-before-trust (Proposal §6.6); export Anki; một số là **BYO-key power user** | 4 (A1–A4) |
| **Bình** | **Hay trì hoãn** (80–95% SV [B]), ngại bắt đầu, dùng free-tier, mâu thuẫn với streak | Giảm ma sát bắt đầu; gamification "cây" **không phạt** (Proposal §1, §6.4); miễn phí | 3 (B1–B3) |
| **Chi** | **Zero-budget**, RAM 8GB/laptop yếu, offline, lệ thuộc lecture-recording + dịch (trùng du học sinh Việt) | Preset máy yếu 1.5B–3B (Proposal §7.2); offline; transcription + (pha sau) dịch; miễn phí; **không** BYO-key | 3 (C1–C3) |

**Phân bổ theo khuyến nghị briefing:** 3–4 An · 3 Bình · 2–3 Chi → chọn **4 + 3 + 3 = 10**.

---

# Nhóm An — chính xác, khối lượng lớn, grounding

## A1 — Minh · SV Y khoa năm 3 (21t, ĐH Úc, ở KTX)
- **Một dòng:** Sống trong Anki, hàng nghìn thẻ; ghét tạo thẻ thủ công nhưng *không tin* AI bịa.
- **Phần cứng & ngân sách:** Laptop 16GB RAM **[B]** (chuẩn khuyến nghị); sẵn sàng trả tiền cho công cụ **chứng minh được** tiết kiệm thời gian tạo thẻ; đang dùng Anki (free) + thử ChatGPT.
- **Hành vi học:** 40–48 giờ học/tuần ở full-load **[B]**; ôn hằng ngày, daily Anki tương quan điểm USMLE Step 1 cao hơn **[B]**; gần thi thì cày lecture recording (xem 75–100% mỗi bản **[B]**).
- **Mục tiêu:** Phủ hết khối lượng khổng lồ; nhớ lâu, chính xác tuyệt đối; cắt thời gian *làm* thẻ để dành cho *ôn* thẻ.
- **Nỗi đau:** Tạo thẻ thủ công tốn thời gian kinh khủng **[B]**; ChatGPT hallucinate ~40% (vs NotebookLM ~13%) **[B]** → không dám tin cho kiến thức y khoa.
- **AI/privacy/gamification:** Trust > privacy (thực dụng); **đòi grounding + trích dẫn**; gần như **thờ ơ với streak** (động lực nội tại).
- **Câu nói:** *"Một thẻ sai là học thuộc kiến thức sai — tôi phải thấy nó lấy từ trang nào."*
- **→ Arbora phục vụ:** Grounding chặt + **trích dẫn trang/timestamp từng thẻ** + **review-before-trust** (§6.6); sinh thẻ tự động từ tài liệu môn; **export `.apkg`/AnkiConnect** để ôn trên điện thoại (§7.1).

## A2 — Linh · SV Luật năm 4 (22t, đi làm thêm văn phòng luật)
- **Một dòng:** Đọc án lệ hàng giờ; trích dẫn sai = chết, nên cực kỳ nghi ngờ AI tự "chế" vụ án.
- **Phần cứng & ngân sách:** 16GB; free-tier + canh trial trước kỳ thi; coi Quizlet Plus US$35.99/năm là "đắt" **[B]**.
- **Hành vi học:** Khối lượng đọc nặng (ngành đọc nhiều, ít giờ lên lớp **[B]**); tóm tắt + tự kiểm tra; dùng recording để ôn trước thi (~48% tăng dùng khi gần thi **[B]**).
- **Mục tiêu:** Tóm tắt nhanh án lệ/đạo luật **truy về đúng đoạn**; tạo câu hỏi tự kiểm.
- **Nỗi đau:** LLM bịa tên vụ án/điều luật không tồn tại; công cụ cloud không cho kiểm chứng nguồn.
- **AI/privacy/gamification:** Đòi **trích dẫn nguyên văn** (đoạn/trang); thờ ơ streak; thực dụng về privacy.
- **Câu nói:** *"Nếu nó không chỉ được điều luật ở trang nào thì tôi coi như nó đang đoán."*
- **→ Arbora phục vụ:** **Hỏi-đáp RAG khoanh vùng theo môn có trích dẫn** (Proposal §6.3, Pha 2); notes/quiz truy về trang nguồn; review trước khi tin.

## A3 — Đức · SV Kỹ thuật/CS năm 2 (20t, có PC rời GPU)
- **Một dòng:** Power user kỹ thuật — đã chạy Ollama local, muốn **cắm API key riêng** để lấy model xịn & kiểm soát chi phí.
- **Phần cứng & ngân sách:** 32GB + GPU NVIDIA **[B]** (workload kỹ thuật); trả tiền theo *token họ dùng*, không muốn subscription cố định.
- **Hành vi học:** ~20–25 giờ lên lớp/tuần **[B]**; làm bài tập + flashcard công thức; thuộc nhóm 23% dùng GenAI "frequent/very frequent" **[B]**.
- **Mục tiêu:** Chất lượng sinh nội dung cao nhất có thể; tự chủ về model/billing/data-routing **[B]**.
- **Nỗi đau:** Model local nhỏ yếu ở suy luận nhiều bước; bị khóa vào một provider; không kiểm soát được chi phí.
- **AI/privacy/gamification:** Quan tâm **kiểm soát data routing**; muốn chọn model; thờ ơ–trung lập với gamification.
- **Câu nói:** *"BYO API key là yêu cầu tối thiểu cho bất kỳ bộ tích hợp AI nào."* **[B]**
- **→ Arbora phục vụ:** **BYO cloud key opt-in** (OpenAI/Gemini/Anthropic/OpenRouter/endpoint OpenAI-compatible) — *user trả phí, data chỉ rời máy khi user chọn* (Proposal §7.2 tầng 2); preset model bậc cao.

## A4 — Trang · Học viên CPA/Kế toán (25t, đi làm full-time, ôn thi nghề)
- **Một dòng:** Vừa làm vừa ôn thi nghề; khối lượng ghi nhớ lớn, quỹ thời gian cực hẹp → cần lịch ôn tối ưu.
- **Phần cứng & ngân sách:** 16GB laptop công ty/cá nhân; cân nhắc ChatGPT Go US$8/tháng như mức "chấp nhận được", chứ US$20 thì không **[B]**.
- **Hành vi học:** Học rải buổi tối/cuối tuần; mảng "good-intentioned/crammer" **[B]**; cần nhớ lâu cho nhiều môn thi cách nhau.
- **Mục tiêu:** Hệ thống *tự quyết* ôn gì–khi nào để nhớ lâu với ít công nhất; rải lịch ôn quanh ngày thi.
- **Nỗi đau:** Không đủ thời gian; tự xếp lịch ôn thủ công bất khả thi; dễ quên môn thi xa.
- **AI/privacy/gamification:** Trung lập gamification (mục tiêu = đậu); coi trọng hiệu quả/thời gian.
- **Câu nói:** *"Tôi không có thời gian quyết định hôm nay ôn gì — cứ bảo tôi mở cái gì ra ôn."*
- **→ Arbora phục vụ:** **FSRS** quyết định lịch ôn (§7.1); **tự rải phiên ôn quanh deadline/ngày thi** (Trụ 4, Pha 1/3); dashboard "độ ổn định trí nhớ".

---

# Nhóm Bình — trì hoãn, ngại bắt đầu, free-tier

## B1 — Nam · SV Kinh doanh năm 1 (18t, ở nhà với gia đình)
- **Một dòng:** Trì hoãn kinh điển; rào cản lớn nhất là *bắt đầu*; không bao giờ trả US$20/tháng.
- **Phần cứng & ngân sách:** 8–16GB; **chỉ free tier** (ChatGPT free), canh trial 7 ngày trước thi rồi hủy **[B]**.
- **Hành vi học:** Nằm trong nhóm **80–95% SV trì hoãn**; ~64% trì hoãn riêng việc ôn thi **[B]**; đọc lại/xem lại thay vì gợi nhớ chủ động (91% re-read **[B]**).
- **Mục tiêu:** Vượt qua "quán tính bắt đầu"; điểm qua môn mà không phải dựng workflow phức tạp.
- **Nỗi đau:** Mở app lên thấy quá nhiều việc → đóng lại; công cụ tốt thì thu phí tính năng lõi.
- **AI/privacy/gamification:** **Mâu thuẫn với streak** — có lúc tạo động lực, có lúc thấy áp lực; ít quan tâm privacy.
- **Câu nói:** *"Cứ cho tôi một nút 'học 10 phút' là tôi bấm — đừng bắt tôi nghĩ."*
- **→ Arbora phục vụ:** **Giảm ma sát bắt đầu** (nút "Bắt đầu phiên 10 phút"), phiên ngắn (a11y/ADHD, Pha 3); **miễn phí hoàn toàn**; cây lớn theo hành vi học, **không phạt khi nghỉ** (§6.4) → không tạo áp lực streak.

## B2 — Hà · SV Nghệ thuật/KHXH năm 2 (19t, ở trọ chung)
- **Một dòng:** Có động lực nhưng dễ tội lỗi khi "đứt chuỗi"; cần cơ chế tha thứ, không trừng phạt.
- **Phần cứng & ngân sách:** 8–16GB **[B]**; free tools; không trả subscription cố định.
- **Hành vi học:** Khối lượng đọc nặng; hay học dồn gần deadline; từng dùng app có streak và **bỏ vì lo âu/áp lực** ("luôn ở thế cạnh tranh", "chơi chỉ để giữ vị trí, không phải để học" **[B]**).
- **Mục tiêu:** Giữ thói quen đều đặn mà **không** bị guilt khi cuộc sống thật xen vào.
- **Nỗi đau:** Streak/leaderboard tạo lo âu (research Duolingo **[B]**); mất streak → bỏ luôn app.
- **AI/privacy/gamification:** **Nhạy cảm với dark pattern**; thích trực quan hóa tiến bộ tích cực hơn là đếm ngược trừng phạt.
- **Câu nói:** *"Bỏ lỡ một ngày mà app làm tôi thấy như kẻ thất bại thì tôi xóa nó luôn."*
- **→ Arbora phục vụ:** Ẩn dụ **"cây không chết / không bị phạt"** (§1, §6.4); cơ chế tha thứ (ngày nghỉ); gamify *hành vi gây ra việc học*, không phải số phút mở app.

## B3 — Khoa · SV có ADHD (20t, ngành bất kỳ — đại diện hỗ trợ điều hành)
- **Một dòng:** Chức năng điều hành kém; cần phiên ngắn, phản hồi tức thì, giao diện ít quá tải.
- **Phần cứng & ngân sách:** 8–16GB; free tier.
- **Hành vi học:** Khởi động khó, dễ phân tâm; làm tốt khi nhiệm vụ được chia nhỏ + có hẹn giờ; streak có thể **hại** (lo âu mất chuỗi) **[B]**.
- **Mục tiêu:** Bắt đầu được; duy trì tập trung từng đợt ngắn; không bị giao diện làm quá tải.
- **Nỗi đau:** Nhiệm vụ lớn gây tê liệt; UI nhiều thứ cùng lúc gây overwhelm; cơ chế trừng phạt đánh vào đúng điểm yếu.
- **AI/privacy/gamification:** Cần **không-trừng-phạt** tuyệt đối; ghi nhận *nỗ lực* không chỉ kết quả.
- **Câu nói:** *"Tôi không lười — tôi chỉ không bắt đầu nổi nếu mọi thứ hiện ra cùng lúc."*
- **→ Arbora phục vụ:** **Chế độ tập trung + phiên ngắn + chia nhỏ + giảm ma sát bắt đầu**; NFR a11y: tương phản cao, TTS, cỡ chữ, giảm chuyển động (§6.5); cây không phạt (§6.4). *(Pha 3; gắn skill `a11y-adhd`.)*

---

# Nhóm Chi — zero-budget, máy yếu, offline (du học sinh Việt + privacy)

## C1 — Phạm Thị Chi · Du học sinh Việt, Quản trị/Thương mại (21t, Subclass 500)
- **Một dòng:** Ngân sách cực chặt, laptop 8GB cũ, tiếng Anh chưa vững → sống nhờ recording + dịch.
- **Phần cứng & ngân sách:** **Laptop 8GB cũ** (RAM giá tăng 2026, máy phổ thông **[B]**); visa yêu cầu A$29.710 sinh hoạt phí/năm **[B]**; làm 48 giờ/2 tuần ~A$1.900–2.500/tháng **[B]**; **chỉ dùng đồ miễn phí**, Anki free.
- **Hành vi học:** Ngành phổ biến nhất của du học sinh Việt (Management & Commerce) **[B]**; **chỉ nghe được 40–60% bài giảng trực tiếp** → nghe lại recording **[B]**; dùng phần mềm dịch trước khi hỏi **[B]**.
- **Mục tiêu:** Hiểu bài qua recording + bản chép + tóm tắt; học hiệu quả trong quỹ thời gian bị việc làm thêm ăn mòn.
- **Nỗi đau:** Rào cản tiếng Anh; máy yếu không chạy nổi phần mềm nặng; không tiền cho subscription.
- **AI/privacy/gamification:** Ưu tiên **miễn phí + offline + nhẹ RAM**; gamification giúp tạo thói quen (welcome nếu không phạt).
- **Câu nói:** *"Em không hiểu nhiều trên lớp, nên em nghe lại bản ghi."* **[B]**
- **→ Arbora phục vụ:** **Preset máy yếu 1.5B–3B + Whisper tiny/base** (§7.2, NFR hiệu năng §6.5); **transcription bài giảng** → notes/tóm tắt; **offline**; **miễn phí**; *(pha sau)* dịch/đa ngôn ngữ là cơ hội lớn cho cohort này.

## C2 — Tuấn · Du học sinh Việt, IT (22t, ở ghép, làm thêm ~20h/tuần)
- **Một dòng:** Hiểu công nghệ nhưng **không** cắm API key vì *tốn tiền*; chỉ free + offline.
- **Phần cứng & ngân sách:** 8GB (vào sàn tối thiểu **[B]**); zero-budget; **sẽ không BYO key vì chi phí** (khác hẳn A3).
- **Hành vi học:** IT là ngành phổ biến thứ 2 của du học sinh Việt **[B]**; làm bài tập + ôn; lệ thuộc recording khi tiếng Anh chưa theo kịp giảng viên.
- **Mục tiêu:** Công cụ chất lượng chấp nhận được mà **0 đồng**, chạy offline trên máy yếu, đồng bộ với áp lực ROI (chỉ 51,6% cử nhân Việt có việc full-time **[B]**).
- **Nỗi đau:** Mọi công cụ AI tốt đều bắt trả phí; máy không kham model lớn.
- **AI/privacy/gamification:** Chấp nhận chất lượng local "vừa đủ" để khỏi trả phí; trung lập gamification.
- **Câu nói:** *"Em chỉ dùng bản free và canh trial trước kỳ thi."* **[B]**
- **→ Arbora phục vụ:** **Local mặc định miễn phí** (§7.2 tầng 1) — không cần key; chi phí vận hành $0 (§9); chạy được trên 8GB.

## C3 — Emma · SV Úc tài chính eo hẹp & privacy-conscious (20t, laptop budget)
- **Một dòng:** Gen-Z "privacy paradox" — coi trọng riêng tư trên nguyên tắc, ngân sách hẹp → bị hút bởi local-first/offline.
- **Phần cứng & ngân sách:** **Laptop budget 8GB** (xu hướng máy tầm trung quay lại 8GB do thiếu DRAM 2026 **[B]**); free tools.
- **Hành vi học:** Dùng recording (99% đánh giá lecture-capture "essential/very useful" **[B]**); chủ động từ chối cookie, dùng ad-blocker, bỏ brand sau rò rỉ dữ liệu **[B]**.
- **Mục tiêu:** Công cụ học mạnh **không gửi dữ liệu cá nhân lên cloud**; chạy trên máy yếu.
- **Nỗi đau:** Chỉ 21% Gen-Z thoải mái cho dữ liệu train AI **[B]**; 47% cho rằng dev AI cần *xin phép rõ ràng* **[B]**; muốn opt-out AI mà không mất chức năng cơ bản ("privacy-first AI", mạnh ở thị trường Úc **[B]**).
- **AI/privacy/gamification:** **Privacy là yếu tố quyết định**; thích trực quan hóa tiến bộ tích cực.
- **Câu nói:** *"Tôi muốn công cụ thông minh mà dữ liệu của tôi không bao giờ rời máy."*
- **→ Arbora phục vụ:** **Local-first & riêng tư** là USP trung tâm (§4, §6.1); **không telemetry mặc định**, opt-in & ẩn danh (NFR §6.5); offline; preset 8GB.

---

## Ma trận phủ (Persona × tín hiệu briefing GĐ1)

| Tín hiệu / số liệu **[B]** | Persona neo | Quyết định Arbora liên quan |
|---|---|---|
| Anki power user, tạo thẻ thủ công là friction | A1 | Sinh thẻ tự động + export `.apkg` |
| Grounding/trích dẫn (NotebookLM 13% vs ChatGPT 40% hallucinate) | A1, A2 | §6.6 grounding + trích dẫn từng thẻ + review |
| BYO API key power user | A3 | §7.2 BYO key opt-in |
| FSRS / lịch ôn tự động quanh deadline | A4 | FSRS + tự rải phiên ôn |
| Trì hoãn 80–95%, friction-to-start | B1, B3 | Nút "phiên 10 phút", phiên ngắn |
| Streak anxiety / dark pattern | B2, B3 | "Cây không chết / không phạt" (§6.4) |
| ADHD / hỗ trợ điều hành | B3 | NFR a11y + chế độ tập trung (§6.5) |
| 8GB RAM / máy yếu / DRAM 2026 | C1, C2, C3 | Preset 1.5B–3B + Whisper tiny/base (§7.2) |
| ESL 40–60% bài giảng, recording + dịch | C1, C2 | Transcription; dịch (pha sau) |
| Zero-budget, free-tier, không key | B1, C1, C2 | Local miễn phí mặc định, vận hành $0 |
| Privacy-first / không train data | C3 | Local-first, no telemetry mặc định |
| AI adoption 53% ChatGPT / 67% any GenAI | tất cả | Định vị: AI có ích nhưng grounded |
| Ngưỡng chi tiêu (Anki free / Quizlet $35.99 "đắt" / $20 quá tầm / Go $8) | A2, A4, B1, C2 | Miễn phí; BYO-key chỉ cho ai tự nguyện |

---

*Personas v1.0 — Pha Discovery. Suy ra requirements/user stories tại [`Requirements.md`](./Requirements.md).*
