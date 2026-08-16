package com.npms.auth.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public class VerifyOtpRequest {
    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "OTP is required")
    private String otp;

    /** Required only if user has MFA enabled */
    private Integer totpCode;

    public VerifyOtpRequest() {}
    public VerifyOtpRequest(String email, String otp, Integer totpCode) {
        this.email = email;
        this.otp = otp;
        this.totpCode = totpCode;
    }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getOtp() { return otp; }
    public void setOtp(String otp) { this.otp = otp; }
    public Integer getTotpCode() { return totpCode; }
    public void setTotpCode(Integer totpCode) { this.totpCode = totpCode; }
}
