package com.npms.auth.service;

import com.npms.auth.entity.PasswordHistory;
import com.npms.auth.entity.PasswordResetToken;
import com.npms.auth.entity.User;
import com.npms.auth.exception.NpmsBaseException;
import com.npms.auth.repository.PasswordHistoryRepository;
import com.npms.auth.repository.PasswordResetTokenRepository;
import com.npms.auth.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Handles forgot-password flow:
 * 1. User requests OTP via email
 * 2. OTP is verified (with MFA if enabled)
 * 3. New password is set (with history check to prevent reuse)
 */
@Service
public class PasswordService {

    private static final Logger log = LoggerFactory.getLogger(PasswordService.class);
    private static final int OTP_LENGTH = 6;
    private static final int OTP_EXPIRY_MINUTES = 10;
    private static final int MAX_OTP_ATTEMPTS = 5;
    private static final int PASSWORD_HISTORY_LIMIT = 10;

    @Value("${spring.mail.from:${spring.mail.username:noreply@npms.nic.in}}")
    private String mailFrom;

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository resetTokenRepository;
    private final PasswordHistoryRepository passwordHistoryRepository;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;
    private final MfaService mfaService;
    private final AuditLogService auditLogService;
    private final SecureRandom secureRandom;

    public PasswordService(UserRepository userRepository,
                           PasswordResetTokenRepository resetTokenRepository,
                           PasswordHistoryRepository passwordHistoryRepository,
                           PasswordEncoder passwordEncoder,
                           JavaMailSender mailSender,
                           MfaService mfaService,
                           AuditLogService auditLogService) {
        this.userRepository = userRepository;
        this.resetTokenRepository = resetTokenRepository;
        this.passwordHistoryRepository = passwordHistoryRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailSender = mailSender;
        this.mfaService = mfaService;
        this.auditLogService = auditLogService;
        this.secureRandom = new SecureRandom();
    }

    /**
     * Initiates forgot-password flow: generates OTP and sends it to user's registered email.
     * If MFA is enabled, the user will also need to provide their TOTP code during reset.
     */
    @Transactional
    public void forgotPassword(String email, String ipAddress, String userAgent) {
        var userOpt = userRepository.findByEmail(email);

        if (userOpt.isEmpty() || !userOpt.get().isActive()) {
            // Don't reveal that the account exists but is deactivated or not found
            // Return normally so the frontend receives a 200 OK and proceeds to the OTP screen
            log.warn("Password reset requested for unknown or inactive email: {}", email);
            return;
        }

        User user = userOpt.get();

        // A newly issued OTP is authoritative; older emails must never remain valid.
        resetTokenRepository.markAllUnusedAsUsed(user.getId());

        // Generate 6-digit OTP
        String otp = generateOtp();
        String otpHash = hashOtp(otp);

        // Store hashed OTP in DB
        PasswordResetToken token = PasswordResetToken.builder()
                .user(user)
                .otpHash(otpHash)
                .expiresAt(LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES))
                .isUsed(false)
                .attempts(0)
                .build();
        resetTokenRepository.save(token);

        // Send OTP via email
        sendOtpEmail(user.getEmail(), user.getFullName(), otp);

        auditLogService.writeLog(user.getId(), user.getUsername(), "PASSWORD_RESET_REQUESTED",
                "USER", user.getId(), null, null, ipAddress, userAgent, "SUCCESS", null);

