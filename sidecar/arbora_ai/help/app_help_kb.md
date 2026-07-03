# App Help KB

Tài liệu hướng dẫn sử dụng Arbora — nguồn grounding cho Domain B của pet AI.
Mỗi mục là 1 đơn vị embed độc lập (dùng dấu `---` để chia chunk khi ingest).
Bản đóng gói theo app; bản biên tập gốc nằm ở vault `App Help KB.md` — sửa ở đó rồi đồng bộ sang đây.
Cập nhật lần cuối: 2026-07-03.

---

## 1. Arbora là gì?

Arbora là ứng dụng học tập trên máy tính chạy hoàn toàn offline — không cần internet, không gửi
dữ liệu ra ngoài. Bạn tải tài liệu của mình lên (PDF, slide, ghi âm, video), AI phân tích và
tạo ra ghi chú, thẻ học, câu hỏi ôn tập có trích dẫn nguồn. Bạn duyệt qua những thứ AI tạo
trước khi dùng, rồi ôn theo lịch thông minh để nhớ lâu hơn.

Điểm khác biệt:
- **AI chỉ nói từ tài liệu của bạn** — mọi ghi chú đều có trích dẫn trang/timestamp.
- **Bạn duyệt trước khi tin** — không có gì được lưu vào deck mà chưa qua tay bạn.
- **Chạy trên máy bạn** — AI là Ollama local, riêng tư tuyệt đối.
- **Cây tiến trình** không bao giờ chết hay thu nhỏ khi bạn nghỉ học.

---

## 2. Onboarding — lần đầu mở app

Khi mở Arbora lần đầu, app sẽ hỏi một số thông tin để cá nhân hoá trải nghiệm:

**Bước 1 — Giới thiệu:** Arbora giải thích ngắn gọn nó làm gì. Nhấn "Bắt đầu".

**Bước 2 — Thông tin cá nhân:** Nhập tên, năm học/lớp, ngành học. Có thể bỏ qua.

**Bước 3 — Môn học kỳ này:** Liệt kê các môn đang học và ngày bắt đầu/kết thúc học kỳ.
Có thể thêm/sửa sau trong ứng dụng.

**Bước 4 — Nhịp sinh hoạt:** Giờ thức dậy và giờ ngủ. Dùng để AI xếp lịch hợp lý.

**Bước 5 — Khung giờ học:** Chọn ngày trong tuần và giờ bạn thường rảnh để học.
Đây là input để AI scheduler sắp xếp buổi học cho bạn.

**Bước 6 — Mục tiêu:** Chỉ cần pass hay nhắm GPA cao? Ảnh hưởng đến mức độ tích cực
của lịch học AI đề xuất.

**Bước 7 — Chọn AI model:** App gợi ý model phù hợp với máy bạn (🌱 nhỏ/🌿 vừa/🌳 mạnh).
Tải model lần đầu mất một lúc — có progress bar. Sau đó không cần tải lại.

Tất cả thông tin này đều chỉ lưu trên máy bạn. Có thể sửa lại bất kỳ lúc nào trong Settings.

---

## 3. Thêm môn học

Để thêm môn học mới:

1. Ở màn Home, nhấn nút **"+ Môn mới"**.
2. Nhập tên môn.
3. **Cách nhanh — tải syllabus:** Kéo thả file PDF/PPTX/TXT/MD của đề cương môn học vào ô
   "Tải syllabus". AI sẽ tự phân tích và đề xuất danh sách tuần + deadline. Bạn xem lại và
   xác nhận trước khi lưu.
4. **Cách thủ công:** Nhập tay — học về gì, content mỗi tuần, deadlines, số tuần học.
5. Nhấn "Tạo môn".

Sau khi tạo, môn học xuất hiện như một cành cây mới trên màn Home. Click vào cành đó
hoặc vào thẻ môn để vào không gian của môn học.

