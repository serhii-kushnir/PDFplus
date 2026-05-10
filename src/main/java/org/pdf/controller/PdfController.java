package org.pdf.controller;

import org.pdf.model.FileMetadata;
import org.pdf.service.FileStorageService;
import org.pdf.service.PdfService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/pdf")
public class PdfController {

    private final PdfService pdfService;
    private final FileStorageService storageService;
    private final String uploadDir = "uploaded_files/";

    public PdfController(PdfService pdfService, FileStorageService storageService) {
        this.pdfService = pdfService;
        this.storageService = storageService;
        try {
            Files.createDirectories(Paths.get(uploadDir));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    @PostMapping(value = "/merge", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> mergePdfs(@RequestParam("files") List<MultipartFile> files) {
        try {
            byte[] mergedPdf = pdfService.mergePdfs(files);
            String fileId = UUID.randomUUID().toString();
            String filename = "merged_" + fileId + ".pdf";
            Path filePath = Paths.get(uploadDir, filename);
            Files.write(filePath, mergedPdf);

            FileMetadata metadata = new FileMetadata(fileId, "merged_result.pdf", filePath.toString(), 60);
            storageService.saveMetadata(metadata);

            return buildPdfResponse(mergedPdf, "merged_result.pdf");
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping(value = "/split", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<List<byte[]>> splitPdf(@RequestParam("file") MultipartFile file) {
        try {
            List<byte[]> splitPages = pdfService.splitPdf(file);
            for (int i = 0; i < splitPages.size(); i++) {
                String fileId = UUID.randomUUID().toString();
                String filename = "page_" + (i + 1) + "_" + fileId + ".pdf";
                Path filePath = Paths.get(uploadDir, filename);
                Files.write(filePath, splitPages.get(i));

                FileMetadata metadata = new FileMetadata(fileId, "page_" + (i + 1) + ".pdf", filePath.toString(), 30);
                storageService.saveMetadata(metadata);
            }
            return ResponseEntity.ok(splitPages);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/status/{fileId}")
    public ResponseEntity<Object> getFileStatus(@PathVariable String fileId) {
        return storageService.findById(fileId)
                .<ResponseEntity<Object>>map(metadata -> {
                    boolean expired = metadata.isExpired();
                    long minutesLeft = 0;
                    if (!expired && metadata.getTtlMinutes() > 0) {
                        minutesLeft = metadata.getTtlMinutes() -
                                Duration.between(metadata.getCreatedAt(), LocalDateTime.now()).toMinutes();
                    }
                    return ResponseEntity.ok(new StatusResponse(
                            metadata.getFileId(),
                            metadata.getOriginalFilename(),
                            metadata.getCreatedAt(),
                            expired ? "EXPIRED" : "ACTIVE",
                            Math.max(0, minutesLeft)
                    ));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body("Файл не знайдено"));
    }

    private ResponseEntity<byte[]> buildPdfResponse(byte[] pdfBytes, String filename) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", filename);
        headers.setContentLength(pdfBytes.length);
        return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
    }

    static class StatusResponse {
        public String fileId;
        public String filename;
        public LocalDateTime createdAt;
        public String status;
        public long minutesLeft;

        public StatusResponse(String fileId, String filename, LocalDateTime createdAt, String status, long minutesLeft) {
            this.fileId = fileId;
            this.filename = filename;
            this.createdAt = createdAt;
            this.status = status;
            this.minutesLeft = minutesLeft;
        }
    }
}