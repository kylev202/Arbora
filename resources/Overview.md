# StudyForge — Nghiên cứu & Phân tích Ứng dụng Học tập Toàn vẹn (Local-first Desktop App)

> **Tài liệu này gồm 5 phần, đúng theo những gì bạn yêu cầu:**
> 1. Phân tích & hoàn thiện ý tưởng (đã rà soát lại toàn bộ tính năng bạn đề xuất)
> 2. Những thứ bạn cần để xây dựng ứng dụng
> 3. Toàn bộ công đoạn phát triển (development lifecycle + lộ trình theo pha)
> 4. Bài giới thiệu sản phẩm chi tiết
> 5. Rủi ro, cảnh báo & khuyến nghị cuối
>
> *Tên "StudyForge" là tên kế thừa từ tài liệu gốc và chỉ là tên làm việc (placeholder). Vì tầm nhìn mới rộng hơn nhiều một công cụ làm flashcard, bạn có thể đổi sang tên phản ánh định vị "hệ điều hành học tập" — ví dụ: **Lumina, Cortex, Scholar, Polymath, Atlas**. Tài liệu giữ tên StudyForge cho nhất quán.*

---

## 0. Tóm tắt điều hành (Executive Summary)

**Ý tưởng cốt lõi rất tốt và đúng xu hướng:** một ứng dụng desktop chạy local, riêng tư, biến tài liệu học của trường thành công cụ học chủ động (notes, flashcard, quiz, sơ đồ, hỏi đáp), cộng thêm quản lý môn học/lịch/deadline/điểm số, và một lớp tạo động lực kiểu Duolingo. Đây thực chất là tham vọng gộp **Notion + Anki + NotebookLM + Duolingo + một app lịch học** vào một sản phẩm cài-một-lần, chạy trên máy người dùng.

**Ba sự thật bạn cần đối diện ngay:**

1. **Đây không phải một dự án "làm xong hết rồi mới ra mắt".** Tầm nhìn đầy đủ là khối lượng nhiều *năm-người* (person-years). Một sinh viên/nhóm nhỏ chỉ thành công nếu **xây một lõi mạnh trước, rồi mở rộng ra ngoài theo pha**, thay vì làm mười tính năng nửa vời cùng lúc. Tài liệu gốc đã cảnh báo điều này — và nó vẫn đúng, chỉ là giờ ta sắp xếp lộ trình rộng hơn.

2. **"Kết nối API với NotebookLM" gần như bất khả thi theo cách bạn hình dung.** NotebookLM **không có API công khai cho người dùng thường**; chỉ có API Enterprise trả phí qua Google Cloud (cần license Gemini Enterprise/Education) — sai hoàn toàn với một app miễn phí, local, cho học sinh. Các "API cộng đồng" chỉ là tự động hóa trình duyệt, dễ vỡ, vi phạm vùng xám điều khoản, và **phá vỡ chính lời hứa "local & riêng tư"** vì dữ liệu vẫn phải gửi lên Google. → Giải pháp: **tự tái tạo các đầu ra của NotebookLM ngay trên máy** (bạn đã có sẵn kế hoạch LLM local + RAG), và chỉ coi NotebookLM là **tích hợp tùy chọn, online, không phải phụ thuộc lõi**.

3. **"Học theo phong cách thị giác/thính giác" (learning styles VAK) là một myth khoa học.** Việc dò "phong cách học" rồi phục vụ nội dung "khớp phong cách" **không có bằng chứng làm tăng kết quả học** (Pashler và cộng sự, 2008, và hàng loạt nghiên cứu sau). → Đừng bán tính năng đó như một thuật toán "phát hiện kiểu học của bạn". Thay vào đó hãy làm hai thứ *có* bằng chứng: (a) **nội dung đa phương thức** (chữ + hình + âm thanh — dual coding có lợi cho *mọi người*), và (b) **cá nhân hóa theo biến số thật**: kiến thức nền, mục tiêu, quỹ thời gian, và **hỗ trợ điều hành/ADHD**. ADHD là chuyện có thật và có thể hỗ trợ bằng bằng chứng — hãy biến nó thành điểm khác biệt thực sự, nhưng gọi đúng tên: *hỗ trợ chức năng điều hành & khả năng tiếp cận*, không phải "kiểu học".

**Khuyến nghị tổng:** Xây — nhưng theo **lõi → vòng tròn mở rộng**. Lõi (Phase 1–2) là "ingest tài liệu trường → notes/flashcard/quiz/hỏi đáp + lịch học + deadline + điểm số", tất cả local. Lớp gamification, cá nhân hóa, sơ đồ/hình ảnh, audio overview, đa-môn nâng cao là các pha sau. Cắm cờ chất lượng & an toàn AI ngay từ MVP (mọi thẻ/quiz phải truy về nguồn + có nút review).

---

# PHẦN 1 — PHÂN TÍCH & HOÀN THIỆN Ý TƯỞNG

## 1.1 Bạn đang thực sự mô tả điều gì (kiểm tra phạm vi)

Gộp lại, danh sách tính năng của bạn rơi vào **5 trụ cột**, và mỗi trụ cột vốn là một loại sản phẩm riêng:

| Trụ cột | Tính năng bạn nêu | Tương đương thị trường | Độ khó kỹ thuật |
|---|---|---|---|
| **A. Tổ chức & Lưu trữ** | Quản lý môn học, workspace riêng từng môn, quản lý kiến thức đã học | Notion / Obsidian | Dễ–Trung bình (CRUD + cấu trúc dữ liệu) |
| **B. Hiểu & Sinh nội dung** | Tạo bài giảng từ tài liệu trường, flashcard, quiz, sơ đồ, hình ảnh, hỏi đáp — "giống NotebookLM" | NotebookLM | **Khó** (LLM local + RAG + chất lượng/an toàn) |
| **C. Luyện tập & Ghi nhớ** | Spaced repetition, active recall, các phương pháp học nổi tiếng | Anki | Trung bình (FSRS đã có sẵn) |
| **D. Lập kế hoạch & Theo dõi** | Lịch học, deadline, điểm số, track progress từng môn | Todoist + sổ điểm + analytics | Dễ–Trung bình (CRUD + thống kê) |
| **E. Cá nhân hóa & Động lực** | Phương pháp học tương thích từng người, ADHD/đa phương thức, nhắc nhở kiểu Duolingo | Duolingo + adaptive learning | **Khó nếu làm "thật"**, dễ nếu làm lớp UX |

