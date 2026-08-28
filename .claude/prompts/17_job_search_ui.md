# Prompt 17 — Job Discovery UI With Source-Aware States

Build the job discovery UI using the source abstraction.

During development, synthetic records may be used only behind an explicit development flag and must be visibly labelled as development data.

In production, when no authorized individual-job source is active, show a truthful unavailable/coming-soon state rather than fake listings.

Support keyword, occupation, location, employment type, remote type and date filters. Follow the editorial/cartographic design system and avoid generic AI/SaaS cards.
