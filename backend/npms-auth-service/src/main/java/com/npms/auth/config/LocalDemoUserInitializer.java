package com.npms.auth.config;

import com.npms.auth.entity.Role;
import com.npms.auth.entity.User;
import com.npms.auth.repository.RoleRepository;
import com.npms.auth.repository.UserRepository;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.HashSet;

/**
 * Local-only bootstrap for the two operational roles used by the NPMS demo.
 * Production deployments must set APP_ENV to a non-local value.
 * Passwords are stored as BCrypt hashes; no plaintext credential is persisted.
 */
@Configuration
@ConditionalOnProperty(name = "app.env", havingValue = "local")
public class LocalDemoUserInitializer {

    @Bean
    ApplicationRunner ensureOperationalDemoUsers(
            UserRepository users,
            RoleRepository roles,
            PasswordEncoder encoder) {
        return args -> {
            Role oa = ensureRole(roles, "OA", "Operational Assistant", "Executes assigned project tickets and submits work for PM review.");
            Role pmc = ensureRole(roles, "PMC", "Project Monitoring Cell", "Monitors project exceptions, SLA breaches, escalations and holds.");

            ensureUser(users, encoder, "oa_operator", "oa_operator@npms.local", "OA Operator", oa);
            ensureUser(users, encoder, "pmc_admin", "pmc_admin@npms.local", "PMC Control Cell", pmc);
        };
    }

    private Role ensureRole(RoleRepository roles, String code, String name, String description) {
        return roles.findByCode(code).orElseGet(() -> {
            Role role = new Role();
            role.setCode(code);
            role.setName(name);
            role.setDescription(description);
            role.setPermissions(new HashSet<>());
            return roles.save(role);
        });
    }

    private void ensureUser(UserRepository users, PasswordEncoder encoder,
                            String username, String email, String fullName, Role role) {
        User user = users.findByUsernameIgnoreCase(username).orElseGet(() -> {
            User created = User.builder()
                    .username(username)
                    .email(email)
                    .fullName(fullName)
                    .passwordHash(encoder.encode("Abhi1234#"))
                    .isActive(true)
                    .isLocked(false)
                    .requiresPasswordChange(false)
                    .roles(new HashSet<>())
                    .build();
            return users.save(created);
        });

        boolean changed = user.getRoles().add(role);
        if (!user.isActive()) {
            user.setActive(true);
            changed = true;
        }
        if (user.isLocked()) {
            user.setLocked(false);
            user.setLockedUntil(null);
            user.setFailedLoginCount(0);
            changed = true;
        }
        if (changed) users.save(user);
    }
}
