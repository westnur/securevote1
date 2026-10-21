import { describe, expect, it } from "vitest";
import { sanitizeCell, toCsv } from "./csv";

describe("CSV export", () => {
  it("neutralises spreadsheet formula injection", () => {
    expect(sanitizeCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(sanitizeCell("+1")).toBe("'+1");
    expect(sanitizeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(sanitizeCell("-2")).toBe("'-2");
  });

  it("quotes commas, quotes and newlines and serialises objects", () => {
    expect(sanitizeCell('a,"b"')).toBe('"a,""b"""');
    expect(sanitizeCell({ voter: "0xabc" })).toBe('"{""voter"":""0xabc""}"');
    expect(toCsv(["h1", "h2"], [[1, "x"]])).toBe("h1,h2\r\n1,x");
  });
});
