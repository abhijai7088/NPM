package com.npms.auth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.security.MessageDigest;

@Service
public class JwtService {

    @Value("${jwt.private-key-path}")
    private String privateKeyPath;

    @Value("${jwt.public-key-path}")
    private String publicKeyPath;

    @Value("${jwt.access-expiry-minutes}")
    private int accessExpiryMinutes;

    @Value("${jwt.refresh-expiry-days}")
    private int refreshExpiryDays;

    // Cookies must only be marked Secure once the app is actually served over
    // HTTPS — a Secure cookie is silently dropped by the browser on plain
    // HTTP, which would break local dev entirely. Driven by APP_ENV so this
    // flips to true automatically in any non-local deployment instead of
    // relying on someone remembering to hand-edit this file before shipping.
    @Value("${app.env:local}")
    private String appEnv;

    private final ResourceLoader resourceLoader;

    private PrivateKey privateKey;
    private PublicKey publicKey;

    public JwtService(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @PostConstruct
    public void init() throws Exception {
        KeyFactory kf = KeyFactory.getInstance("RSA");

        // Load keys via Spring's ResourceLoader so 'classpath:' works inside a jar/container.
        byte[] privBytes = Base64.getDecoder().decode(readKey(privateKeyPath));
        privateKey = kf.generatePrivate(new PKCS8EncodedKeySpec(privBytes));

        byte[] pubBytes = Base64.getDecoder().decode(readKey(publicKeyPath));
        publicKey = kf.generatePublic(new X509EncodedKeySpec(pubBytes));
    }

    /** Reads a PEM resource (classpath: or file:) and strips headers/whitespace. */
    private String readKey(String location) throws Exception {
        try (InputStream is = resourceLoader.getResource(location).getInputStream()) {
            String pem = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            return pem.replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s+", "");
        }
    }

    public String generateAccessToken(UUID userId, String username, List<String> roles) {
        return generateAccessToken(userId, username, roles, null);
    }

    public String generateAccessToken(UUID userId, String username, List<String> roles, List<String> permissions) {
        var builder = Jwts.builder()
                .setSubject(userId.toString())
                .claim("username", username)
                .claim("roles", roles);

        if (permissions != null && !permissions.isEmpty()) {
            builder.claim("permissions", permissions);
        }

        return builder
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + accessExpiryMinutes * 60000L))
                .signWith(privateKey, SignatureAlgorithm.RS256)
                .compact();
    }

    public String generateRefreshToken() {
        return UUID.randomUUID().toString();
    }

    public Claims validateAccessToken(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(publicKey)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    public String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes());
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            throw new RuntimeException("Error hashing token", e);
        }
    }

    /** True for every environment except local dev (plain HTTP on localhost). */
    private boolean secureCookies() {
        return !"local".equalsIgnoreCase(appEnv);
    }

    public ResponseCookie createAccessCookie(String token) {
        return ResponseCookie.from("access_token", token)
                .httpOnly(true)
                .secure(secureCookies())
                .sameSite("Strict")
                .path("/")
                .maxAge(accessExpiryMinutes * 60L)
                .build();
    }

    public ResponseCookie createRefreshCookie(String token) {
        return ResponseCookie.from("refresh_token", token)
                .httpOnly(true)
                .secure(secureCookies())
                .sameSite("Strict")
                .path("/api/v1/auth/refresh")
                .maxAge(refreshExpiryDays * 24 * 60 * 60L)
                .build();
    }

    public ResponseCookie[] clearCookies() {
        ResponseCookie accessCookie = ResponseCookie.from("access_token", "")
                .httpOnly(true).path("/").maxAge(0).build();
        ResponseCookie refreshCookie = ResponseCookie.from("refresh_token", "")
                .httpOnly(true).path("/api/v1/auth/refresh").maxAge(0).build();
        return new ResponseCookie[]{accessCookie, refreshCookie};
    }
}