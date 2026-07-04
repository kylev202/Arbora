import { useCallback, useEffect, useState } from "react";

/**
 * A user-made organizational folder — a purely FRONT-END layer over a subject's
 * files. The backend never sees these: a source always keeps its `subject_id`
 * (that's what scopes the AI index, law #1) and the whole subject stays "one
 * group" for generation/RAG. Folders and file placements live only here, in
 * localStorage, so the user can arrange files however they like for a calmer
 * Drive without touching anything the AI relies on.
 */
export type OrgFolder = {
  id: string;
  subjectId: string | null; // a subject's folder, or null for a personal top-level folder
  parentId: string | null; // null = top level (under its subject, or the rail root)
  name: string;
};

type OrgState = {
  folders: OrgFolder[];
  placements: Record<string, string>; // sourceId -> folderId it's been dragged into
};

const KEY = "arbora.drive.org.v1";

function load(): OrgState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OrgState;
      if (Array.isArray(parsed.folders) && parsed.placements) return parsed;
    }
  } catch {
    /* corrupt / unavailable — fall back to empty */
  }
  return { folders: [], placements: {} };
}

const uid = () => `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export type DriveOrg = ReturnType<typeof useDriveOrg>;

/** The Drive's front-end folder overlay, persisted to localStorage. */
export function useDriveOrg() {
  const [state, setState] = useState<OrgState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* best-effort — storage full or blocked */
    }
  }, [state]);

  const createFolder = useCallback((subjectId: string | null, parentId: string | null, name: string): string => {
    const id = uid();
    setState((s) => ({ ...s, folders: [...s.folders, { id, subjectId, parentId, name }] }));
    return id;
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setState((s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)) }));
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setState((s) => {
      // Collect the folder and every descendant.
      const doomed = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of s.folders) {
          if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
            doomed.add(f.id);
            grew = true;
          }
        }
      }
      // Files inside fall back to the subject root — never deleted.
      const placements: Record<string, string> = {};
      for (const [src, fid] of Object.entries(s.placements)) {
        if (!doomed.has(fid)) placements[src] = fid;
      }
      return { folders: s.folders.filter((f) => !doomed.has(f.id)), placements };
    });
  }, []);

  /** Drag a file into a folder, or back to the subject root when `folderId` is null. */
  const placeSource = useCallback((sourceId: string, folderId: string | null) => {
    setState((s) => {
      const placements = { ...s.placements };
      if (folderId) placements[sourceId] = folderId;
      else delete placements[sourceId];
      return { ...s, placements };
    });
  }, []);

  return {
    folders: state.folders,
    placements: state.placements,
    createFolder,
    renameFolder,
    deleteFolder,
    placeSource,
  };
}