**Hệ quả thực tế:** Cụm A và D là phần "dễ" (chiếm phần lớn cảm giác "đầy đủ" của app nhưng tốn ít rủi ro kỹ thuật). Cụm B là phần "khó và tốn não nhất" — đồng thời là **điểm khác biệt sống còn**. Cụm C đã có thư viện chín (đừng phát minh lại). Cụm E nếu làm như một thuật toán "adaptive thực thụ" thì rất khó và dễ thành lời hứa rỗng; nếu làm như **một lớp UX thông minh + quy tắc đơn giản** thì khả thi và vẫn rất hấp dẫn.

→ **Nguyên tắc vàng:** Đừng cố làm cả 5 trụ cột ở mức "đầy đủ" cùng lúc. Hãy chọn **một vòng lặp hoàn chỉnh** (một học sinh có thể dùng từ A→Z cho *một môn*) làm MVP, rồi đắp dày.

## 1.2 Định vị sản phẩm sau khi tinh chỉnh

**Một câu định vị:**
> *"StudyForge là không gian học tập chạy hoàn toàn trên máy bạn: thả tài liệu của trường vào, nó tự biến thành ghi chú có cấu trúc, thẻ ghi nhớ, quiz và sơ đồ; rồi lên lịch ôn theo khoa học trí nhớ, nhắc bạn đúng lúc, và theo dõi tiến bộ từng môn — riêng tư, miễn phí, không cần internet."*

**Bốn cột trụ triết lý (đây là thứ làm nên bản sắc, đối thủ cloud khó copy):**
- **Local-first & riêng tư:** tài liệu, ghi âm bài giảng, điểm số của bạn *không bao giờ rời máy*. Đây là USP trung tâm — đặc biệt mạnh ở thị trường giáo dục (lo ngại quyền riêng tư của học sinh) và vùng mạng yếu.
- **Dựa trên bằng chứng (evidence-based):** mọi cơ chế học (recall, spacing, interleaving, dual coding) đều có gốc khoa học nhận thức, không phải gimmick.
- **Grounded & kiểm chứng được:** mọi nội dung AI sinh ra đều truy về nguồn gốc (trích dẫn + timestamp/trang), có bước review trước khi "tin".
- **Bao trùm & tiếp cận được (inclusive):** thiết kế cho não thật của người học thật — bao gồm người có ADHD, người dễ quá tải, người học bằng nhiều giác quan.

## 1.3 Phân tích từng cụm tính năng: Giữ / Tái khung / Hoãn

### A. Quản lý môn học, workspace riêng từng môn, quản lý kiến thức — **GIỮ (lõi)**
- **Đánh giá:** Đây là "xương sống tổ chức" và là phần dễ nhưng giá trị cao về trải nghiệm. Mỗi môn là một *workspace* chứa: nguồn tài liệu, notes, deck flashcard, quiz, sơ đồ, lịch ôn, điểm, và một trợ lý hỏi-đáp chỉ biết về môn đó (RAG khoanh vùng theo môn — y hệt cách NotebookLM tách notebook theo chủ đề để câu trả lời không lẫn).
- **"Quản lý kiến thức đã học"** nên hiện thực dưới dạng: (1) **knowledge map** per môn (các khái niệm đã học, liên kết, mức độ thành thạo dựa trên dữ liệu ôn tập); (2) trạng thái từng khái niệm: *mới / đang học / đã thuộc / cần ôn*. Dữ liệu này lấy *miễn phí* từ chính hệ spaced repetition — bạn không cần người dùng tự khai báo.

### B. "Tạo bài giảng từ tài liệu trường" + flashcard/quiz/sơ đồ/hỏi đáp giống NotebookLM — **GIỮ (lõi khác biệt) nhưng làm local**
- **Đây là trái tim sản phẩm.** Pipeline: tài liệu (PDF/slide/ghi âm bài giảng/video) → trích xuất/transcribe → LLM local sinh notes có cấu trúc + flashcard + quiz + sơ đồ → xuất/ôn.
- **Để bằng được "giống NotebookLM"**, đây là bộ đầu ra NotebookLM đang có năm 2026 mà bạn nên coi là *bản đồ tính năng tham chiếu* (không phải tất cả phải làm ngay): tóm tắt có trích dẫn (RAG Q&A), study guide, briefing doc, FAQ, timeline, **flashcard** (kèm giải thích, chỉnh số lượng/độ khó), **quiz trắc nghiệm** (có gợi ý + giải thích đáp án sai), **mind map** (node bấm được, truy về nguồn), **infographic**, **slide deck**, **data table**, **Audio Overview** (podcast 2 người dẫn), **Video Overview** (video thuyết minh), và **Learning Guide** (gia sư đặt câu hỏi dẫn dắt).
- **Quan trọng — phân biệt "sơ đồ" và "hình ảnh":**
  - **Sơ đồ (diagram/mind map):** KHÔNG cần AI sinh ảnh. Hãy để LLM xuất ra **mã sơ đồ** (Mermaid.js / PlantUML / cấu trúc JSON) rồi **render bằng thư viện** ngay trên máy. Cách này nhẹ, không cần GPU, *chính xác và sửa được*. Đây đúng là cách NotebookLM làm mind map (cấu trúc, không phải ảnh AI).
  - **Hình ảnh AI thật (sinh tranh minh họa):** cần Stable Diffusion/Flux chạy local → **nặng** (GPU khá, model lớn, chậm trên máy yếu) và **dễ sai về mặt học thuật** (ảnh minh họa AI hay bịa chi tiết). → **Hoãn** sang pha sau, đặt là tính năng "nâng cao/tùy chọn", không phải lõi. Ưu tiên ban đầu: sơ đồ-bằng-mã + lấy lại hình có sẵn trong tài liệu gốc.
