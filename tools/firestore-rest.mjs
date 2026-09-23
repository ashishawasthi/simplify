// A small Firestore REST client for the owner's one-off tools
// (tools/seed-institutions.mjs, tools/migrate-coaches.mjs): no dependencies.
//
// Against production it signs requests with the gcloud user's OAuth token
// (`gcloud auth print-access-token`), which is an IAM principal, so the
// security rules do not apply — only run these tools as the project's owner.
// Against the emulator (--emulator host:port, or FIRESTORE_EMULATOR_HOST) it
// uses the emulator's "owner" token, which skips the rules the same way.

import { execFileSync } from "node:child_process";

export const PROJECT = "simplify-special";
export const SERVER_TIME = Symbol("server time");

// --emulator host:port, --project id, and the rest of the flags as a Set
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2);
    if (["emulator", "project", "file"].includes(key)) out.values[key] = inline ?? argv[++i];
    else out.flags.add(key);
  }
  return out;
}

export function connect({ emulator = process.env.FIRESTORE_EMULATOR_HOST, project = PROJECT } = {}) {
  const base = emulator
    ? `http://${emulator}/v1/projects/${project}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  let token = emulator ? "owner" : null;
  const auth = () => {
    if (!token) {
      try {
        token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
      } catch {
        throw new Error("No gcloud token: run `gcloud auth login` as the project's owner first.");
      }
    }
    return {
      authorization: `Bearer ${token}`,
      ...(emulator ? {} : { "x-goog-user-project": project }),
    };
  };
  const docName = (path) => `projects/${project}/databases/(default)/documents/${path}`;

  async function call(url, init = {}) {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...auth(), ...(init.headers ?? {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Firestore ${res.status}: ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : {};
  }

  return {
    where: emulator ? `the emulator at ${emulator}` : `project ${project}`,

    // every document of a top-level collection: [{ id, data }]
    async listAll(collection) {
      const out = [];
      let pageToken = "";
      do {
        const page = await call(`${base}/${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
        for (const d of page.documents ?? []) out.push({ id: d.name.split("/").pop(), data: decodeFields(d.fields ?? {}) });
        pageToken = page.nextPageToken ?? "";
      } while (pageToken);
      return out;
    },

    // writes: [{ path, data, create?: true, mask?: [fields] }]; SERVER_TIME
    // values become the commit's time. At most 500 a commit, all or nothing.
    async commit(writes) {
      for (let i = 0; i < writes.length; i += 500) {
        await call(`${base}:commit`, {
          method: "POST",
          body: JSON.stringify({ writes: writes.slice(i, i + 500).map((w) => toWrite(w, docName)) }),
        });
      }
    },
  };
}

function toWrite({ path, data, create, mask }, docName) {
  const times = Object.keys(data).filter((k) => data[k] === SERVER_TIME);
  const plainKeys = Object.keys(data).filter((k) => data[k] !== SERVER_TIME);
  return {
    update: { name: docName(path), fields: encodeFields(Object.fromEntries(plainKeys.map((k) => [k, data[k]]))) },
    ...(mask ? { updateMask: { fieldPaths: mask.filter((k) => !times.includes(k)) } } : {}),
    ...(create ? { currentDocument: { exists: false } } : mask ? { currentDocument: { exists: true } } : {}),
    ...(times.length ? { updateTransforms: times.map((fieldPath) => ({ fieldPath, setToServerValue: "REQUEST_TIME" })) } : {}),
  };
}

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === "number") return { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(v) } };
}
export function encodeFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encodeValue(v)]));
}

function decodeValue(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}
export function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}
