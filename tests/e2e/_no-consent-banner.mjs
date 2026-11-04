// Preloaded by `pnpm run test:e2e` (node --import). The GA4 consent banner and its small "Statistiques" button are fixed overlays that sit on top of
// the bottom of every page; they are the subject of tests/e2e/ga4-consent.e2e.mjs only. Everywhere else a browser context starts with the choice
// already made ("denied"), like a returning visitor, so that unrelated journeys are not covered by a first-visit banner.
import { chromium } from "playwright";

const decide = () => { try { if (localStorage.getItem("titan_ga4_consent_v1") === null) localStorage.setItem("titan_ga4_consent_v1", "denied"); } catch (_) { /* storage may be blocked by the test itself */ } };

const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => { const context = await newContext(...a); await context.addInitScript(decide); return context; };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => { const page = await newPage(...a); await page.context().addInitScript(decide); return page; };
  return browser;
};
