# Arbora — Chốt Model LLM & Preset (Pha 0)

> **Mục đích:** Quyết định cuối cùng cho model LLM mỗi preset + ngưỡng phần cứng + cấu hình máy dev. Nguồn chân lý cho `FR-AI-1` (preset theo RAM) và `Settings.ai_preset`.
> **Trạng thái:** v1 — CHỐT (2026-06). Cập nhật khi có benchmark thực ở Pha 3 spike hoặc khi model mới tốt hơn ra mắt.
> **Liên quan:** [`Developer_Guide.md`](./Developer_Guide.md) §8 · [`Requirements.md`](./Requirements.md) FR-AI-1/3 · [`Phase1_IPC_Contract.md`](./Phase1_IPC_Contract.md) (`llm_config`) · [`Phase1_Output_Schemas.md`](./Phase1_Output_Schemas.md)

---

## 1. Họ model: Qwen3 (thống nhất 3 bậc)

Chọn **một họ model duy nhất** cho cả 3 preset thay vì trộn nhiều họ.

**Lý do:**
- **Structured output ổn định nhất** trong nhóm model local 2026 — khớp trực tiếp với yêu cầu JSON/GBNF + grounding (rủi ro kỹ thuật #1 của Arbora).
- **Đa ngôn ngữ mạnh** (gồm tiếng Việt) — phục vụ cohort du học sinh Việt (persona C1/C2, NFR-I18N-1).
- Có đủ cỡ **4B / 8B / 14B** → cùng họ ⇒ hành vi prompt nhất quán, tune few-shot một lần dùng cả ba bậc.

**Đã cân nhắc & loại:**
| Họ | Lý do không chọn làm mặc định |
|---|---|
| Phi-4 (14B) | Reasoning tốt nhưng thiếu bậc nhỏ đồng họ sạch; đa ngôn ngữ yếu hơn. |
| Gemma 3 (4B/12B/27B) | Đa ngôn ngữ tốt, multimodal — nhưng cỡ 12B (không 8B/14B) lệch ladder; giữ làm phương án dự phòng. |
| Mistral 7B | JSON ổn định nhưng tổng thể yếu hơn Qwen3 thế hệ 2026. |
| Llama 3.x | Mặc định an toàn nhưng Qwen3 vượt về structured output + tiếng Việt. |

---

## 2. Bảng preset (CHỐT)

| Preset | Model LLM | VRAM/RAM ước tính (Q4_K_M) | Whisper | Embeddings | Máy mục tiêu |
|---|---|---|---|---|---|
| 🌱 **Nhẹ** | **Qwen3 4B** Q4_K_M | ~3 GB | tiny | nomic-embed-text | ≤8GB RAM, CPU hoặc GPU nhỏ — persona Chi |
| 🌿 **Trung bình** | **Qwen3 8B** Q4_K_M | ~6 GB | base | nomic-embed-text | ~16GB RAM hoặc ≥8GB VRAM — **mặc định gợi ý** |
| 🌳 **Mạnh** | **Qwen3 14B** Q4_K_M | ~10 GB | small | nomic-embed-text | ≥12GB VRAM hoặc ≥32GB RAM / GPU |

### Ngưỡng chọn preset (VRAM-aware)

```
detect_preset():
  if GPU tồn tại:
    if VRAM >= 12GB → 🌳 Mạnh
    elif VRAM >= 8GB → 🌿 Trung bình
    else → 🌱 Nhẹ
  else (CPU-only):
    if RAM >= 32GB → 🌳 Mạnh
    elif RAM >= 16GB → 🌿 Trung bình
    else → 🌱 Nhẹ
```

> Thay đổi so với spec cũ (chỉ keyed theo RAM): ưu tiên **VRAM** khi có GPU vì đó mới là yếu tố quyết định tốc độ. User vẫn đổi preset thủ công được trong Settings.

---

## 3. Cấu hình kỹ thuật khi gọi model

| Tham số | Giá trị | Lý do |
|---|---|---|
| Quantization | Q4_K_M | Cân bằng chất lượng/bộ nhớ tốt nhất cho structured output. |
| Thinking mode | **Tắt** (non-thinking) khi sinh JSON | Output sạch, nhanh, ổn định schema; không cần chain-of-thought cho grounding. |
| Temperature | 0.1 (structured), tăng nhẹ khi retry (§6 Output Schemas) | Ổn định, test được. |
| Context | đủ chứa 1 chunk + few-shot (~4–8K) | Sinh một-item-một-chunk → context nhỏ, nhẹ máy yếu. |

---

## 4. Cấu hình máy dev (XÁC NHẬN — 2026-06)

| Thành phần | Giá trị |
|---|---|
| GPU | **NVIDIA RTX 4070 desktop — 12 GB VRAM** (driver 591.44) |
| RAM | 16 GB |
| CPU | AMD Ryzen 7 5700X (8 nhân) |
| OS | Windows 11 |

**Model dev hằng ngày: Qwen3 8B Q4_K_M (preset 🌿).**

Lý do chọn 8B làm daily driver dù GPU gánh được 14B:
- ~6GB VRAM → dư nhiều cho context + chạy **đồng thời** embeddings + Whisper trên GPU; rất nhanh trên 4070.
- 🌿 là preset **đa số user (16GB) sẽ chạy** → dev đúng môi trường số đông, tránh bẫy "máy dev mạnh ≠ máy user" (Dev Guide §9, §10).
- **Qwen3 14B (🌳)** cài sẵn làm "trần chất lượng" — test khi cần (4070 ~60 tok/s, vừa khít 12GB VRAM).
- **Bắt buộc test định kỳ trên 🌱 Qwen3 4B** — giữ cam kết NFR-PERF-1 cho persona Chi (máy ≤8GB).

> ⚠️ Quy tắc test máy yếu (Cross-cutting checklist): mọi tính năng AI phải chạy thử trên preset 🌱 trước khi coi là xong.

---

## 5. Việc còn lại (xác minh ở Pha 3 spike)

- [ ] Đo **thời gian thực** pipeline ingest→thẻ trên từng preset (đặc biệt 🌱 trên máy 8GB thật) — trả lời câu hỏi mở Requirements §7.1.
- [ ] Đo **% thẻ chấp nhận được** mỗi preset trên 2–3 tài liệu thật → xác nhận 4B có đủ chất lượng grounding không, hay phải nâng sàn 🌱 lên 7B.
- [ ] Xác nhận GBNF grammar hoạt động ổn với Qwen3 qua Ollama (structured output path).

---

*Model Presets v1 — CHỐT 2026-06. Họ Qwen3, 3 bậc 4B/8B/14B. Máy dev: RTX 4070 12GB + 16GB RAM, daily driver Qwen3 8B. Xác minh số liệu thực ở Pha 3 spike.*
