// Minifies the embed loader in the build output. Run after `opennextjs-cloudflare build`.
//
// `public/embed.js` is written to be read, and two thirds of it is comments.
// It is the one file of ours that loads on other people's pages, often on a
// phone, sometimes only once their own button is pressed, so what is served
// is the minified copy: about 6 KB compressed instead of 16, which fits in the
// first round trip of a new connection. The source in `public/` is untouched,
// and is what `next dev` serves.
import { readFileSync, writeFileSync } from "node:fs";
import { minify } from "terser";

const file = new URL("../.open-next/assets/embed.js", import.meta.url);
const source = readFileSync(file, "utf8");
// ES5 out, like the source: it runs on whatever browsers the host page supports.
const { code } = await minify(source, { ecma: 5, compress: true, mangle: true });
if (!code || !code.includes("__chatformInstances")) throw new Error("minified embed.js looks wrong; not writing it");
writeFileSync(file, `/* Chatform embed loader. https://chatform.in/docs/embed */\n${code}`);
console.log(`embed.js: ${source.length} -> ${code.length} bytes`);
