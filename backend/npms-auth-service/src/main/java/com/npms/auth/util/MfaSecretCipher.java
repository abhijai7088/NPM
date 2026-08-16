package com.npms.auth.util;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Encrypts/decrypts TOTP MFA secrets before they are persisted to
 * {@code auth.users.mfa_secret}. Without this, anyone with read access to
 * the database (a backup, a leaked dump, an over-privileged DB role) could
 * read a user's authenticator seed directly and clone their second factor
 * indefinitely — encryption at rest means that alone is not enough; the
 * {@code mfa.secret-key} must also be known (it lives only in the
 * environment, never in the database).
 *
 * <p>Uses AES-256-GCM: a random 12-byte nonce is generated per encryption
 * and stored alongside the ciphertext (nonce || ciphertext, base64-encoded)
 * so no separate IV column is needed. GCM also provides integrity — a
 * tampered ciphertext fails to decrypt rather than silently returning
 * garbage.</p>
 */
@Component
public class MfaSecretCipher {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final int GCM_IV_LENGTH_BYTES = 12;

    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKeySpec key;
    private final boolean configured;

    public MfaSecretCipher(@Value("${mfa.secret-key:}") String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            // Local dev fallback only — startup should not hard-fail just because
            // MFA_SECRET_ENC_KEY wasn't set, but this must never be relied on
            // outside local: it is not read from any secret store and is fixed
            // per-JVM-restart, so encrypted values from a previous run become
            // undecryptable, which is an acceptable local-dev tradeoff.
            this.key = deriveInsecureLocalKey();
            this.configured = false;
        } else {
            byte[] raw = Base64.getDecoder().decode(base64Key.trim());
            if (raw.length != 32) {
                throw new IllegalStateException(
                        "MFA_SECRET_ENC_KEY must decode to exactly 32 bytes (AES-256). " +
                        "Generate one with: openssl rand -base64 32");
            }
            this.key = new SecretKeySpec(raw, "AES");
            this.configured = true;
        }
    }

    /** True when a real MFA_SECRET_ENC_KEY was supplied (i.e. not the local-dev fallback). */
    public boolean isConfigured() {
        return configured;
    }

    public String encrypt(String plainText) {
        if (plainText == null) return null;
        try {
            byte[] iv = new byte[GCM_IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] cipherText = cipher.doFinal(plainText.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt MFA secret", e);
        }
    }

    public String decrypt(String encoded) {
        if (encoded == null) return null;
        try {
            byte[] combined = Base64.getDecoder().decode(encoded);
            byte[] iv = new byte[GCM_IV_LENGTH_BYTES];
            byte[] cipherText = new byte[combined.length - GCM_IV_LENGTH_BYTES];
            System.arraycopy(combined, 0, iv, 0, iv.length);
            System.arraycopy(combined, iv.length, cipherText, 0, cipherText.length);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] plainText = cipher.doFinal(cipherText);
            return new String(plainText, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt MFA secret", e);
        }
    }

    private SecretKeySpec deriveInsecureLocalKey() {
        // Fixed, obviously-not-secret key used only so local dev works without
        // requiring MFA_SECRET_ENC_KEY to be set. Every real environment must
        // set MFA_SECRET_ENC_KEY (see application.yml) — isConfigured() can be
        // checked at startup to warn loudly if it wasn't.
        byte[] fallback = "npms-local-dev-only-fallback-32".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return new SecretKeySpec(fallback, "AES");
    }
}
