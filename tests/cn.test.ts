import { describe, expect, it } from 'vitest';
import { cn } from '@/components/ui/cn';

/**
 * The merge helper is configured with this product's theme scales, and these
 * assertions are why.
 *
 * tailwind-merge only knows Tailwind's own theme. Handed a custom utility it
 * cannot classify, it falls back to the loosest group that matches, which for
 * anything beginning `text-` is the colour group. `text-label` is a font size
 * here, so an unconfigured merge treats it and `text-ink-faint` as the same
 * property and drops one. That pair sets nearly every field label, source line
 * and column heading on the site, so the failure would not be subtle and it
 * would not be caught by types.
 */
describe('cn', () => {
  it('keeps a custom font size and a colour together', () => {
    // The pair that breaks under an unconfigured merge.
    expect(cn('text-ink-faint text-label')).toBe('text-ink-faint text-label');
    expect(cn('text-label text-ink-faint')).toBe('text-label text-ink-faint');
  });

  it('treats custom font sizes as font sizes', () => {
    // Two sizes are a real conflict, and the later one wins.
    expect(cn('text-sm text-label')).toBe('text-label');
    expect(cn('text-title text-display')).toBe('text-display');
    expect(cn('text-figure text-base')).toBe('text-base');
  });

  it('still resolves ordinary conflicts', () => {
    expect(cn('text-ink text-accent')).toBe('text-accent');
    expect(cn('bg-ink bg-accent')).toBe('bg-accent');
    expect(cn('py-2 py-4')).toBe('py-4');
  });

  it('resolves the custom widths against one another', () => {
    expect(cn('max-w-plate max-w-column')).toBe('max-w-column');
    expect(cn('max-w-measure max-w-plate')).toBe('max-w-plate');
  });

  it('leaves unrelated custom utilities alone', () => {
    // Colour tokens are not a scale tailwind-merge needs told about: anything
    // it cannot classify under `border-` is a colour, which is correct here.
    expect(cn('border-rule border-t-2')).toBe('border-rule border-t-2');
    expect(cn('tabular font-mono uppercase')).toBe('tabular font-mono uppercase');
  });

  it('drops falsy values and accepts arrays', () => {
    expect(cn('text-ink', false, undefined, ['font-medium'])).toBe(
      'text-ink font-medium',
    );
  });
});
