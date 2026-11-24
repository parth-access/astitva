import { Fragment, type ReactNode } from "react";

/**
 * Text typed in the admin, set as the page should show it. Descriptions are
 * often pasted with a little Markdown: blank lines between paragraphs,
 * "- " lists and **bold**. Those become real paragraphs, lists and bold
 * instead of showing their asterisks and dashes; nothing else is read as
 * markup, and nothing is ever inserted as HTML.
 */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className={`rich-text ${className}`}>
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        const isItem = (l: string) => LIST_ITEM.test(l);
        // A block that is only list items is a list; one that opens with a line and then lists ("Details" then "- …") is a heading and a list.
        const listed = lines.every(isItem) || (lines.length > 1 && !isItem(lines[0]!) && lines.slice(1).every(isItem));
        if (listed) {
          const lead = isItem(lines[0]!) ? null : lines[0]!;
          const items = lines.filter(isItem);
          return (
            <Fragment key={i}>
              {lead ? <p className="rich-lead">{inline(lead)}</p> : null}
              <ul>
                {items.map((l, j) => (
                  <li key={j}>{inline(l.replace(LIST_ITEM, ""))}</li>
                ))}
              </ul>
            </Fragment>
          );
        }
        return (
          <p key={i} className={BOLD_ONLY.test(block) ? "rich-lead" : undefined}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const LIST_ITEM = /^(?:[-•*]|\d+[.)])\s+/;
/** A paragraph that is all bold ("**Details**") reads as a small heading. */
const BOLD_ONLY = /^\*\*[^*]+\*\*$/;

/** **bold** within a line; everything else stays plain text. */
function inline(line: string): ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}
