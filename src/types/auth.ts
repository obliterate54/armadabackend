export type TokenKind = 'access' | 'refresh';

export interface TokenPayload {
  userId: string;
  email: string;
  username: string;
  type: TokenKind;
}
