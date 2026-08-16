package com.npms.auth.dto.response;

public class MfaSetupResponse {
    /** Base32-encoded TOTP secret (for manual entry) */
    private String secret;

    /** otpauth:// URI for QR code generation */
    private String qrCodeUrl;

    public MfaSetupResponse() {}
    public MfaSetupResponse(String secret, String qrCodeUrl) {
        this.secret = secret;
        this.qrCodeUrl = qrCodeUrl;
    }

    public String getSecret() { return secret; }
    public void setSecret(String secret) { this.secret = secret; }
    public String getQrCodeUrl() { return qrCodeUrl; }
    public void setQrCodeUrl(String qrCodeUrl) { this.qrCodeUrl = qrCodeUrl; }

    public static MfaSetupResponseBuilder builder() {
        return new MfaSetupResponseBuilder();
    }

    public static class MfaSetupResponseBuilder {
        private String secret;
        private String qrCodeUrl;

        public MfaSetupResponseBuilder secret(String secret) { this.secret = secret; return this; }
        public MfaSetupResponseBuilder qrCodeUrl(String qrCodeUrl) { this.qrCodeUrl = qrCodeUrl; return this; }

        public MfaSetupResponse build() {
            return new MfaSetupResponse(secret, qrCodeUrl);
        }
    }
}
