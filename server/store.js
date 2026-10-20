// Cloud storage for Lift. Every record (exercise, split day, workout, setting)
// is one row. A record only replaces the stored copy when its updatedAt is
// newer, and each accepted write gets the next `seq` from a server sequence,
// which devices use as their pull cursor. MemoryStore mirrors NeonStore for
// tests and local runs.

export const SCHEMA = `
create sequence if not exists lift_seq;
create table if not exists lift_records (
  id text primary key,
  kind text not null,
  doc jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null default nextval('lift_seq')
);
create index if not exists lift_records_seq on lift_records (seq)
`;

export const PULL_LIMIT = 2000;

export class MemoryStore {
  constructor() {
    this.rows = new Map();
    this.seq = 0;
  }

  // Returns how many of the records were newer than what was stored.
  async upsert(records) {
    let accepted = 0;
    for (const record of records) {
      const current = this.rows.get(record.id);
      if (current && current.doc.updatedAt >= record.updatedAt) continue;
      this.seq += 1;
      this.rows.set(record.id, { doc: structuredClone(record), seq: this.seq });
      accepted += 1;
    }
    return accepted;
  }

  async changesSince(since, limit = PULL_LIMIT) {
    const rows = [...this.rows.values()].filter((row) => row.seq > since).sort((a, b) => a.seq - b.seq).slice(0, limit);
    return rows.map((row) => ({ doc: structuredClone(row.doc), seq: row.seq }));
  }

  async head() {
    return this.seq;
  }
}

export class NeonStore {
  constructor(url, { neon } = {}) {
    this.url = url;
    this.neonFactory = neon;
    this.sql = null;
    this.ready = null;
  }

  async init() {
    if (!this.ready) {
      this.ready = (async () => {
        const factory = this.neonFactory || (await import("@neondatabase/serverless")).neon;
        this.sql = factory(this.url);
        for (const statement of SCHEMA.split(";").map((part) => part.trim()).filter(Boolean)) await this.sql.query(statement);
      })().catch((error) => {
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  async query(text, params = []) {
    await this.init();
    return this.sql.query(text, params);
  }

  async upsert(records) {
    if (!records.length) return 0;
    const rows = await this.query(
      `insert into lift_records (id, kind, doc, updated_at, deleted)
       select id, kind, doc::jsonb, updated_at, deleted
       from unnest($1::text[], $2::text[], $3::text[], $4::bigint[], $5::boolean[]) as t(id, kind, doc, updated_at, deleted)
       on conflict (id) do update
         set kind = excluded.kind, doc = excluded.doc, updated_at = excluded.updated_at,
             deleted = excluded.deleted, seq = nextval('lift_seq')
         where lift_records.updated_at < excluded.updated_at
       returning id`,
      [
        records.map((record) => record.id),
        records.map((record) => record.kind),
        records.map((record) => JSON.stringify(record)),
        records.map((record) => record.updatedAt),
        records.map((record) => Boolean(record.deleted))
      ]
    );
    return rows.length;
  }

  async changesSince(since, limit = PULL_LIMIT) {
    const rows = await this.query("select doc, seq from lift_records where seq > $1 order by seq limit $2", [since, limit]);
    return rows.map((row) => ({ doc: row.doc, seq: Number(row.seq) }));
  }

  // The newest seq handed out, so a device can tell the database was reset.
  async head() {
    const rows = await this.query("select coalesce(max(seq), 0) as head from lift_records");
    return Number(rows[0].head);
  }
}
