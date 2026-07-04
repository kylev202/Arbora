import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  Code,
  Highlighter,
  ListBullets,
  ListChecks,
  ListNumbers,
  Quotes,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  type Icon,
} from "@phosphor-icons/react";
import styles from "./NoteEditor.module.css";

/**
 * TipTap rich-text editor (bundled offline — local-first). StarterKit already
 * carries bold/italic/underline/strike/headings/lists/quote/code/link, so we
 * only add task lists, highlight, and a placeholder on top. `compact` trims the
 * toolbar for the Quick Note popover.
 */
export function NoteEditor({
  content,
  onChange,
  placeholder = "Start writing…",
  compact = false,
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            underline: editor.isActive("underline"),
            strike: editor.isActive("strike"),
            highlight: editor.isActive("highlight"),
            h1: editor.isActive("heading", { level: 1 }),
            h2: editor.isActive("heading", { level: 2 }),
            h3: editor.isActive("heading", { level: 3 }),
            bullet: editor.isActive("bulletList"),
            ordered: editor.isActive("orderedList"),
            task: editor.isActive("taskList"),
            quote: editor.isActive("blockquote"),
            code: editor.isActive("codeBlock"),
          }
        : null,
  });

  if (!editor) return null;

  const Btn = ({
    on,
    run,
    label,
    icon: IconCmp,
  }: {
    on?: boolean;
    run: () => void;
    label: string;
    icon: Icon;
  }) => (
    <button
      type="button"
      className={`${styles.tbtn} ${on ? styles.on : ""}`}
      aria-label={label}
      aria-pressed={on}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // keep the selection
      onClick={run}
    >
      <IconCmp aria-hidden="true" />
    </button>
  );

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        <Btn on={active?.bold} label="Bold" icon={TextB} run={() => editor.chain().focus().toggleBold().run()} />
        <Btn on={active?.italic} label="Italic" icon={TextItalic} run={() => editor.chain().focus().toggleItalic().run()} />
        <Btn on={active?.underline} label="Underline" icon={TextUnderline} run={() => editor.chain().focus().toggleUnderline().run()} />
        {!compact && (
          <Btn on={active?.strike} label="Strikethrough" icon={TextStrikethrough} run={() => editor.chain().focus().toggleStrike().run()} />
        )}
        <Btn on={active?.highlight} label="Highlight" icon={Highlighter} run={() => editor.chain().focus().toggleHighlight().run()} />

        {!compact && (
          <>
            <span className={styles.sep} aria-hidden="true" />
            <Btn on={active?.h1} label="Heading 1" icon={TextHOne} run={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
            <Btn on={active?.h2} label="Heading 2" icon={TextHTwo} run={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
            <Btn on={active?.h3} label="Heading 3" icon={TextHThree} run={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
          </>
        )}

        <span className={styles.sep} aria-hidden="true" />
        <Btn on={active?.bullet} label="Bullet list" icon={ListBullets} run={() => editor.chain().focus().toggleBulletList().run()} />
        {!compact && (
          <Btn on={active?.ordered} label="Numbered list" icon={ListNumbers} run={() => editor.chain().focus().toggleOrderedList().run()} />
        )}
        <Btn on={active?.task} label="Checklist" icon={ListChecks} run={() => editor.chain().focus().toggleTaskList().run()} />

        {!compact && (
          <>
            <Btn on={active?.quote} label="Quote" icon={Quotes} run={() => editor.chain().focus().toggleBlockquote().run()} />
            <Btn on={active?.code} label="Code block" icon={Code} run={() => editor.chain().focus().toggleCodeBlock().run()} />
            <span className={styles.sep} aria-hidden="true" />
            <Btn label="Undo" icon={ArrowUUpLeft} run={() => editor.chain().focus().undo().run()} />
            <Btn label="Redo" icon={ArrowUUpRight} run={() => editor.chain().focus().redo().run()} />
          </>
        )}
      </div>
      <EditorContent editor={editor} className={styles.content} />
    </div>
  );
}
