# Launch Checklist

Reviewed 2026-09-09. An unticked box below is a real gap, not a forgotten tick,
and each one names what it is waiting on. Where a box is ticked by a command,
the command is named, because "someone checked once" is not a state anything can
be in for long.

## Product

- [x] Search works. Keyword, location, employment type, source, posting date and
      sponsorship, each filter present because the stored data supports it
- [x] Heatmap works
- [x] Drilldown works
- [ ] Job details work. Listings link to the original advertisement; there is no
      detail page of our own, and given the field rights matrix there may never
      need to be one
- [x] Market pages work. Locations, occupations, insights, compare, explore
- [ ] Skill analytics. Not built. `skills/` is an empty boundary
- [ ] Salary analytics are honest about coverage. Not built, and not worth
      building: nine listings of 2,713 state a salary

## Data

- [x] JSA imports validated
- [x] Job source permissions verified. Four sources verified, one verified as
      prohibited; `docs/compliance/SOURCE_REGISTER.md` carries the evidence
- [x] Provenance present. `npm run data:check` asserts it
- [x] Freshness logic working. Posted, verified and retrieved are distinct, and
      the lifecycle is derived rather than stored (ADR-0012)
- [x] Duplicate handling working. `npm run jobs:dedupe`, asserted by `data:check`

## UX

- [x] Mobile. Every table scrolls inside its own frame; the plate reorders to one
      column; controls are built to a 44px minimum
- [x] Desktop
- [x] Accessibility. `npm run a11y:check` covers structure across 17 routes.
      Contrast computed across every token pair in both schemes
- [ ] Accessibility, by hand. Keyboard and screen reader passes have not been
      done, and how the map reads is a question only a person can answer
- [x] Error states
- [x] Empty states
- [x] Source attribution. Rendered from the registry, with the licence linked

## Engineering

- [x] Tests pass. `npm run check`
- [x] Typecheck pass
- [x] Lint pass, including the architectural import boundaries
- [x] Performance targets met. Query time is around a millisecond; the numbers
      that looked alarming were round trips from outside the region (milestone 27)
- [x] Security review complete. Milestone 27, including what it looked at and
      found nothing wrong with
- [ ] Backups and recovery documented. Neon's own retention is the only thing
      standing between this and a bad migration, and nothing says so anywhere
- [x] Monitoring operational. `npm run source:health`, weekly in CI, failing loud

## Commercial

- [x] Data rights verified, per source and per field of an advertisement
      (ADR-0011)
- [ ] Terms and privacy reviewed. Not written. Blocked on brand identity; see
      `docs/BACKLOG.md`
- [x] No unsupported coverage claims. `/methodology` gives what the site does not
      measure as much room as what it does
- [ ] Support and contact path exists. Blocked on the same thing

## Blocking launch

Three, and the first two are one decision:

1. **A contact address and a legal or operator name.** Without them there is no
   privacy policy, no terms, and no route by which a person can report an error
   or ask for something to be removed.
2. **A domain.** Canonical URLs, the sitemap and indexation all wait on it, and
   the site is `noindex` until they exist.
3. **`public/adzuna-logo.png`.** Their terms require their logo in the
   attribution on every page showing their adverts, and their site blocks
   automated download, so it has to be fetched by hand.

Everything else on this page is either done or deliberately deferred with the
reason recorded.
