import { cx } from 'class-variance-authority';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Class composition for the primitives layer.
 *
 * The approach is the one shadcn/ui popularised, without its components: own
 * the primitives, express their variants with `cva`, and resolve caller
 * overrides with `tailwind-merge`. What is deliberately not adopted is the
 * component library itself. Every shadcn component sits on a headless
 * primitive that runs React hooks, so it carries `use client` and pulls a
 * bundle across the server boundary. This product ships no client JavaScript
 * at all: selection is a link, filtering is a GET form, and that is what makes
 * a search shareable, a reload harmless and the back button correct. There is
 * no dialog, dropdown or combobox here for a primitive to earn its keep on.
 *
 * **Why tailwind-merge has to be configured.** Its defaults know Tailwind's
 * theme, not ours. Given `text-label`, it has no way to tell a font size from
 * a colour, so it falls through to the colour group, decides `text-ink-faint`
 * and `text-label` are the same property, and silently drops one. Half the
 * labels on the site are exactly that pair. Declaring our theme scales here is
 * what stops a merge helper from quietly restyling the product, and
 * `tests/cn.test.ts` holds the line.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      // Custom font sizes from the @theme block, which would otherwise be
      // read as colours.
      text: ['display', 'title', 'figure', 'label'],
      // Custom widths, so two of them in one class list resolve rather than
      // both being emitted.
      container: ['plate', 'column'],
      spacing: ['measure'],
    },
  },
});

/**
 * Joins class values and resolves Tailwind conflicts, last one winning.
 *
 * Use it wherever a component accepts a `className` from its caller. A
 * component that never takes an override does not need it, and `cx` alone is
 * cheaper.
 */
export function cn(...inputs: Parameters<typeof cx>): string {
  return merge(cx(inputs));
}
