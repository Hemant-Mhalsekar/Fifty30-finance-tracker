package com.financetracker.expense;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CsvTest {

    @Test
    void plainTextIsLeftAlone() {
        assertEquals("Groceries", Csv.field("Groceries"));
        assertEquals("", Csv.field(null));
        assertEquals("", Csv.field(""));
    }

    @Test
    void commasQuotesAndLineBreaksAreQuoted() {
        assertEquals("\"Rice, dal\"", Csv.field("Rice, dal"));
        assertEquals("\"The \"\"good\"\" one\"", Csv.field("The \"good\" one"));
        assertEquals("\"two\nlines\"", Csv.field("two\nlines"));
    }

    @Test
    void textThatASpreadsheetWouldRunAsAFormulaIsDefused() {
        assertEquals("\"'=HYPERLINK(\"\"x\"\")\"", Csv.field("=HYPERLINK(\"x\")"));
        assertEquals("'+91 phone bill", Csv.field("+91 phone bill"));
        assertEquals("'-5 refund", Csv.field("-5 refund"));
        assertEquals("'@friend", Csv.field("@friend"));
        assertEquals("\"'=1+2,3\"", Csv.field("=1+2,3"));
    }

    @Test
    void paiseBecomeRupeesWithTwoDecimals() {
        assertEquals("1234.56", Csv.rupees(123_456));
        assertEquals("0.05", Csv.rupees(5));
        assertEquals("100.00", Csv.rupees(10_000));
        assertEquals("-12.30", Csv.rupees(-1_230));
    }
}
