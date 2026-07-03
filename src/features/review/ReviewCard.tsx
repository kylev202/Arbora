import { useEffect, useState } from "react";
import { SpeakerHigh } from "@phosphor-icons/react";
import { CitationChip, IconButton, Tag, Textarea } from "../../components";
import { speak } from "../../lib/tts";
import type { ReviewItem, SourceRef } from "../../lib/types";
import styles from "./ReviewCard.module.css";

const KIND_LABEL: Record<ReviewItem["kind"], string> = {
  card: "Flashcard",
  quiz: "Quiz question",
  note: "Note",
  brief: "Study brief",
};

function citationsOf(item: ReviewItem): SourceRef[] {
  return item.kind === "note" || item.kind === "brief" ? item.source_refs : [item.source_ref];
}

function speakText(item: ReviewItem): string {
  if (item.kind === "card") return `${item.front}. ${item.back}`;
  if (item.kind === "quiz") return `${item.question}. Answer: ${item.options[item.answer_index]}`;
  return item.content;
}

export type ReviewCardProps = {
  item: ReviewItem;
  editing: boolean;
  onSaveEdit: (item: ReviewItem) => void;
  onCancelEdit: () => void;
  onOpenCitation?: (ref: SourceRef) => void;
};

/**
 * Displays one review item (card/quiz/note) with its citation always visible
 * (Law #1). In edit mode the text fields become editable; nothing is trusted
 * until kept (Law #2). Includes a read-aloud (TTS) hook.
 */
export function ReviewCard({ item, editing, onSaveEdit, onCancelEdit, onOpenCitation }: ReviewCardProps) {
  const [draft, setDraft] = useState<ReviewItem>(item);

  // Reset the draft whenever the item or edit mode changes.
  useEffect(() => setDraft(item), [item, editing]);

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <Tag tone="info">{KIND_LABEL[item.kind]}</Tag>
        <IconButton
          label="Read aloud"
          size="sm"
          icon={<SpeakerHigh />}
          onClick={() => speak(speakText(item))}
        />
      </header>

      {editing ? (
        <EditFields draft={draft} setDraft={setDraft} />
      ) : (
        <DisplayFields item={item} />
      )}

      <div className={styles.citations}>
        {citationsOf(item).map((ref, i) => (
          <CitationChip key={i} source={ref} onOpen={onOpenCitation} />
        ))}
      </div>

      {editing && (
        <div className={styles.editActions}>
          <button type="button" className={styles.linkBtn} onClick={onCancelEdit}>
            Cancel
          </button>
          <button type="button" className={styles.saveBtn} onClick={() => onSaveEdit(draft)}>
            Save changes
          </button>
        </div>
      )}
    </article>
  );
}

function DisplayFields({ item }: { item: ReviewItem }) {
  if (item.kind === "card") {
    return (
      <div className={styles.fields}>
        <Field label="Front">{item.front}</Field>
        <Field label="Back">{item.back}</Field>
        {item.explanation && <Field label="Explanation" muted>{item.explanation}</Field>}
      </div>
    );
  }
  if (item.kind === "quiz") {
    return (
      <div className={styles.fields}>
        <Field label="Question">{item.question}</Field>
        <div className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Options</span>
          <ol className={styles.options}>
            {item.options.map((opt, i) => (
              <li key={i} className={i === item.answer_index ? styles.correct : undefined}>
                {opt}
                {i === item.answer_index && <span className={styles.correctTag}> ✓ answer</span>}
              </li>
            ))}
          </ol>
        </div>
        {item.explanation && <Field label="Explanation" muted>{item.explanation}</Field>}
      </div>
    );
  }
  if (item.kind === "brief") {
    return (
      <div className={styles.fields}>
        <Field label={`Study brief · ${item.deadline_title}`}>
          <span className={styles.note}>{item.content}</span>
        </Field>
      </div>
    );
  }
  return (
    <div className={styles.fields}>
      <Field label="Note">
        <span className={styles.note}>{item.content}</span>
      </Field>
    </div>
  );
}

function EditFields({
  draft,
  setDraft,
}: {
  draft: ReviewItem;
  setDraft: (d: ReviewItem) => void;
}) {
  if (draft.kind === "card") {
    return (
      <div className={styles.fields}>
        <Textarea label="Front" rows={2} value={draft.front} onChange={(e) => setDraft({ ...draft, front: e.target.value })} />
        <Textarea label="Back" rows={2} value={draft.back} onChange={(e) => setDraft({ ...draft, back: e.target.value })} />
        <Textarea label="Explanation" rows={3} value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
      </div>
    );
  }
  if (draft.kind === "quiz") {
    return (
      <div className={styles.fields}>
        <Textarea label="Question" rows={2} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
        <Textarea label="Explanation" rows={3} value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
      </div>
    );
  }
  if (draft.kind === "brief") {
    return (
      <div className={styles.fields}>
        <Textarea label="Study brief" rows={8} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
      </div>
    );
  }
  return (
    <div className={styles.fields}>
      <Textarea label="Note" rows={6} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
    </div>
  );
}

function Field({ label, children, muted }: { label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={styles.fieldBlock}>
      <span className={styles.fieldLabel}>{label}</span>
      <p className={muted ? styles.fieldValueMuted : styles.fieldValue}>{children}</p>
    </div>
  );
}
