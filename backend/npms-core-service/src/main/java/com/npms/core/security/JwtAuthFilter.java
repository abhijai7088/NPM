package com.npms.core.security;

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
import java.util.ArrayList;
import java.util.List;

/** Populates core-service security from the auth-service access_token cookie. */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final CoreJwtService jwtService;

    public JwtAuthFilter(CoreJwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {
        String token = accessToken(request);
        if (token != null) {
            try {
                Claims claims = jwtService.validate(token);
                String username = claims.get("username", String.class);
                List<SimpleGrantedAuthority> authorities = new ArrayList<>();

                List<?> roles = claims.get("roles", List.class);
                if (roles != null) {
                    roles.stream().map(String::valueOf).forEach(role -> {
                        authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
                        authorities.add(new SimpleGrantedAuthority(role));
                    });
                }
                List<?> permissions = claims.get("permissions", List.class);
                if (permissions != null) {
                    permissions.stream().map(String::valueOf)
                            .map(SimpleGrantedAuthority::new)
                            .forEach(authorities::add);
                }

                if (username != null && !username.isBlank()) {
                    SecurityContextHolder.getContext().setAuthentication(
                            new UsernamePasswordAuthenticationToken(username, null, authorities));
                }
            } catch (Exception ignored) {
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }

    private String accessToken(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        if (request.getCookies() == null) return null;
        for (Cookie cookie : request.getCookies()) {
            if ("access_token".equals(cookie.getName())) return cookie.getValue();
        }
        return null;
    }
}
