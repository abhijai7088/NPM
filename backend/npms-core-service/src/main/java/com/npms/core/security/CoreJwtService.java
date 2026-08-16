package com.npms.core.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/** Validates access tokens issued by npms-auth-service. */
@Service
public class CoreJwtService {

    private final ResourceLoader resourceLoader;

    @Value("${jwt.public-key-path}")
    private String publicKeyPath;

    private PublicKey publicKey;

    public CoreJwtService(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @PostConstruct
    void init() throws Exception {
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        try (InputStream input = resourceLoader.getResource(publicKeyPath).getInputStream()) {
            String pem = new String(input.readAllBytes(), StandardCharsets.UTF_8)
                    .replaceAll("-----[A-Z ]+-----", "")
                    .replaceAll("\\s+", "");
            publicKey = keyFactory.generatePublic(
                    new X509EncodedKeySpec(Base64.getDecoder().decode(pem)));
        }
    }

    public Claims validate(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(publicKey)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
}
