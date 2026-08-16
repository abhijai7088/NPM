package com.npms.auth.exception;

public class NpmsBaseException extends RuntimeException {
    private final String errorCode;

    public NpmsBaseException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}