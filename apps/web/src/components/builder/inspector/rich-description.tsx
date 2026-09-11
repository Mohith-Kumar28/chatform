"use client";

import { useEffect, useRef, useState } from "react";
import {
  EditorContent,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Mention from "@tiptap/extension-mention";
import { Markdown } from "@tiptap/markdown";
import { AtSign, Bold, Check, ImageIcon, Italic, Link2, List, Loader2, Paperclip, Unlink, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { fileDownloadUrl, fileFromUrl, fileLink, youtubeId } from "@repo/form-schema";
import { FileCard } from "@/components/chat/file-card";
import { Input } from "@/components/ui/input";
import { useBufferedValue } from "@/hooks/use-buffered-value";
import { useEntitlements } from "@/hooks/use-entitlements";
import { INLINE_IMAGE, INLINE_VIDEO, uploadAsset, type UploadedAsset } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { fieldInputClass } from "./fields";

export interface RecallOption {
  /** The question's ref — what `{{ref}}` names. */
  id: string;
  /** Its title, which is what the author recognises. */
  label: string;
}

/**
 * A YouTube link on a line of its own, in and out of Markdown.
 *
 * The stock extension stores an iframe; the description stores the link, so the
 * text stays readable anywhere it is not rendered and the AI builder only has
 * to write a URL. See `@repo/form-schema` rich-text.
 */
const YoutubeLine = Youtube.extend({
  markdownTokenName: "youtubeLine",
  markdownTokenizer: {
    name: "youtubeLine",
    level: "block",
    start: (src: string) => src.search(/^https?:\/\/\S*(youtube\.com|youtu\.be)/m),
    tokenize: (src: string) => {
      const m = /^(https?:\/\/\S+)[ \t]*(?:\n|$)/.exec(src);
      if (!m || !youtubeId(m[1]!)) return undefined;
      return { type: "youtubeLine", raw: m[0], url: m[1] };
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode("youtube", { src: String(token.url ?? "") }),
  renderMarkdown: (node) => String(node.attrs?.src ?? ""),
});

/** `]` and `\` would end or break the link text a file's name is stored as. */
const escapeLinkText = (s: string) => s.replace(/([\\[\]])/g, "\\$1");
const unescapeLinkText = (s: string) => s.replace(/\\(.)/g, "$1");

/**
 * An attached file (File Drops), as a card with a name you can edit.
 *
 * Stored as `[name](asset-url#file=<bytes>)` on a line of its own — see
 * `fileFromUrl` in `@repo/form-schema` rich-text — so the name the author types
 * is the link text, and is the name the respondent's download is saved under.
 */
const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { href: { default: "" }, name: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-file-attachment]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-file-attachment": "", ...HTMLAttributes }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentView);
  },
  markdownTokenName: "fileAttachment",
  markdownTokenizer: {
    name: "fileAttachment",
    level: "block",
    start: (src: string) => src.search(/^\[[^\n]+\]\(https:\/\/\S+#file/m),
    tokenize: (src: string) => {
      const m = /^\[((?:\\.|[^\]\\\n])+)\]\((https:\/\/[^\s)]+)\)[ \t]*(?:\n|$)/.exec(src);
      if (!m || !fileFromUrl(m[2]!)) return undefined;
      return { type: "fileAttachment", raw: m[0], name: unescapeLinkText(m[1]!), href: m[2] };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("fileAttachment", { href: String(token.href ?? ""), name: String(token.name ?? "") }),
  renderMarkdown: (node) => {
    const name = String(node.attrs?.name ?? "").trim() || "file";
    return `[${escapeLinkText(name)}](${String(node.attrs?.href ?? "")})`;
  },
});

function FileAttachmentView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const href = String(node.attrs.href ?? "");
  const name = String(node.attrs.name ?? "");
  const file = fileFromUrl(href);
  return (
    <NodeViewWrapper contentEditable={false} className="my-1">
      <FileCard
        filename={name || "file"}
        ext={file?.ext}
        sizeBytes={file?.sizeBytes}
        downloadHref={fileDownloadUrl(href, name || "file")}
        className={cn("bg-background", selected && "ring-ring ring-2")}
        name={
          <input
            value={name}
            aria-label="File name"
            placeholder="File name"
            title="Rename — this is the name it downloads as"
            onChange={(e) => updateAttributes({ name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="hover:bg-accent/60 focus:bg-accent/60 -mx-1 w-full rounded px-1 font-medium outline-none"
          />
        }
        actions={
          <button
            type="button"
            aria-label="Remove file"
            title="Remove file"
            onClick={deleteNode}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive grid size-7 shrink-0 place-items-center rounded-md transition-colors"
          >
            <X className="size-3.5" />
          </button>
        }
      />
    </NodeViewWrapper>
  );
}

function insertFile(editor: Editor, asset: UploadedAsset, name: string) {
  editor
    .chain()
    .focus()
    .insertContent({ type: "fileAttachment", attrs: { href: fileLink(asset.url, asset.sizeBytes, name), name } })
    .run();
}

/**
 * The questions @ can recall, read by the editor's extension long after the
 * render that configured it — so it is a box the component keeps filled, not a
 * value captured once.
 */
interface RecallStore {
  options: RecallOption[];
  labels: Map<string, string>;
}

function fillRecallStore(store: RecallStore, recall: RecallOption[] | undefined) {
  store.options = recall ?? [];
  store.labels = new Map((recall ?? []).map((o) => [o.id, o.label]));
}

/** `{{ref}}` in the stored text, a chip naming the question in the editor. */
function recallExtension(store: RecallStore) {
  return Mention.extend({
    markdownTokenName: "recall",
    markdownTokenizer: {
      name: "recall",
      level: "inline",
      start: (src: string) => src.indexOf("{{"),
      tokenize: (src: string) => {
        const m = /^\{\{\s*([\w.]+)\s*\}\}/.exec(src);
        if (!m) return undefined;
        return { type: "recall", raw: m[0], ref: m[1] };
      },
    },
    parseMarkdown: (token, helpers) => helpers.createNode("mention", { id: String(token.ref ?? "") }),
    renderMarkdown: (node) => `{{${String(node.attrs?.id ?? "")}}}`,
  }).configure({
    HTMLAttributes: { class: "bg-primary/15 text-primary rounded px-1 py-0.5 font-medium" },
    renderText: ({ node }) => `@${store.labels.get(node.attrs.id) ?? node.attrs.id}`,
    renderHTML: ({ node, options: o }) => [
      "span",
      o.HTMLAttributes,
      `@${store.labels.get(node.attrs.id) ?? node.attrs.id}`,
    ],
    suggestion: {
      char: "@",
      items: ({ query }) =>
        store.options
          .filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6),
      render: recallMenu,
    },
  });
}

/**
 * The @ menu: earlier questions, arrow keys and Enter.
 *
 * Plain DOM rather than a React portal — it lives for the length of one
 * keystroke sequence and has one job.
 */
function recallMenu() {
  let el: HTMLDivElement | null = null;
  let items: RecallOption[] = [];
  let active = 0;
  let pick: (item: { id: string }) => void = () => {};

  const draw = () => {
    if (!el) return;
    el.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-muted-foreground px-2 py-1.5 text-xs";
      empty.textContent = "No earlier questions";
      el.appendChild(empty);
      return;
    }
    items.forEach((item, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = item.label;
      b.className = cn(
        "block w-full truncate rounded-md px-2 py-1.5 text-left text-sm",
        i === active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
      );
      b.onmousedown = (e) => {
        e.preventDefault();
        pick({ id: item.id });
      };
      el!.appendChild(b);
    });
  };

  const place = (rect: DOMRect | null | undefined) => {
    if (!el || !rect) return;
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.bottom + 6}px`;
  };

  return {
    onStart: (props: { items: RecallOption[]; command: (i: { id: string }) => void; clientRect?: (() => DOMRect | null) | null }) => {
      el = document.createElement("div");
      el.className = "bg-popover text-popover-foreground fixed z-50 w-60 rounded-lg border p-1 shadow-md";
      document.body.appendChild(el);
      items = props.items;
      pick = props.command;
      active = 0;
      draw();
      place(props.clientRect?.());
    },
    onUpdate: (props: { items: RecallOption[]; command: (i: { id: string }) => void; clientRect?: (() => DOMRect | null) | null }) => {
      items = props.items;
      pick = props.command;
      active = 0;
      draw();
      place(props.clientRect?.());
    },
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (items.length) active = (active + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        draw();
        return true;
      }
      if (event.key === "Enter" && items[active]) {
        pick({ id: items[active]!.id });
        return true;
      }
      return event.key === "Escape";
    },
    onExit: () => {
      el?.remove();
      el = null;
    },
  };
}

type Panel = "link" | "image" | "youtube" | null;

/**
 * The description editor: a handful of buttons and a box.
 *
 * Bold, italic, a bullet list, a link, an image or video (link or upload), a
 * YouTube video (link), a file of any type (upload, drawn as a card with a
 * download button), and @ to recall an earlier answer.
 * Media is three buttons rather than one clever box, so nobody has to guess
 * what a single "media" input will do with what they paste. Nothing else on
 * purpose — the description sits under a question in a chat bubble.
 *
 * Stores Markdown in the dialect `@repo/form-schema` rich-text describes, and
 * commits the way every other inspector box does: on blur or a pause, never per
 * keystroke (`useBufferedValue`).
 */
export function RichDescription({
  value,
  onChange,
  recall,
  ariaLabel = "Description",
}: {
  value: string;
  onChange: (markdown: string) => void;
  /** Questions this one may recall. Omitted, the @ button is not offered. */
  recall?: RecallOption[];
  ariaLabel?: string;
}) {
  const buffered = useBufferedValue(value, onChange);
  // Filled before the editor exists (the initializer) and kept current after
  // (the effect, declared ahead of `useEditor` so it runs first).
  const [recallStore] = useState<RecallStore>(() => {
    const store: RecallStore = { options: [], labels: new Map() };
    fillRecallStore(store, recall);
    return store;
  });
  useEffect(() => fillRecallStore(recallStore, recall), [recallStore, recall]);

  const [panel, setPanel] = useState<Panel>(null);

  const editor = useEditor({
    immediatelyRender: false,
    // The toolbar reads `isActive` — bold lit, unlink offered — so it has to
    // re-render when the caret moves, not only when the text changes.
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        orderedList: false,
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Image.configure({ HTMLAttributes: { class: "my-1 max-h-48 rounded-lg" } }),
      YoutubeLine.configure({ nocookie: true, HTMLAttributes: { class: "my-1 aspect-video w-full rounded-lg" } }),
      recallExtension(recallStore),
      FileAttachment,
      Markdown,
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class: cn(
          "min-h-20 px-3 py-2.5 text-sm leading-relaxed outline-none",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-0 [&_p+p]:mt-2 [&_a]:underline [&_a]:underline-offset-2",
          // The player carries fixed width/height attributes; the panel is
          // narrower than either, so size it by the box instead.
          "[&_iframe]:my-1 [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:rounded-lg",
        ),
      },
    },
    onUpdate: ({ editor: e }) => buffered.onChange(e.getMarkdown().trim()),
    onBlur: () => buffered.onBlur(),
  });

  // Adopt a change that did not come from typing here — undo, the AI bar.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (editor.getMarkdown().trim() !== buffered.value.trim()) {
      editor.commands.setContent(buffered.value, { contentType: "markdown", emitUpdate: false });
    }
  }, [editor, buffered.value]);

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const maxMb = useEntitlements().limit("max_upload_mb_per_file");

  const attachFile = async (file: File) => {
    if (!editor) return;
    setUploadingFile(true);
    try {
      const asset = await uploadAsset(file, { maxMb });
      // The original name, not the server's filesystem-safe copy of it.
      insertFile(editor, asset, file.name);
    } catch (err) {
      toast.error("Couldn't upload", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <div className={cn(fieldInputClass, "border focus-within:border-ring focus-within:bg-background dark:focus-within:bg-background")}>
      <div className="border-border/60 flex items-center gap-0.5 border-b px-1.5 py-1">
        <ToolButton label="Bold" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="size-3.5" />
        </ToolButton>
        <ToolButton label="Italic" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="size-3.5" />
        </ToolButton>
        <ToolButton label="Bullet list" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="size-3.5" />
        </ToolButton>
        <span className="bg-border mx-1 h-4 w-px" />
        <ToolButton label="Link" active={panel === "link" || editor?.isActive("link")} onClick={() => toggle("link")}>
          <Link2 className="size-3.5" />
        </ToolButton>
        {/* Only where there is a link to remove: the caret in one, or a
            selection that holds one. */}
        {editor?.isActive("link") && (
          <ToolButton
            label="Remove link"
            tone="danger"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              setPanel(null);
            }}
          >
            <Unlink className="size-3.5" />
          </ToolButton>
        )}
        <ToolButton label="Image or video" active={panel === "image"} onClick={() => toggle("image")}>
          <ImageIcon className="size-3.5" />
        </ToolButton>
        <ToolButton label="YouTube video" active={panel === "youtube"} onClick={() => toggle("youtube")}>
          <YoutubeMark className="size-4" />
        </ToolButton>
        <ToolButton label="Attach a file" onClick={() => fileRef.current?.click()}>
          {uploadingFile ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
        </ToolButton>
        {/* No `accept`: any file at all. The server serves anything it cannot
            render as a sandboxed download, so the type is not the risk. */}
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void attachFile(file);
            e.target.value = "";
          }}
        />
        {recall && (
          <ToolButton label="Recall an answer" onClick={() => editor?.chain().focus().insertContent("@").run()}>
            <AtSign className="size-3.5" />
          </ToolButton>
        )}
      </div>

      {editor && panel === "link" && <LinkPanel editor={editor} onDone={() => setPanel(null)} />}
      {editor && panel === "image" && <ImagePanel editor={editor} maxMb={maxMb} onDone={() => setPanel(null)} />}
      {editor && panel === "youtube" && <YoutubePanel editor={editor} onDone={() => setPanel(null)} />}

      <EditorContent editor={editor} />
    </div>
  );
}

function ToolButton({
  label,
  active,
  tone,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  tone?: "danger";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // Keep the selection: a mousedown here would otherwise blur the editor
      // and apply the mark to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md transition-colors",
        tone === "danger"
          ? "text-destructive hover:bg-destructive/10"
          : active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One line of input under the toolbar: type, then tick or cross.
 *
 * Enter and Escape do the same, but nobody should have to know that — the two
 * buttons are the visible way to finish.
 */
function InlinePanel({
  placeholder,
  initial = "",
  onApply,
  onDone,
  children,
}: {
  placeholder: string;
  initial?: string;
  /** Return false to keep the panel open (the value was refused). */
  onApply: (value: string) => boolean;
  onDone: () => void;
  children?: React.ReactNode;
}) {
  const [value, setValue] = useState(initial);
  const apply = () => {
    if (onApply(value.trim())) onDone();
  };
  return (
    <div className="border-border/60 flex items-center gap-1 border-b p-1.5">
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
          if (e.key === "Escape") onDone();
        }}
        className="bg-background h-8 min-w-0 flex-1 text-sm"
      />
      <PanelButton label="Apply" onClick={apply} className="text-primary">
        <Check className="size-4" />
      </PanelButton>
      <PanelButton label="Cancel" onClick={onDone}>
        <X className="size-4" />
      </PanelButton>
      {children}
    </div>
  );
}

function PanelButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:bg-accent/60 hover:text-foreground grid size-8 shrink-0 place-items-center rounded-md transition-colors disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function LinkPanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  return (
    <InlinePanel
      placeholder="https://"
      initial={String(editor.getAttributes("link").href ?? "")}
      onDone={onDone}
      onApply={(url) => {
        const chain = editor.chain().focus().extendMarkRange("link");
        if (!url) chain.unsetLink().run();
        else if (editor.state.selection.empty && !editor.isActive("link")) {
          chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
        } else chain.setLink({ href: url }).run();
        return true;
      }}
    />
  );
}

/** A video line in the stored text; see `embedFromUrl`. */
function insertVideoLine(editor: Editor, url: string) {
  editor.chain().focus().insertContent({ type: "paragraph", content: [{ type: "text", text: url }] }).run();
}

/** An image or a clip, from a link or an upload. */
function ImagePanel({ editor, maxMb, onDone }: { editor: Editor; maxMb: number | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const asset = await uploadAsset(file, { maxMb });
      if (INLINE_VIDEO.test(asset.mime)) {
        // Asset URLs have no extension; the `#video` fragment marks a clip.
        insertVideoLine(editor, `${asset.url}#video`);
      } else if (INLINE_IMAGE.test(asset.mime)) {
        editor.chain().focus().setImage({ src: asset.url, alt: asset.filename }).run();
      } else {
        // An SVG, a HEIC, a .mov: served as a download, so it becomes one
        // rather than a broken picture.
        insertFile(editor, asset, file.name);
      }
      onDone();
    } catch (err) {
      toast.error("Couldn't upload", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <InlinePanel
      placeholder="Image or video link"
      onDone={onDone}
      onApply={(url) => {
        if (!url) return true;
        if (!/^https:\/\//i.test(url)) {
          toast.error("Use an https:// link");
          return false;
        }
        if (/\.(mp4|webm)(\?|#|$)/i.test(url)) insertVideoLine(editor, url);
        else editor.chain().focus().setImage({ src: url }).run();
        return true;
      }}
    >
      <span className="bg-border mx-0.5 h-4 w-px" />
      <PanelButton label="Upload an image or video" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
      </PanelButton>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/*,video/mp4,video/webm"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
    </InlinePanel>
  );
}

/** A YouTube video, from its link. */
function YoutubePanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  return (
    <InlinePanel
      placeholder="YouTube link"
      onDone={onDone}
      onApply={(url) => {
        if (!url) return true;
        if (!youtubeId(url)) {
          toast.error("That isn't a YouTube link");
          return false;
        }
        editor.chain().focus().setYoutubeVideo({ src: url }).run();
        return true;
      }}
    />
  );
}

/**
 * YouTube's own mark, in its own red.
 *
 * Lucide dropped its brand icons in v1, and the nearest thing left — a play
 * triangle in a rounded square — sat next to the image button reading as "some
 * other kind of media" rather than as YouTube. The rest of this toolbar is
 * monochrome line work on purpose; this one is a logo, and a logo drawn in the
 * toolbar's grey is a logo nobody recognises.
 *
 * One path with `evenodd`, so the triangle is a hole rather than a second fill:
 * the button's own background shows through it, in either theme.
 */
function YoutubeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="#FF0000" fillRule="evenodd" clipRule="evenodd">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z" />
    </svg>
  );
}
