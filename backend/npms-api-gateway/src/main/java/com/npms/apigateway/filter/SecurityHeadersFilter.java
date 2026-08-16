package com.npms.apigateway.filter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class SecurityHeadersFilter implements GlobalFilter, Ordered {
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        return chain.filter(exchange).then(Mono.fromRunnable(() -> {
            exchange.getResponse().getHeaders().add("Content-Security-Policy", "default-src 'self'");
            exchange.getResponse().getHeaders().add("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
            exchange.getResponse().getHeaders().add("Cache-Control", "no-store, no-cache");
            exchange.getResponse().getHeaders().add("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
        }));
    }

    @Override
    public int getOrder() {
        return -5;
    }
}