Mỗi môn học có đúng **3 trang**, chuyển bằng thanh điều hướng ngang dưới thanh trên cùng:
- **Overview (Tổng quan)** — quản lý thông tin môn, tài liệu nguồn, tiến trình học, todo tuần này.
- **Plan (Kế hoạch)** — kế hoạch học, deadline, timeline theo tuần.
- **Study (Học)** — buổi học tuần này và học tự do theo tuần (flashcard, test, sơ đồ, hỏi AI).

---

## 4. Thêm tài liệu (nguồn học)

Trong trang **Overview** của môn học, kéo xuống mục **"Sources"** (Nguồn):

1. Nhấn **"Add source"** hoặc kéo thả file vào vùng drop.
2. **Định dạng hỗ trợ:** PDF, slide PPTX, file văn bản TXT/MD/DOCX, ghi âm MP3/WAV/M4A,
   video MP4/MKV/WebM/AVI/MOV.
3. Nếu thêm audio/video, app sẽ tự dùng Whisper để chuyển thành văn bản — quá trình này
   chạy nền, có progress bar.
4. Sau khi xử lý xong, tài liệu xuất hiện trong danh sách với badge trạng thái "Đã xử lý".

Tài liệu được chia thành các đoạn nhỏ và đánh chỉ mục để AI có thể tìm kiếm và trích dẫn
chính xác khi tạo nội dung học.

**Lưu ý:** AI chỉ tạo nội dung từ tài liệu bạn đã thêm vào. Nếu tuần chưa có tài liệu,
app sẽ báo bạn cần thêm nội dung cho tuần đó.

---

## 5. Sinh nội dung học (ghi chú, thẻ học, câu hỏi)

Sau khi có tài liệu, ở mục Sources trên trang **Overview**:

1. Nhấn **"Generate content from sources"**.
2. Chọn loại nội dung muốn tạo: **Ghi chú, Thẻ học (Flashcard), Câu hỏi ôn tập (Quiz)**.
3. AI sẽ đọc tài liệu, tạo nội dung và kèm trích dẫn nguồn (trang/timestamp) cho mỗi mục.
4. Có progress bar trong quá trình tạo — tùy file lớn nhỏ mà mất 10–60 giây.
5. Khi xong, app chuyển bạn sang **màn Review** để duyệt nội dung trước khi lưu.

**Quan trọng:** Nội dung AI tạo ra chưa được lưu vào deck cho đến khi bạn duyệt qua.

---

## 6. Duyệt nội dung (Review Queue)

Màn Review hiển thị từng mục AI tạo ra — bạn xem và quyết định:

- **[Giữ]** — Chấp nhận mục này, lưu vào bộ thẻ của môn.
- **[Chỉnh sửa]** — Sửa nội dung trước khi lưu.
- **[Bỏ qua]** — Không lưu mục này.

Mỗi mục đều có **trích dẫn nguồn** (tên file, trang hoặc timestamp) — click vào để mở đúng
trang trong tài liệu gốc.

Phím tắt: `←` `→` chuyển mục, `A` giữ, `D` bỏ, `E` chỉnh sửa, `Esc` đóng.

Nút "Chấp nhận tất cả còn lại" ở trên cùng nếu bạn muốn duyệt nhanh.

---

## 7. Ôn tập (Study / FSRS)

Arbora dùng hệ thống FSRS để lên lịch ôn tập — bạn chỉ ôn đúng thẻ sắp quên, không ôn hết
tất cả. Kết quả là nhớ lâu hơn với thời gian ít hơn.

**Bắt đầu ôn:**
1. Vào trang **"Study"** của môn, hoặc nhấn "Study smart" ở Home.
2. App hiện thẻ mặt trước — nhớ câu trả lời, rồi nhấn "Lật thẻ".
3. Xem mặt sau, tự đánh giá: **Quên / Khó / Nhớ / Dễ** (không có màu đỏ — "Quên" màu xám,
   không phạt bạn, chỉ lịch ôn của thẻ đó sẽ điều chỉnh).
