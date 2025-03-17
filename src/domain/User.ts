export interface User {
  id: number;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  joinedAt: Date;
  isActive: boolean;
}

export type NewUser = Omit<User, 'id' | 'joinedAt'> & { joinedAt?: Date };