package com.tinylog.babytracker.noise;

import java.util.Random;

/** Generates white, pink or brown noise as 16-bit mono samples. Not thread-safe: one per stream. */
final class NoiseGenerator {
    private final Random random = new Random();
    private final String type;
    private double b0, b1, b2, b3, b4, b5, b6, brown;

    NoiseGenerator(String type) {
        this.type = type == null ? "white" : type;
    }

    void fill(short[] out, float gain) {
        for (int i = 0; i < out.length; i++) {
            double white = random.nextDouble() * 2 - 1;
            double v;
            if ("pink".equals(type)) { // Paul Kellet's filter
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                v = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            } else if ("brown".equals(type)) {
                brown = (brown + 0.02 * white) / 1.02;
                v = brown * 3.5;
            } else {
                v = white * 0.5;
            }
            v *= gain;
            if (v > 1) v = 1;
            if (v < -1) v = -1;
            out[i] = (short) (v * 32767);
        }
    }
}
