package org.pdf.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.multipdf.Splitter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

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
}