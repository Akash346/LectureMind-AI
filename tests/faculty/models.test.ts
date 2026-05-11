import { describe, expect, it } from "vitest";

import { assertMistralOnlyForOcr, getFacultyModelRoute } from "@/lib/faculty/models";

describe("faculty model routing", () => {
  it("Mistral route guard rejects non OCR task", () => {
    expect(() => assertMistralOnlyForOcr("faculty_chat")).toThrow(
      /Mistral may only be used/
    );
    expect(() => assertMistralOnlyForOcr("faculty_ocr")).not.toThrow();
  });

  it("routes Faculty OCR to Mistral only", () => {
    expect(getFacultyModelRoute("faculty_ocr").provider).toBe("mistral_ocr");
  });
});
