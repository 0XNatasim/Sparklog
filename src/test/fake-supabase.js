// In-memory stand-in for the Supabase client, for screen tests (jsdom). Every query is recorded in
// `calls` so a test can check what a screen read or wrote; answers come from `tables` / `rpcs`.
//
//   const fake = createFakeSupabase({ tables: { profiles: [...] }, rpcs: { nas_presence: [] } });
//   vi.mock("@/supabaseClient", () => ({ supabase: fake.client }));
//
// A table or RPC answer can be a function (receives the recorded call) to vary it per request.
// Filters are not applied: a screen test gives the rows the screen should receive.
export function createFakeSupabase({ tables = {}, rpcs = {}, functions = {}, session = { access_token: "token", user: { id: "me" } } } = {}) {
  const calls = [];

  // Resolves to { data, error }; a function answer may return a promise (to hold a request open).
  async function answer(source, call) {
    const value = await (typeof source === "function" ? source(call) : source);
    if (value && typeof value === "object" && ("data" in value || "error" in value)) return value;
    return { data: value ?? null, error: null };
  }
  const one = (result) => (Array.isArray(result.data) ? { ...result, data: result.data[0] ?? null } : result);

  function query(table) {
    const call = { table, op: "select", filters: [], payload: null };
    calls.push(call);
    const builder = {
      select(columns) { if (call.op === "select") call.columns = columns; else call.returning = columns; return builder; },
      insert(payload) { call.op = "insert"; call.payload = payload; return builder; },
      update(payload) { call.op = "update"; call.payload = payload; return builder; },
      upsert(payload) { call.op = "upsert"; call.payload = payload; return builder; },
      delete() { call.op = "delete"; return builder; },
      single() { call.single = true; return builder; },
      maybeSingle() { call.single = true; return builder; },
      abortSignal() { return builder; },
      then(resolve, reject) {
        const rows = tables[table];
        return answer(call.op === "select" ? rows ?? [] : typeof rows === "function" ? rows : null, call)
          .then((result) => (call.single ? one(result) : result))
          .then(resolve, reject);
      },
    };
    for (const name of ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "or", "not", "like", "ilike", "order", "limit", "range", "match", "filter", "contains"]) {
      builder[name] = (...args) => { call.filters.push([name, ...args]); return builder; };
    }
    return builder;
  }

  const client = {
    from: query,
    rpc(name, args) {
      const call = { rpc: name, args };
      calls.push(call);
      const builder = {
        single() { call.single = true; return builder; },
        maybeSingle() { call.single = true; return builder; },
        abortSignal() { return builder; },
        then(resolve, reject) {
          return answer(rpcs[name] ?? [], call)
            .then((result) => (call.single ? one(result) : result))
            .then(resolve, reject);
        },
      };
      return builder;
    },
    functions: {
      invoke(name, options) {
        const call = { fn: name, options };
        calls.push(call);
        return answer(functions[name] ?? { ok: true }, call);
      },
    },
    storage: {
      from(bucket) {
        return {
          createSignedUrl: (path) => { calls.push({ storage: bucket, op: "sign", path }); return Promise.resolve({ data: { signedUrl: `https://storage.test/${bucket}/${path}` }, error: null }); },
          upload: (path) => { calls.push({ storage: bucket, op: "upload", path }); return Promise.resolve({ data: { path }, error: null }); },
          remove: (paths) => { calls.push({ storage: bucket, op: "remove", paths }); return Promise.resolve({ data: [], error: null }); },
        };
      },
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      getUser: () => Promise.resolve({ data: { user: session?.user ?? null }, error: null }),
      refreshSession: () => Promise.resolve({ data: { session }, error: null }),
    },
    channel() {
      const channel = { on: () => channel, subscribe: () => channel, unsubscribe: () => undefined };
      return channel;
    },
    removeChannel: () => undefined,
  };

  return {
    client,
    calls,
    writes: (table) => calls.filter((call) => call.table === table && call.op !== "select"),
    rpcCalls: (name) => calls.filter((call) => call.rpc === name),
  };
}