4. App tự tính ngày ôn lại dựa theo rating của bạn.

**Chế độ học nhanh:** Nút "Quick 5" trong tab Study → ôn 5 thẻ, xong là xong.

**Focus timer:** Thêm `?timer=N` vào URL (N là số phút) để đếm ngược — hết giờ app nhắc nhẹ
"Buổi học xong rồi!" không ép tiếp.

**TTS (đọc to):** Nút loa ở Study Session — app đọc mặt trước/sau thẻ bằng giọng nói.

---

## 8. Buổi học tuần này & học tự do (trang Study)

Trang **Study** của môn có hai phần:

**Buổi học tuần này (This week's session):**
- Tổng quan kiến thức tuần hiện tại, chia nhỏ thành **từng chặng theo khái niệm** — mỗi
  khái niệm một bước nhỏ, hoàn thành được ngay.
- Từ tuần 2 trở đi, app đề xuất **kiểm tra nhanh kiến thức tuần trước** trước khi vào bài
  tuần này (giúp nhớ lâu hơn) — bỏ qua được, không ép.
- Có nút "10-minute focus" (đếm ngược 10 phút) và "Quick 5" (ôn 5 thẻ).

**Học tự do (Self-paced study):**
- Xem kiến thức của **tất cả các tuần** — chọn tuần bất kỳ, tuần nào cũng luôn mở.
- Mỗi tuần có 4 loại tài liệu học: **Flashcards** (thẻ học trong app), **Test** (bài kiểm tra
  đa dạng), **Diagram** (sơ đồ), **Ask AI** (hỏi đáp).

Cuối buổi học, app tóm tắt những gì bạn đã học (có trích dẫn nguồn) và đề xuất 1–2 buổi
**"rewind"** (ôn lại) vào những ngày kế tiếp — bạn xác nhận rồi mới ghi vào lịch.

---

## 9. Lịch học (Calendar)

Mở **Lịch** từ biểu tượng lịch trên thanh trên cùng (cạnh Settings) để quản lý thời gian biểu:

**Xem lịch:** Mặc định xem theo tuần; chuyển sang tháng bằng nút góc trên phải.

**Tạo event thủ công:** Click vào ô thời gian → điền tên, chọn môn, loại (lecture/học/deadline/khác).

**Kéo-thả:** Kéo event sang giờ/ngày khác để dời.

**AI xếp lịch:** Nhấn **"AI xếp giúp tuần này"** → AI nhìn vào lịch rảnh bạn đã nhập ở
onboarding + tiến trình từng môn + deadline → đề xuất các buổi học. Pet sẽ nói "Mình đề xuất…"
rồi hiện thẻ xác nhận [Chấp nhận][Sửa][Bỏ] cho từng buổi. Bạn duyệt xong mới ghi vào lịch.

**Buổi chưa hoàn thành:** Nếu bạn chưa đánh dấu xong 1 buổi, app (qua pet) sẽ đề xuất dời
sang khung giờ rảnh kế tiếp — trung tính, không phạt, không đỏ.

**Màu event:** Xanh lá = buổi học, vàng đất = deadline, xanh dương = bài giảng trên lớp,
xám = tùy chỉnh.

---

## 10. Cây tiến trình & Tổng quan môn (Overview)

Màn Home và trang **Overview** trong mỗi môn hiển thị **cây tiến trình** cùng số liệu học tập
(số lần ôn tuần này, tuần trước, % nắm vững cả kỳ), todo tuần này, và mục quản lý tài liệu.
Ở đây cũng sửa được tên/màu môn học hoặc xoá môn (nút Edit subject / Delete).

- **Cây tổng ở Home:** mỗi cành = 1 môn học; lá trên cành = kiến thức môn đó bạn đã nắm.
- **Cây trong môn:** cành nhánh và lá theo tiến trình thẻ đã "mastered" (ôn đủ lần, nhớ lâu).
- **Cây chỉ lớn, không bao giờ thu nhỏ** — kể cả khi bạn nghỉ học vài ngày.
- Lá xanh = đã nắm vững; lá vàng = đang học; cành trống = chưa bắt đầu.

Khi 1 thẻ đạt "mastered" sau buổi ôn, bạn sẽ thấy 1 lá mới mọc ra trên cây (animation nhẹ,
tắt được trong Settings → Giảm chuyển động).

Nghỉ học không làm cây héo — "Chào mừng trở lại 🌱" không phán xét.

---

## 11. Pet AI — trợ lý đồng hành

Con pet nhỏ (biểu tượng mầm/lá) nằm ở góc màn hình. Click vào (hoặc nhấn `Ctrl+.`) để mở
chat; nhấn `Esc` để đóng. Kéo-thả pet sang góc khác — app nhớ vị trí.

**Hỏi về bài học:** Pet tìm trong tài liệu bạn đã thêm và trả lời có trích dẫn trang/timestamp.
Nếu không tìm thấy trong tài liệu → pet nói thẳng "chưa có tài liệu về phần này". Chọn môn
ở đầu khung chat (hoặc mở chat khi đang ở trong workspace một môn) để pet biết tìm ở đâu.

**Hỏi về cách dùng app:** Pet trả lời từ hướng dẫn đóng gói sẵn (chính là tài liệu này).

**Nhờ xếp lịch:** Nhắn "xếp lịch tuần này cho mình" hoặc "nhắc mình deadline môn X" → pet
đề xuất và thông báo những gì nó sắp làm, rồi bạn xác nhận.

**Tắt/di chuyển pet:** Kéo-thả pet sang góc khác; thu nhỏ bằng nút `_`; tắt bong bóng gợi ý
chủ động trong Settings → Pet → "Tắt gợi ý tự động".

Pet **không** giúp việc ngoài 2 phạm vi trên (bài học của bạn + cách dùng Arbora).

---

## 12. Cài đặt (Settings)

Mở Settings từ biểu tượng bánh răng góc trên phải, bất kỳ màn nào.

**Thông tin cá nhân:** Sửa tên, năm học, ngành, ngày học kỳ, giờ thức/ngủ, khung giờ rảnh,
mục tiêu (pass/GPA cao) — đúng những gì onboarding đã hỏi.

**AI model (Preset):**
- 🌱 Qwen3 4B — máy yếu, RAM < 8GB, đủ dùng.
- 🌿 Qwen3 8B — máy trung bình, RAM 8–16GB, chất lượng tốt.
- 🌳 Qwen3 14B — máy mạnh, RAM > 16GB, chất lượng cao nhất.
- Đổi preset → app tải lại model (lần đầu mất thêm thời gian tải).

**Whisper model (chuyển audio/video → văn bản):**
- `base` — nhanh, đủ dùng.
- `small` / `medium` — chính xác hơn, nặng hơn.

**Hiển thị:**
- **Cỡ chữ:** 14 / 16 / 18 / 20px.
- **High contrast:** tăng độ tương phản cho màn hình hoặc thị giác.
- **Giảm chuyển động:** tắt animation (cây, pet, chặng học) — app vẫn đủ chức năng.

**TTS (đọc to):** Bật/tắt mặc định; chọn giọng hệ thống.

**Pet:**
- Tắt "Gợi ý tự động" — pet chỉ trả lời khi bạn hỏi, không tự bật bong bóng.

---

## 13. Lập kế hoạch học kỳ (trang Plan)

Trang **Plan** của môn có 3 mục phân tách rõ ràng:

**Plan (Kế hoạch):** gợi ý "Focus next" (nên học tuần nào trước, dựa vào deadline gần và
lượng bài chưa học), danh sách buổi học đã xếp trên lịch, và nút **"Plan my week"** — AI đề
xuất các buổi học tuần này, bạn duyệt [Accept/Edit/Dismiss] từng buổi rồi mới ghi vào lịch.

**Deadlines:** tất cả deadline của môn — thêm/xoá/chỉnh, tạo Assignment Brief — cùng sổ điểm
(Grade book) để theo dõi điểm từng bài.

**Timeline:** cấu trúc môn theo tuần — mỗi tuần có nội dung, tài liệu được gán, deadline.
Nút **"Import syllabus"** → tải file đề cương, AI parse ra cấu trúc tuần + deadline, bạn xác
nhận trước khi lưu. Tay chỉnh được: thêm/sửa tuần, đổi ngày.

**Assignment Brief:** Với từng bài tập/deadline, nhấn "Tạo brief ôn tập" → AI tóm tắt kiến thức
liên quan (từ tài liệu của bạn, có trích dẫn) để bạn ôn trước khi nộp. Cũng qua review trước khi hiện.

---

## 14. Hỏi đáp theo môn (Ask AI)

Trang **Study** → chọn tuần → tab **"Ask AI"** (hoặc chat với pet trong ngữ cảnh môn đó):

- Nhập câu hỏi về kiến thức môn bất kỳ.
- AI tìm trong tài liệu của môn đó (FAISS search), trả lời + kèm trích dẫn trang/timestamp.
- Click citation để mở đúng trang trong tài liệu gốc.
- Nếu không có tài liệu liên quan → AI nói rõ, không bịa.

---

## 15. Knowledge Map (Bản đồ kiến thức)

Link **"Knowledge map"** ở mục Self-paced study trên trang Study:

- Hiển thị các khái niệm chính của môn và mức độ nắm vững (mastery state) của từng khái niệm.
- Xanh = nắm vững, vàng = đang học, xám = chưa bắt đầu.
- Nhìn toàn cảnh xem còn thiếu khái niệm nào.

---

## 16. Sơ đồ (Diagram)

Trang **Study** → chọn tuần → tab **"Diagram"**:

- Chủ đề được điền sẵn theo tuần đang chọn; nhấn mũi tên → AI tạo sơ đồ flowchart Mermaid
  hoàn chỉnh từ tài liệu của môn (có trích dẫn).
- Sơ đồ render ngay trên app, offline hoàn toàn.
- Sơ đồ chỉ để xem trong phiên — không lưu vào deck nên không cần qua Review.

---

## 16b. Bài kiểm tra (Test)

Trang **Study** → chọn tuần → tab **"Test"** → "Set up a test":

- **Chọn thể loại câu hỏi** trước mỗi bài test: Multiple choice (trắc nghiệm), Short answer
  (trả lời ngắn), Connect boxes (nối ô), Rearrange (sắp xếp thứ tự), Feynman (giải thích
  bằng lời của bạn). Chọn 1, vài, hoặc tất cả.
- AI tạo bài kiểm tra từ đúng tài liệu tuần đó — mỗi câu đều có trích dẫn nguồn.
- Làm từng câu một. Trắc nghiệm/nối ô/sắp xếp chấm ngay tại chỗ; trả lời ngắn và Feynman
  được AI chấm và nhận xét (nhận xét chỉ so với đáp án gốc, giọng ôn hoà, không phạt).
- Kết quả cuối bài: đúng / gần đúng / cần xem lại — không điểm số đáng sợ, không màu đỏ.
- Bài test dùng xong là xong, không lưu lại.

---

## 17. Ôn tập liên môn (Interleaved Study)

Nút **"Study smart"** ở màn Home → ôn thẻ từ nhiều môn cùng lúc, ưu tiên môn có deadline gần:

- Kết hợp thẻ từ tất cả môn bạn đang học.
- Thẻ từ môn có deadline trong 7 ngày được ưu tiên lên đầu.
- Tốt cho việc ôn tổng hợp cuối kỳ.
