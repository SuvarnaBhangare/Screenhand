import { describe, expect, it } from "vitest";
import {
  deriveScopePrefix,
  filterScopedLinks,
  normalizeCrawlUrl,
  renderMergedMarkdown,
} from "../src/platform/help-center-markdown.js";

describe("help-center-markdown", () => {
  it("derives a help scope prefix from a localized help URL", () => {
    expect(deriveScopePrefix("https://www.canva.com/en_in/help/topics/")).toBe("/en_in/help/");
  });

  it("normalizes crawl URLs by removing hashes and tracking params", () => {
    expect(
      normalizeCrawlUrl(
        "https://www.canva.com/en_in/help/websites/?utm_source=test#overview",
        "https://www.canva.com/en_in/help/topics/",
      ),
    ).toBe("https://www.canva.com/en_in/help/websites/");
  });

  it("filters links to the same origin and scope", () => {
    const links = filterScopedLinks(
      [
        {
          url: "https://www.canva.com/en_in/help/websites/",
          title: "Websites",
        },
        {
          url: "https://www.canva.com/en_in/help/websites/#foo",
          title: "Websites Duplicate",
        },
        {
          url: "https://www.canva.com/features/",
          title: "Outside scope",
        },
        {
          url: "https://example.com/help/page",
          title: "Outside origin",
        },
      ],
      "https://www.canva.com/en_in/help/topics/",
      "/en_in/help/",
    );

    expect(links).toEqual([
      {
        url: "https://www.canva.com/en_in/help/websites/",
        title: "Websites",
        description: undefined,
      },
    ]);
  });

  it("renders a merged markdown document with metadata and page sections", () => {
    const markdown = renderMergedMarkdown(
      "https://www.canva.com/en_in/help/topics/",
      "/en_in/help/",
      [
        {
          url: "https://www.canva.com/en_in/help/topics/",
          title: "All Topics",
          kind: "listing",
          markdown: "### Linked Pages\n\n- [Websites](https://www.canva.com/en_in/help/websites/)",
          links: [],
        },
        {
          url: "https://www.canva.com/en_in/help/websites/",
          title: "Websites",
          kind: "article",
          markdown: "Create and publish websites.\n\n## Website publishing",
          links: [],
        },
      ],
      "2026-03-13T00:00:00.000Z",
    );

    expect(markdown).toContain("# Help Center Export");
    expect(markdown).toContain("- Pages: 2");
    expect(markdown).toContain("## 1. All Topics");
    expect(markdown).toContain("## 2. Websites");
    expect(markdown).toContain("[Websites](https://www.canva.com/en_in/help/websites/)");
  });
});
