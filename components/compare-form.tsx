import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { hairlineGrid, HairlineCell } from '@/components/ui/hairline-grid';
import { FieldLabel } from '@/components/ui/label';

/**
 * Choosing two things to compare.
 *
 * Two forms rather than one with a mode switch. A single form would need the
 * second and third controls to change their options when the first changed,
 * which needs a script, and every other control on this site is a plain GET
 * form that works without one. Two forms is more markup and less machinery.
 *
 * Both are shown at once and either can be used from any state, so a reader
 * comparing two states can switch to comparing two occupations without going
 * back anywhere.
 */

const control = 'text-ink bg-paper mt-1 block h-8 w-full text-base outline-none';

export interface Choice {
  readonly value: string;
  readonly label: string;
}

function Pair({
  name,
  legend,
  hint,
  choices,
  a,
  b,
  submit,
}: {
  /** The query parameter prefix, so the two forms cannot collide. */
  name: string;
  legend: string;
  hint: string;
  choices: readonly Choice[];
  a: string | undefined;
  b: string | undefined;
  submit: string;
}) {
  return (
    <form method="get" action="/compare" className="min-w-0">
      <fieldset className="min-w-0">
        <legend className="sr-only">{legend}</legend>
        <div className={cn(hairlineGrid, 'grid-cols-1 sm:grid-cols-2')}>
          {(
            [
              { id: `${name}-a`, param: `${name}A`, label: 'First', value: a },
              { id: `${name}-b`, param: `${name}B`, label: 'Second', value: b },
            ] as const
          ).map((field) => (
            <HairlineCell key={field.id} className="py-2.5">
              <FieldLabel htmlFor={field.id}>{field.label}</FieldLabel>
              <select
                id={field.id}
                name={field.param}
                defaultValue={field.value ?? ''}
                className={control}
              >
                <option value="">Choose one</option>
                {choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </HairlineCell>
          ))}

          <div className="bg-paper flex sm:col-span-2">
            <Button type="submit" block className="m-2">
              {submit}
            </Button>
          </div>
        </div>
        <p className="text-ink-faint mt-2 text-xs leading-relaxed">{hint}</p>
      </fieldset>
    </form>
  );
}

export function CompareForm({
  places,
  occupations,
  placeA,
  placeB,
  occupationA,
  occupationB,
}: {
  places: readonly Choice[];
  occupations: readonly Choice[];
  placeA: string | undefined;
  placeB: string | undefined;
  occupationA: string | undefined;
  occupationB: string | undefined;
}) {
  return (
    <div className="print-hide mt-8 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
      <div className="min-w-0">
        <h2 className="text-ink font-serif text-lg font-semibold">
          Two states or territories
        </h2>
        <div className="mt-3">
          <Pair
            name="place"
            legend="Choose two states or territories to compare"
            hint="Their size, how each moved, and the work each advertises more of than the other."
            choices={places}
            a={placeA}
            b={placeB}
            submit="Compare places"
          />
        </div>
      </div>

      <div className="min-w-0">
        <h2 className="text-ink font-serif text-lg font-semibold">
          Two occupation groups
        </h2>
        <div className="mt-3">
          <Pair
            name="occupation"
            legend="Choose two occupation groups to compare"
            hint="Their size, how each moved, and where each is advertised across the country."
            choices={occupations}
            a={occupationA}
            b={occupationB}
            submit="Compare occupations"
          />
        </div>
      </div>
    </div>
  );
}
