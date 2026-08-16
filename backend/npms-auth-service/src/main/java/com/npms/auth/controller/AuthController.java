package com.npms.auth.controller;

import com.npms.auth.dto.request.*;
import com.npms.auth.dto.response.ApiResponse;
import com.npms.auth.dto.response.MfaSetupResponse;
import com.npms.auth.entity.User;
import com.npms.auth.exception.NpmsBaseException;
import com.npms.auth.repository.UserRepository;
import com.npms.auth.service.AuthService;
import com.npms.auth.service.JwtService;
import com.npms.auth.service.MfaService;
import com.npms.auth.service.PasswordService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Authentication REST controller.
 * Handles login, MFA, token refresh, logout, forgot-password, and user profile.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final MfaService mfaService;
    private final PasswordService passwordService;
    private final JwtService jwtService;
    private final UserRepository userRepository;

    public AuthController(AuthService authService,
                          MfaService mfaService,
                          PasswordService passwordService,
                          JwtService jwtService,
                          UserRepository userRepository) {
        this.authService = authService;
        this.mfaService = mfaService;
        this.passwordService = passwordService;
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    /**
     * POST /api/v1/auth/login
     * Authenticates user. Returns tokens in cookies or mfaRequired=true with tempToken.
     */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Map<String, Object>>> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {

        String ip = getClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");

        Map<String, Object> result = authService.login(request.getUsername(), request.getPassword(), ip, ua);

        boolean mfaRequired = result.containsKey("mfaRequired") && (boolean) result.get("mfaRequired");
        boolean passwordChangeRequired = result.containsKey("passwordChangeRequired") && (boolean) result.get("passwordChangeRequired");

        if (passwordChangeRequired) {
            Map<String, Object> data = Map.of(
                    "passwordChangeRequired", true,
                    "tempToken", result.get("tempToken"),
                    "user", result.get("user")
            );
            return ResponseEntity.ok(ApiResponse.success(data, "Password change required"));
        }

        if (mfaRequired) {
            // Return tempToken in response body (client stores in memory only)
            Map<String, Object> data = Map.of(
                    "mfaRequired", true,
                    "tempToken", result.get("tempToken")
            );
            return ResponseEntity.ok(ApiResponse.success(data, "MFA verification required"));
        }

        // Full login success — set cookies
        ResponseCookie accessCookie = (ResponseCookie) result.get("accessCookie");
        ResponseCookie refreshCookie = (ResponseCookie) result.get("refreshCookie");

        @SuppressWarnings("unchecked")
        Map<String, Object> userData = (Map<String, Object>) result.get("user");
        Map<String, Object> data = Map.of("mfaRequired", false, "user", userData);

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                .body(ApiResponse.success(data, "Login successful"));
    }

    /**
     * POST /api/v1/auth/change-password
     * Handles the first-login password change.
     */
    @PostMapping("/change-password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest) {

        String ip = getClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");

        String tempToken = request.get("tempToken");
        String newPassword = request.get("newPassword");
        String otp = request.get("otp");

        if (tempToken == null || newPassword == null || otp == null) {
            throw new NpmsBaseException("AUTH_BAD_REQUEST", "Temp token, new password, and OTP are required.");
        }

        authService.changeInitialPassword(tempToken, newPassword, otp, ip, ua);

        return ResponseEntity.ok(ApiResponse.success(null, "Password successfully changed. You can now log in."));
    }

    /**
     * POST /api/v1/auth/mfa/resend-otp
     * Resends the Email OTP for an active MFA login challenge (MFA_PENDING token).
     */
    @PostMapping("/mfa/resend-otp")
    public ResponseEntity<ApiResponse<Void>> resendMfaOtp(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest) {
        String tempToken = request.get("tempToken");
        if (tempToken == null || tempToken.isBlank()) {
            throw new NpmsBaseException("AUTH_BAD_REQUEST", "Temp token is required.");
        }
        authService.resendMfaOtp(tempToken, getClientIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(ApiResponse.success(null, "A new OTP has been sent to your registered email."));
    }

    /**
     * POST /api/v1/auth/resend-setup-otp
     * Resends the first-login verification OTP after validating the temporary token.
     */
    @PostMapping("/resend-setup-otp")
    public ResponseEntity<ApiResponse<Void>> resendSetupOtp(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest) {
        String tempToken = request.get("tempToken");
        if (tempToken == null || tempToken.isBlank()) {
            throw new NpmsBaseException("AUTH_BAD_REQUEST", "Temp token is required.");
        }

        authService.resendInitialPasswordOtp(
                tempToken,
                getClientIp(httpRequest),
                httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(ApiResponse.success(null, "A new verification OTP has been sent."));
    }

    /**
     * POST /api/v1/auth/mfa/verify
     * Verifies TOTP code after login returned mfaRequired=true.
     */
    @PostMapping("/mfa/verify")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyMfa(
            @Valid @RequestBody MfaVerifyRequest request,
            HttpServletRequest httpRequest) {

        String ip = getClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");

        // Validate tempToken to extract userId
        Claims claims;
        try {
            claims = jwtService.validateAccessToken(request.getTempToken());
        } catch (Exception e) {
            throw new NpmsBaseException("AUTH_INVALID_TOKEN", "Invalid or expired temp token. Please login again.");
        }

        UUID userId = UUID.fromString(claims.getSubject());

        // Verify Email OTP code
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NpmsBaseException("AUTH_USER_NOT_FOUND", "User not found"));

        try {
            passwordService.verifySetupOtp(user, String.format("%06d", request.getTotpCode()));
        } catch (NpmsBaseException ex) {
            throw new NpmsBaseException("MFA_INVALID_CODE", ex.getMessage());
        }

        // Email OTP valid — issue full tokens


        Map<String, Object> result = authService.issueTokens(user, ip, ua);

        ResponseCookie accessCookie = (ResponseCookie) result.get("accessCookie");
        ResponseCookie refreshCookie = (ResponseCookie) result.get("refreshCookie");

        @SuppressWarnings("unchecked")
        Map<String, Object> userData = (Map<String, Object>) result.get("user");
        Map<String, Object> data = Map.of("mfaRequired", false, "user", userData);

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                .body(ApiResponse.success(data, "MFA verification successful"));
    }

    /**
     * POST /api/v1/auth/mfa/setup
     * Initiates MFA enrollment. Returns secret + QR code URL.
     * Requires authentication.
     */
    @PostMapping("/mfa/setup")
    public ResponseEntity<ApiResponse<MfaSetupResponse>> setupMfa(Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getPrincipal().toString());

        Map<String, String> setupResult = mfaService.setupMfa(userId);

        MfaSetupResponse response = MfaSetupResponse.builder()
                .secret(setupResult.get("secret"))
                .qrCodeUrl(setupResult.get("qrCodeUrl"))
                .build();

        return ResponseEntity.ok(ApiResponse.success(response, "Scan the QR code with your authenticator app"));
    }

    /**
     * POST /api/v1/auth/mfa/confirm
     * Confirms MFA setup by verifying the user's first TOTP code.
     * Requires authentication.
     */
    @PostMapping("/mfa/confirm")
    public ResponseEntity<ApiResponse<Void>> confirmMfa(
            @Valid @RequestBody MfaConfirmRequest request,
            Authentication authentication,
            HttpServletRequest httpRequest) {

        UUID userId = UUID.fromString(authentication.getPrincipal().toString());
        String ip = getClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");

        mfaService.confirmMfaSetup(userId, request.getTotpCode(), ip, ua);

        return ResponseEntity.ok(ApiResponse.success(null, "MFA has been enabled successfully"));
    }

    /**
     * POST /api/v1/auth/refresh
     * Refreshes the access token using the refresh token cookie.
     */
    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<Void>> refreshToken(HttpServletRequest httpRequest) {
        String refreshTokenRaw = extractCookie(httpRequest, "refresh_token");
        String ip = getClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");

        Map<String, Object> result = authService.refreshToken(refreshTokenRaw, ip, ua);

        ResponseCookie accessCookie = (ResponseCookie) result.get("accessCookie");
        ResponseCookie refreshCookie = (ResponseCookie) result.get("refreshCookie");

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                .body(ApiResponse.success(null, "Token refreshed"));
    }

    /**
     * POST /api/v1/auth/logout
     * Revokes refresh token and clears cookies.
     */
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            Authentication authentication,
            HttpServletRequest httpRequest) {

        String refreshTokenRaw = extractCookie(httpRequest, "refresh_token");
        String ip = getClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");

        UUID userId = authentication != null
                ? UUID.fromString(authentication.getPrincipal().toString())
                : null;

        ResponseCookie[] clearCookies = authService.logout(refreshTokenRaw, userId, ip, ua);

        var responseBuilder = ResponseEntity.ok();
        for (ResponseCookie cookie : clearCookies) {
            responseBuilder.header(HttpHeaders.SET_COOKIE, cookie.toString());
        }

        return responseBuilder.body(ApiResponse.success(null, "Logged out successfully"));
    }

    /**
     * GET /api/v1/auth/me
     * Returns current authenticated user's profile with roles and permissions.
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getMe(Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getPrincipal().toString());
        Map<String, Object> profile = authService.getCurrentUser(userId);
        return ResponseEntity.ok(ApiResponse.success(profile, "Profile fetched"));
    }

    /**
     * POST /api/v1/auth/forgot-password
     * Sends a 6-digit OTP to the user's registered email.
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Map<String, Object>>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request,
            HttpServletRequest httpRequest) {

        String ip = getClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");

        passwordService.forgotPassword(request.getEmail(), ip, ua);

        // Check if user has MFA enabled (for the frontend to know)
        boolean mfaEnabled = userRepository.findByEmail(request.getEmail())
                .map(User::isMfaEnabled)
                .orElse(false);

        Map<String, Object> data = Map.of("mfaRequired", mfaEnabled);

        return ResponseEntity.ok(ApiResponse.success(data,
                "If this email is registered, you will receive a password reset OTP."));
    }

    /**
     * POST /api/v1/auth/verify-otp
     * Verifies the OTP (and TOTP if MFA enabled). Returns a reset token ID.
     */
    @PostMapping("/verify-otp")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyOtp(
            @Valid @RequestBody VerifyOtpRequest request,
            HttpServletRequest httpRequest) {

        String ip = getClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");

        UUID resetTokenId = passwordService.verifyOtpAndMfa(
                request.getEmail(), request.getOtp(), request.getTotpCode(), ip, ua);

        Map<String, Object> data = Map.of("resetTokenId", resetTokenId);

        return ResponseEntity.ok(ApiResponse.success(data, "OTP verified. You may now reset your password."));
    }

    /**
     * POST /api/v1/auth/reset-password
     * Resets the password using a verified reset token.
     */
    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request,
            HttpServletRequest httpRequest) {

        String ip = getClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");

        passwordService.resetPassword(request.getResetTokenId(), request.getNewPassword(), ip, ua);

        return ResponseEntity.ok(ApiResponse.success(null, "Password has been reset successfully. Please login with your new password."));
    }

    // ─── Helper methods ─────────────────────────────────────────────────────────

    private String extractCookie(HttpServletRequest request, String name) {
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if (name.equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