        log.info("Password reset OTP sent to user: {}", user.getUsername());
    }

    /**
     * Verifies the OTP and (if user has MFA enabled) also the TOTP code.
     * Returns a one-time reset token UUID for the actual password change.
     */
    @Transactional
    public UUID verifyOtpAndMfa(String email, String otp, Integer totpCode, String ipAddress, String userAgent) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new NpmsBaseException("AUTH_INVALID_OTP", "Invalid or expired OTP"));

        PasswordResetToken resetToken = resetTokenRepository
                .findTopByUserIdAndIsUsedFalseOrderByCreatedAtDesc(user.getId())
                .orElseThrow(() -> new NpmsBaseException("AUTH_INVALID_OTP", "Invalid or expired OTP"));

        // Check expiry
        if (resetToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new NpmsBaseException("AUTH_OTP_EXPIRED", "OTP has expired. Please request a new one.");
        }

        // Check max attempts
        if (resetToken.getAttempts() >= MAX_OTP_ATTEMPTS) {
            resetToken.setUsed(true);
            resetTokenRepository.save(resetToken);
            throw new NpmsBaseException("AUTH_OTP_MAX_ATTEMPTS",
                    "Maximum verification attempts exceeded. Please request a new OTP.");
        }

        // Verify OTP
        String otpHash = hashOtp(otp);
        if (!otpHash.equals(resetToken.getOtpHash())) {
            resetToken.setAttempts(resetToken.getAttempts() + 1);
            resetTokenRepository.save(resetToken);
            throw new NpmsBaseException("AUTH_INVALID_OTP", "Invalid OTP. Please try again.");
        }

        // If MFA is enabled, also verify TOTP code
        if (user.isMfaEnabled()) {
            if (totpCode == null) {
                throw new NpmsBaseException("AUTH_MFA_REQUIRED",
                        "MFA is enabled. Please provide your authenticator code along with the OTP.");
            }
            if (!mfaService.verifyTotp(user.getId(), totpCode)) {
                resetToken.setAttempts(resetToken.getAttempts() + 1);
                resetTokenRepository.save(resetToken);
                throw new NpmsBaseException("AUTH_MFA_INVALID", "Invalid authenticator code.");
            }
        }

        // OTP (and MFA if applicable) verified — mark token as used but return its ID as a reset grant
        // We'll use the token ID as a one-time grant for the actual password change
        auditLogService.writeLog(user.getId(), user.getUsername(), "PASSWORD_RESET_OTP_VERIFIED",
                "USER", user.getId(), null, null, ipAddress, userAgent, "SUCCESS", null);

        return resetToken.getId();
    }

    /**
     * Resets the password using the verified reset token ID.
     * Validates password strength and checks against last 10 passwords.
     */
    @Transactional
    public void resetPassword(UUID resetTokenId, String newPassword, String ipAddress, String userAgent) {
        PasswordResetToken resetToken = resetTokenRepository.findById(resetTokenId)
                .orElseThrow(() -> new NpmsBaseException("AUTH_INVALID_RESET_TOKEN", "Invalid reset token"));

        if (resetToken.isUsed()) {
            throw new NpmsBaseException("AUTH_RESET_TOKEN_USED", "This reset token has already been used.");
        }

        if (resetToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new NpmsBaseException("AUTH_RESET_TOKEN_EXPIRED", "Reset token has expired.");
        }

        User user = resetToken.getUser();

        // Validate password strength
        validatePasswordStrength(newPassword);

        // Check password history (last 10 passwords)
        checkPasswordHistory(user.getId(), newPassword);

        // Hash and set new password
        String newHash = passwordEncoder.encode(newPassword);
        String oldHash = user.getPasswordHash();
        user.setPasswordHash(newHash);
        user.setRequiresPasswordChange(false);

        // Unlock account if it was locked (verified OTP + optional MFA proves ownership).
        user.setLocked(false);
        user.setLockedUntil(null);
        user.setFailedLoginCount(0);
        userRepository.save(user);

        // Save to password history
        PasswordHistory history = PasswordHistory.builder()
                .user(user)
                .passwordHash(newHash)
                .build();
        passwordHistoryRepository.save(history);

        // Mark reset token as used
        resetToken.setUsed(true);
        resetTokenRepository.save(resetToken);

        auditLogService.writeLog(user.getId(), user.getUsername(), "PASSWORD_RESET_COMPLETED",
                "USER", user.getId(), null, null, ipAddress, userAgent, "SUCCESS", null);

        log.info("Password reset completed for user: {}", user.getUsername());
    }

    /**
     * Generates and sends a 6-digit OTP for the first-login mandatory password change process.
     */
    @Transactional
    public void generateAndSendSetupOtp(User user) {
        // Keep exactly one active OTP per account so the newest email is authoritative.
        resetTokenRepository.markAllUnusedAsUsed(user.getId());

        String otp = generateOtp();
        String otpHash = hashOtp(otp);

        PasswordResetToken token = PasswordResetToken.builder()
                .user(user)
                .otpHash(otpHash)
                .expiresAt(LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES))
                .isUsed(false)
                .attempts(0)
                .build();
        resetTokenRepository.save(token);

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(user.getEmail());
            message.setSubject("NPMS - Login Verification OTP");
            message.setText(String.format(
                    "Dear %s,\n\n" +
                    "Welcome to NPMS! To securely log in, please use the following OTP:\n\n" +
                    "%s\n\n" +
                    "This OTP is valid for %d minutes. Only the OTP from the newest NPMS email will work.\n\n" +
                    "Regards,\nNPMS System",
                    user.getFullName(), otp, OTP_EXPIRY_MINUTES));
            message.setFrom(mailFrom);
            mailSender.send(message);
            log.info("First login setup OTP sent to user: {}", user.getUsername());
        } catch (Exception e) {
            log.error("Failed to send setup OTP email to {}: {}", user.getEmail(), e.getMessage());
            // Do not fail the login entirely if email fails, or do we? Yes, they need it.
            throw new NpmsBaseException("EMAIL_SEND_FAILED", "Failed to send verification email. Contact Admin.");
        }
    }

    /**
     * Validates a first-login password before consuming the one-time OTP.
     */
    @Transactional(readOnly = true)
    public void validateInitialPassword(User user, String newPassword) {
        validatePasswordStrength(newPassword);
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new NpmsBaseException("AUTH_PASSWORD_REUSED",
                    "Your new password must be different from the initial password.");
        }
        checkPasswordHistory(user.getId(), newPassword);
    }

    /** Preserve the replaced password so it cannot be reused later. */
    @Transactional
    public void recordCurrentPassword(User user) {
        passwordHistoryRepository.save(PasswordHistory.builder()
                .user(user)
                .passwordHash(user.getPasswordHash())
                .build());
    }

    /**
     * Verifies the OTP provided during the first-login mandatory password change process.
     */
    @Transactional
    public void verifySetupOtp(User user, String otp) {
        PasswordResetToken resetToken = resetTokenRepository
                .findTopByUserIdAndIsUsedFalseOrderByCreatedAtDesc(user.getId())
                .orElseThrow(() -> new NpmsBaseException("AUTH_INVALID_OTP", "No active OTP exists. Select Resend OTP to request a new code."));

        if (resetToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            resetToken.setUsed(true);
            resetTokenRepository.save(resetToken);
            throw new NpmsBaseException("AUTH_OTP_EXPIRED", "The latest OTP has expired. Select Resend OTP to request a new code.");
        }
        if (resetToken.getAttempts() >= MAX_OTP_ATTEMPTS) {
            resetToken.setUsed(true);
            resetTokenRepository.save(resetToken);
            throw new NpmsBaseException("AUTH_OTP_MAX_ATTEMPTS", "Maximum attempts exceeded. Select Resend OTP to request a new code.");
        }

        String otpHash = hashOtp(otp);
        if (!otpHash.equals(resetToken.getOtpHash())) {
            resetToken.setAttempts(resetToken.getAttempts() + 1);
            resetTokenRepository.save(resetToken);
            throw new NpmsBaseException("AUTH_INVALID_OTP", "That OTP does not match the newest NPMS email. Please use the latest code or resend it.");
        }

        resetToken.setUsed(true);
        resetTokenRepository.save(resetToken);
    }

    // ─── Private helpers ────────────────────────────────────────────────────────

    private String generateOtp() {
        int otp = secureRandom.nextInt(900000) + 100000; // 6-digit number
        return String.valueOf(otp);
    }

    private String hashOtp(String otp) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(otp.getBytes());
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            throw new RuntimeException("Error hashing OTP", e);
        }
    }

    private void sendOtpEmail(String toEmail, String fullName, String otp) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(toEmail);
            message.setSubject("NPMS - Password Reset OTP");
            message.setText(String.format(
                    "Dear %s,\n\n" +
                    "Your password reset OTP is: %s\n\n" +
                    "This OTP is valid for %d minutes.\n" +
                    "If you did not request this, please ignore this email and contact your administrator.\n\n" +
                    "Regards,\nNPMS System",
                    fullName, otp, OTP_EXPIRY_MINUTES));
            message.setFrom(mailFrom);
            mailSender.send(message);
        } catch (Exception e) {
            log.error("Failed to send OTP email to {}: {}", toEmail, e.getMessage());
            throw new NpmsBaseException("EMAIL_SEND_FAILED", "Failed to send OTP email. Please try again later.");
        }
    }

    private void validatePasswordStrength(String password) {
        if (password == null || password.length() < 8) {
            throw new NpmsBaseException("AUTH_WEAK_PASSWORD", "Password must be at least 8 characters long.");
        }
        if (password.length() > 128) {
            throw new NpmsBaseException("AUTH_WEAK_PASSWORD", "Password must not exceed 128 characters.");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new NpmsBaseException("AUTH_WEAK_PASSWORD", "Password must contain at least one uppercase letter.");
        }
        if (!password.matches(".*[a-z].*")) {
            throw new NpmsBaseException("AUTH_WEAK_PASSWORD", "Password must contain at least one lowercase letter.");
        }
        if (!password.matches(".*\\d.*")) {
            throw new NpmsBaseException("AUTH_WEAK_PASSWORD", "Password must contain at least one digit.");
        }
        if (!password.matches(".*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?].*")) {
            throw new NpmsBaseException("AUTH_WEAK_PASSWORD", "Password must contain at least one special character.");
        }
    }

    private void checkPasswordHistory(UUID userId, String newPassword) {
        List<PasswordHistory> recentPasswords =
                passwordHistoryRepository.findTop10ByUserIdOrderByCreatedAtDesc(userId);

        for (PasswordHistory history : recentPasswords) {
            if (passwordEncoder.matches(newPassword, history.getPasswordHash())) {
                throw new NpmsBaseException("AUTH_PASSWORD_REUSED",
                        "Cannot reuse any of your last 10 passwords. Please choose a different password.");
            }
        }
    }
}
