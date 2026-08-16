package com.npms.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class MfaVerifyRequest {
    @NotBlank(message = "Temp token is required")
    private String tempToken;

    @NotNull(message = "TOTP code is required")
    private Integer totpCode;

    public MfaVerifyRequest() {}
    public MfaVerifyRequest(String tempToken, Integer totpCode) {
        this.tempToken = tempToken;
        this.totpCode = totpCode;
    }

    public String getTempToken() { return tempToken; }
    public void setTempToken(String tempToken) { this.tempToken = tempToken; }
    public Integer getTotpCode() { return totpCode; }
    public void setTotpCode(Integer totpCode) { this.totpCode = totpCode; }
}
