// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";

// https://astro.build/config
export default defineConfig({
  // GitHub Pages project site: https://manehorizons.github.io/necro
  site: "https://manehorizons.github.io",
  base: "/necro",

  integrations: [
    starlight({
      title: "Necro",
      description:
        "Local, free, polyglot CLI that finds anti-pattern code and proposes LLM-assisted fixes.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/manehorizons/necro",
        },
      ],
      plugins: [starlightLinksValidator()],
      sidebar: [
        { label: "Guide", items: [{ autogenerate: { directory: "guide" } }] },
        { label: "Reference", items: [{ autogenerate: { directory: "reference" } }] },
        {
          label: "Architecture",
          items: [{ autogenerate: { directory: "architecture" } }],
        },
      ],
    }),
  ],
});
