const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-auth-service/src/main/java/com/npms/auth';

const files = {
  'service/JwtService.java': `package com.npms.auth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.nio.file.Files;
import java.nio.file.Paths;
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

    @Value("\${jwt.private-key-path}")
    private String privateKeyPath;

    @Value("\${jwt.public-key-path}")
    private String publicKeyPath;

    @Value("\${jwt.access-expiry-minutes}")
    private int accessExpiryMinutes;

    @Value("\${jwt.refresh-expiry-days}")
    private int refreshExpiryDays;

    private PrivateKey privateKey;
    private PublicKey publicKey;

    @PostConstruct
    public void init() throws Exception {
        // Remove 'classpath:' prefix if exists for local file reading (simplified for dev)
        String privPath = privateKeyPath.replace("classpath:", "src/main/resources/");
        String pubPath = publicKeyPath.replace("classpath:", "src/main/resources/");
        
        String privKeyStr = new String(Files.readAllBytes(Paths.get(privPath)))
                .replaceAll("-----[A-Z ]+-----", "")
                .replaceAll("\\\\s+", "");
        byte[] privBytes = Base64.getDecoder().decode(privKeyStr);
        PKCS8EncodedKeySpec privSpec = new PKCS8EncodedKeySpec(privBytes);
        KeyFactory kf = KeyFactory.getInstance("RSA");
        privateKey = kf.generatePrivate(privSpec);

        String pubKeyStr = new String(Files.readAllBytes(Paths.get(pubPath)))
                .replaceAll("-----[A-Z ]+-----", "")
                .replaceAll("\\\\s+", "");
        byte[] pubBytes = Base64.getDecoder().decode(pubKeyStr);
        X509EncodedKeySpec pubSpec = new X509EncodedKeySpec(pubBytes);
        publicKey = kf.generatePublic(pubSpec);
    }

    public String generateAccessToken(UUID userId, String username, List<String> roles) {
        return Jwts.builder()
                .setSubject(userId.toString())
                .claim("username", username)
                .claim("roles", roles)
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

    public ResponseCookie createAccessCookie(String token) {
        return ResponseCookie.from("access_token", token)
                .httpOnly(true)
                .secure(false) // Set to true in prod
                .sameSite("Strict")
                .path("/")
                .maxAge(accessExpiryMinutes * 60L)
                .build();
    }

    public ResponseCookie createRefreshCookie(String token) {
        return ResponseCookie.from("refresh_token", token)
                .httpOnly(true)
                .secure(false)
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
}`,

  'service/AuditLogService.java': `package com.npms.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class AuditLogService {

    private static final Logger log = LoggerFactory.getLogger(AuditLogService.class);
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AuditLogService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public void writeLog(UUID userId, String username, String action, String entityType,
                         UUID entityId, Object oldValue, Object newValue,
                         String ipAddress, String userAgent, String status, String errorMsg) {
        try {
            String oldValJson = oldValue != null ? objectMapper.writeValueAsString(oldValue) : null;
            String newValJson = newValue != null ? objectMapper.writeValueAsString(newValue) : null;
            
            String sql = "INSERT INTO audit.audit_logs (user_id, username, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, status, error_message) VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?)";
            
            jdbcTemplate.update(sql, userId, username, action, entityType, entityId, oldValJson, newValJson, ipAddress, userAgent, status, errorMsg);
        } catch (Exception e) {
            log.error("Failed to write audit log: {}", e.getMessage(), e);
        }
    }
}`,

  'security/JwtAuthFilter.java': `package com.npms.auth.security;

import com.npms.auth.service.JwtService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        
        String token = null;
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("access_token".equals(cookie.getName())) {
                    token = cookie.getValue();
                    break;
                }
            }
        }

        if (token != null) {
            try {
                Claims claims = jwtService.validateAccessToken(token);
                String userId = claims.getSubject();
                List<String> roles = claims.get("roles", List.class);

                List<SimpleGrantedAuthority> authorities = roles.stream()
                        .map(SimpleGrantedAuthority::new)
                        .collect(Collectors.toList());

                UsernamePasswordAuthenticationToken auth = 
                        new UsernamePasswordAuthenticationToken(userId, null, authorities);
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (Exception e) {
                // Invalid token, continue filter chain without setting auth
            }
        }

        filterChain.doFilter(request, response);
    }
}`,

  'security/SecurityConfig.java': `package com.npms.auth.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/login", "/api/v1/auth/refresh").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
            
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Services and Security configured.');
