// Synthetic test authenticator. Never imported by application or Worker code.
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
const b64 = (data: Uint8Array) => Buffer.from(data).toString("base64url");
const unb64 = (data: string) => new Uint8Array(Buffer.from(data, "base64url"));
const concat = (...items: Uint8Array[]) => {
  const out = new Uint8Array(items.reduce((n, b) => n + b.length, 0));
  let offset = 0;
  for (const item of items) {
    out.set(item, offset);
    offset += item.length;
  }
  return out;
};
const digest = async (data: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", data));
const utf8 = (s: string) => new TextEncoder().encode(s);
function derSignature(raw: Uint8Array) {
  const integer = (n: Uint8Array) => {
    while (n.length > 1 && n[0] === 0) n = n.slice(1);
    if (n[0] & 128) n = concat(new Uint8Array([0]), n);
    return concat(new Uint8Array([2, n.length]), n);
  };
  const pair = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat(new Uint8Array([48, pair.length]), pair);
}
export async function createTestAuthenticator(rpID: string, origin: string) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const credentialId = crypto.getRandomValues(new Uint8Array(32));
  const id = b64(credentialId),
    rpHash = await digest(utf8(rpID));
  const cose = isoCBOR.encode(
    new Map<any, any>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, unb64(jwk.x!)],
      [-3, unb64(jwk.y!)],
    ]),
  );
  let userHandle: string | undefined,
    counter = 0;
  return {
    id,
    keyPair,
    async registration(
      options: Pick<
        PublicKeyCredentialCreationOptionsJSON,
        "challenge" | "user"
      >,
      flags = 0x45,
    ): Promise<RegistrationResponseJSON> {
      userHandle = options.user.id;
      const clientDataJSON = b64(
        utf8(
          JSON.stringify({
            type: "webauthn.create",
            challenge: options.challenge,
            origin,
          }),
        ),
      );
      const authData = concat(
        rpHash,
        new Uint8Array([flags, 0, 0, 0, 0]),
        new Uint8Array(16),
        new Uint8Array([0, credentialId.length]),
        credentialId,
        cose,
      );
      const attestationObject = b64(
        isoCBOR.encode(
          new Map<any, any>([
            ["fmt", "none"],
            ["attStmt", new Map()],
            ["authData", authData],
          ]),
        ),
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        response: {
          clientDataJSON,
          attestationObject,
          transports: ["internal"],
        },
        clientExtensionResults: {},
      };
    },
    async authentication(
      options: Pick<PublicKeyCredentialRequestOptionsJSON, "challenge">,
      overrides: {
        flags?: number;
        damageSignature?: boolean;
        counter?: number;
        userHandle?: string;
      } = {},
    ): Promise<AuthenticationResponseJSON> {
      counter = overrides.counter ?? counter + 1;
      const clientData = utf8(
        JSON.stringify({
          type: "webauthn.get",
          challenge: options.challenge,
          origin,
        }),
      );
      const counts = new Uint8Array(4);
      new DataView(counts.buffer).setUint32(0, counter);
      const authenticatorData = concat(
        rpHash,
        new Uint8Array([overrides.flags ?? 0x05]),
        counts,
      );
      const signature = derSignature(
        new Uint8Array(
          await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            keyPair.privateKey,
            concat(authenticatorData, await digest(clientData)),
          ),
        ),
      );
      if (overrides.damageSignature) signature[signature.length - 1] ^= 1;
      return {
        id,
        rawId: id,
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(clientData),
          authenticatorData: b64(authenticatorData),
          signature: b64(signature),
          userHandle: overrides.userHandle ?? userHandle,
        },
      };
    },
  };
}
