// Cloud storage for Lift. Every record (exercise, split day, workout, setting)
// is one row, owned by an account (its email), so ids only have to be unique
// per person. A record only replaces the stored copy when its updatedAt is
// newer, and each accepted write gets the next `seq` from a server sequence,
// which devices use as their pull cursor. `forOwner(email)` gives the record
// methods for one account. MemoryStore mirrors NeonStore for tests and local
// runs. `lift_users` is the invite list; `lift_once` remembers one-time OAuth
// codes and refresh tokens that were already used; `lift_friends` holds
// friendships (pending until the other person accepts), one row per pair
// with the two emails in sorted order.

// Run in order on first use. Before accounts, records had no owner: those
// rows are given to `legacyOwner` (the first admin) and the primary key moves
// from (id) to (owner, id).
export const SCHEMA = [
  "create sequence if not exists lift_seq",
  `create table if not exists lift_records (
    owner text not null,
    id text not null,
    kind text not null,
    doc jsonb not null,
    updated_at bigint not null,
    deleted boolean not null default false,
    seq bigint not null default nextval('lift_seq'),
    primary key (owner, id)
  )`,
  "alter table lift_records add column if not exists owner text",
  { legacy: "update lift_records set owner = $1 where owner is null" },
  `do $$
  declare pk text;
  begin
    select conname into pk from pg_constraint
      where conrelid = 'lift_records'::regclass and contype = 'p' and array_length(conkey, 1) = 1;
    if pk is not null and not exists (select 1 from lift_records where owner is null) then
      execute format('alter table lift_records drop constraint %I', pk);
      alter table lift_records alter column owner set not null;
      alter table lift_records add primary key (owner, id);
    end if;
  end $$`,
  "drop index if exists lift_records_seq",
  "drop index if exists lift_records_kind",
  "create index if not exists lift_records_owner_seq on lift_records (owner, seq)",
  "create index if not exists lift_records_owner_kind on lift_records (owner, kind)",
  `create table if not exists lift_once (
    key text primary key,
    expires_at bigint not null
  )`,
  `create table if not exists lift_users (
    email text primary key,
    name text not null default '',
    vip boolean not null default false,
    invited_by text not null default '',
    created_at bigint not null,
    last_seen_at bigint
  )`,
  `create table if not exists lift_friends (
    a text not null,
    b text not null,
    status text not null,
    requested_by text not null,
    created_at bigint not null,
    primary key (a, b)
  )`,
  "create index if not exists lift_friends_b on lift_friends (b)"
];

export const PULL_LIMIT = 2000;

// The record methods for one account.
function scoped(store, owner) {
  return {
    upsert: (records) => store.upsertFor(owner, records),
    changesSince: (since, limit) => store.changesSinceFor(owner, since, limit),
    head: () => store.headFor(owner),
    get: (id) => store.getFor(owner, id),
    listKind: (kind) => store.listKindFor(owner, kind)
  };
}

// A friendship's key: the two emails in sorted order.
export const friendPair = (x, y) => (x < y ? [x, y] : [y, x]);
const friendRow = (row) => {
  const [a, b] = friendPair(row.a, row.b);
  return { a, b, status: row.status, requestedBy: row.requestedBy, createdAt: row.createdAt };
};

const userRow = (user) => ({ email: user.email, name: user.name || "", vip: Boolean(user.vip), invitedBy: user.invitedBy || "", createdAt: user.createdAt, lastSeenAt: user.lastSeenAt ?? null });

export class MemoryStore {
  constructor() {
    this.rows = new Map();
    this.users = new Map();
    this.friends = new Map();
    this.seq = 0;
  }

  forOwner(owner) {
    return scoped(this, owner);
  }

  // Returns how many of the records were newer than what was stored.
  async upsertFor(owner, records) {
    let accepted = 0;
    for (const record of records) {
      const key = `${owner}\n${record.id}`;
      const current = this.rows.get(key);
      if (current && current.doc.updatedAt >= record.updatedAt) continue;
      this.seq += 1;
      this.rows.set(key, { owner, doc: structuredClone(record), seq: this.seq });
      accepted += 1;
    }
    return accepted;
  }

  mine(owner) {
    return [...this.rows.values()].filter((row) => row.owner === owner);
  }

  async changesSinceFor(owner, since, limit = PULL_LIMIT) {
    const rows = this.mine(owner).filter((row) => row.seq > since).sort((a, b) => a.seq - b.seq).slice(0, limit);
    return rows.map((row) => ({ doc: structuredClone(row.doc), seq: row.seq }));
  }

  async headFor(owner) {
    return Math.max(0, ...this.mine(owner).map((row) => row.seq));
  }

  async getFor(owner, id) {
    const row = this.rows.get(`${owner}\n${id}`);
    return row ? structuredClone(row.doc) : null;
  }

  // Live (not deleted) records of one kind.
  async listKindFor(owner, kind) {
    return this.mine(owner).filter((row) => row.doc.kind === kind && !row.doc.deleted).map((row) => structuredClone(row.doc));
  }

  // True the first time a key is claimed, false on every later try.
  async claim(key, expiresAt, now = Date.now()) {
    this.once ||= new Map();
    for (const [k, until] of this.once) if (until < now) this.once.delete(k);
    if (this.once.has(key)) return false;
    this.once.set(key, expiresAt);
    return true;
  }

  async getUser(email) {
    const user = this.users.get(email);
    return user ? { ...user } : null;
  }

  async listUsers() {
    return [...this.users.values()].map((user) => ({ ...user })).sort((a, b) => a.createdAt - b.createdAt);
  }

  async putUser(user) {
    this.users.set(user.email, userRow(user));
  }

