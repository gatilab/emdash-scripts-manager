import { getViteConfig } from "astro/config";
import { configDefaults } from "vitest/config";

// getViteConfig lets the render tests compile .astro components through the
// Astro Container API without a host site.
export default getViteConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		exclude: [...configDefaults.exclude],
	},
});
