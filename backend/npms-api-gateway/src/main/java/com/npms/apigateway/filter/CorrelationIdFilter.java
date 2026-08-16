package com.npms.apigateway.filter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import java.util.UUID;

@Component
public class CorrelationIdFilter implements GlobalFilter, Ordered {
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String correlationId = exchange.getRequest().getHeaders().getFirst("X-Correlation-ID");
        if (correlationId == null) {
            correlationId = UUID.randomUUID().toString();
        }
        final String finalId = correlationId;
        exchange.getResponse().getHeaders().add("X-Correlation-ID", finalId);
        ServerWebExchange modified = exchange.mutate()
            .request(r -> r.header("X-Correlation-ID", finalId))
            .build();
        return chain.filter(modified);
    }

    @Override
    public int getOrder() {
        return -10;
    }
}