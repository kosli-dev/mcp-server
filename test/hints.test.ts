import { describe, it, expect } from "vitest";
import catalog from "../src/catalog.json" with { type: "json" };
import hints from "../src/hints.json" with { type: "json" };
import type { ActionHints } from "../src/types.js";

// Guards against hint keys drifting from catalog action IDs (e.g. when the
// OpenAPI spec gains operationIds and generated IDs change). A dangling key
// means the hint silently never attaches to search results.
describe("hints.json", () => {
  it("every hint key matches an action ID in the real catalog", () => {
    const ids = new Set(catalog.map((entry) => entry.id));
    for (const key of Object.keys(hints)) {
      expect(ids, `hint key "${key}" does not match any catalog action ID`).toContain(key);
    }
  });
  it("every hint carries a note, or a schema URL together with an example", () => {
    for (const [key, hint] of Object.entries(hints as ActionHints)) {
      const hasSchema = hint.schemaUrl !== undefined && hint.example !== undefined;
      expect(hasSchema || typeof hint.note === "string", `hint "${key}" has nothing to say`).toBe(true);
      expect(
        (hint.schemaUrl === undefined) === (hint.example === undefined),
        `hint "${key}" has only one of schemaUrl and example`,
      ).toBe(true);
    }
  });

  // The server can't PUT the file to the upload URL, so the model has to hand
  // that step to the user before attesting with the upload id (#85).
  it("tells the model to hand the attachment upload to the user", () => {
    const note = (hints as ActionHints).create_attestation_upload?.note;
    expect(note).toMatch(/can't upload/);
    expect(note).toMatch(/attachment_upload_id/);
  });

  // The personal API key actions mint and revoke credentials. A new key value
  // is returned once and lands in the model's context, and rotate or delete
  // can revoke the key this server authenticates with.
  it("tells the model to hand a new API key to the user and never choose a key to revoke", () => {
    const h = hints as ActionHints;
    for (const id of ["create_personal_api_key", "rotate_personal_api_key"]) {
      expect(h[id]?.note, id).toMatch(/only once/);
      expect(h[id]?.note, id).toMatch(/do not store/);
    }
    for (const id of ["rotate_personal_api_key", "delete_personal_api_key"]) {
      expect(h[id]?.note, id).toMatch(/never pick one yourself/);
    }
  });
});
