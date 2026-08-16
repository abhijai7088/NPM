package com.npms.auth.dto.response;

import java.time.Instant;

public class ApiResponse<T> {
    private boolean success;
    private T data;
    private String error;
    private String message;
    private String timestamp = Instant.now().toString();

    public ApiResponse() {}

    public ApiResponse(boolean success, T data, String error, String message, String timestamp) {
        this.success = success;
        this.data = data;
        this.error = error;
        this.message = message;
        this.timestamp = timestamp != null ? timestamp : Instant.now().toString();
    }

    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    public T getData() { return data; }
    public void setData(T data) { this.data = data; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

    public static <T> ApiResponse<T> success(T data, String message) {
        return new ApiResponse<>(true, data, null, message, Instant.now().toString());
    }
    public static <T> ApiResponse<T> error(String error, String message) {
        return new ApiResponse<>(false, null, error, message, Instant.now().toString());
    }

    public static <T> ApiResponseBuilder<T> builder() {
        return new ApiResponseBuilder<>();
    }

    public static class ApiResponseBuilder<T> {
        private boolean success;
        private T data;
        private String error;
        private String message;
        private String timestamp = Instant.now().toString();

        public ApiResponseBuilder<T> success(boolean success) { this.success = success; return this; }
        public ApiResponseBuilder<T> data(T data) { this.data = data; return this; }
        public ApiResponseBuilder<T> error(String error) { this.error = error; return this; }
        public ApiResponseBuilder<T> message(String message) { this.message = message; return this; }
        public ApiResponseBuilder<T> timestamp(String timestamp) { this.timestamp = timestamp; return this; }

        public ApiResponse<T> build() {
            return new ApiResponse<>(success, data, error, message, timestamp);
        }
    }
}