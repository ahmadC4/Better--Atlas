import test from 'node:test';
import assert from 'node:assert/strict';

process.env.API_KEY_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

const { encryptSecret, decryptSecret } = await import('../server/security/secret-storage');

const secretValue = 'sk-test-abc12345';

const encrypted = encryptSecret(secretValue);

assert.ok(encrypted.cipherText.length > 0, 'Cipher text should not be empty');
assert.equal(encrypted.lastFour, '2345', 'Last four characters should be preserved without whitespace');

const decrypted = decryptSecret(encrypted.cipherText);
assert.equal(decrypted, secretValue, 'Encrypted value should decrypt to original');

test('encryptSecret generates reversible ciphertext', () => {
  assert.equal(decrypted, secretValue);
});

test('encryptSecret falls back to session secret when API key secret missing', async () => {
  const originalKey = process.env.API_KEY_ENCRYPTION_KEY;
  const originalSessionSecret = process.env.SESSION_SECRET;

  try {
    delete process.env.API_KEY_ENCRYPTION_KEY;
    process.env.SESSION_SECRET = 'fallback-session-secret';

    const module = await import('../server/security/secret-storage');
    const value = 'sk-secondary-987654';
    const encryptedFallback = module.encryptSecret(value);
    assert.ok(encryptedFallback.cipherText.length > 0);
    assert.equal(module.decryptSecret(encryptedFallback.cipherText), value);
  } finally {
    process.env.API_KEY_ENCRYPTION_KEY = originalKey;
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  }
});
