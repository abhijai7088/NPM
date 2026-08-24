package com.npms.core.util;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public final class StateCodeMap {

    private static final Map<String, String> CODE_TO_NAME;

    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("ND", "New Delhi");
        m.put("DL", "Delhi");
        m.put("TS", "Telangana");
        m.put("AP", "Andhra Pradesh");
        m.put("PY", "Puducherry");
        m.put("UP", "Uttar Pradesh");
        m.put("MH", "Maharashtra");
        m.put("WB", "West Bengal");
        m.put("LD", "Lakshadweep");
        m.put("KL", "Kerala");
        m.put("HR", "Haryana");
        m.put("TN", "Tamil Nadu");
        m.put("AS", "Assam");
        m.put("MP", "Madhya Pradesh");
        m.put("JH", "Jharkhand");
        m.put("CG", "Chhattisgarh");
        m.put("RJ", "Rajasthan");
        m.put("GJ", "Gujarat");
        m.put("CH", "Chandigarh");
        m.put("MN", "Manipur");
        m.put("PB", "Punjab");
        m.put("JK", "Jammu & Kashmir");
        m.put("ML", "Meghalaya");
        m.put("GA", "Goa");
        m.put("BR", "Bihar");
        m.put("MZ", "Mizoram");
        m.put("OR", "Odisha");
        m.put("OD", "Odisha");
        m.put("AR", "Arunachal Pradesh");
        m.put("KA", "Karnataka");
        m.put("HP", "Himachal Pradesh");
        m.put("UK", "Uttarakhand");
        m.put("UT", "Uttarakhand");
        m.put("TR", "Tripura");
        m.put("AN", "Andaman & Nicobar");
        m.put("SK", "Sikkim");
        m.put("LA", "Ladakh");
        m.put("NL", "Nagaland");
        m.put("DD", "Daman & Diu");
        m.put("DN", "Dadra & Nagar Haveli");
        CODE_TO_NAME = Collections.unmodifiableMap(m);
    }

    private StateCodeMap() {}

    public static String extractStateCode(String projectCode) {
        if (projectCode == null) return "NA";
        String clean = projectCode.trim().toUpperCase();
        if (clean.length() < 2) return "NA";
        String lastTwo = clean.substring(clean.length() - 2);
        if (Character.isLetter(lastTwo.charAt(0)) && Character.isLetter(lastTwo.charAt(1))) {
            return lastTwo;
        }
        return "NA";
    }

    public static String getStateName(String code) {
        if (code == null) return "Other";
        return CODE_TO_NAME.getOrDefault(code.trim().toUpperCase(), code);
    }

    public static Map<String, String> getAllStates() {
        return CODE_TO_NAME;
    }
}
