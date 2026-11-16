package com.financetracker.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientIpTest {

    @Test
    void usesTheFirstForwardedAddress() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.5");
        request.addHeader("X-Forwarded-For", " 203.0.113.9 , 76.76.21.21, 10.0.0.1");
        assertEquals("203.0.113.9", ClientIp.resolve(request));
    }

    @Test
    void fallsBackToTheConnectionAddress() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.5");
        assertEquals("10.0.0.5", ClientIp.resolve(request));

        request.addHeader("X-Forwarded-For", "  ");
        assertEquals("10.0.0.5", ClientIp.resolve(request));
    }

    @Test
    void ignoresAnAbsurdlyLongFirstEntry() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.5");
        request.addHeader("X-Forwarded-For", "x".repeat(500));
        assertEquals("10.0.0.5", ClientIp.resolve(request));
    }
}
