import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EncryptionEnvelope } from "@shannon/shared";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

interface SecretVaultOptions {
  encryptionKey: string;
}

export class SecretVault {
  private readonly key: Buffer;

  constructor(options: SecretVaultOptions) {
    if (!/^[0-9a-f]{64}$/i.test(options.encryptionKey)) {
      throw new Error("SecretVault encryption key must be 64 hex characters");
    }

    this.key = Buffer.from(options.encryptionKey, "hex");

    if (this.key.length !== KEY_LENGTH_BYTES) {
      throw new Error("SecretVault encryption key must decode to 32 bytes");
    }
  }

  encrypt(plaintext: string): EncryptionEnvelope {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authTag: authTag.toString("base64")
    };
  }

  decrypt(envelope: EncryptionEnvelope): string {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(envelope.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final()
    ]);

    return plaintext.toString("utf8");
  }
}

