package org.pdf.controller;

import org.pdf.model.FileMetadata;
import org.pdf.service.FileStorageService;
import org.pdf.service.PdfService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

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

    @PostMapping(value = "/remove-pages", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> removePages(@RequestParam("file") MultipartFile file,
                                              @RequestParam("keepPages") String keepPagesJson) {
        try {
            List<Integer> keepPages = new ObjectMapper().readValue(keepPagesJson,
                    new TypeReference<List<Integer>>() {});
            byte[] resultPdf = pdfService.extractPages(file.getBytes(), keepPages);
            return buildPdfResponse(resultPdf, "modified.pdf");
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping(value = "/rotate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> rotatePdf(@RequestParam("file") MultipartFile file,
                                            @RequestParam("angle") int angle) {
        try {
            byte[] bytes = file.getBytes();
            if (!pdfService.isPdfValid(bytes)) {
                System.out.println("ПОМИЛКА: Невірний PDF у rotate - " + file.getOriginalFilename());
                return ResponseEntity.badRequest()
                        .body(("Файл " + file.getOriginalFilename() + " некоректний або містить JavaScript").getBytes());
            }
            byte[] rotatedPdf = pdfService.rotatePdf(bytes, angle);
            System.out.println("УСПІХ: Повернуто файл " + file.getOriginalFilename());
            return buildPdfResponse(rotatedPdf, "rotated.pdf");
        } catch (IOException e) {
            System.err.println("ПОМИЛКА: rotate - " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping(value = "/rotate-page", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> rotatePage(@RequestParam("file") MultipartFile file,
                                             @RequestParam("page") int pageNumber,
                                             @RequestParam("angle") int angle) {
        try {
            byte[] bytes = file.getBytes();
            if (!pdfService.isPdfValid(bytes)) {
                System.out.println("ПОМИЛКА: Невірний PDF у rotate-page - " + file.getOriginalFilename());
                return ResponseEntity.badRequest()
                        .body(("Файл " + file.getOriginalFilename() + " некоректний або містить JavaScript").getBytes());
            }
            byte[] rotated = pdfService.rotatePage(bytes, pageNumber, angle);
            System.out.println("УСПІХ: Повернуто сторінку " + pageNumber + " файлу " + file.getOriginalFilename());
            return buildPdfResponse(rotated, "rotated.pdf");
        } catch (IOException e) {
            System.err.println("ПОМИЛКА: rotate-page - " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping(value = "/extract-pages", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> extractPages(@RequestParam("file") MultipartFile file,
                                               @RequestParam("pages") String pagesJson) {
        try {
            byte[] bytes = file.getBytes();
            if (!pdfService.isPdfValid(bytes)) {
                System.out.println("ПОМИЛКА: Невірний PDF у extract-pages - " + file.getOriginalFilename());
                return ResponseEntity.badRequest()
                        .body(("Файл " + file.getOriginalFilename() + " некоректний або містить JavaScript").getBytes());
            }
            List<Integer> pageNumbers = new ObjectMapper().readValue(pagesJson,
                    new TypeReference<List<Integer>>() {});
            byte[] zipData = pdfService.extractPagesToZip(bytes, pageNumbers);
            System.out.println("УСПІХ: Витягнуто сторінки " + pageNumbers + " з файлу " + file.getOriginalFilename());
            return buildZipResponse(zipData, "extracted_pages.zip");
        } catch (IOException e) {
            System.err.println("ПОМИЛКА: extract-pages - " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping(value = "/merge", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> mergePdfs(@RequestParam("files") List<MultipartFile> files) {
        for (MultipartFile file : files) {
            try {
                byte[] bytes = file.getBytes();
                if (!pdfService.isPdfValid(bytes)) {
                    System.out.println("ПОМИЛКА: Невірний PDF у merge - " + file.getOriginalFilename());
                    return ResponseEntity.badRequest()
                            .body(("Файл " + file.getOriginalFilename() + " некоректний або містить JavaScript").getBytes());
                }
            } catch (IOException e) {
                System.err.println("ПОМИЛКА: merge - перевірка файлу " + file.getOriginalFilename() + " - " + e.getMessage());
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(("Помилка перевірки файлу " + file.getOriginalFilename()).getBytes());
            }
        }
        try {
            byte[] mergedPdf = pdfService.mergePdfs(files);
            String fileId = UUID.randomUUID().toString();
            String filename = "merged_" + fileId + ".pdf";
            Path filePath = Paths.get(uploadDir, filename);
            Files.write(filePath, mergedPdf);
            FileMetadata metadata = new FileMetadata(fileId, "merged_result.pdf", filePath.toString(), 60);
            storageService.saveMetadata(metadata);
            System.out.println("УСПІХ: Об'єднано " + files.size() + " файлів");
            return buildPdfResponse(mergedPdf, "merged_result.pdf");
        } catch (IOException e) {
            System.err.println("ПОМИЛКА: merge - " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping(value = "/split", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> splitPdf(@RequestParam("file") MultipartFile file) {
        try {
            List<byte[]> splitPages = pdfService.splitPdf(file);

            // Створюємо ZIP-архів у пам'яті
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                for (int i = 0; i < splitPages.size(); i++) {
                    byte[] pageData = splitPages.get(i);
                    String entryName = "page_" + (i + 1) + ".pdf";
                    ZipEntry entry = new ZipEntry(entryName);
                    zos.putNextEntry(entry);
                    zos.write(pageData);
                    zos.closeEntry();

                    // Зберігаємо кожну сторінку на диск для таймліфу
                    String fileId = UUID.randomUUID().toString();
                    String filename = "page_" + (i + 1) + "_" + fileId + ".pdf";
                    Path filePath = Paths.get(uploadDir, filename);
                    Files.write(filePath, pageData);

                    FileMetadata metadata = new FileMetadata(fileId, "page_" + (i + 1) + ".pdf", filePath.toString(), 30);
                    storageService.saveMetadata(metadata);
                }
            }

            byte[] zipData = baos.toByteArray();
            return buildZipResponse(zipData, "split_pages.zip");
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping(value = "/organize", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> organizePdf(
            @RequestParam("file") MultipartFile file,
            @RequestParam("order") String orderJson) {
        try {
            byte[] bytes = file.getBytes();
            if (!pdfService.isPdfValid(bytes)) {
                System.out.println("ПОМИЛКА: Невірний PDF у organize - " + file.getOriginalFilename());
                return ResponseEntity.badRequest()
                        .body(("Файл " + file.getOriginalFilename() + " некоректний або містить JavaScript").getBytes());
            }
            List<Integer> pageOrder = new ObjectMapper().readValue(orderJson,
                    new TypeReference<List<Integer>>() {});
            byte[] organizedPdf = pdfService.organizePdf(bytes, pageOrder);
            String fileId = UUID.randomUUID().toString();
            String filename = "organized_" + fileId + ".pdf";
            Path filePath = Paths.get(uploadDir, filename);
            Files.write(filePath, organizedPdf);
            FileMetadata metadata = new FileMetadata(fileId, "organized_result.pdf", filePath.toString(), 60);
            storageService.saveMetadata(metadata);
            System.out.println("УСПІХ: Організовано файл " + file.getOriginalFilename());
            return buildPdfResponse(organizedPdf, "organized_result.pdf");
        } catch (IOException e) {
            System.err.println("ПОМИЛКА: organize - " + e.getMessage());
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

    @GetMapping("/files")
    public ResponseEntity<List<FileMetadata>> getAllFiles() {
        List<FileMetadata> files = storageService.getAllMetadata();
        return ResponseEntity.ok(files);
    }

    private ResponseEntity<byte[]> buildPdfResponse(byte[] pdfBytes, String filename) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", filename);
        headers.setContentLength(pdfBytes.length);
        return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
    }

    private ResponseEntity<byte[]> buildZipResponse(byte[] zipBytes, String filename) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        headers.setContentDispositionFormData("attachment", filename);
        headers.setContentLength(zipBytes.length);
        return new ResponseEntity<>(zipBytes, headers, HttpStatus.OK);
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