(function (root) {
  "use strict";

  root.RAFIQRejectedFileCleanup = async function (db, intakeId, paths) {
    if (!db || !db.storage || typeof intakeId !== "string" || !intakeId.trim()) {
      return { ok: false, removed: 0, error: "storage_client_unavailable" };
    }
    if (!Array.isArray(paths)) {
      return { ok: false, removed: 0, error: "invalid_deleted_file_paths" };
    }
    if (paths.length === 0) return { ok: true, removed: 0, error: null };

    // Both existing upload handlers write to this same bucket/table:
    // public-application-upload uses intake/<id>/; public-intake uses intakes/<id>/.
    const prefixes = ["intake/" + intakeId + "/", "intakes/" + intakeId + "/"];
    const safePaths = paths.filter((path) =>
      typeof path === "string" &&
      prefixes.some((prefix) => path.startsWith(prefix)) &&
      !path.includes("..") &&
      !path.includes("\\")
    );
    if (safePaths.length !== paths.length) {
      return { ok: false, removed: 0, error: "unsafe_storage_path_returned_by_review_rpc" };
    }

    try {
      const { data, error } = await db.storage.from("private_documents").remove(safePaths);
      if (error) {
        return { ok: false, removed: 0, error: String(error.message || "storage_delete_failed") };
      }
      const removed = Array.isArray(data) ? data.length : 0;
      if (removed !== safePaths.length) {
        return { ok: false, removed, error: "storage_delete_count_mismatch" };
      }
      return { ok: true, removed, error: null };
    } catch (error) {
      return { ok: false, removed: 0, error: String(error && error.message || "storage_delete_failed") };
    }
  };
})(globalThis);
