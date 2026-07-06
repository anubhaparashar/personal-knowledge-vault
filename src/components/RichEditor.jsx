import React, { useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

function ToolbarButton({ active, disabled, onClick, children, title }) {
  return (
    <button
      type="button"
      className={`toolbar-button ${active ? 'active' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

export default function RichEditor({ initialHtml, onChange, onImageFile, disableImages = false }) {
  const imageInput = useRef(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ allowBase64: false, inline: false }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({
        placeholder: 'Paste text, links, lists, research notes, or write your own ideas…',
      }),
    ],
    content: initialHtml || '<p></p>',
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
        spellcheck: 'true',
      },
      handlePaste(view, event) {
        if (disableImages) return false;
        const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        Promise.all(files.map((file) => onImageFile(file)))
          .then((uploaded) => {
            uploaded.forEach((item) => {
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src: item.src || item.url, alt: item.name, title: item.name }),
                ),
              );
            });
          })
          .catch((error) => window.alert(error.message));
        return true;
      },
    },
  });

  if (!editor) return <div className="editor-loading">Loading editor...</div>;

  function addLink() {
    const current = editor.getAttributes('link').href || '';
    const url = window.prompt('Paste the URL:', current);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim(), target: '_blank', rel: 'noopener noreferrer' }).run();
  }

  async function handleImageSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const uploaded = await onImageFile(file);
      editor.chain().focus().setImage({ src: uploaded.src || uploaded.url, alt: uploaded.name, title: uploaded.name }).run();
    } catch (error) {
      window.alert(error.message);
    }
  }

  return (
    <section className="rich-editor-card">
      <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">Bold</ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">Italic</ToolbarButton>
        <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strike">Strike</ToolbarButton>
        <ToolbarButton active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">Heading</ToolbarButton>
        <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list">Bulleted list</ToolbarButton>
        <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">Numbered list</ToolbarButton>
        <ToolbarButton active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">Blockquote</ToolbarButton>
        <ToolbarButton active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code">Code</ToolbarButton>
        <ToolbarButton active={editor.isActive('link')} onClick={addLink} title="Link">Link</ToolbarButton>
        <ToolbarButton disabled={disableImages} onClick={() => imageInput.current?.click()} title="Image">Image</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">Undo</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">Redo</ToolbarButton>
        <input ref={imageInput} type="file" accept="image/*" hidden onChange={handleImageSelection} />
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}