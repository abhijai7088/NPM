const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-auth-service/src/main/java/com/npms/auth';
const dirs = [
    'config', 'controller', 'service', 'repository', 'entity', 'dto/request', 'dto/response', 'mapper', 'exception', 'security', 'event', 'util'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});

// A dummy Main Application class
fs.writeFileSync(path.join(baseDir, 'AuthServiceApplication.java'), `
package com.npms.auth;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
@SpringBootApplication
public class AuthServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuthServiceApplication.class, args);
    }
}
`);
console.log('Directories created successfully');
