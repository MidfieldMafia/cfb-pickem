import avatarList from "../../public/avatars/avatars.json";

export interface Avatar {
  id: string;
  name: string;
  file: string;
  color: string;
}

/** The fixed set of pennants a member chooses from. Members never upload photos. */
export const avatars: readonly Avatar[] = avatarList;

export function findAvatar(id: string | null | undefined): Avatar | undefined {
  return avatars.find((a) => a.id === id);
}
