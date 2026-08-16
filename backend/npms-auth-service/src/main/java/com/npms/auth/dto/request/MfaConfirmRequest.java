package com.npms.auth.dto.request;

import jakarta.validation.constraints.NotNull;

public class MfaConfirmRequest {
    @NotNull(message = "TOTP code is required")
    private Integer totpCode;

    public MfaConfirmRequest() {}
    public MfaConfirmRequest(Integer totpCode) { this.totpCode = totpCode; }

    public Integer getTotpCode() { return totpCode; }
    public void setTotpCode(Integer totpCode) { this.totpCode = totpCode; }
}
