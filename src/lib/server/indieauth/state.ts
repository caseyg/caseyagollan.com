import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import {
  AUTH_SCOPES,
  authError,
  tokenName,
  type AuthOperations,
  type AuthSettings,
  type AuthorizationRequest,
} from "./contracts";
type Credential = import("@simplewebauthn/server").WebAuthnCredential & {
  createdAt: number;
  deviceType?: string;
  backedUp?: boolean;
};
type Expiring = {
  expiresAt: number;
};
type Database = {
  credentials: Credential[];
  sessions: Record<
    string,
    Expiring & {
      csrf: string;
      credentialId: string;
    }
  >;
  challenges: Record<
    string,
    Expiring & {
      challenge: string;
      kind: string;
      bootstrap: boolean;
    }
  >;
  requests: Record<string, Expiring & AuthorizationRequest>;
  codes: Record<string, Expiring & AuthorizationRequest>;
  tokens: Record<
    string,
    Expiring & {
      clientId: string;
      name?: string;
      scope: string;
      createdAt: number;
    }
  >;
  rates: Record<
    string,
    Expiring & {
      count: number;
    }
  >;
};
export interface StateStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  transaction<T>(fn: (storage: StateStorage) => Promise<T>): Promise<T>;
  setAlarm?(time: number): Promise<void>;
  deleteAlarm?(): Promise<void>;
}
const empty = (): Database => ({
  credentials: [],
  sessions: {},
  challenges: {},
  requests: {},
  codes: {},
  tokens: {},
  rates: {},
});
const bytes = (value: string) => new TextEncoder().encode(value);
function base64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function hash(value: string) {
  return base64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value))),
  );
}
function random() {
  return base64(crypto.getRandomValues(new Uint8Array(32)));
}
async function equal(a: string, b: string) {
  const x = await hash(a),
    y = await hash(b);
  let different = 0;
  for (let i = 0; i < x.length; i++)
    different |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return different === 0;
}
export type WebAuthn = Pick<
  typeof import("@simplewebauthn/server"),
  | "generateRegistrationOptions"
  | "verifyRegistrationResponse"
  | "generateAuthenticationOptions"
  | "verifyAuthenticationResponse"
