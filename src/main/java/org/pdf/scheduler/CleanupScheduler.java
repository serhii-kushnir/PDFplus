package org.pdf.scheduler;

import org.pdf.model.FileMetadata;
import org.pdf.service.FileStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@Component
public class CleanupScheduler {
    private static final Logger log = LoggerFactory.getLogger(CleanupScheduler.class);
    private final FileStorageService storageService;

    public CleanupScheduler(FileStorageService storageService) {
        this.storageService = storageService;
    }

    @Scheduled(fixedRate = 30 * 60 * 1000) // кожні 30 хвилин
    public void cleanExpiredFiles() {
        log.info("🔄 Запуск очищення застарілих файлів...");
        List<FileMetadata> allFiles = storageService.getAllMetadata();
        int deletedCount = 0;

        for (FileMetadata meta : allFiles) {
            if (meta.isExpired()) {
                try {
                    Path filePath = Paths.get(meta.getStoragePath());
                    boolean deleted = Files.deleteIfExists(filePath);
                    storageService.removeMetadata(meta.getFileId());
                    if (deleted) {
                        log.info("🗑️ Видалено файл: {} (ID: {}, створено: {})",
                                meta.getOriginalFilename(), meta.getFileId(), meta.getCreatedAt());
                        deletedCount++;
                    }
                } catch (IOException e) {
                    log.error("❌ Помилка видалення файлу {}: {}", meta.getFileId(), e.getMessage());
                }
            }
        }
        log.info("✅ Очищення завершено. Видалено {} файлів.", deletedCount);
    }
}