import { expect, test } from "bun:test";
import { IndieAuthState } from "../src/lib/server/indieauth/state";
const settings = {
  issuer: "https://auth.example/",
  me: "https://example/",
  rpID: "auth.example",
  rpName: "Owner",
  tokenTTL: 2592000,
  setupToken: "secret",
};
class MemoryStorage {
  data = new Map<string, unknown>();
  alarmAt: number | null = null;
  async setAlarm(time: number) {
    this.alarmAt = time;
  }
  async deleteAlarm() {
    this.alarmAt = null;
  }
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T;
  }
  async put(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
  }
  async transaction<T>(fn: (s: MemoryStorage) => Promise<T>) {
    return fn(this);
  }
}
function fixture() {
  let now = 1000000;
  const storage = new MemoryStorage();
  const state = new IndieAuthState(storage, settings, { now: () => now });
  return { state, storage, advance: (ms: number) => (now += ms) };
}
test("bootstrap requires exact origin and setup token", async () => {
  const { state } = fixture();
  await expect(
    state.invoke("registrationOptions", {
      origin: "https://evil.example",
      authorization: { setupToken: "secret" },
    }),
  ).rejects.toThrow("invalid_request");
  await expect(
    state.invoke("registrationOptions", {
      origin: "https://auth.example",
      authorization: { setupToken: "wrong" },
    }),
  ).rejects.toThrow("invalid_owner_auth");
  expect(await state.invoke("status", {})).toEqual({
    credentialCount: 0,
    setupAvailable: true,
  });
});
test("unknown sessions and tokens fail closed", async () => {
  const { state } = fixture();
  expect(await state.invoke("session", { token: "unknown" })).toBeNull();
  expect(await state.invoke("introspectToken", { token: "unknown" })).toEqual({
    active: false,
  });
  await expect(
    state.invoke("personalToken", {
      session: "unknown",
      csrf: "x",
      scope: ["create"],
    }),
  ).rejects.toThrow("invalid_owner_auth");
});
test("pending requests expire and cannot grant without owner session", async () => {
  const { state, advance } = fixture();
  const { id } = await state.invoke("createRequest", {
    clientId: "https://client.example/",
    redirectUri: "https://client.example/cb",
    scope: ["create"],
    codeChallenge: "A".repeat(43),
  });
  await expect(
    state.invoke("approveRequest", {
      id,
      session: "unknown",
      csrf: "x",
      scope: ["create"],
    }),
  ).rejects.toThrow("invalid_owner_auth");
  advance(600001);
  expect(await state.invoke("request", { id })).toBeNull();
});
test("rate limits reset after window", async () => {
  const { state, advance } = fixture();
  for (let i = 0; i < 30; i++)
    expect(await state.invoke("rateLimit", { key: "ip" })).toBe(true);
  expect(await state.invoke("rateLimit", { key: "ip" })).toBe(false);
  advance(60001);
  expect(await state.invoke("rateLimit", { key: "ip" })).toBe(true);
});
import { hash, type WebAuthn } from "../src/lib/server/indieauth/state";
import * as realWebauthn from "@simplewebauthn/server";
async function enrolled() {
  let now = 1000000;
  let nextCounter = 1;
  let rejectRegistration = false;
  const storage = new MemoryStorage();
  const webauthn = {
    ...realWebauthn,
    verifyRegistrationResponse: async (options: {
      response: { id?: string };
    }) => {
      if (rejectRegistration) throw Error("bad");
      return {
        verified: true,
        registrationInfo: {
          credential: {
            id: options.response.id ?? "key",
            publicKey: new Uint8Array([1]),
            counter: 0,
          },
          credentialDeviceType: "singleDevice",
          credentialBackedUp: false,
        },
      };
    },
    verifyAuthenticationResponse: async () => ({
      verified: true,
      authenticationInfo: { newCounter: nextCounter },
    }),
  } as unknown as WebAuthn;
  const state = new IndieAuthState(storage, settings, {
    now: () => now,
    webauthn,
  });
  const authorization = { setupToken: "secret" };
  const options = await state.invoke("registrationOptions", {
    authorization,
    origin: "https://auth.example",
  });
  const owner = await state.invoke("registrationVerify", {
    authorization,
    origin: "https://auth.example",
    id: options.id,
    response: {},
  });
  return {
    state,
    storage,
    owner,
    advance: (ms: number) => (now += ms),
    counter: (n: number) => (nextCounter = n),
    reject: () => (rejectRegistration = true),
  };
}
test("first enrollment closes bootstrap and owner csrf protects further registration", async () => {
  const { state, owner } = await enrolled();
  expect((await state.invoke("status", {})).setupAvailable).toBe(false);
  await expect(
    state.invoke("registrationOptions", {
      origin: "https://auth.example",
      authorization: { setupToken: "secret" },
    }),
  ).rejects.toThrow("setup_closed");
  await expect(
    state.invoke("registrationOptions", {
      origin: "https://auth.example",
      authorization: { session: owner.sessionToken, csrf: "bad" },
    }),
  ).rejects.toThrow("csrf_failed");
  await expect(
    state.invoke("removeCredential", {
      session: owner.sessionToken,
      csrf: owner.csrf,
      id: "key",
    }),
  ).rejects.toThrow("last_credential");
});
test("codes bind consent and PKCE and exchange exactly once under concurrency", async () => {
  const { state, owner, storage } = await enrolled();
  const verifier = "A".repeat(43);
  const request = {
    clientId: "https://client.example/",
    redirectUri: "https://client.example/cb",
    scope: ["create"],
    codeChallenge: await hash(verifier),
  };
  const { id } = await state.invoke("createRequest", request);
  await expect(
    state.invoke("approveRequest", {
      id,
      session: owner.sessionToken,
      csrf: owner.csrf,
      scope: ["delete"],
    }),
  ).rejects.toThrow("invalid_scope");
  const { code } = await state.invoke("approveRequest", {
    id,
    session: owner.sessionToken,
    csrf: owner.csrf,
    scope: ["create"],
  });
  expect(await state.invoke("request", { id })).toBeNull();
  await expect(
    state.invoke("exchangeCode", {
      code,
      clientId: request.clientId,
      redirectUri: "https://evil/",
      verifier,
    }),
  ).rejects.toThrow("invalid_grant");
  await expect(
    state.invoke("exchangeCode", {
      code,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      verifier: "B".repeat(43),
    }),
  ).rejects.toThrow("invalid_grant");
  const attempts = await Promise.allSettled(
    [1, 2].map(() =>
      state.invoke("exchangeCode", {
        code,
        clientId: request.clientId,
        redirectUri: request.redirectUri,
        verifier,
      }),
    ),
  );
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const token = (
    attempts.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<any>
  ).value.access_token;
  expect(await state.invoke("introspectToken", { token })).toMatchObject({
    active: true,
    scope: "create",
    me: settings.me,
  });
  const dump = JSON.stringify([...storage.data.values()]);
  expect(dump).not.toContain(token);
  expect(dump).not.toContain(code);
  expect(dump).not.toContain(owner.sessionToken);
  await state.invoke("revokeToken", { token });
  expect(await state.invoke("introspectToken", { token })).toEqual({
    active: false,
  });
});
test("authentication challenge is single use and counters cannot regress", async () => {
  const { state, counter } = await enrolled();
  const login = async () =>
    state.invoke("authenticationOptions", { origin: "https://auth.example" });
  const first = await login();
  await state.invoke("authenticationVerify", {
    origin: "https://auth.example",
    id: first.id,
    response: { id: "key" },
  });
  await expect(
    state.invoke("authenticationVerify", {
      origin: "https://auth.example",
      id: first.id,
      response: { id: "key" },
    }),
  ).rejects.toThrow("invalid_authentication");
  const second = await login();
  counter(1);
  await expect(
    state.invoke("authenticationVerify", {
      origin: "https://auth.example",
      id: second.id,
      response: { id: "key" },
    }),
  ).rejects.toThrow("invalid_authentication");
  counter(2);
  await expect(
    state.invoke("authenticationVerify", {
      origin: "https://auth.example",
      id: second.id,
      response: { id: "key" },
    }),
  ).rejects.toThrow("invalid_authentication");
});
test("sessions expire, logout requires csrf, token expiry follows configuration", async () => {
  const { state, owner, advance } = await enrolled();
  const token = await state.invoke("personalToken", {
    session: owner.sessionToken,
    csrf: owner.csrf,
    scope: ["read"],
  });
  await expect(
    state.invoke("logout", { session: owner.sessionToken, csrf: "bad" }),
  ).rejects.toThrow("csrf_failed");
  advance(43200001);
  expect(
    await state.invoke("session", { token: owner.sessionToken }),
  ).toBeNull();
  expect(
    (await state.invoke("introspectToken", { token: token.access_token }))
      .active,
  ).toBe(true);
  advance(settings.tokenTTL * 1000);
  expect(
    await state.invoke("introspectToken", { token: token.access_token }),
  ).toEqual({ active: false });
});
test("authentication rejects another owner userHandle", async () => {
  const { state } = await enrolled();
  const { id } = await state.invoke("authenticationOptions", {
    origin: "https://auth.example",
  });
  await expect(
    state.invoke("authenticationVerify", {
      id,
      origin: "https://auth.example",
      response: { id: "key", response: { userHandle: "wrong" } },
    }),
  ).rejects.toThrow("invalid_authentication");
});
import { createTestAuthenticator } from "./helpers/webauthn";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
test("real ES256 registration and authentication enforce cryptographic signature and UV", async () => {
  const storage = new MemoryStorage(),
    state = new IndieAuthState(storage, settings);
  const origin = "https://auth.example",
    authorization = { setupToken: "secret" };
  const authenticator = await createTestAuthenticator(settings.rpID, origin);
  const registration = await state.invoke("registrationOptions", {
    authorization,
    origin,
  });
  const owner = await state.invoke("registrationVerify", {
    id: registration.id,
    authorization,
    origin,
    response: await authenticator.registration(
      registration.options as unknown as PublicKeyCredentialCreationOptionsJSON,
    ),
  });
  expect(
    await state.invoke("session", { token: owner.sessionToken }),
  ).not.toBeNull();
  const authenticate = async (flags: number, damageSignature = false) => {
    const options = await state.invoke("authenticationOptions", { origin });
    return state.invoke("authenticationVerify", {
      id: options.id,
      origin,
      response: await authenticator.authentication(
        options.options as unknown as PublicKeyCredentialRequestOptionsJSON,
        { flags, damageSignature },
      ),
    });
  };
  await expect(authenticate(0x01)).rejects.toThrow("invalid_authentication");
  await expect(authenticate(0x05, true)).rejects.toThrow(
    "invalid_authentication",
  );
  const login = await authenticate(0x05);
  expect(
    await state.invoke("session", { token: login.sessionToken }),
  ).not.toBeNull();
});
test("unauthenticated challenge allocation is bounded until expiry", async () => {
  const { state, advance } = fixture();
  for (let i = 0; i < 128; i++)
    await state.invoke("authenticationOptions", {
      origin: "https://auth.example",
    });
  await expect(
    state.invoke("authenticationOptions", { origin: "https://auth.example" }),
  ).rejects.toThrow("slow_down");
  advance(300001);
  await expect(
    state.invoke("authenticationOptions", { origin: "https://auth.example" }),
  ).resolves.toHaveProperty("id");
});
test("rate limit bounds allocations across many attacker keys", async () => {
  const { state, storage } = fixture();
  for (let i = 0; i < 350; i++)
    await state.invoke("rateLimit", { key: `attacker-${i}` });
  const db = storage.data.get("state") as { rates: Record<string, unknown> };
  expect(Object.keys(db.rates).length).toBeLessThanOrEqual(301);
});
test("challenge kinds and expired challenges cannot authenticate", async () => {
  const { state, owner, advance } = await enrolled();
  const origin = "https://auth.example";
  const registration = await state.invoke("registrationOptions", {
    origin,
    authorization: { session: owner.sessionToken, csrf: owner.csrf },
  });
  await expect(
    state.invoke("authenticationVerify", {
      origin,
      id: registration.id,
      response: { id: "key" },
    }),
  ).rejects.toThrow("invalid_authentication");
  const challenge = await state.invoke("authenticationOptions", { origin });
  advance(300001);
  await expect(
    state.invoke("authenticationVerify", {
      origin,
      id: challenge.id,
      response: { id: "key" },
    }),
  ).rejects.toThrow("invalid_authentication");
});
test("owner management token ids revoke tokens without exposing bearer secrets", async () => {
  const { state, owner } = await enrolled();
  const token = await state.invoke("personalToken", {
    session: owner.sessionToken,
    csrf: owner.csrf,
    scope: ["read"],
  });
  const list = await state.invoke("listTokens", {
    session: owner.sessionToken,
  });
  expect(list).toHaveLength(1);
  expect(list[0].id).not.toEqual(token.access_token);
  await expect(
    state.invoke("revokeTokenById", {
      session: owner.sessionToken,
      csrf: "wrong",
      id: list[0].id,
    }),
  ).rejects.toThrow("csrf_failed");
  await state.invoke("revokeTokenById", {
    session: owner.sessionToken,
    csrf: owner.csrf,
    id: list[0].id,
  });
  expect(
    await state.invoke("introspectToken", { token: token.access_token }),
  ).toEqual({ active: false });
  await state.invoke("logout", {
    session: owner.sessionToken,
    csrf: owner.csrf,
  });
  expect(
    await state.invoke("session", { token: owner.sessionToken }),
  ).toBeNull();
});
test("personal token names persist across state instances alongside unnamed tokens", async () => {
  const { state, storage, owner } = await enrolled();
  const authorization = { session: owner.sessionToken, csrf: owner.csrf, scope: ["create", "media"] };
  const named = await state.invoke("personalToken", { ...authorization, name: "  Laptop publishing  " });
  await state.invoke("personalToken", authorization);
  await state.invoke("personalToken", { ...authorization, name: "   " });
  const reloaded = new IndieAuthState(storage, settings, { now: () => 1000000 });
  const tokens = await reloaded.invoke("listTokens", { session: owner.sessionToken });
  expect(tokens).toHaveLength(3);
  expect(tokens.map(token => token.name)).toEqual(["Laptop publishing", undefined, undefined]);
  expect(tokens[0].clientId).toBe(settings.me);
  expect(tokens[0].scope).toBe("create media");
  const introspection = await reloaded.invoke("introspectToken", { token: named.access_token });
  expect(introspection.active).toBe(true);
  expect(introspection.client_id).toBe(settings.me);
  expect(introspection).not.toHaveProperty("name");
  await reloaded.invoke("revokeTokenById", { ...authorization, id: tokens[0].id });
  expect(await reloaded.invoke("introspectToken", { token: named.access_token })).toEqual({ active: false });
});
test("personal token names are bounded and validated at the state boundary", async () => {
  const { state, owner } = await enrolled();
  const authorization = { session: owner.sessionToken, csrf: owner.csrf, scope: ["read"] };
  for (const name of ["x".repeat(101), null, 42, ["name"], {}]) {
    await expect(state.invoke("personalToken", { ...authorization, name: name as string })).rejects.toThrow("invalid_request");
  }
  expect(await state.invoke("listTokens", { session: owner.sessionToken })).toHaveLength(0);
  await state.invoke("personalToken", { ...authorization, name: "x".repeat(100) });
  expect((await state.invoke("listTokens", { session: owner.sessionToken }))[0].name).toHaveLength(100);
});
test("owner can add keys up to eight and cannot exceed registration limit", async () => {
  const { state, owner } = await enrolled();
  const origin = "https://auth.example",
    authorization = { session: owner.sessionToken, csrf: owner.csrf };
  for (let i = 1; i < 8; i++) {
    const { id } = await state.invoke("registrationOptions", {
      origin,
      authorization,
    });
    await state.invoke("registrationVerify", {
      origin,
      authorization,
      id,
      response: { id: `key-${i}` },
    });
  }
  expect(
    (await state.invoke("listCredentials", { session: owner.sessionToken }))
      .length,
  ).toBe(8);
  await expect(
    state.invoke("registrationOptions", { origin, authorization }),
  ).rejects.toThrow("credential_limit");
  await state.invoke("removeCredential", {
    session: owner.sessionToken,
    csrf: owner.csrf,
    id: "key-7",
  });
  expect(
    (await state.invoke("listCredentials", { session: owner.sessionToken }))
      .length,
  ).toBe(7);
});
test("removing a credential invalidates all its sessions while another credential stays authorized", async () => {
  const { state, owner } = await enrolled();
  const origin = "https://auth.example",
    authorization = { session: owner.sessionToken, csrf: owner.csrf };
  const login = await state.invoke("authenticationOptions", { origin });
  const otherSessionSameKey = await state.invoke("authenticationVerify", {
    origin,
    id: login.id,
    response: { id: "key" },
  });
  const registration = await state.invoke("registrationOptions", {
    origin,
    authorization,
  });
  const second = await state.invoke("registrationVerify", {
    origin,
    authorization,
    id: registration.id,
    response: { id: "second" },
  });
  await state.invoke("removeCredential", {
    session: second.sessionToken,
    csrf: second.csrf,
    id: "key",
  });
  for (const removed of [owner, otherSessionSameKey]) {
    expect(
      await state.invoke("session", { token: removed.sessionToken }),
    ).toBeNull();
    await expect(
      state.invoke("registrationOptions", {
        origin,
        authorization: { session: removed.sessionToken, csrf: removed.csrf },
      }),
    ).rejects.toThrow("invalid_owner_auth");
    await expect(
      state.invoke("personalToken", {
        session: removed.sessionToken,
        csrf: removed.csrf,
        scope: ["read"],
      }),
    ).rejects.toThrow("invalid_owner_auth");
    const { id } = await state.invoke("createRequest", {
      clientId: "https://client.example/",
      redirectUri: "https://client.example/cb",
      scope: ["read"],
      codeChallenge: "A".repeat(43),
    });
    await expect(
      state.invoke("approveRequest", {
        id,
        session: removed.sessionToken,
        csrf: removed.csrf,
        scope: ["read"],
      }),
    ).rejects.toThrow("invalid_owner_auth");
  }
  expect(await state.invoke("session", { token: second.sessionToken })).toEqual(
    { csrf: second.csrf, expiresAt: second.expiresAt },
  );
  await expect(
    state.invoke("personalToken", {
      session: second.sessionToken,
      csrf: second.csrf,
      scope: ["read"],
    }),
  ).resolves.toHaveProperty("access_token");
});
test("legacy sessions without a backing credential fail closed", async () => {
  const { state, owner, storage } = await enrolled();
  const db = storage.data.get("state") as any;
  delete db.sessions[await hash(owner.sessionToken)].credentialId;
  storage.data.set("state", db);
  expect(
    await state.invoke("session", { token: owner.sessionToken }),
  ).toBeNull();
  await expect(
    state.invoke("personalToken", {
      session: owner.sessionToken,
      csrf: owner.csrf,
      scope: ["read"],
    }),
  ).rejects.toThrow("invalid_owner_auth");
});
test("alarms follow earliest expiration and stop after final expiring row is cleaned", async () => {
  const { state, storage, advance } = fixture();
  await state.invoke("status", {});
  expect(storage.alarmAt).toBeNull();
  await state.invoke("authenticationOptions", {
    origin: "https://auth.example",
  });
  expect(storage.alarmAt).toBe(1300000);
  await state.invoke("rateLimit", { key: "client" });
  expect(storage.alarmAt).toBe(1060000);
  advance(60000);
  await state.alarm();
  expect(storage.alarmAt).toBe(1300000);
  advance(240000);
  await state.alarm();
  expect(storage.alarmAt).toBeNull();
});
