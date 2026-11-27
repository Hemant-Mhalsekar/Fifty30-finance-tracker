package com.financetracker.notification;

/** Where one browser receives pushes: its push service URL and the keys it gave when subscribing. */
public record PushTarget(String endpoint, byte[] p256dh, byte[] auth) {
}
