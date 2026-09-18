# PostGIS `spatial_ref_sys` security advisory

Supabase Security Advisor can report `public.spatial_ref_sys` as “RLS Disabled
in Public” (check 0013) when PostGIS is installed in `public`. This is not a
user-data exposure: `spatial_ref_sys` is PostGIS's built-in coordinate-system
lookup table. The underlying configuration problem is that PostGIS's objects
are in a schema exposed to the Data API.

Do not try to resolve this with an application migration that enables RLS,
changes ownership, or revokes grants on `public.spatial_ref_sys`. Supabase owns
the extension table, so the project database role cannot reliably alter it.
The security migrations intentionally leave it alone for this reason.

## Supported remediation

For a new PostGIS installation, use the Supabase Dashboard's Database →
Extensions flow and choose a dedicated schema (for example, `gis` or
`extensions`) that is not listed under the project's Data API exposed schemas.
Do not install PostGIS in `public`.

For an existing installation in `public`, PostGIS 2.3 and later is not
relocatable by a normal `ALTER EXTENSION ... SET SCHEMA`. On a Supabase-managed
project, take a database backup and ask Supabase Support to perform the
documented in-place relocation to a dedicated, non-exposed schema. This avoids
the drop-and-recreate path and its dependency/data-loss risks. Include the
installed PostGIS version and the desired target schema in the request. Follow
the current [Supabase PostGIS troubleshooting guide](https://supabase.com/docs/guides/database/extensions/postgis#troubleshooting)
for the support-assisted procedure.

The documented self-service alternative drops PostGIS with `CASCADE` and
recreates it in the new schema. That can also drop dependent application
objects; it is not a repo migration and must not be run without a tested
backup, a dependency audit, and a planned restore/recreation window. For a
self-hosted stack, this is an operator-level database change: the ordinary
application migration role is not sufficient. Have the database operator
choose and test the relocation/recreation procedure for the installed PostGIS
version before making the production change.

Repo inspection found no application geometry/geography columns or PostGIS
query calls. It does contain historical ACL migrations for PostGIS helper
functions, but deployed database dependencies still need to be checked before
any extension rebuild.

## Verification

After the extension move (or removal, if PostGIS is intentionally no longer
needed), run the read-only assertion in
[`supabase/verification/postgis_schema.sql`](../supabase/verification/postgis_schema.sql)
against the target database. It passes if PostGIS and its
`spatial_ref_sys` relation are both absent, or if they are installed together
outside `public`. Also confirm the target schema is not in the Data API's
exposed-schema list, then rerun Security Advisor and confirm check 0013 no
longer reports `public.spatial_ref_sys`.

Until that operator/support action is completed, the existing finding is an
expected false positive for a public reference table—not something a repo
migration can clear safely.
