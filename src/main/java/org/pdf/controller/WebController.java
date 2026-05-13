package org.pdf.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class WebController {

    @GetMapping("/")
    public String index(HttpServletRequest request, Model model) {
        model.addAttribute("currentUri", request.getRequestURI());
        return "index";
    }

    @GetMapping("/merge")
    public String mergePage(HttpServletRequest request, Model model) {
        model.addAttribute("currentUri", request.getRequestURI());
        return "merge";
    }

    @GetMapping("/split")
    public String splitPage(HttpServletRequest request, Model model) {
        model.addAttribute("currentUri", request.getRequestURI());
        return "split";
    }

    @GetMapping("/result")
    public String resultPage(@RequestParam(value = "message", required = false) String message, 
                             HttpServletRequest request, Model model) {
        model.addAttribute("message", message);
        model.addAttribute("currentUri", request.getRequestURI());
        return "result";
    }

    @GetMapping("/organize")
    public String organizePage(HttpServletRequest request, Model model) {
        model.addAttribute("currentUri", request.getRequestURI());
        return "organize";
    }

    @GetMapping("/scan")
    public String scanPage(HttpServletRequest request, Model model) {
        model.addAttribute("currentUri", request.getRequestURI());
        return "scan";
    }

    @GetMapping("/history")
    public String historyPage(HttpServletRequest request, Model model) {
        model.addAttribute("currentUri", request.getRequestURI());
        return "history";
    }
}