- **Rủi ro lõi (đọc kỹ mục 5):** LLM nhỏ chạy local *hallucinate* — sinh thẻ/quiz sai dạy kiến thức sai (cực nguy hiểm với y khoa, công thức toán). Bắt buộc: **grounding chặt vào nguồn** (không cho bịa ngoài tài liệu) + **trích dẫn trên từng thẻ** + **review-before-trust** + disclaimer rõ ràng.

### C. Spaced repetition + active recall + "các phương pháp học nổi tiếng" — **GIỮ, nhưng đừng phát minh lại**
- **Spaced repetition:** dùng **FSRS** (thuật toán Anki dùng mặc định từ 11/2023, giảm ~20–30% số lần ôn ở cùng mức ghi nhớ theo benchmark cộng đồng — hãy trình bày như "bằng chứng mạnh nhưng vẫn có tranh luận về phương pháp đo"). Có sẵn thư viện FSRS — **đừng tự viết scheduler**.
- **Các phương pháp học nổi tiếng có bằng chứng** nên tích hợp như *chế độ/feature*, không chỉ là chữ:
  - *Active recall / testing effect:* lõi của flashcard & quiz (retrieval > đọc lại — Karpicke & Roediger 2008).
  - *Spacing:* lịch ôn FSRS.
  - *Interleaving:* trộn câu hỏi nhiều chủ đề/môn trong một phiên ôn.
  - *Elaboration & self-explanation:* nút "Giải thích vì sao" sau mỗi thẻ.
  - *Dual coding:* mỗi khái niệm kèm cả chữ và sơ đồ/hình.
  - *Feynman technique:* chế độ "giảng lại cho AI nghe", AI phát hiện chỗ bạn nói mơ hồ.
  - *Pomodoro / focus timer:* phiên học có hẹn giờ (đặc biệt hợp ADHD).
  - *Cornell notes / outline:* định dạng note có cấu trúc.
- **Cảnh báo trung thực:** một số "phương pháp nổi tiếng" (learning styles VAK, "thuyết trí thông minh đa dạng" áp dụng kiểu ghép-modality) **không có bằng chứng**. Đừng đưa vào như khoa học. (Xem 1.4.)

### D. Lịch học, deadline, điểm số, track progress — **GIỮ (lõi, phần "dễ" tạo cảm giác đầy đủ)**
- **Quản lý deadline & lịch học:** CRUD + lịch + nhắc nhở. Giá trị tăng vọt nếu **tự sinh lịch ôn**: khi bạn thêm một deadline (bài kiểm tra ngày X), app tự rải các phiên ôn spaced trước ngày đó cho đúng các khái niệm của môn đó. Đây là chỗ các trụ cột C+D giao nhau và tạo ra "wow".
- **Quản lý điểm số:** sổ điểm theo môn, theo loại (kiểm tra/bài tập/giữa kỳ/cuối kỳ), hỗ trợ tính GPA, tính "cần bao nhiêu điểm bài cuối để đạt mục tiêu" (what-if). Đây là tính năng học sinh *cực thích* và rất dễ làm.
- **Track progress từng môn:** dashboard mỗi môn: % khái niệm đã thuộc, độ ổn định trí nhớ trung bình, streak ôn tập, deadline sắp tới, điểm xu hướng. Nguồn dữ liệu lấy từ chính hệ ôn tập + sổ điểm — *không cần người dùng nhập tay*.

### E. Cá nhân hóa, ADHD/đa phương thức, gamification kiểu Duolingo — **TÁI KHUNG (đây là phần dễ làm sai nhất)**
- **Cá nhân hóa "tương thích từng người":** đừng hứa "AI hiểu kiểu học của bạn". Hãy cá nhân hóa theo **biến số đo được**: thời gian rảnh trong ngày, deadline, kiến thức nền (qua một bài kiểm tra chẩn đoán ngắn), mục tiêu điểm, và **sở thích trải nghiệm** (thích học buổi sáng? thích phiên 15 phút? thích nghe hơn đọc?). Lúc đầu dùng **luật đơn giản (rule-based)** — đã đủ hữu ích — rồi mới cân nhắc mô hình thích nghi sau.
- **ADHD & khả năng tiếp cận — biến thành điểm khác biệt thật:** đây là hỗ trợ *có bằng chứng* (khác hẳn learning styles). Các cơ chế: phiên học ngắn có hẹn giờ; "body doubling"/focus mode; *giảm ma sát* khi bắt đầu (một nút "Bắt đầu phiên 10 phút"); chia nhỏ nhiệm vụ lớn; phản hồi tức thì; nhắc nhở **linh hoạt, không trừng phạt**; chế độ giao diện ít gây quá tải (ẩn bớt, tập trung một việc); ghi nhận nỗ lực thay vì chỉ kết quả. Cũng nên có: chế độ tương phản cao, đọc to (TTS), cỡ chữ, giảm chuyển động.
- **Đa phương thức (multi-modal):** cung cấp *cùng một nội dung* ở nhiều dạng (đọc / nghe audio overview / nhìn sơ đồ / làm quiz). Đây là **dual coding** — có lợi cho mọi người. Để người dùng *chọn* dạng họ thích vì lý do động lực & tiếp cận, **không** vì niềm tin sai rằng nó làm họ "học giỏi hơn theo kiểu não".
- **Gamification kiểu Duolingo — dùng đúng, tránh dark pattern:** Cơ chế của Duolingo (streak, XP, league, "tim", thông báo đẩy, phần thưởng biến thiên) *rất mạnh* về giữ chân. Nhưng với một công cụ học thật, áp dụng sai sẽ phản tác dụng: học sinh "cày XP/streak" thay vì học, lo âu khi mất streak (đặc biệt hại với người ADHD). → **Quy tắc:** chỉ gamify các *hành vi gây ra việc học* (xuất hiện đều, làm phiên recall, ôn đúng hạn FSRS) chứ không phải số phút mở app; thưởng gắn với hành động có bằng chứng; "đừng làm đứt chuỗi" + nhắc nhẹ + trực quan hóa tiến bộ; **không** dùng cơ chế gây tội lỗi/thao túng; cho phép "streak freeze"/ngày nghỉ để không trừng phạt cuộc sống thật.

