package com.financetracker.notification;

/** ₹ amounts for notification text, Indian grouping: ₹1,50,000 and ₹49.50. */
final class Rupees {

    private Rupees() {
    }

    static String format(long paise) {
        String sign = paise < 0 ? "-" : "";
        long abs = Math.abs(paise);
        long rupees = abs / 100;
        long rest = abs % 100;
        return sign + "₹" + group(rupees) + (rest == 0 ? "" : "." + (rest < 10 ? "0" : "") + rest);
    }

    // Last three digits, then pairs: 12,34,567.
    private static String group(long rupees) {
        String digits = Long.toString(rupees);
        if (digits.length() <= 3) {
            return digits;
        }
        String head = digits.substring(0, digits.length() - 3);
        StringBuilder out = new StringBuilder();
        int first = head.length() % 2;
        if (first == 1) {
            out.append(head, 0, 1);
        }
        for (int i = first; i < head.length(); i += 2) {
            if (!out.isEmpty()) {
                out.append(',');
            }
            out.append(head, i, i + 2);
        }
        return out.append(',').append(digits.substring(digits.length() - 3)).toString();
    }
}
