import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/**
 * The submit button, and the one link that is dressed as one.
 *
 * Square, filled, no radius and no shadow. It reads as a printed key on a form
 * rather than as a control in an application, which is the distinction the
 * design constitution draws.
 *
 * `min-h-11` is not decoration. It is the forty-four pixel target these have to
 * clear on a phone, and it is set here so no call site can quietly ship a
 * button too small to hit.
 *
 * The hover state moves to the accent rather than darkening the ink, because
 * ink is already at the end of its range and in the night edition it is the
 * palest colour on the page: a "darker on hover" rule inverts there and the
 * button appears to go dead under the cursor.
 */

export const button = cva(
  'inline-flex items-center justify-center text-sm font-medium transition-colors',
  {
    variants: {
      tone: {
        solid: 'text-paper-raised bg-ink hover:bg-accent',
        outline: 'border-rule-strong text-ink hover:border-ink border',
      },
      size: {
        sm: 'min-h-11 px-4',
        md: 'min-h-11 px-6',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { tone: 'solid', size: 'md', block: false },
  },
);

export function Button({
  tone,
  size,
  block,
  className,
  children,
  ...rest
}: VariantProps<typeof button> &
  Omit<React.ComponentPropsWithoutRef<'button'>, 'className'> & {
    className?: string;
  }) {
  return (
    <button {...rest} className={cn(button({ tone, size, block }), className)}>
      {children}
    </button>
  );
}