## 1.4 Bốn điểm cần đính chính (quan trọng nhất trong tài liệu này)

**(1) NotebookLM không có API công khai — đừng phụ thuộc vào nó.**
Tình trạng tháng 6/2026: chỉ có **NotebookLM Enterprise API** qua Google Cloud (cần dự án Google Cloud + license Gemini Enterprise/Education Premium) — không phù hợp app miễn phí/local cho học sinh. API Podcast độc lập đã *deprecated*, Google không nhận khách mới. API cho người dùng thường đã được Google "hứa" nhưng *chưa ra mắt* (không beta, không waitlist, không mốc thời gian). Có thư viện cộng đồng (ví dụ `notebooklm-py`, ~5.6k★) nhưng nó **tự động hóa trình duyệt** → dễ vỡ khi Google đổi giao diện, nằm trong vùng xám điều khoản, cần đăng nhập Google của người dùng, và **mâu thuẫn trực tiếp với lời hứa "local & offline"** vì dữ liệu vẫn đi lên cloud Google.
→ **Khuyến nghị:** *Tự tái tạo* các đầu ra NotebookLM trên máy (LLM local + RAG — bạn đã có kế hoạch). Coi NotebookLM là **tích hợp tùy chọn ở chế độ online** (ví dụ: nút "Mở/đồng bộ sang NotebookLM" hoặc "nhập nội dung từ một notebook") — gắn nhãn rõ "tính năng online, dùng Google, không bắt buộc". Không bao giờ để nó thành phụ thuộc lõi.

