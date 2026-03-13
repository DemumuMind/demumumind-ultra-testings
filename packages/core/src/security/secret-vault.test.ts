import { SecretVault } from "./secret-vault.js";

describe("SecretVault", () => {
  test("encrypts secrets at rest and decrypts them later", () => {
    const vault = new SecretVault({
      encryptionKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    });

    const encrypted = vault.encrypt("sensitive-access-token");

    expect(encrypted.ciphertext).not.toContain("sensitive-access-token");
    expect(vault.decrypt(encrypted)).toBe("sensitive-access-token");
  });

  test("rejects an invalid encryption key", () => {
    expect(
      () =>
        new SecretVault({
          encryptionKey: "too-short"
        })
    ).toThrow(/64 hex characters/i);
  });
});

