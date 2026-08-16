package com.npms.master;

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
