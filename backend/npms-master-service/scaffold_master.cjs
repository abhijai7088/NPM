const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-master-service/src/main/java/com/npms/master';
const resourcesDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-master-service/src/main/resources';

const dirs = [
    'config', 'controller', 'service', 'repository', 'entity', 'dto/request', 'dto/response', 'exception', 'security', 'util'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});
fs.mkdirSync(resourcesDir, { recursive: true });

fs.writeFileSync(path.join(resourcesDir, 'application.yml'), `server:
  port: 8082
spring:
  datasource:
    url: jdbc:postgresql://\${DB_HOST}:\${DB_PORT}/\${DB_NAME}
    username: \${DB_USER}
    password: \${DB_PASSWORD}
  jpa:
    hibernate.ddl-auto: validate
    properties.hibernate.default_schema: master
  flyway:
    enabled: false
  cache:
    type: redis
  data:
    redis:
      host: \${REDIS_HOST}
      port: \${REDIS_PORT}
      time-to-live: 900000
jwt:
  public-key-path: \${JWT_PUBLIC_KEY_PATH}
`);

fs.writeFileSync(path.join(baseDir, 'MasterServiceApplication.java'), `package com.npms.master;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
public class MasterServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(MasterServiceApplication.class, args);
    }
}
`);

const entities = {
  'Ministry.java': `package com.npms.master.entity;
import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "ministries", schema = "master")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Ministry {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(nullable = false, unique = true)
    private String code;
    @Column(nullable = false)
    private String name;
    @Column(name = "is_active")
    private boolean isActive = true;
}`,
  'Department.java': `package com.npms.master.entity;
import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "departments", schema = "master")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Department {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ministry_id", nullable = false)
    private Ministry ministry;
    @Column(nullable = false, unique = true)
    private String code;
    @Column(nullable = false)
    private String name;
    @Column(name = "is_active")
    private boolean isActive = true;
}`
};

for (const [name, content] of Object.entries(entities)) {
  fs.writeFileSync(path.join(baseDir, 'entity', name), content);
}

console.log('Master Service scaffolded.');