>;
export class IndieAuthState {
  private tail: Promise<unknown> = Promise.resolve();
  private now: () => number;
  private webauthn: WebAuthn;
  constructor(
    private storage: StateStorage,
    private settings: AuthSettings,
    dependencies: {
      now?: () => number;
      webauthn?: WebAuthn;
    } = {},
  ) {
    this.now = dependencies.now ?? Date.now;
    this.webauthn = dependencies.webauthn ?? {
      generateRegistrationOptions,
      verifyRegistrationResponse,
      generateAuthenticationOptions,
      verifyAuthenticationResponse,
    };
  }
  async invoke<K extends keyof AuthOperations>(
    operation: K,
    input: AuthOperations[K]["input"],
  ): Promise<AuthOperations[K]["output"]> {
    const run = this.tail.then(async () => {
      const result = await this.storage.transaction(async (storage) => {
        const db = (await storage.get<Database>("state")) ?? empty();
        this.cleanup(db);
        let value: unknown, error: unknown;
        try {
          value = await this.dispatch(db, operation, input);
        } catch (e) {
          error = e;
        }
        await storage.put("state", db);
        await this.scheduleAlarm(storage, db);
        return { value, error };
      });
      if (result.error) throw result.error;
      return result.value as AuthOperations[K]["output"];
    });
    this.tail = run.catch(() => {});
    return run;
  }
  async alarm() {
    await this.invoke("status", {});
  }
  private cleanup(db: Database) {
    for (const table of [
      db.sessions,
      db.challenges,
      db.requests,
      db.codes,
      db.tokens,
      db.rates,
    ])
      for (const [id, item] of Object.entries(table))
        if (!Number.isFinite(item.expiresAt) || item.expiresAt <= this.now())
          delete table[id];
    for (const [id, session] of Object.entries(db.sessions)) {
      if (
        !db.credentials.some(
          (credential) => credential.id === session.credentialId,
        )
      )
        delete db.sessions[id];
    }
  }
  private async scheduleAlarm(storage: StateStorage, db: Database) {
    let earliest = Infinity;
    for (const table of [
      db.sessions,
      db.challenges,
      db.requests,
      db.codes,
      db.tokens,
      db.rates,
    ]) {
      for (const row of Object.values(table)) {
        if (Number.isFinite(row.expiresAt))
          earliest = Math.min(earliest, row.expiresAt);
      }
    }
    if (earliest === Infinity) await storage.deleteAlarm?.();
    else
      await storage.setAlarm?.(Math.max(this.now() + 1, Math.ceil(earliest)));
  }
  private origin(origin: string) {
    if (origin !== new URL(this.settings.issuer).origin)
      authError("invalid_request");
  }
  private async validSession(db: Database, token: string) {
    const id = await hash(token),
      session = db.sessions[id];
    if (
      !session ||
      !db.credentials.some(
        (credential) => credential.id === session.credentialId,
      )
    ) {
      delete db.sessions[id];
      return null;
    }
    return session;
  }
  private async session(db: Database, token: string) {
    return (
      (await this.validSession(db, token)) ?? authError("invalid_owner_auth")
    );
  }
  private async owner(
    db: Database,
    input: {
      session?: string;
      csrf?: string;
    },
  ) {
    const session = await this.session(db, input.session ?? "");
    if (!input.csrf || !(await equal(session.csrf, input.csrf)))
      authError("csrf_failed");
    return session;
  }
  private async registrationOwner(
    db: Database,
    input: {
      session?: string;
      csrf?: string;
      setupToken?: string;
    },
  ) {
    if (db.credentials.length) {
      if (input.setupToken) authError("setup_closed");
      await this.owner(db, input);
      return false;
    }
    if (
      !this.settings.setupToken ||
      !input.setupToken ||
      !(await equal(this.settings.setupToken, input.setupToken))
    )
      authError("invalid_owner_auth");
    return true;
  }
  private scopes(scope: string[]) {
    if (
      !Array.isArray(scope) ||
      scope.some(
        (s) => !AUTH_SCOPES.includes(s as (typeof AUTH_SCOPES)[number]),
      ) ||
      new Set(scope).size !== scope.length
    )
      authError("invalid_scope");
  }
  private capacity(table: Record<string, unknown>, maximum = 128) {
    if (Object.keys(table).length >= maximum) authError("slow_down");
  }
  private async newSession(db: Database, credentialId: string) {
    this.capacity(db.sessions);
    const sessionToken = random(),
      csrf = random(),
      expiresAt = this.now() + 43200000;
    db.sessions[await hash(sessionToken)] = { csrf, expiresAt, credentialId };
    return { sessionToken, csrf, expiresAt };
  }
  private async token(db: Database, clientId: string, scope: string[], name?: string) {
    this.scopes(scope);
    this.capacity(db.tokens);
    const access_token = random();
    db.tokens[await hash(access_token)] = {
      clientId,
      ...(name ? { name } : {}),
      scope: scope.join(" "),
      createdAt: this.now(),
      expiresAt: this.now() + this.settings.tokenTTL * 1000,
    };
    return {
      access_token,
      token_type: "Bearer" as const,
      me: this.settings.me,
      scope: scope.join(" "),
      expires_in: this.settings.tokenTTL,
    };
  }
  private async dispatch(
    db: Database,
    op: keyof AuthOperations,
    raw: unknown,
  ): Promise<unknown> {
    // The shared RPC contract validates callers at compile time; security-sensitive values are checked here too.
    const a = raw as any;
    switch (op) {
      case "status":
        return {
          credentialCount: db.credentials.length,
          setupAvailable:
            db.credentials.length === 0 && !!this.settings.setupToken,
        };
      case "session": {
        const session = await this.validSession(db, a.token);
        return session
          ? { csrf: session.csrf, expiresAt: session.expiresAt }
          : null;
      }
      case "logout":
        await this.owner(db, a);
        delete db.sessions[await hash(a.session)];
        return true;
      case "registrationOptions": {
        this.origin(a.origin);
        this.capacity(db.challenges);
        const bootstrap = await this.registrationOwner(db, a.authorization);
        if (db.credentials.length >= 8) authError("credential_limit");
        const options = await this.webauthn.generateRegistrationOptions({
          rpName: this.settings.rpName,
          rpID: this.settings.rpID,
          userName: this.settings.me,
          userID: new Uint8Array(
            await crypto.subtle.digest("SHA-256", bytes(this.settings.me)),
          ),
          attestationType: "none",
          supportedAlgorithmIDs: [-7],
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
          excludeCredentials: db.credentials.map((c) => ({
            id: c.id,
            transports: c.transports,
          })),
        });
        const id = random();
        db.challenges[await hash(id)] = {
          challenge: options.challenge,
          kind: "registration",
          bootstrap,
          expiresAt: this.now() + 300000,
        };
        return { id, options };
      }
      case "registrationVerify": {
        this.origin(a.origin);
        const id = await hash(a.id),
          challenge = db.challenges[id];
        delete db.challenges[id];
        if (!challenge || challenge.kind !== "registration")
          authError("invalid_authentication");
        const bootstrap = await this.registrationOwner(db, a.authorization);
        if (bootstrap !== challenge.bootstrap) authError("setup_closed");
        if (db.credentials.length >= 8) authError("credential_limit");
        let result;
        try {
          result = await this.webauthn.verifyRegistrationResponse({
            response: a.response,
            expectedChallenge: challenge.challenge,
            expectedOrigin: new URL(this.settings.issuer).origin,
            expectedRPID: this.settings.rpID,
            requireUserVerification: true,
            supportedAlgorithmIDs: [-7],
          });
        } catch {
          authError("invalid_authentication");
        }
        if (!result.verified || !result.registrationInfo)
          authError("invalid_authentication");
        const info = result.registrationInfo;
        if (db.credentials.some((c) => c.id === info.credential.id))
          authError("invalid_authentication");
        db.credentials.push({
          ...info.credential,
          createdAt: this.now(),
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
        });
        return this.newSession(db, info.credential.id);
      }
      case "authenticationOptions": {
        this.origin(a.origin);
        this.capacity(db.challenges);
        const options = await this.webauthn.generateAuthenticationOptions({
          rpID: this.settings.rpID,
          userVerification: "required",
          allowCredentials: db.credentials.map((c) => ({
            id: c.id,
            transports: c.transports,
          })),
        });
        const id = random();
        db.challenges[await hash(id)] = {
          challenge: options.challenge,
          kind: "authentication",
          bootstrap: false,
          expiresAt: this.now() + 300000,
        };
        return { id, options };
      }
      case "authenticationVerify": {
        this.origin(a.origin);
        const id = await hash(a.id),
          challenge = db.challenges[id];
        delete db.challenges[id];
        if (!challenge || challenge.kind !== "authentication")
          authError("invalid_authentication");
        if (
          a.response?.response?.userHandle &&
          a.response.response.userHandle !== (await hash(this.settings.me))
        )
          authError("invalid_authentication");
        const credential = db.credentials.find((c) => c.id === a.response?.id);
        if (!credential) authError("invalid_authentication");
        let result;
        try {
          result = await this.webauthn.verifyAuthenticationResponse({
            response: a.response,
            expectedChallenge: challenge.challenge,
            expectedOrigin: new URL(this.settings.issuer).origin,
            expectedRPID: this.settings.rpID,
            credential,
            requireUserVerification: true,
          });
        } catch {
          authError("invalid_authentication");
        }
        if (!result.verified) authError("invalid_authentication");
        const counter = result.authenticationInfo.newCounter;
        if (
          (credential.counter !== 0 || counter !== 0) &&
          counter <= credential.counter
        )
          authError("invalid_authentication");
        credential.counter = counter;
        return this.newSession(db, credential.id);
      }
      case "createRequest": {
        this.scopes(a.scope);
        if (!/^[A-Za-z0-9_-]{43}$/.test(a.codeChallenge))
          authError("invalid_request");
        if (Object.keys(db.requests).length >= 128) authError("slow_down");
        const id = random();
        db.requests[await hash(id)] = { ...a, expiresAt: this.now() + 600000 };
        return { id };
      }
      case "request": {
        const item = db.requests[await hash(a.id)];
        if (!item) return null;
        const { expiresAt, ...request } = item;
        return request;
      }
      case "approveRequest": {
        await this.owner(db, a);
        const id = await hash(a.id),
          request = db.requests[id];
        if (!request) authError("invalid_request");
        this.scopes(a.scope);
        if (a.scope.some((s: string) => !request.scope.includes(s)))
          authError("invalid_scope");
        this.capacity(db.codes);
        delete db.requests[id];
        const code = random();
        db.codes[await hash(code)] = {
          ...request,
          scope: a.scope,
          expiresAt: this.now() + 300000,
        };
        return { code, redirectUri: request.redirectUri, state: request.state };
      }
      case "exchangeCode": {
        const id = await hash(a.code),
          code = db.codes[id];
        if (
          !code ||
          code.clientId !== a.clientId ||
          code.redirectUri !== a.redirectUri ||
          !/^[-._~A-Za-z0-9]{43,128}$/.test(a.verifier) ||
          !(await equal(await hash(a.verifier), code.codeChallenge))
        )
          authError("invalid_grant");
        delete db.codes[id];
        return this.token(db, code.clientId, code.scope);
      }
      case "personalToken":
        await this.owner(db, a);
        return this.token(db, this.settings.me, a.scope, tokenName(a.name));
      case "introspectToken": {
        const token = db.tokens[await hash(a.token)];
        return token
          ? {
              active: true,
              me: this.settings.me,
              client_id: token.clientId,
              scope: token.scope,
              exp: Math.floor(token.expiresAt / 1000),
              iat: Math.floor(token.createdAt / 1000),
            }
          : { active: false };
      }
      case "revokeToken": {
        const id = await hash(a.token),
          token = db.tokens[id];
        if (token && (!a.clientId || token.clientId === a.clientId))
          delete db.tokens[id];
        return true;
      }
      case "listTokens":
        await this.session(db, a.session);
        return Object.entries(db.tokens).map(([id, t]) => ({ id, ...t }));
      case "revokeTokenById":
        await this.owner(db, a);
        delete db.tokens[a.id];
        return true;
      case "listCredentials":
        await this.session(db, a.session);
        return db.credentials.map(
          ({ id, createdAt, deviceType, backedUp }) => ({
            id,
            createdAt,
            deviceType,
            backedUp,
          }),
        );
      case "removeCredential":
        await this.owner(db, a);
        if (!db.credentials.some((c) => c.id === a.id)) return false;
        if (db.credentials.length === 1) authError("last_credential");
        db.credentials = db.credentials.filter((c) => c.id !== a.id);
        for (const [id, session] of Object.entries(db.sessions)) {
          if (session.credentialId === a.id) delete db.sessions[id];
        }
        return true;
      case "rateLimit": {
        const key = await hash(a.key);
        for (const [id, max] of [
          ["global", 300],
          [key, 30],
        ] as const) {
          if (!db.rates[id]) this.capacity(db.rates, 2000);
          const rate = db.rates[id] ?? {
            count: 0,
            expiresAt: this.now() + 60000,
          };
          db.rates[id] = rate;
          rate.count++;
          if (rate.count > max) return false;
        }
        return true;
      }
    }
  }
}