**(2) "Learning styles" (thị giác/thính giác/vận động) là neuromyth.**
"Meshing hypothesis" — khớp cách dạy với "kiểu học" sẽ học tốt hơn — **không có bằng chứng** (Pashler, McDaniel, Rohrer & Bjork, 2008, *Psychological Science in the Public Interest*; và nhiều nghiên cứu sau như Husmann & O'Loughlin, 2019). Người ta *có* sở thích (điều này thật), nhưng phục vụ theo sở thích đó **không làm tăng kết quả học**. Thứ *có* bằng chứng cho **mọi** người học: active recall, spaced repetition, interleaving, elaboration, **dual coding** (kết hợp chữ + hình).
→ **Khuyến nghị:** Bỏ ý tưởng "thuật toán phát hiện kiểu học". Thay bằng: (a) nội dung đa phương thức cho tất cả; (b) cá nhân hóa theo biến số thật (kiến thức nền, thời gian, mục tiêu, nhu cầu điều hành/ADHD); (c) để người dùng chọn dạng trình bày vì *động lực & tiếp cận*. Nếu vẫn muốn dùng từ "phong cách học" trong marketing, hãy định nghĩa lại nó là "sở thích trình bày" — và đừng tuyên bố nó cải thiện điểm số.

**(3) Chất lượng & an toàn của AI local là rủi ro số một, không phải tính năng phụ.**
Model 3B–14B chạy trên máy người dùng kém hơn cloud rõ rệt ở suy luận nhiều bước và *dễ hallucinate*. Trong giáo dục, một flashcard sai = học thuộc kiến thức sai. → Thiết kế an toàn ngay từ MVP: grounding chặt (chỉ sinh từ nội dung nguồn), structured output có schema (JSON/GBNF), few-shot prompt, trích dẫn + timestamp/trang trên *mỗi* thẻ và quiz, **bắt buộc bước review trước khi đưa vào deck ôn**, và disclaimer "AI có thể sai — hãy kiểm tra". Không quảng cáo app như nguồn chân lý.

**(4) Gamification có thể gây hại nếu tối ưu sai chỉ số.**
Tối ưu cho "thời gian mở app/streak" dễ tạo *engagement theater* và lo âu. → Tối ưu cho **kết quả học** (số khái niệm đạt mức ghi nhớ mục tiêu, độ phủ ôn tập đúng hạn). Gamify hành vi đúng, cho phép nghỉ, không thao túng.

## 1.5 Đối thủ & khe hở (ngắn gọn)

- **NotebookLM, Quizlet, Knowt, Revisely, StudyFetch...**: mạnh nhưng **cloud + paywall** các tính năng cốt lõi.
- **Open-source nhưng không offline-first/không chuyên học sinh:** Open Notebook (~25.6k★), AnythingLLM (~62k★), Khoj (~35k★) — tổng quát "chat with docs", không phải bộ công cụ học sinh đầy đủ.
- **PageLM (~1.7k★):** gần nhất về phạm vi "study material → quiz/flashcard/notes/podcast", hỗ trợ Ollama local, nhưng là web app, không phải **desktop local-first** + không có lớp lịch/điểm/gamification.
- **Khe hở của bạn:** **không có** một desktop app cài-một-lần, chạy hoàn toàn local, kết hợp *(NotebookLM-cho-học-sinh) + (Anki/FSRS) + (quản lý môn/lịch/deadline/điểm) + (gamification & hỗ trợ ADHD)*. Đó là vùng đất trống — nhưng cũng là lý do phải làm theo pha (vì nó rộng).

---

# PHẦN 2 — NHỮNG THỨ BẠN CẦN ĐỂ XÂY DỰNG

## 2.1 Kỹ năng (và lộ trình học nếu bạn là sinh viên solo)

| Nhóm kỹ năng | Cần để làm gì | Mức cần thiết |
|---|---|---|
| **Lập trình ứng dụng** (1 ngôn ngữ chính: TypeScript/JS, Python, hoặc Rust) | Toàn bộ app | Bắt buộc |
| **Front-end / UI** (HTML/CSS + một framework: React/Svelte/Vue) | Giao diện desktop | Bắt buộc |
| **Thiết kế dữ liệu local** (SQLite, schema) | Lưu môn/notes/thẻ/điểm/lịch | Bắt buộc |
| **AI engineering thực chiến** (chạy LLM local, prompt engineering cho structured output, RAG, embeddings) | Cụm B (lõi khác biệt) | Bắt buộc cho lõi AI |
| **Xử lý media** (ffmpeg, Whisper, PDF/slide parsing) | Ingest tài liệu | Cần cho pipeline |
| **Đóng gói & phân phối cross-platform** | Cài-một-lần trên Win/Mac/Linux | Cần khi ra mắt (khó nhất về vận hành) |
| **UX & hiểu biết khoa học học tập cơ bản** | Để các tính năng "đúng" chứ không gimmick | Rất nên có |

**Thực tế cho người mới:** Bạn không thể thành thạo tất cả cùng lúc — và không cần. Trợ lý lập trình AI (ví dụ Claude Code) rút ngắn đáng kể đường cong, nhưng bạn vẫn cần *hiểu* kiến trúc để không tạo ra mớ hỗn độn không bảo trì nổi. Hãy học theo *just-in-time*: học đúng cái pha hiện tại cần.

## 2.2 Bộ công nghệ đề xuất (stack)

> Mọi lựa chọn dưới đây ưu tiên **ít phụ thuộc, local-first, chạy được trên máy yếu**.

**Vỏ ứng dụng desktop (chọn 1):**
- **Tauri 2** *(khuyến nghị cho bản chính thức)* — lõi Rust + UI web, binary nhẹ, bảo mật tốt. Thường ghép với một "sidecar" Python để chạy AI.
- **Electron** — dễ làm hơn, hệ sinh thái lớn, nhưng nặng (đóng gói cả Chromium).
- **Python + Flet/PySide** *(khuyến nghị cho MVP nhanh nhất nếu bạn rành Python)* — vì toàn bộ hệ AI (Whisper, embeddings, genanki) đều ở Python, đi thuần Python giảm độ phức tạp tích hợp ở giai đoạn đầu.

**Lưu trữ:** **SQLite** (toàn bộ dữ liệu local) + **sqlite-vec / FAISS / Chroma** cho vector (RAG).

**Lõi AI (chạy local):**
- **LLM serving:** **Ollama** (đơn giản nhất) hoặc llama.cpp.
- **Model:** một model nhỏ mạnh *hiện hành tại thời điểm build* — họ **Qwen (Qwen2.5/Qwen3), Gemma 3, Phi-4, Llama** — với preset theo RAM: 3B–4B (Q4) ~2–3GB RAM cho máy yếu; 14B cần ~8–10GB+. (Hãy thử nghiệm chọn model tốt nhất tại thời điểm bạn làm, vì model mới ra liên tục.)
- **Transcription:** **faster-whisper** (nhanh trên NVIDIA) hoặc **whisper.cpp** (chạy mọi nơi kể cả CPU/Apple Silicon, không cần CUDA). Bật VAD để tránh hallucinate khi im lặng.
- **Embeddings:** nomic-embed-text / bge-small.
- **Structured output:** JSON schema / GBNF grammar (llama.cpp) để thẻ/quiz ra ổn định.

**Sinh đầu ra học tập:**
- **Sơ đồ/mind map:** **Mermaid.js** (render local; LLM xuất mã Mermaid).
- **Flashcard/Anki:** **genanki** (xuất `.apkg`) và/hoặc **AnkiConnect** (đẩy thẳng vào Anki).
- **Lịch ôn:** thư viện **FSRS**.
- **Audio Overview (TTS local):** Piper / Kokoro (chất lượng khá, miễn phí, offline) — lưu ý không bằng giọng cloud; đặt là tính năng pha sau.
- **Hình ảnh AI (tùy chọn, nặng):** Stable Diffusion/Flux qua ComfyUI — chỉ pha nâng cao.

**PDF/slide/scan:** PyMuPDF/pdfplumber (PDF), python-pptx (slide), Tesseract (OCR scan), ffmpeg + yt-dlp (audio/video — lưu ý bản quyền/ToS với nội dung tải về).

## 2.3 Phần cứng

- **Máy dev:** RAM ≥ 16GB (32GB lý tưởng), **có GPU NVIDIA** càng tốt để thử model lớn & transcription nhanh. Apple Silicon cũng rất ổn cho whisper.cpp + model nhỏ.
- **Nguyên tắc thiết kế:** *test trên cấu hình yếu*. Cung cấp preset "máy yếu" (Whisper tiny/base + LLM 3B) để app không loại trừ học sinh dùng laptop phổ thông.

## 2.4 Chi phí (tiền)

- **Phát triển:** gần **$0** nếu đi hoàn toàn local + open-source (không tốn phí API). Đây là một lợi thế chiến lược lớn: chi phí vận hành = 0, không lo hóa đơn token khi nhiều người dùng.
- **Phân phối:** chứng chỉ ký mã (code signing) — Windows/macOS có phí (vài chục–trăm USD/năm) để app không bị cảnh báo "untrusted". Có thể trì hoãn lúc đầu.
- **Tùy chọn cloud:** nếu sau này thêm "BYO cloud key" (người dùng tự nhập key OpenAI/Gemini khi muốn chất lượng cao hơn) thì *họ* trả phí, không phải bạn.

## 2.5 Kiến thức nền nên đọc

- **Khoa học học tập:** "Make It Stick" (Brown, Roediger, McDaniel); tổng quan Pashler et al. (2008) về learning styles; tài liệu về FSRS/Anki.
- **Kỹ thuật:** docs của Tauri/Electron, Ollama, faster-whisper, genanki, FSRS; tài liệu về RAG & prompt engineering cho structured output.

---

# PHẦN 3 — TOÀN BỘ CÔNG ĐOẠN PHÁT TRIỂN

> Hai góc nhìn lồng nhau: **(I) Vòng đời phát triển chuẩn (làm gì ở mỗi giai đoạn)** và **(II) Lộ trình tính năng theo pha (xây cái gì trước)**.

## 3.1 Vòng đời phát triển (làm tuần tự, lặp lại ở mỗi pha)

1. **Khám phá & khoanh vùng (Discovery):** Chốt MVP. Phỏng vấn 5–10 học sinh/sinh viên thật về cách họ học, đau ở đâu. Viết một câu định vị. Định nghĩa "vòng lặp hoàn chỉnh" tối thiểu.
2. **Thiết kế (Design):** Vẽ luồng người dùng (user flows) cho vòng lặp đó. Thiết kế **mô hình dữ liệu** (môn, nguồn, note, thẻ, quiz, lịch, điểm, tiến độ). Thiết kế **kiến trúc** (app shell ↔ AI sidecar ↔ SQLite ↔ vector store). Dựng **design system** đơn giản (màu, typography, component) — ưu tiên giao diện *bình tĩnh, ít quá tải* (tốt cho ADHD).
3. **Dựng môi trường & khung (Skeleton):** Repo + version control + CI. Dựng app shell chạy được "hello world", kết nối SQLite, dựng được Ollama + một model, transcribe được một file mẫu.
4. **Spike phần khó trước (Prove the risk):** Trước khi xây UI đẹp, *chứng minh* pipeline lõi chạy: `audio/PDF → transcript/text → LLM local (structured JSON) → flashcard/quiz có trích dẫn → xuất .apkg`. Nếu phần này không đạt chất lượng chấp nhận được, mọi thứ khác vô nghĩa — phải biết sớm.
5. **Xây MVP (một vòng lặp hoàn chỉnh):** Ghép pipeline + UI tối giản + review thẻ + lịch ôn FSRS + một dashboard tiến độ cơ bản. Đây là phiên bản *một học sinh dùng được cho một môn*.
6. **Dogfooding & test:** Tự dùng cho chính việc học của bạn mỗi ngày (dogfooding là test tốt nhất). Mời vài người dùng thử. Sửa lỗi, đo chất lượng thẻ/quiz.
7. **Đắp tính năng theo pha (Iterate):** Lặp lại bước 2–6 cho từng pha bên dưới.
8. **Cá nhân hóa & gamification:** Thêm lớp luật cá nhân hóa + cơ chế động lực (sau khi lõi học đã vững).
9. **Đánh bóng, đóng gói, phân phối:** Tối ưu hiệu năng, đóng gói binary 3 OS, (code signing), auto-update.
10. **Ra mắt beta có chủ đích:** Launch ở cộng đồng đúng (xem 3.3), thu phản hồi, lặp.
11. **Bảo trì:** Cập nhật model, vá lỗi, theo dõi "dependency/CUDA hell" — gánh nặng vận hành lớn nhất của loại app này.

## 3.2 Lộ trình tính năng theo pha (xây gì trước)

**Pha 0 — Spike xương sống (1–2 tuần).**
CLI thuần: `tài liệu → faster-whisper/parser → Ollama (structured JSON) → flashcard/quiz + genanki .apkg`. Mục tiêu: chứng minh chạy offline & chất lượng đủ dùng.

**Pha 1 — MVP "một môn, một vòng lặp" (4–8 tuần).** *Đây là phiên bản đáng để dùng & cho người khác thử.*
- Tạo môn + workspace + thêm nguồn (PDF/slide/audio).
- Sinh **notes có cấu trúc + flashcard + quiz**, *có trích dẫn nguồn* + **review/edit trước khi lưu**.
- **Ôn tập theo FSRS** + active recall.
- **Quản lý deadline + lịch học** cơ bản + nhắc nhở.
- **Sổ điểm** đơn giản.
- **Dashboard tiến độ** per môn (cơ bản).
- UI tối giản, preset model theo RAM.

**Pha 2 — Đa môn & tổ chức sâu (3–5 tuần).**
- Nhiều môn, nhiều workspace, chuyển ngữ cảnh mượt.
- **Hỏi-đáp RAG khoanh vùng theo môn** (trợ lý chỉ biết về môn đó, có trích dẫn).
- **Knowledge map** per môn (khái niệm + trạng thái thành thạo).
- Interleaving (trộn câu hỏi nhiều chủ đề).
- **Sơ đồ/mind map bằng Mermaid** (LLM sinh, render local).

**Pha 3 — Lớp động lực & cá nhân hóa (3–5 tuần).**
- **Gamification "đúng cách"** (streak hành vi học, XP gắn hành động có bằng chứng, không dark pattern, có streak-freeze).
- **Nhắc nhở thông minh** (kiểu Duolingo nhưng linh hoạt, không trừng phạt).
- **Cá nhân hóa rule-based:** tự rải lịch ôn theo deadline + thời gian rảnh + bài chẩn đoán nền.
- **Chế độ hỗ trợ ADHD/tiếp cận:** focus timer, phiên ngắn, giảm ma sát bắt đầu, giao diện ít quá tải, TTS, tương phản/cỡ chữ.

**Pha 4 — "NotebookLM local" mở rộng (4–8 tuần, tùy chọn theo nhu cầu).**
- **Audio Overview** (TTS local 2 giọng), study guide/briefing/FAQ/timeline, infographic/data table, **Learning Guide** (gia sư đặt câu hỏi dẫn dắt — Feynman/self-explanation).
- *(Tùy chọn)* **Tích hợp NotebookLM online** dưới dạng bridge có nhãn rõ ràng (không phải lõi).
- *(Tùy chọn, nặng)* **Sinh hình ảnh AI local** (SD/Flux) cho người có GPU.

**Pha 5 — Đánh bóng & phân phối (liên tục).**
- Binary 3 OS, code signing, auto-update, onboarding, demo GIF/video, tài liệu, awesome-lists, "Show HN".

**Nguyên tắc xuyên suốt:** mỗi pha phải ra một bản *dùng được trọn vẹn*; ưu tiên một "happy path" hoàn hảo hơn mười tính năng nửa vời; README + demo ngay từ Pha 1.

## 3.3 Ra mắt & cộng đồng

Nhắm cộng đồng pro-FOSS, ý thức riêng tư, đã quen workflow học chủ động: r/Anki, r/medicalschool(anki), r/languagelearning, r/LocalLLaMA, Hacker News ("Show HN"), và xin vào awesome-anki / awesome-selfhosted / awesome-local-llm. Nhấn mạnh "**local, miễn phí, riêng tư, cài-một-lần**" + demo 30 giây "thả tài liệu → có deck + lịch ôn".

---

# PHẦN 4 — BÀI GIỚI THIỆU SẢN PHẨM (chi tiết)

## StudyForge — Không gian học tập toàn vẹn, riêng tư, chạy ngay trên máy bạn

**Tagline:** *"Tài liệu của trường, biến thành kiến thức trong đầu bạn — riêng tư, có khoa học, ngay trên máy của bạn."*

### Vấn đề
Học sinh và sinh viên ngày nay ngập trong tài liệu: slide bài giảng, PDF, ghi âm/quay buổi học. Nhưng *ghi lại* không phải là *học*. Nghiên cứu cho thấy việc ghi hình bài giảng khiến người học dành rất nhiều thời gian xem lại và chép nguyên văn, lấn vào thời gian tự học thật sự — trong khi hai kỹ thuật có bằng chứng mạnh nhất (gợi nhớ chủ động và ôn ngắt quãng) lại ít được dùng. Các công cụ tốt thì hoặc trên cloud, hoặc thu phí tính năng cốt lõi, hoặc rời rạc (một app làm flashcard, một app lịch, một app ghi chú) khiến học sinh phải tự ghép và dữ liệu cá nhân trôi nổi trên máy chủ người khác.

### Giải pháp
StudyForge là **một không gian học tập hợp nhất, chạy hoàn toàn trên máy bạn**. Bạn thả tài liệu của môn học vào; StudyForge tự biến chúng thành ghi chú có cấu trúc, thẻ ghi nhớ, bài quiz và sơ đồ — tất cả đều **truy về đúng nguồn** để bạn kiểm chứng. Sau đó nó lên lịch ôn theo khoa học trí nhớ, nhắc bạn đúng lúc một cách dễ chịu, theo dõi tiến bộ từng môn, quản lý deadline và điểm số — và làm tất cả **không cần internet, không gửi dữ liệu của bạn đi đâu cả**.

### Dành cho ai
Học sinh THPT và sinh viên đại học — đặc biệt những người: coi trọng quyền riêng tư, ở nơi mạng yếu, muốn một công cụ *trọn gói* thay vì năm app rời rạc, hoặc cần một môi trường học **thân thiện với ADHD** và không gây quá tải.

### Triết lý
- **Local-first & riêng tư:** dữ liệu của bạn ở lại trên máy bạn.
- **Dựa trên bằng chứng:** mọi cơ chế đều có gốc khoa học nhận thức, không phải chiêu trò.
- **Kiểm chứng được:** AI luôn chỉ rõ nó lấy thông tin từ đâu; bạn duyệt trước khi tin.
- **Bao trùm:** thiết kế cho não thật của người học thật.

### Tham quan tính năng (theo 5 trụ cột)

**Trụ 1 — Tổ chức & Lưu trữ.** Mỗi môn là một *workspace* riêng: chứa tài liệu, ghi chú, thẻ, quiz, sơ đồ, lịch ôn, điểm và một trợ lý hỏi-đáp chỉ biết về môn đó. Một "bản đồ kiến thức" cho mỗi môn cho bạn thấy bạn đã học gì, còn yếu ở đâu, khái niệm nào sắp quên.

**Trụ 2 — Hiểu & Sinh nội dung (lõi).** Thả slide/PDF/ghi âm bài giảng → StudyForge transcribe và biến thành: ghi chú có cấu trúc (Cornell/outline), thẻ ghi nhớ kèm giải thích, quiz trắc nghiệm có gợi ý và giải thích đáp án, sơ đồ/mind map render ngay trên máy, và một trợ lý hỏi-đáp có trích dẫn về nội dung môn. *Mỗi đầu ra đều dẫn về đúng giây trong bài giảng hoặc đúng trang trong tài liệu.*

**Trụ 3 — Luyện tập & Ghi nhớ.** Hệ ôn tập ngắt quãng (FSRS — thuật toán Anki dùng mặc định) tự quyết định ôn gì, khi nào, để bạn nhớ lâu với ít công nhất. Tích hợp các phương pháp có bằng chứng: gợi nhớ chủ động, ôn xen kẽ nhiều chủ đề, "giảng lại cho AI" kiểu Feynman, và xuất thẻ sang Anki (.apkg) nếu bạn muốn ôn trên điện thoại.

**Trụ 4 — Lập kế hoạch & Theo dõi.** Quản lý deadline và lịch học; khi bạn thêm một kỳ thi, StudyForge **tự rải các phiên ôn** cho đúng các khái niệm trước ngày thi. Sổ điểm theo môn, tính GPA, và "what-if" (cần bao nhiêu điểm bài cuối để đạt mục tiêu). Dashboard mỗi môn: % đã thuộc, độ ổn định trí nhớ, streak, deadline, xu hướng điểm — tất cả tự tổng hợp, không phải nhập tay.

**Trụ 5 — Cá nhân hóa & Động lực.** StudyForge thích nghi với *bạn thật*: thời gian rảnh, mục tiêu, kiến thức nền và sở thích trình bày (đọc/nghe/nhìn). Nội dung có ở **nhiều dạng** để bạn chọn. Một lớp động lực kiểu trò chơi (streak, điểm, cột mốc) — nhưng thưởng cho *hành vi thật sự giúp bạn học*, có ngày nghỉ, không gây tội lỗi. Và một **chế độ hỗ trợ ADHD/tiếp cận**: phiên học ngắn có hẹn giờ, một nút "bắt đầu" giảm ma sát, giao diện gọn ít gây quá tải, đọc to, tương phản và cỡ chữ tùy chỉnh.

### Điều làm StudyForge khác biệt
Không có công cụ nào khác gộp *(một "NotebookLM cho học sinh") + (Anki/FSRS) + (quản lý môn/lịch/deadline/điểm) + (động lực & hỗ trợ ADHD)* trong **một desktop app cài-một-lần, chạy hoàn toàn local, miễn phí**. NotebookLM/Quizlet/Knowt đều ở trên cloud và thu phí tính năng cốt lõi; các công cụ open-source khác chỉ là "chat với tài liệu" tổng quát. StudyForge thắng ở đúng chỗ họ không làm: **riêng tư trọn vẹn + trọn gói cho việc học + thân thiện với người học thật.**

### Điều StudyForge *chưa* là (trung thực)
- Không phải nguồn chân lý: AI có thể sai, nên mọi nội dung đều có trích dẫn và bước duyệt.
- Không "đọc được kiểu não bạn": không có chuyện "phát hiện phong cách học" — vì khoa học không ủng hộ điều đó. Thay vào đó là nội dung đa phương thức + cá nhân hóa theo nhu cầu thật.
- Không thay thầy cô hay bạn học: nó là công cụ hỗ trợ, không phải để bạn lệ thuộc.

---

# PHẦN 5 — RỦI RO, CẢNH BÁO & KHUYẾN NGHỊ CUỐI

## 5.1 Rủi ro & cách giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| **Phạm vi quá rộng cho solo/nhóm nhỏ** | Cao | Xây lõi → mở rộng theo pha; mỗi pha ra bản dùng được; cắt không thương tiếc |
| **LLM local hallucinate → dạy sai** | Cao | Grounding chặt, trích dẫn từng thẻ, review-before-trust, disclaimer |
| **Phụ thuộc NotebookLM (API không có)** | Cao | Tự tái tạo đầu ra local; NotebookLM chỉ là tích hợp tùy chọn |
| **"Learning styles" như khoa học** | Trung bình | Tái khung thành đa phương thức + cá nhân hóa thật + hỗ trợ ADHD |
| **Gamification gây lo âu/engagement theater** | Trung bình | Gamify hành vi học, cho nghỉ, không thao túng |
| **Đóng gói cross-platform / CUDA hell** | Cao (vận hành) | Ưu tiên whisper.cpp + Ollama, pin version, CI build 3 OS, preset máy yếu |
| **Sinh hình ảnh AI nặng & dễ sai** | Trung bình | Hoãn; ưu tiên sơ đồ-bằng-mã (Mermaid) |
| **Bản quyền nội dung tải về (YouTube/bài giảng)** | Trung bình | Người dùng tự cung cấp file; ghi rõ về quyền sử dụng |

## 5.2 Khuyến nghị cuối

1. **Xây — nhưng cam kết với lộ trình lõi→mở rộng.** Đừng để danh sách tính năng dài làm bạn tê liệt. Pha 1 (một môn, một vòng lặp hoàn chỉnh, local) là cột mốc quyết định.
2. **Bỏ "API NotebookLM" khỏi yêu cầu lõi.** Tự tái tạo các đầu ra của nó trên máy; coi NotebookLM là tích hợp tùy chọn online.
3. **Tái khung "learning styles" thành đa phương thức + cá nhân hóa thật + hỗ trợ ADHD** (đây là điểm khác biệt *có bằng chứng*).
4. **Đặt chất lượng & an toàn AI là ưu tiên số 1 từ MVP** (grounding, trích dẫn, review, disclaimer).
5. **Gamify đúng chỉ số** (kết quả học, không phải thời gian mở app).
6. **Đừng phát minh lại scheduler** — dùng FSRS; **đừng dùng AI cho sơ đồ** — dùng Mermaid; **hoãn hình ảnh AI nặng**.
7. **Dogfood chính việc học của bạn** — đó là cách kiểm thử và tạo động lực tốt nhất, đồng thời là câu chuyện ra mắt thuyết phục.

---

## Nguồn tham khảo chính (đã kiểm chứng khi viết tài liệu)

- **NotebookLM API:** Google Cloud — *NotebookLM Enterprise API* (chỉ enterprise, cần license; Podcast API đã deprecated). Không có API công khai cho người dùng thường (xác nhận qua nhiều nguồn 03–06/2026). Thư viện cộng đồng `notebooklm-py` (~5.6k★) chỉ là tự động hóa trình duyệt.
- **Tính năng NotebookLM 2026:** Audio/Video Overview, Mind Map, Reports (briefing/study guide/FAQ/timeline/blog), Flashcards, Quizzes, Infographic, Slide Deck, Data Table, Learning Guide; chạy trên Gemini 3.5 (Google Blog, DigitalOcean, FelloAI — 01–06/2026).
- **Learning styles là myth:** Pashler, McDaniel, Rohrer & Bjork (2008), *Psychological Science in the Public Interest* 9(3); Husmann & O'Loughlin (2019). Cái *có* bằng chứng: active recall, spacing, interleaving, elaboration, dual coding.
- **Khoa học học tập:** Karpicke & Roediger (2008) — testing effect; Cepeda et al. (2006) — spacing effect; FSRS (open-spaced-repetition) — mặc định của Anki từ 23.10 (11/2023).
- **Tài liệu gốc:** "StudyForge — Phân tích chuyên sâu về ý tưởng dự án open-source AI học tập offline" (do bạn cung cấp), về stack offline: faster-whisper/whisper.cpp, Ollama + model 3B–14B, genanki, FSRS, Tauri/Electron.

---

*Tài liệu phân tích & nghiên cứu — phiên bản 1.0. Tên "StudyForge" là tên làm việc, có thể thay đổi.*
