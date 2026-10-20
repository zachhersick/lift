// htm bound to Preact, so components are written as tagged templates.
import { h } from "preact";
import htm from "htm";

export const html = htm.bind(h);
