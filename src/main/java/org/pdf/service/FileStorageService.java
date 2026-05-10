package org.pdf.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.pdf.model.FileMetadata;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class FileStorageService {
    private final ConcurrentHashMap<String, FileMetadata> metadataStore = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;
    private final String metadataFile = "files_metadata.json";

    public FileStorageService() {
        // Налаштовуємо ObjectMapper з підтримкою Java 8 Time
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
        loadMetadataFromDisk();
    }

    public void saveMetadata(FileMetadata metadata) {
        metadataStore.put(metadata.getFileId(), metadata);
        saveMetadataToDisk();
    }

    public List<FileMetadata> getAllMetadata() {
        return new ArrayList<>(metadataStore.values());
    }

    public void removeMetadata(String fileId) {
        metadataStore.remove(fileId);
        saveMetadataToDisk();
    }

    public Optional<FileMetadata> findById(String fileId) {
        return Optional.ofNullable(metadataStore.get(fileId));
    }

    private void saveMetadataToDisk() {
        try {
            objectMapper.writeValue(new File(metadataFile), getAllMetadata());
        } catch (IOException e) {
            System.err.println("Помилка збереження метаданих: " + e.getMessage());
        }
    }

    private void loadMetadataFromDisk() {
        File file = new File(metadataFile);
        if (file.exists() && file.length() > 0) {
            try {
                List<FileMetadata> list = objectMapper.readValue(file, new TypeReference<List<FileMetadata>>() {});
                list.forEach(m -> metadataStore.put(m.getFileId(), m));
            } catch (IOException e) {
                System.err.println("Помилка читання метаданих (файл пошкоджено): " + e.getMessage());
                file.renameTo(new File(metadataFile + ".corrupted"));
            }
        }
    }
}