package org.pdf.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.LocalDateTime;

@JsonIgnoreProperties(ignoreUnknown = true)
public class FileMetadata {
    private String fileId;
    private String originalFilename;
    private String storagePath;
    private LocalDateTime createdAt;
    private long ttlMinutes; // час життя в хвилинах, 0 = безстроково

    public FileMetadata() {}

    public FileMetadata(String fileId, String originalFilename, String storagePath, long ttlMinutes) {
        this.fileId = fileId;
        this.originalFilename = originalFilename;
        this.storagePath = storagePath;
        this.createdAt = LocalDateTime.now();
        this.ttlMinutes = ttlMinutes;
    }

    public boolean isExpired() {
        if (ttlMinutes == 0) return false;
        return LocalDateTime.now().isAfter(createdAt.plusMinutes(ttlMinutes));
    }

    // Гетери та сетери
    public String getFileId() { return fileId; }
    public void setFileId(String fileId) { this.fileId = fileId; }
    public String getOriginalFilename() { return originalFilename; }
    public void setOriginalFilename(String originalFilename) { this.originalFilename = originalFilename; }
    public String getStoragePath() { return storagePath; }
    public void setStoragePath(String storagePath) { this.storagePath = storagePath; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public long getTtlMinutes() { return ttlMinutes; }
    public void setTtlMinutes(long ttlMinutes) { this.ttlMinutes = ttlMinutes; }
}