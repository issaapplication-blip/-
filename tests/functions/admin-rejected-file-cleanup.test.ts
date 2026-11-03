import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dir, "../../public/js/rafiq-rejected-file-cleanup.js"), "utf8");

function loadCleanup() {
  const root: Record<string, any> = {};
  new Function("globalThis", source)(root);
  return root.RAFIQRejectedFileCleanup as (
    db: any,
    intakeId: string,
    paths: unknown,
  ) => Promise<{ ok: boolean; removed: number; error: string | null }>;
}

test("rejected intake files are removed only from their private intake folder", async () => {
  const cleanup = loadCleanup();
  let bucket = "";
  let removedPaths: string[] = [];
  const db = {
    storage: {
      from(name: string) {
        bucket = name;
        return {
          async remove(paths: string[]) {
            removedPaths = paths;
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };

  const paths = ["intake/abc/file-a.pdf", "intake/abc/file-b.jpg"];
  const result = await cleanup(db, "abc", paths);

  expect(result).toEqual({ ok: true, removed: 2, error: null });
  expect(bucket).toBe("private_documents");
  expect(removedPaths).toEqual(paths);
});

test("cleanup accepts the plural intakes path used by public-intake", async () => {
  const cleanup = loadCleanup();
  let removedPaths: string[] = [];
  const db = {
    storage: {
      from() {
        return {
          async remove(paths: string[]) {
            removedPaths = paths;
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };

  const paths = ["intakes/abc/file-cv.pdf"];
  const result = await cleanup(db, "abc", paths);

  expect(result).toEqual({ ok: true, removed: 1, error: null });
  expect(removedPaths).toEqual(paths);
});


test("cleanup supports both legacy singular and current plural intake storage folders", async () => {
  const cleanup = loadCleanup();
  let removedPaths: string[] = [];
  const db = {
    storage: {
      from() {
        return {
          async remove(paths: string[]) {
            removedPaths = paths;
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };

  const paths = ["intake/abc/legacy.pdf", "intakes/abc/current.pdf"];
  const result = await cleanup(db, "abc", paths);

  expect(result).toEqual({ ok: true, removed: 2, error: null });
  expect(removedPaths).toEqual(paths);
});

test("cleanup refuses paths outside the rejected intake folder", async () => {
  const cleanup = loadCleanup();
  let removeCalled = false;
  const db = {
    storage: {
      from() {
        return {
          async remove() {
            removeCalled = true;
            return { data: [], error: null };
          },
        };
      },
    },
  };

  const result = await cleanup(db, "abc", ["intake/other/file.pdf"]);

  expect(result.ok).toBe(false);
  expect(result.error).toBe("unsafe_storage_path_returned_by_review_rpc");
  expect(removeCalled).toBe(false);
});

test("cleanup reports Storage API failures without claiming success", async () => {
  const cleanup = loadCleanup();
  const db = {
    storage: {
      from() {
        return {
          async remove() {
            return { data: null, error: { message: "permission denied" } };
          },
        };
      },
    },
  };

  const result = await cleanup(db, "abc", ["intake/abc/file.pdf"]);

  expect(result.ok).toBe(false);
  expect(result.error).toBe("permission denied");
});

test("cleanup detects partial deletion results", async () => {
  const cleanup = loadCleanup();
  const db = {
    storage: {
      from() {
        return {
          async remove(paths: string[]) {
            return { data: paths.slice(0, 1).map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };

  const result = await cleanup(db, "abc", ["intake/abc/a.pdf", "intake/abc/b.pdf"]);

  expect(result).toEqual({ ok: false, removed: 1, error: "storage_delete_count_mismatch" });
});
