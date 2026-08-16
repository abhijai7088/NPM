package com.npms.auth.service;

import com.npms.auth.entity.User;
import com.npms.auth.exception.NpmsBaseException;
import com.npms.auth.repository.UserRepository;
import com.npms.auth.util.MfaSecretCipher;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import com.warrenstrange.googleauth.GoogleAuthenticatorKey;
import com.warrenstrange.googleauth.GoogleAuthenticatorQRGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Service for TOTP-based Multi-Factor Authentication.
 * Compatible with Google Authenticator, Authy, and similar apps.
 *
 * <p>The TOTP secret is encrypted (AES-256-GCM, see {@link MfaSecretCipher})
 * before it is ever written to {@code auth.users.mfa_secret} — the plaintext
 * seed only ever exists in memory, never at rest in the database.</p>
 */
@Service
public class MfaService {

    private static final Logger log = LoggerFactory.getLogger(MfaService.class);
    private static final String ISSUER = "NPMS";

    private final GoogleAuthenticator googleAuthenticator;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;
    private final MfaSecretCipher mfaSecretCipher;

    public MfaService(UserRepository userRepository, AuditLogService auditLogService, MfaSecretCipher mfaSecretCipher) {
        this.googleAuthenticator = new GoogleAuthenticator();
        this.userRepository = userRepository;
        this.auditLogService = auditLogService;
        this.mfaSecretCipher = mfaSecretCipher;
        if (!mfaSecretCipher.isConfigured()) {
            log.warn("MFA_SECRET_ENC_KEY is not set — MFA secrets are being encrypted with a " +
                    "fixed local-dev-only key. Set MFA_SECRET_ENC_KEY before deploying anywhere " +
                    "real (generate with: openssl rand -base64 32).");
        }
    }

    /**
     * Generates a new TOTP secret for MFA enrollment.
     * Returns the secret and the QR code URI (otpauth:// format).
     * The secret is NOT saved yet — it's stored only after the user confirms with a valid code.
     */
    public Map<String, String> setupMfa(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NpmsBaseException("AUTH_USER_NOT_FOUND", "User not found"));

        if (user.isMfaEnabled()) {
            throw new NpmsBaseException("MFA_ALREADY_ENABLED", "MFA is already enabled for this account");
        }

        GoogleAuthenticatorKey key = googleAuthenticator.createCredentials();
        String secret = key.getKey();

        // Generate otpauth:// URI for QR code display
        String qrCodeUrl = GoogleAuthenticatorQRGenerator.getOtpAuthTotpURL(ISSUER, user.getUsername(), key);

        // Temporarily store the encrypted secret (not yet confirmed)
        user.setMfaSecret(mfaSecretCipher.encrypt(secret));
        userRepository.save(user);

        Map<String, String> result = new LinkedHashMap<>();
        result.put("secret", secret);
        result.put("qrCodeUrl", qrCodeUrl);
        return result;
    }

    /**
     * Confirms MFA setup by verifying the user's first TOTP code.
     * Once confirmed, mfaEnabled is set to true.
     */
    @Transactional
    public void confirmMfaSetup(UUID userId, int totpCode, String ipAddress, String userAgent) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NpmsBaseException("AUTH_USER_NOT_FOUND", "User not found"));

        if (user.isMfaEnabled()) {
            throw new NpmsBaseException("MFA_ALREADY_ENABLED", "MFA is already enabled");
        }

        String encryptedSecret = user.getMfaSecret();
        if (encryptedSecret == null || encryptedSecret.isBlank()) {
            throw new NpmsBaseException("MFA_NOT_SETUP", "MFA setup has not been initiated. Call /mfa/setup first.");
        }
        String secret = mfaSecretCipher.decrypt(encryptedSecret);

        if (!googleAuthenticator.authorize(secret, totpCode)) {
            throw new NpmsBaseException("MFA_INVALID_CODE", "Invalid TOTP code. Please try again.");
        }

        // Mark MFA as enabled
        user.setMfaEnabled(true);
        userRepository.save(user);

        auditLogService.writeLog(userId, user.getUsername(), "MFA_ENABLED", "USER", userId,
                null, null, ipAddress, userAgent, "SUCCESS", null);
        log.info("MFA enabled for user: {}", user.getUsername());
    }

    /**
     * Verifies a TOTP code during login (after password was already validated).
     * Called when mfaRequired=true was returned from the login step.
     */
    public boolean verifyTotp(UUID userId, int totpCode) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NpmsBaseException("AUTH_USER_NOT_FOUND", "User not found"));

        if (!user.isMfaEnabled() || user.getMfaSecret() == null) {
            throw new NpmsBaseException("MFA_NOT_ENABLED", "MFA is not enabled for this account");
        }

        return googleAuthenticator.authorize(mfaSecretCipher.decrypt(user.getMfaSecret()), totpCode);
    }

    /**
     * Disables MFA for a user (admin action or user self-service with password confirmation).
     */
    @Transactional
    public void disableMfa(UUID userId, String ipAddress, String userAgent) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NpmsBaseException("AUTH_USER_NOT_FOUND", "User not found"));

        user.setMfaEnabled(false);
        user.setMfaSecret(null);
        userRepository.save(user);

        auditLogService.writeLog(userId, user.getUsername(), "MFA_DISABLED", "USER", userId,
                null, null, ipAddress, userAgent, "SUCCESS", null);
        log.info("MFA disabled for user: {}", user.getUsername());
    }
}
