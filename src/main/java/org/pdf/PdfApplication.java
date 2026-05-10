package org.pdf;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PdfApplication {
    public static void main(String[] args) {
        SpringApplication.run(PdfApplication.class, args);
        System.out.println("📄 PDF Editor запущено!");
        System.out.println("📍 http://localhost:8080/");
        System.out.println("🕒 Таймліф: файли живуть 30-60 хвилин");
    }
}