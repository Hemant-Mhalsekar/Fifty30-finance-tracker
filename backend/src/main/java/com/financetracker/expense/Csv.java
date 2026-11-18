package com.financetracker.expense;

// Writes CSV fields the way spreadsheets read them (RFC 4180), and defuses "formula injection":
// a description such as =HYPERLINK(...) would otherwise run as a formula when the file is opened
// in Excel or Google Sheets, so cells starting with = + - @ (or a tab or carriage return) get a
// leading apostrophe, which spreadsheets show as plain text.
public final class Csv {

    private Csv() {
    }

    public static String field(String value) {
        if (value == null) {
            return "";
        }
        String text = value;
        if (!text.isEmpty() && "=+-@\t\r".indexOf(text.charAt(0)) >= 0) {
            text = "'" + text;
        }
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            return "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }

    /** Paise as plain rupees with two decimals and no grouping: 123456 -> "1234.56". */
    public static String rupees(long paise) {
        String sign = paise < 0 ? "-" : "";
        long abs = Math.abs(paise);
        long fraction = abs % 100;
        // Built by hand: String.format would use the server locale's digits.
        return sign + (abs / 100) + "." + (fraction < 10 ? "0" : "") + fraction;
    }
}
