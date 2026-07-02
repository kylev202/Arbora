# App Help KB

Tài liệu hướng dẫn sử dụng Arbora — nguồn grounding cho Domain B của pet AI.
Mỗi mục là 1 đơn vị embed độc lập (dùng dấu `---` để chia chunk khi ingest).
Bản đóng gói theo app; bản biên tập gốc nằm ở vault `App Help KB.md` — sửa ở đó rồi đồng bộ sang đây.
Cập nhật lần cuối: 2026-07-02.

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
hoặc vào thẻ môn để vào workspace của môn học đó.

---

## 4. Thêm tài liệu (nguồn học)

Trong workspace của môn học, vào tab **"Sources"** (Nguồn):

1. Nhấn **"+ Thêm tài liệu"** hoặc kéo thả file vào vùng drop.
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

Sau khi có tài liệu, trong tab **"Content"**:

1. Nhấn **"Tạo nội dung"** (nút Generate).
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
1. Vào tab **"Study"** trong workspace môn, hoặc nhấn "Study smart" ở Home.
2. App hiện thẻ mặt trước — nhớ câu trả lời, rồi nhấn "Lật thẻ".
3. Xem mặt sau, tự đánh giá: **Quên / Khó / Nhớ / Dễ** (không có màu đỏ — "Quên" màu xám,
   không phạt bạn, chỉ lịch ôn của thẻ đó sẽ điều chỉnh).
4. App tự tính ngày ôn lại dựa theo rating của bạn.

**Chế độ học nhanh:** Nút "Quick 5" trong tab Study → ôn 5 thẻ, xong là xong.

**Focus timer:** Thêm `?timer=N` vào URL (N là số phút) để đếm ngược — hết giờ app nhắc nhẹ
"Buổi học xong rồi!" không ép tiếp.

**TTS (đọc to):** Nút loa ở Study Session — app đọc mặt trước/sau thẻ bằng giọng nói.

---

## 8. Học theo chặng (Learning Path)

Trong tab Study của môn học, bạn thấy **con đường học** chia thành các chặng theo tuần/chủ đề:

- Mỗi chặng = 1 nhóm kiến thức (ví dụ: tuần 1 — Giới thiệu, tuần 2 — Chương 2…).
- Chặng hiện tại được đánh dấu rõ — **1 bước kế tiếp duy nhất**, không gây bối rối.
- Học xong chặng → kiểm tra nhanh ngay → mở chặng kế.
- Làm sai không mất gì — câu đó chỉ được lặp lại để củng cố.
- Thanh tiến trình hôm nay 0%→100% tăng khi bạn hoàn thành từng chặng trong ngày.

Cuối buổi học, app tóm tắt những gì bạn đã học (có trích dẫn nguồn) và đề xuất ngày ôn lại
để chắc trí nhớ.

---

## 9. Lịch học (Calendar)

Tab **Lịch** ở Home quản lý thời gian biểu học tập:

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

## 10. Cây tiến trình (Dashboard)

Màn Home và tab Dashboard trong mỗi môn hiển thị **cây tiến trình**:

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

## 13. Lập kế hoạch học kỳ (Timeline / Outline)

Trong workspace của môn, tab **"Timeline"** hiển thị cấu trúc môn theo tuần:

- Mỗi tuần có: nội dung/kiến thức cần học, tài liệu được gán, deadline (nếu có).
- Click vào tuần để xem chi tiết, thêm tài liệu vào đúng tuần, gán assignment.
- Nút **"Import Syllabus"** → tải file đề cương, AI parse ra cấu trúc tuần + deadline, bạn xác nhận trước khi lưu.
- Tay chỉnh được: thêm/sửa/xoá tuần, thay đổi deadline.

Tab **"Plan"** hiển thị tất cả deadline của môn + sổ điểm để bạn theo dõi điểm số theo từng bài.

**Assignment Brief:** Với từng bài tập/deadline, nhấn "Tạo brief ôn tập" → AI tóm tắt kiến thức
liên quan (từ tài liệu của bạn, có trích dẫn) để bạn ôn trước khi nộp. Cũng qua review trước khi hiện.

---

## 14. Hỏi đáp theo môn (Ask / RAG Chat)

Tab **"Ask"** trong workspace của môn (hoặc chat với pet trong ngữ cảnh môn đó):

- Nhập câu hỏi về kiến thức môn bất kỳ.
- AI tìm trong tài liệu của môn đó (FAISS search), trả lời + kèm trích dẫn trang/timestamp.
- Click citation để mở đúng trang trong tài liệu gốc.
- Nếu không có tài liệu liên quan → AI nói rõ, không bịa.

---

## 15. Knowledge Map (Bản đồ kiến thức)

Tab **"Map"** trong workspace môn:

- Hiển thị các khái niệm chính của môn và mức độ nắm vững (mastery state) của từng khái niệm.
- Xanh = nắm vững, vàng = đang học, xám = chưa bắt đầu.
- Nhìn toàn cảnh xem còn thiếu khái niệm nào.

---

## 16. Sơ đồ (Diagrams)

Tab **"Diagrams"** trong workspace môn:

- Nhấn "Tạo sơ đồ" → AI tạo sơ đồ Mermaid từ tài liệu của môn (có trích dẫn).
- Sơ đồ render ngay trên app, offline hoàn toàn.
- Duyệt qua Review trước khi lưu.

---

## 17. Ôn tập liên môn (Interleaved Study)

Nút **"Study smart"** ở màn Home → ôn thẻ từ nhiều môn cùng lúc, ưu tiên môn có deadline gần:

- Kết hợp thẻ từ tất cả môn bạn đang học.
- Thẻ từ môn có deadline trong 7 ngày được ưu tiên lên đầu.
- Tốt cho việc ôn tổng hợp cuối kỳ.
