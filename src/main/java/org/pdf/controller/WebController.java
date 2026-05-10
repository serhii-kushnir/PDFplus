package org.pdf.controller;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class WebController {

    @GetMapping("/")
    public String index() {
        return "index";
    }

    @GetMapping("/merge")
    public String mergePage() {
        return "merge";
    }

    @GetMapping("/split")
    public String splitPage() {
        return "split";
    }

    @GetMapping("/result")
    public String resultPage(@RequestParam(value = "message", required = false) String message, Model model) {
        model.addAttribute("message", message);
        return "result";
    }
}