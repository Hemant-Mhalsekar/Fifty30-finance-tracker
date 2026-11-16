package com.financetracker.mail;

public record Email(String to, String subject, String text, String html) {
}
