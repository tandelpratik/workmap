# Skills

Skill extraction and matching.

**Nothing is implemented here yet.** The directory is a boundary rather than a
module: it exists so that when extraction is built it has a place with a stated
rule, and so that nobody puts it in `ingestion/` by default.

The rule, when it is built: deterministic extraction first, and skills are never
invented for a listing that does not mention them. How a skill came to be
attached is recorded on the join, so derived analytics can be qualified by it
(`JobSkill.method` in the schema).

Two sibling boundaries were removed rather than left standing. `search/`
described full-text search with trigram fallback and keyset pagination, none of
which was built; search is `ILIKE` matching in `db/repositories/job.ts`, and an
empty directory implying otherwise was worse than no directory. `salary/` was
removed on evidence: nine of 2,713 listings state a salary, which is not a
distribution.
