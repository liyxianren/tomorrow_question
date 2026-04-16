import { SESSION_STORAGE_KEY } from "../../../services/http";


export const LOCAL_PROFILE_STORAGE_KEY = "tomorrow-question.profile";
export const LEGACY_NICKNAME_STORAGE_KEY = "tomorrow-question.preferred-nickname";

export type LocalProfile = {
  profileId: string;
  displayName: string;
  boundSessionId: string | null;
  recentRoomCodes: string[];
  lastActiveGameId: string | null;
  updatedAt: string;
};

function createProfileId(): string {
  const randomId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID().split("-").join("").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  return `profile-${randomId}`;
}

function normalizeDisplayName(value: string): string {
  return value.trim();
}

function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeRecentRoomCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? normalizeRoomCode(entry) : ""))
    .filter(Boolean)
    .slice(0, 3);
}

function persistProfile(profile: LocalProfile): LocalProfile {
  window.localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.localStorage.setItem(LEGACY_NICKNAME_STORAGE_KEY, profile.displayName);
  return profile;
}

function parseStoredProfile(raw: string | null): LocalProfile | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    const displayName = normalizeDisplayName(parsed.displayName ?? "");
    const profileId = typeof parsed.profileId === "string" ? parsed.profileId.trim() : "";
    const boundSessionId =
      typeof parsed.boundSessionId === "string" && parsed.boundSessionId.trim()
        ? parsed.boundSessionId.trim()
        : null;

    if (!displayName || !profileId) {
      return null;
    }

    return {
      profileId,
      displayName,
      boundSessionId,
      recentRoomCodes: normalizeRecentRoomCodes(parsed.recentRoomCodes),
      lastActiveGameId:
        typeof parsed.lastActiveGameId === "string" && parsed.lastActiveGameId.trim()
          ? parsed.lastActiveGameId.trim()
          : null,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function migrateLegacyNickname(): LocalProfile | null {
  const legacyDisplayName = normalizeDisplayName(
    window.localStorage.getItem(LEGACY_NICKNAME_STORAGE_KEY) ?? "",
  );
  if (!legacyDisplayName) {
    return null;
  }

  const migratedProfile = persistProfile({
    profileId: createProfileId(),
    displayName: legacyDisplayName,
    boundSessionId: window.localStorage.getItem(SESSION_STORAGE_KEY),
    recentRoomCodes: [],
    lastActiveGameId: null,
    updatedAt: new Date().toISOString(),
  });

  return migratedProfile;
}

export function getStoredProfile(): LocalProfile | null {
  const parsedProfile = parseStoredProfile(window.localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY));
  if (parsedProfile) {
    return parsedProfile;
  }

  return migrateLegacyNickname();
}

export function upsertStoredProfile(displayName: string): LocalProfile {
  const normalizedDisplayName = normalizeDisplayName(displayName);
  const currentProfile = getStoredProfile();

  return persistProfile({
    profileId: currentProfile?.profileId ?? createProfileId(),
    displayName: normalizedDisplayName,
    boundSessionId: currentProfile?.boundSessionId ?? window.localStorage.getItem(SESSION_STORAGE_KEY),
    recentRoomCodes: currentProfile?.recentRoomCodes ?? [],
    lastActiveGameId: currentProfile?.lastActiveGameId ?? null,
    updatedAt: new Date().toISOString(),
  });
}

export function bindStoredProfileSession(sessionId: string | null): LocalProfile | null {
  const currentProfile = getStoredProfile();
  if (!currentProfile) {
    return null;
  }

  return persistProfile({
    ...currentProfile,
    boundSessionId: sessionId,
    updatedAt: new Date().toISOString(),
  });
}

export function clearStoredProfileSession(): void {
  const currentProfile = getStoredProfile();
  if (!currentProfile) {
    return;
  }

  persistProfile({
    ...currentProfile,
    boundSessionId: null,
    updatedAt: new Date().toISOString(),
  });
}

export function rememberRecentRoomCode(roomCode: string): LocalProfile | null {
  const currentProfile = getStoredProfile();
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!currentProfile || !normalizedRoomCode) {
    return null;
  }

  const recentRoomCodes = [normalizedRoomCode, ...currentProfile.recentRoomCodes.filter((code) => code !== normalizedRoomCode)].slice(0, 3);

  return persistProfile({
    ...currentProfile,
    recentRoomCodes,
    updatedAt: new Date().toISOString(),
  });
}

export function setLastActiveGameId(gameId: string | null): LocalProfile | null {
  const currentProfile = getStoredProfile();
  if (!currentProfile) {
    return null;
  }

  return persistProfile({
    ...currentProfile,
    lastActiveGameId: gameId?.trim() ? gameId.trim() : null,
    updatedAt: new Date().toISOString(),
  });
}

export function getRecoverableSessionId(): string | null {
  return window.localStorage.getItem(SESSION_STORAGE_KEY) ?? getStoredProfile()?.boundSessionId ?? null;
}

export function clearStoredProfile(): void {
  window.localStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_NICKNAME_STORAGE_KEY);
}

export function getPreferredNickname(): string | null {
  return getStoredProfile()?.displayName ?? null;
}

export function setPreferredNickname(displayName: string): void {
  upsertStoredProfile(displayName);
}

export function clearPreferredNickname(): void {
  clearStoredProfile();
}
