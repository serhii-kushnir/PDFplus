package org.pdf.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.multipdf.Splitter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class PdfService {

    public byte[] mergePdfs(List<MultipartFile> files) throws IOException {
        PDFMergerUtility merger = new PDFMergerUtility();
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

        try (PDDocument masterDoc = new PDDocument()) {
            for (MultipartFile file : files) {
                try (PDDocument doc = Loader.loadPDF(file.getBytes())) {
                    merger.appendDocument(masterDoc, doc);
                }
            }
            masterDoc.save(outputStream);
        }
        return outputStream.toByteArray();
    }

    public List<byte[]> splitPdf(MultipartFile file) throws IOException {
        List<byte[]> resultPages = new ArrayList<>();

        try (PDDocument document = Loader.loadPDF(file.getBytes())) {
            Splitter splitter = new Splitter();
            splitter.setSplitAtPage(1);
            List<PDDocument> pages = splitter.split(document);
            for (PDDocument pageDoc : pages) {
                try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    pageDoc.save(baos);
                    resultPages.add(baos.toByteArray());
                    pageDoc.close();
                }
            }
        }
        return resultPages;
    }

    public byte[] organizePdf(byte[] originalBytes, List<Integer> pageOrder) throws IOException {
        try (PDDocument sourceDoc = Loader.loadPDF(originalBytes);
             PDDocument newDoc = new PDDocument()) {
            for (Integer pageNum : pageOrder) {
                if (pageNum == -1) {
                    PDPage blankPage = new PDPage(PDRectangle.A4);
                    newDoc.addPage(blankPage);
                } else {
                    int index = pageNum - 1;
                    if (index >= 0 && index < sourceDoc.getNumberOfPages()) {
                        PDPage page = sourceDoc.getPage(index);
                        newDoc.addPage(page);
                    }
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            newDoc.save(baos);
            return baos.toByteArray();
        }
    }

    public byte[] rotatePage(byte[] originalBytes, int pageNumber, int angle) throws IOException {
        try (PDDocument document = Loader.loadPDF(originalBytes)) {
            int pageIndex = pageNumber - 1;
            if (pageIndex < 0 || pageIndex >= document.getNumberOfPages()) {
                throw new IllegalArgumentException("Invalid page number");
            }
            PDPage page = document.getPage(pageIndex);
            int currentRotation = page.getRotation();
            int newRotation = (currentRotation + angle) % 360;
            page.setRotation(newRotation);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    // Об'єднує вибрані сторінки в один PDF (не для ZIP)
    public byte[] extractPages(byte[] originalBytes, List<Integer> pageNumbers) throws IOException {
        try (PDDocument sourceDoc = Loader.loadPDF(originalBytes);
             PDDocument newDoc = new PDDocument()) {
            for (Integer pNum : pageNumbers) {
                int idx = pNum - 1;
                if (idx >= 0 && idx < sourceDoc.getNumberOfPages()) {
                    PDPage page = sourceDoc.getPage(idx);
                    newDoc.addPage(page);
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            newDoc.save(baos);
            return baos.toByteArray();
        }
    }

    // ✅ Новий метод: створює ZIP-архів з окремими PDF-файлами для кожної сторінки
    public byte[] extractPagesToZip(byte[] originalBytes, List<Integer> pageNumbers) throws IOException {
        ByteArrayOutputStream zipBaos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(zipBaos)) {
            for (int pageNum : pageNumbers) {
                int pageIndex = pageNum - 1;
                try (PDDocument source = Loader.loadPDF(originalBytes);
                     PDDocument singlePageDoc = new PDDocument()) {
                    if (pageIndex >= 0 && pageIndex < source.getNumberOfPages()) {
                        PDPage page = source.getPage(pageIndex);
                        singlePageDoc.addPage(page);
                    }
                    ByteArrayOutputStream pdfBaos = new ByteArrayOutputStream();
                    singlePageDoc.save(pdfBaos);
                    byte[] pdfBytes = pdfBaos.toByteArray();

                    ZipEntry entry = new ZipEntry("page_" + pageNum + ".pdf");
                    zos.putNextEntry(entry);
                    zos.write(pdfBytes);
                    zos.closeEntry();
                }
            }
        }
        return zipBaos.toByteArray();
    }

    public byte[] rotatePdf(byte[] originalBytes, int angle) throws IOException {
        try (PDDocument document = Loader.loadPDF(originalBytes)) {
            for (PDPage page : document.getPages()) {
                int currentRotation = page.getRotation();
                int newRotation = (currentRotation + angle) % 360;
                page.setRotation(newRotation);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    public boolean isPdfValid(byte[] fileBytes) throws IOException {
        if (fileBytes.length < 4) return false;
        String header = new String(fileBytes, 0, 4);
        if (!header.equals("%PDF")) return false;

        try (PDDocument doc = Loader.loadPDF(fileBytes)) {
            if (doc.getNumberOfPages() == 0) return false;
            // Перевірка на JavaScript
            if (doc.getDocumentCatalog().getNames() != null &&
                    doc.getDocumentCatalog().getNames().getJavaScript() != null &&
                    !doc.getDocumentCatalog().getNames().getJavaScript().getNames().isEmpty()) {
                return false;
            }
        } catch (IOException e) {
            return false;
        }
        return true;
    }
}