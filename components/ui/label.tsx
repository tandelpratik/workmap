import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/**
 * The mono uppercase micro-label.
 *
 * It names a field, a column, a source line or a section: the small
 * typographic device that makes a page read as a statistical release rather
 * than as an app. It appeared in fourteen places as the same four classes
 * written out by hand, which is exactly the kind of repetition that drifts one
 * character at a time until two labels on the same page no longer match.
 *
 * The element varies because the role does. The same treatment is a heading
 * above a section, a term in a description list, a caption over a figure and
 * the label of a form control, and using a heading tag for a caption to get
 * the right size would put a lie in the document outline.
 */

export const label = cva('text-label font-mono uppercase', {
  variants: {
    tone: {
      faint: 'text-ink-faint',
      muted: 'text-ink-muted',
      ink: 'text-ink',
    },
  },
  defaultVariants: { tone: 'faint' },
});

/** The tags this label is allowed to be. Narrow on purpose. */
type LabelTag = 'p' | 'h2' | 'h3' | 'dt' | 'span' | 'div';

export function Label({
  as: Tag = 'p',
  tone,
  className,
  id,
  children,
}: VariantProps<typeof label> & {
  as?: LabelTag;
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag id={id} className={cn(label({ tone }), className)}>
      {children}
    </Tag>
  );
}

/**
 * The same treatment on a real `<label>`, which needs `htmlFor` and must not
 * be reachable through the tag union above: a form control's label is the one
 * case where the element carries behaviour rather than only meaning.
 */
export function FieldLabel({
  htmlFor,
  tone,
  className,
  children,
}: VariantProps<typeof label> & {
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={cn(label({ tone }), 'block', className)}>
      {children}
    </label>
  );
}
