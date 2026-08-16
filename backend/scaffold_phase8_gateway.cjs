const fs = require('fs');
const path = require('path');

const svc = {
  name: 'npms-api-gateway',
  port: 8080,
  packages: ['config', 'filter', 'exception'],
  files: {
    'config/CorsConfig.java': `package com.npms.apigateway.config;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;
import java.util.List;

@Configuration
public class CorsConfig {
    @Bean
    public CorsWebFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:3000"));
        config.setAllowedMethods(List.of("GET","POST","PUT","DELETE","PATCH","OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type","X-Correlation-ID","X-CSRF-Token"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return new CorsWebFilter(source);
    }
}`,
    'filter/CorrelationIdFilter.java': `package com.npms.apigateway.filter;
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
        ServerWebExchange modified = exchange.mutate()
            .request(r -> r.header("X-Correlation-ID", finalId))
            .response(r -> r.getHeaders().add("X-Correlation-ID", finalId))
            .build();
        return chain.filter(modified);
    }

    @Override
    public int getOrder() {
        return -10;
    }
}`,
    'filter/SecurityHeadersFilter.java': `package com.npms.apigateway.filter;
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
}`
  }
};

const basePath = 'c:/knowledge/Confidential/NICSI/npms/backend';
const srcPath = path.join(basePath, svc.name, 'src/main/java/com/npms/apigateway');
const resPath = path.join(basePath, svc.name, 'src/main/resources');

svc.packages.forEach(pkg => {
  fs.mkdirSync(path.join(srcPath, pkg), { recursive: true });
});
fs.mkdirSync(resPath, { recursive: true });

fs.writeFileSync(path.join(resPath, 'application.yml'), 'server:\\n  port: 8080\\nspring:\\n  cloud:\\n    gateway:\\n      routes:\\n        - id: auth-service\\n          uri: http://localhost:8081\\n          predicates: [Path=/api/v1/auth/**]\\n        - id: master-service\\n          uri: http://localhost:8082\\n          predicates: [Path=/api/v1/master/**]\\n');

fs.writeFileSync(path.join(srcPath, 'Application.java'), 'package com.npms.apigateway;\\nimport org.springframework.boot.SpringApplication;\\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\\n\\n@SpringBootApplication\\npublic class Application {\\n    public static void main(String[] args) {\\n        SpringApplication.run(Application.class, args);\\n    }\\n}\\n');

Object.entries(svc.files).forEach(([fPath, content]) => {
  fs.writeFileSync(path.join(srcPath, fPath), content);
});

console.log('Phase 8 API Gateway scaffolded.');
