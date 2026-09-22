/**
 * Repository contracts are documented with JSDoc so this JavaScript codebase
 * can gain stable boundaries without a TypeScript migration.
 */

/**
 * @typedef {{ id: string, [key: string]: any }} RepositoryRecord
 */

/**
 * @typedef {{
 *   getByUjbCode(ujbCode: string): Promise<RepositoryRecord | null>,
 *   updateByUjbCode(ujbCode: string, update: object): Promise<RepositoryRecord | null>,
 *   getManyByUjbCodes(ujbCodes: string[]): Promise<RepositoryRecord[]>
 * }} UserRepository
 */

/**
 * @typedef {{
 *   getById(id: string): Promise<RepositoryRecord | null>,
 *   create(data: object): Promise<RepositoryRecord>,
 *   updateById(id: string, update: object): Promise<RepositoryRecord | null>
 * }} ReferralRepository
 */

/**
 * @typedef {{
 *   getById(id: string): Promise<RepositoryRecord | null>,
 *   create(data: object): Promise<RepositoryRecord>,
 *   updateById(id: string, update: object): Promise<RepositoryRecord | null>
 * }} ProspectRepository
 */

/**
 * @typedef {ProspectRepository & {
 *   listAll(): Promise<RepositoryRecord[]>,
 *   isUserRegistered(eventId: string, phone: string): Promise<boolean>,
 *   listRegisteredUsers(eventId: string): Promise<RepositoryRecord[]>,
 *   registerUser(eventId: string, registration: object): Promise<{ created: boolean, record: RepositoryRecord | null }>
 * }} MeetingRepository
 * @typedef {ProspectRepository} ContentRepository
 * @typedef {ProspectRepository} FavoriteRepository
 * @typedef {ProspectRepository} NotificationRepository
 */

/**
 * @typedef {{
 *   name: string,
 *   users: UserRepository,
 *   referrals: ReferralRepository,
 *   prospects: ProspectRepository,
 *   meetings: MeetingRepository,
 *   content: ContentRepository,
 *   favorites: FavoriteRepository,
 *   notifications: NotificationRepository
 * }} DataProvider
 */

export const DATA_PROVIDER_NAMES = Object.freeze({
  FIREBASE: "firebase",
});
