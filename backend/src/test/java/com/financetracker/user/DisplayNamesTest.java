package com.financetracker.user;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class DisplayNamesTest {

    @Test
    void trimsAndCollapsesSpacesAndBlankMeansNoName() {
        assertEquals("Asha Rao", DisplayNames.normalize("  Asha \t  Rao "));
        assertNull(DisplayNames.normalize("   "));
        assertNull(DisplayNames.normalize(null));
    }

    @Test
    void limitIsFiftyCharactersCountingEmojiAsOne() {
        assertEquals("😀".repeat(50), DisplayNames.normalize("😀".repeat(50)));
        assertThrows(ResponseStatusException.class, () -> DisplayNames.normalize("a".repeat(51)));
    }

    @Test
    void rejectsControlCharacters() {
        assertThrows(ResponseStatusException.class, () -> DisplayNames.normalize("Asha\u0000"));
    }
}
