package com.npms.erpsync.scheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ErpSyncJob {
    @Scheduled(fixedDelay = 900_000)
    public void syncFromErp() {
    }
    
    @Scheduled(fixedDelay = 60_000)
    public void checkSyncStaleness() {
    }
}