import { describe, expect, test } from "vitest";
import { MissingTemplateVariableError, resolveTemplate, templateVariables } from "../template";

describe("templateVariables", () => {
  test("returns referenced names in first-seen order, de-duplicated", () => {
    expect(templateVariables("Hi {{ name }}, about {{topic}} — {{ name }} again")).toEqual([
      "name",
      "topic",
    ]);
  });

  test("returns [] when there are no placeholders", () => {
    expect(templateVariables("no placeholders here")).toEqual([]);
  });
});

describe("resolveTemplate", () => {
  test("substitutes every placeholder", () => {
    expect(resolveTemplate("Answer {{q}} using {{src}}", { q: "X", src: "doc4" })).toBe(
      "Answer X using doc4",
    );
  });

  test("tolerates whitespace inside the braces", () => {
    expect(resolveTemplate("{{  a }}-{{b}}", { a: "1", b: "2" })).toBe("1-2");
  });

  test("throws MissingTemplateVariableError naming the missing variable", () => {
    expect(() => resolveTemplate("hi {{name}}", {})).toThrowError(MissingTemplateVariableError);
    try {
      resolveTemplate("hi {{name}}", {});
    } catch (err) {
      expect((err as MissingTemplateVariableError).variable).toBe("name");
    }
  });
});