  async removeUser(email) {
    this.users.delete(email);
  }

  async listFriendships(email) {
    return [...this.friends.values()].filter((row) => row.a === email || row.b === email).map((row) => ({ ...row }));
  }

  async getFriendship(x, y) {
    const row = this.friends.get(friendPair(x, y).join("\n"));
    return row ? { ...row } : null;
  }

  async putFriendship(row) {
    const clean = friendRow(row);
    this.friends.set(`${clean.a}\n${clean.b}`, clean);
  }

  async removeFriendship(x, y) {
    this.friends.delete(friendPair(x, y).join("\n"));
  }
}

export class NeonStore {
  constructor(url, { neon, legacyOwner = "" } = {}) {
    this.url = url;
    this.neonFactory = neon;
    this.legacyOwner = legacyOwner;
    this.sql = null;
    this.ready = null;
  }

  async init() {
    if (!this.ready) {
      this.ready = (async () => {
        const factory = this.neonFactory || (await import("@neondatabase/serverless")).neon;
        this.sql = factory(this.url);
        for (const statement of SCHEMA) {
          if (typeof statement === "string") await this.sql.query(statement);
          else if (this.legacyOwner) await this.sql.query(statement.legacy, [this.legacyOwner]);
        }
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

  forOwner(owner) {
    return scoped(this, owner);
  }

  async upsertFor(owner, records) {
    if (!records.length) return 0;
    const rows = await this.query(
      `insert into lift_records (owner, id, kind, doc, updated_at, deleted)
       select $1, id, kind, doc::jsonb, updated_at, deleted
       from unnest($2::text[], $3::text[], $4::text[], $5::bigint[], $6::boolean[]) as t(id, kind, doc, updated_at, deleted)
       on conflict (owner, id) do update
         set kind = excluded.kind, doc = excluded.doc, updated_at = excluded.updated_at,
             deleted = excluded.deleted, seq = nextval('lift_seq')
         where lift_records.updated_at < excluded.updated_at
       returning id`,
      [
        owner,
        records.map((record) => record.id),
        records.map((record) => record.kind),
        records.map((record) => JSON.stringify(record)),
        records.map((record) => record.updatedAt),
        records.map((record) => Boolean(record.deleted))
      ]
    );
    return rows.length;
  }

  async changesSinceFor(owner, since, limit = PULL_LIMIT) {
    const rows = await this.query("select doc, seq from lift_records where owner = $1 and seq > $2 order by seq limit $3", [owner, since, limit]);
    return rows.map((row) => ({ doc: row.doc, seq: Number(row.seq) }));
  }

  // The newest seq handed out for this account, so a device can tell the
  // database was reset.
  async headFor(owner) {
    const rows = await this.query("select coalesce(max(seq), 0) as head from lift_records where owner = $1", [owner]);
    return Number(rows[0].head);
  }

  async getFor(owner, id) {
    const rows = await this.query("select doc from lift_records where owner = $1 and id = $2", [owner, id]);
    return rows[0]?.doc || null;
  }

  async listKindFor(owner, kind) {
    const rows = await this.query("select doc from lift_records where owner = $1 and kind = $2 and not deleted", [owner, kind]);
    return rows.map((row) => row.doc);
  }

  async claim(key, expiresAt, now = Date.now()) {
    await this.query("delete from lift_once where expires_at < $1", [now]);
    const rows = await this.query("insert into lift_once (key, expires_at) values ($1, $2) on conflict (key) do nothing returning key", [key, expiresAt]);
    return rows.length === 1;
  }

  async getUser(email) {
    const rows = await this.query("select * from lift_users where email = $1", [email]);
    return rows[0] ? fromUserRow(rows[0]) : null;
  }

  async listUsers() {
    return (await this.query("select * from lift_users order by created_at")).map(fromUserRow);
  }

  async putUser(user) {
    const row = userRow(user);
    await this.query(
      `insert into lift_users (email, name, vip, invited_by, created_at, last_seen_at) values ($1, $2, $3, $4, $5, $6)
       on conflict (email) do update set name = excluded.name, vip = excluded.vip, invited_by = excluded.invited_by, last_seen_at = excluded.last_seen_at`,
      [row.email, row.name, row.vip, row.invitedBy, row.createdAt, row.lastSeenAt]
    );
  }

  async removeUser(email) {
    await this.query("delete from lift_users where email = $1", [email]);
  }

  async listFriendships(email) {
    return (await this.query("select * from lift_friends where a = $1 or b = $1", [email])).map(fromFriendRow);
  }

  async getFriendship(x, y) {
    const rows = await this.query("select * from lift_friends where a = $1 and b = $2", friendPair(x, y));
    return rows[0] ? fromFriendRow(rows[0]) : null;
  }

  async putFriendship(row) {
    const clean = friendRow(row);
    await this.query(
      `insert into lift_friends (a, b, status, requested_by, created_at) values ($1, $2, $3, $4, $5)
       on conflict (a, b) do update set status = excluded.status, requested_by = excluded.requested_by`,
      [clean.a, clean.b, clean.status, clean.requestedBy, clean.createdAt]
    );
  }

  async removeFriendship(x, y) {
    await this.query("delete from lift_friends where a = $1 and b = $2", friendPair(x, y));
  }
}

const fromFriendRow = (row) => ({ a: row.a, b: row.b, status: row.status, requestedBy: row.requested_by, createdAt: Number(row.created_at) });
const fromUserRow = (row) => ({ email: row.email, name: row.name, vip: Boolean(row.vip), invitedBy: row.invited_by, createdAt: Number(row.created_at), lastSeenAt: row.last_seen_at == null ? null : Number(row.last_seen_at) });
