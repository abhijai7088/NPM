package com.npms.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class ResetPasswordRequest {
    @NotNull(message = "Reset token is required")
    private UUID resetTokenId;

    @NotBlank(message = "New password is required")
    private String newPassword;

    public ResetPasswordRequest() {}
    public ResetPasswordRequest(UUID resetTokenId, String newPassword) {
        this.resetTokenId = resetTokenId;
        this.newPassword = newPassword;
    }

    public UUID getResetTokenId() { return resetTokenId; }
    public void setResetTokenId(UUID resetTokenId) { this.resetTokenId = resetTokenId; }
    public String getNewPassword() { return newPassword; }
    public void setNewPassword(String newPassword) { this.newPassword = newPassword; }
}
