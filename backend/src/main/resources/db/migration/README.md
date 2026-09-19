# DB migrations (Flyway)

The schema up to this point was built incrementally by Hibernate's `ddl-auto: update` and is not
represented by any file here — it was marked as the Flyway baseline (version 0) when Flyway was
introduced (#17), not replayed from scratch.

From now on, every schema change must be a new file in this directory named
`V<next-number>__<short_description>.sql` (e.g. `V1__add_attempt_snapshot_columns.sql`), applied in
order and never edited once committed. `ddl-auto` is `validate` — Hibernate will refuse to boot if the
entities and the actual (Flyway-migrated) schema disagree, instead of silently altering the schema itself.
