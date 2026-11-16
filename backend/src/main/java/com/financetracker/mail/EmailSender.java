package com.financetracker.mail;

public interface EmailSender {

    /** Sends one email. Throws EmailException if the provider refuses it. */
    void send(Email email);
}
