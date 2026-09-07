import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/**
 * Text links.
 *
 * Three tones and two underline behaviours were already in use across
 * seventeen call sites, spelled out by hand each time and not always the same
 * way. The distinction they encode is real and worth keeping: a link in a
 * sentence is underlined because prose gives it no other affordance, while a
 * link that is the whole content of a table cell or a list row underlines on
 * hover, because a fifty-row table of underlined names is unreadable.
 *
 * `current` is the selected state, and it is deliberately not a colour change.
 * Weight and a rule carry it, so a reader who resolves neither hue nor weight
 * still has one signal, and `aria-current` carries it for anyone who has none
 * of the three.
 *
 * Exported as a style function as well as a component, because several of
 * these are `next/link` rather than plain anchors and that element brings its
 * own props.
 */

export const link = cva('underline-offset-4', {
  variants: {
    tone: {
      ink: 'text-ink hover:text-accent',
      muted: 'text-ink-muted hover:text-ink',
      faint: 'text-ink-faint hover:text-ink',
      /** The row or section the reader is currently on. */
      current: 'text-ink font-medium',
    },
    underline: {
      always: 'underline',
      hover: 'hover:underline',
    },
  },
  defaultVariants: { tone: 'ink', underline: 'always' },
});

export type LinkTone = NonNullable<VariantProps<typeof link>['tone']>;

export function TextLink({
  tone,
  underline,
  className,
  children,
  ...rest
}: VariantProps<typeof link> &
  Omit<React.ComponentPropsWithoutRef<'a'>, 'className'> & {
    className?: string;
  }) {
  return (
    <a {...rest} className={cn(link({ tone, underline }), className)}>
      {children}
    </a>
  );
}
